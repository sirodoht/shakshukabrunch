import { mkdir, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { BrunchStore, DataError, FIRST_BRUNCH_ID, imageFilenamePattern, publicState, validBrunchId } from "./data";
import type { RSVP, Song, Photo } from "./data";

const ROOT = join(import.meta.dir, "..");

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function hashOwnerToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function serveStatic(pathname: string, publicDir: string) {
  const route = pathname === "/first-brunch" || pathname === "/first-brunch/"
    ? "/first-brunch/index.html"
    : pathname === "/" || pathname === "/admin" || pathname === "/admin/" ? "/index.html" : pathname;
  if (route.includes("..")) return new Response("Not found", { status: 404 });
  const file = Bun.file(join(publicDir, route));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "Content-Type": mimeTypes[extname(route)] || "application/octet-stream" } });
}

export async function createApp({
  dataDir = join(ROOT, "data"),
  publicDir = join(ROOT, "public"),
}: { dataDir?: string; publicDir?: string } = {}) {
  const store = new BrunchStore(dataDir);
  await store.initialize();

  return async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/first-brunch" || url.pathname.startsWith("/first-brunch/")) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("This brunch is archived and read-only.", {
            status: 405,
            headers: { Allow: "GET, HEAD" },
          });
        }
        const response = await serveStatic(url.pathname, publicDir);
        return request.method === "HEAD"
          ? new Response(null, { status: response.status, headers: response.headers })
          : response;
      }

      if (url.pathname.startsWith("/api/")) {
        let pathname = url.pathname;
        let requestedId: string | undefined;
        if (pathname.startsWith("/api/brunches/")) {
          const match = pathname.match(/^\/api\/brunches\/([^/]+)\/(.+)$/);
          if (!match) return json({ error: "Not found." }, 404);
          requestedId = match[1];
          pathname = "/api/" + match[2];
        }
        return await store.run(requestedId, ["POST", "DELETE"].includes(request.method), async (state, brunchId) => {
          if (pathname === "/api/state" && request.method === "GET") {
            return json(publicState(state, brunchId));
          }

          if (pathname === "/api/rsvp" && request.method === "POST") {
            const body = await request.json() as Record<string, unknown>;
            const name = clean(body.name, 80);
            const attendance = clean(body.attendance, 10);
            const ownerToken = clean(body.ownerToken, 200);
            if (!name || !["yes", "maybe", "no"].includes(attendance)) return json({ error: "Please add your name and RSVP choice." }, 400);
            if (ownerToken.length < 20) return json({ error: "Could not create a deletion key for this RSVP. Please try again." }, 400);
            const rsvp: RSVP = {
              id: crypto.randomUUID(),
              name,
              attendance: attendance as RSVP["attendance"],
              partySize: Math.min(6, Math.max(1, Number(body.partySize) || 1)),
              dietary: clean(body.dietary),
              contribution: clean(body.contribution, 160),
              createdAt: new Date().toISOString(),
              ownerTokenHash: await hashOwnerToken(ownerToken),
            };
            state.rsvps.unshift(rsvp);
            return json({ ...publicState(state, brunchId), submittedRsvpId: rsvp.id }, 201);
          }

          const rsvpDeleteMatch = pathname.match(/^\/api\/rsvps\/([a-f0-9-]+)$/i);
          if (rsvpDeleteMatch && request.method === "DELETE") {
            const isAdmin = request.headers.get("X-Brunch-Admin") === "local-storage";
            let body: Record<string, unknown> = {};
            try { body = await request.json() as Record<string, unknown>; } catch {}
            const ownerToken = clean(body.ownerToken, 200);
            const rsvpIndex = state.rsvps.findIndex((rsvp) => rsvp.id === rsvpDeleteMatch[1]);
            if (rsvpIndex === -1) return json({ error: "That guest is no longer on the list." }, 404);
            const rsvp = state.rsvps[rsvpIndex];
            if (!isAdmin && (!rsvp.ownerTokenHash || !ownerToken || await hashOwnerToken(ownerToken) !== rsvp.ownerTokenHash)) {
              return json({ error: "Only the browser that submitted this RSVP can remove it." }, 403);
            }
            state.rsvps.splice(rsvpIndex, 1);
            return json(publicState(state, brunchId));
          }

          if (pathname === "/api/songs" && request.method === "POST") {
            const body = await request.json() as Record<string, unknown>;
            const title = clean(body.title, 120);
            const ownerToken = clean(body.ownerToken, 200);
            if (!title) return json({ error: "Give us a song title." }, 400);
            if (ownerToken.length < 20) return json({ error: "Could not create a deletion key for this track. Please try again." }, 400);
            const urlValue = clean(body.url, 500);
            if (urlValue && !/^https?:\/\//i.test(urlValue)) return json({ error: "The song link needs to start with http:// or https://" }, 400);
            const song: Song = {
              id: crypto.randomUUID(),
              title,
              artist: clean(body.artist, 120),
              url: urlValue,
              addedBy: clean(body.addedBy, 80) || "A mysterious DJ",
              createdAt: new Date().toISOString(),
              ownerTokenHash: await hashOwnerToken(ownerToken),
            };
            state.songs.unshift(song);
            return json({ ...publicState(state, brunchId), submittedSongId: song.id }, 201);
          }

          const songDeleteMatch = pathname.match(/^\/api\/songs\/([a-f0-9-]+)$/i);
          if (songDeleteMatch && request.method === "DELETE") {
            const isAdmin = request.headers.get("X-Brunch-Admin") === "local-storage";
            let body: Record<string, unknown> = {};
            try { body = await request.json() as Record<string, unknown>; } catch {}
            const ownerToken = clean(body.ownerToken, 200);
            const songIndex = state.songs.findIndex((song) => song.id === songDeleteMatch[1]);
            if (songIndex === -1) return json({ error: "That track is no longer in the queue." }, 404);
            const song = state.songs[songIndex];
            if (!isAdmin && (!song.ownerTokenHash || !ownerToken || await hashOwnerToken(ownerToken) !== song.ownerTokenHash)) {
              return json({ error: "Only the browser that added this track can remove it." }, 403);
            }
            state.songs.splice(songIndex, 1);
            return json(publicState(state, brunchId));
          }

          if (pathname === "/api/photos" && request.method === "POST") {
            const form = await request.formData();
            const image = form.get("image");
            const ownerToken = clean(form.get("ownerToken"), 200);
            if (!(image instanceof File) || !image.type.startsWith("image/")) return json({ error: "Choose an image to upload." }, 400);
            if (image.size > 8 * 1024 * 1024) return json({ error: "That photo is over 8 MB. Try a smaller one." }, 400);
            if (ownerToken.length < 20) return json({ error: "Could not create a deletion key for this photo. Please try again." }, 400);
            const extension = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" } as Record<string, string>)[image.type] || ".jpg";
            const filename = `${crypto.randomUUID()}${extension}`;
            await mkdir(join(store.uploadDir, brunchId), { recursive: true });
            await Bun.write(join(store.uploadDir, brunchId, filename), image);
            const photo: Photo = {
              id: crypto.randomUUID(),
              url: `/uploads/${brunchId}/${filename}`,
              caption: clean(form.get("caption"), 180),
              uploader: clean(form.get("uploader"), 80) || "Anonymous brunch artist",
              createdAt: new Date().toISOString(),
              ownerTokenHash: await hashOwnerToken(ownerToken),
            };
            state.photos.unshift(photo);
            return json({ ...publicState(state, brunchId), uploadedPhotoId: photo.id }, 201);
          }

          const photoDeleteMatch = pathname.match(/^\/api\/photos\/([a-f0-9-]+)$/i);
          if (photoDeleteMatch && request.method === "DELETE") {
            const body = await request.json() as Record<string, unknown>;
            const ownerToken = clean(body.ownerToken, 200);
            const isAdmin = request.headers.get("X-Brunch-Admin") === "local-storage";
            const photoIndex = state.photos.findIndex((photo) => photo.id === photoDeleteMatch[1]);
            if (photoIndex === -1) return json({ error: "That photo is no longer in the gallery." }, 404);
            const photo = state.photos[photoIndex];
            if (!isAdmin && (!photo.ownerTokenHash || !ownerToken || await hashOwnerToken(ownerToken) !== photo.ownerTokenHash)) {
              return json({ error: "Only the browser that uploaded this photo can remove it." }, 403);
            }

            state.photos.splice(photoIndex, 1);
            const filename = photo.url.slice(`/uploads/${brunchId}/`.length);
            if (photo.url === `/uploads/${brunchId}/${filename}` && imageFilenamePattern.test(filename)) {
              await unlink(join(store.uploadDir, brunchId, filename)).catch(() => undefined);
            }
            return json(publicState(state, brunchId));
          }


          return json({ error: "Not found." }, 404);
        });
      }

      if (url.pathname.startsWith("/uploads/") && ["GET", "HEAD"].includes(request.method)) {
        const parts = url.pathname.slice("/uploads/".length).split("/");
        if (parts.length === 1 && imageFilenamePattern.test(parts[0])) {
          // Old first-brunch photo links remain valid after the migration.
          return new Response(null, {
            status: 308,
            headers: { Location: `/uploads/${FIRST_BRUNCH_ID}/${parts[0]}` },
          });
        }
        const [brunchId, filename] = parts;
        if (parts.length !== 2 || !validBrunchId(brunchId) || !imageFilenamePattern.test(filename)) {
          return new Response("Not found", { status: 404 });
        }
        const state = await store.read();
        if (!Object.hasOwn(state.brunches, brunchId)) return new Response("Not found", { status: 404 });
        const file = Bun.file(join(store.uploadDir, brunchId, filename));
        if (!(await file.exists())) return new Response("Not found", { status: 404 });
        return new Response(request.method === "HEAD" ? null : file, {
          headers: { "Content-Type": file.type },
        });
      }

      return serveStatic(url.pathname, publicDir);
    } catch (error) {
      if (error instanceof DataError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "The brunch gremlins dropped that request. Please try again." }, 500);
    }
  };
}

if (import.meta.main) {
  const server = Bun.serve({
    port: Number(Bun.env.PORT || 3000),
    hostname: "127.0.0.1",
    fetch: await createApp(),
  });
  console.log(`Shakshuka Sunday is bubbling at ${server.url}`);
}
