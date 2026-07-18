import { mkdir } from "node:fs/promises";
import { extname, join } from "node:path";

type RSVP = {
  id: string;
  name: string;
  attendance: "yes" | "maybe" | "no";
  partySize: number;
  email: string;
  phone: string;
  contactApp: string;
  dietary: string;
  contribution: string;
  comment: string;
  createdAt: string;
};

type Song = {
  id: string;
  title: string;
  artist: string;
  url: string;
  addedBy: string;
  createdAt: string;
};

type Photo = {
  id: string;
  url: string;
  caption: string;
  uploader: string;
  createdAt: string;
};

type AppState = { rsvps: RSVP[]; songs: Song[]; photos: Photo[] };

const ROOT = join(import.meta.dir, "..");
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const UPLOAD_DIR = join(DATA_DIR, "uploads");
const STATE_FILE = join(DATA_DIR, "state.json");

await mkdir(UPLOAD_DIR, { recursive: true });

async function readState(): Promise<AppState> {
  const file = Bun.file(STATE_FILE);
  if (!(await file.exists())) return { rsvps: [], songs: [], photos: [] };
  try {
    return await file.json();
  } catch {
    return { rsvps: [], songs: [], photos: [] };
  }
}

let writeQueue = Promise.resolve();
function saveState(state: AppState) {
  writeQueue = writeQueue.then(() => Bun.write(STATE_FILE, JSON.stringify(state, null, 2))).then(() => undefined);
  return writeQueue;
}

function publicState(state: AppState) {
  return {
    event: { title: "Shakshuka Sunday", date: "2026-07-19", plannedGuests: 9 },
    rsvps: state.rsvps.map(({ email: _email, phone: _phone, ...rsvp }) => rsvp),
    songs: state.songs,
    photos: state.photos,
  };
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function serveStatic(pathname: string) {
  const route = pathname === "/" ? "/index.html" : pathname;
  if (route.includes("..")) return new Response("Not found", { status: 404 });
  const file = Bun.file(join(PUBLIC_DIR, route));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "Content-Type": mimeTypes[extname(route)] || "application/octet-stream" } });
}

const server = Bun.serve({
  port: Number(Bun.env.PORT || 3000),
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/state" && request.method === "GET") {
        return json(publicState(await readState()));
      }

      if (url.pathname === "/api/rsvp" && request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const name = clean(body.name, 80);
        const attendance = clean(body.attendance, 10);
        if (!name || !["yes", "maybe", "no"].includes(attendance)) return json({ error: "Please add your name and RSVP choice." }, 400);

        const state = await readState();
        const rsvp: RSVP = {
          id: crypto.randomUUID(),
          name,
          attendance: attendance as RSVP["attendance"],
          partySize: Math.min(6, Math.max(1, Number(body.partySize) || 1)),
          email: clean(body.email, 160),
          phone: clean(body.phone, 40),
          contactApp: clean(body.contactApp, 30),
          dietary: clean(body.dietary),
          contribution: clean(body.contribution, 160),
          comment: clean(body.comment),
          createdAt: new Date().toISOString(),
        };
        state.rsvps.unshift(rsvp);
        await saveState(state);
        return json(publicState(state), 201);
      }

      if (url.pathname === "/api/songs" && request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const title = clean(body.title, 120);
        if (!title) return json({ error: "Give us a song title." }, 400);
        const urlValue = clean(body.url, 500);
        if (urlValue && !/^https?:\/\//i.test(urlValue)) return json({ error: "The song link needs to start with http:// or https://" }, 400);
        const state = await readState();
        state.songs.unshift({
          id: crypto.randomUUID(),
          title,
          artist: clean(body.artist, 120),
          url: urlValue,
          addedBy: clean(body.addedBy, 80) || "A mysterious DJ",
          createdAt: new Date().toISOString(),
        });
        await saveState(state);
        return json(publicState(state), 201);
      }

      if (url.pathname === "/api/photos" && request.method === "POST") {
        const form = await request.formData();
        const image = form.get("image");
        if (!(image instanceof File) || !image.type.startsWith("image/")) return json({ error: "Choose an image to upload." }, 400);
        if (image.size > 8 * 1024 * 1024) return json({ error: "That photo is over 8 MB. Try a smaller one." }, 400);
        const extension = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" } as Record<string, string>)[image.type] || ".jpg";
        const filename = `${crypto.randomUUID()}${extension}`;
        await Bun.write(join(UPLOAD_DIR, filename), image);
        const state = await readState();
        state.photos.unshift({
          id: crypto.randomUUID(),
          url: `/uploads/${filename}`,
          caption: clean(form.get("caption"), 180),
          uploader: clean(form.get("uploader"), 80) || "Anonymous brunch artist",
          createdAt: new Date().toISOString(),
        });
        await saveState(state);
        return json(publicState(state), 201);
      }

      if (url.pathname.startsWith("/uploads/") && request.method === "GET") {
        const filename = url.pathname.slice("/uploads/".length);
        if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(filename)) return new Response("Not found", { status: 404 });
        const file = Bun.file(join(UPLOAD_DIR, filename));
        if (!(await file.exists())) return new Response("Not found", { status: 404 });
        return new Response(file);
      }

      return serveStatic(url.pathname);
    } catch (error) {
      console.error(error);
      return json({ error: "The brunch gremlins dropped that request. Please try again." }, 500);
    }
  },
});

console.log(`Shakshuka Sunday is bubbling at ${server.url}`);
