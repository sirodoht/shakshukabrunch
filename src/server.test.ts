import { beforeEach, afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrunchStore } from "./data";
import { createApp } from "./server";

let dataDir: string;
const token = "a-long-test-owner-token-for-brunch";
const filename = "11111111-1111-4111-8111-111111111111.jpg";
const legacy = () => ({
  rsvps: [{
    id: "11111111-1111-4111-8111-111111111112", name: "First guest",
    attendance: "yes", partySize: 2, dietary: "", contribution: "",
    createdAt: "2026-07-19T10:00:00Z", ownerTokenHash: "preserve-this-hash",
    email: "private@example.test", phone: "private-phone", contactApp: "private-contact", comment: "private-comment",
  }],
  songs: [{ id: "11111111-1111-4111-8111-111111111113", title: "First song", artist: "", url: "", addedBy: "First guest", createdAt: "2026-07-19T10:00:00Z" }],
  photos: [{ id: "11111111-1111-4111-8111-111111111114", url: `/uploads/${filename}`, caption: "First photo", uploader: "First guest", createdAt: "2026-07-19T10:00:00Z", ownerTokenHash: "photo-hash" }],
});

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "shakshuka-multibrunch-test-"));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function seedLegacy() {
  await mkdir(join(dataDir, "uploads"), { recursive: true });
  await Bun.write(join(dataDir, "state.json"), JSON.stringify(legacy()));
  await Bun.write(join(dataDir, "uploads", filename), "original-photo-bytes");
}

async function setupTwoBrunches() {
  await seedLegacy();
  const app = await createApp({ dataDir });
  const store = new BrunchStore(dataDir);
  await store.create("second-brunch", true);
  return { app, store };
}

const request = (path: string, method = "GET", body?: unknown) => new Request("http://brunch.test" + path, {
  method,
  ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
});

test("migration preserves all records, ownership keys, image bytes, and a complete backup", async () => {
  await seedLegacy();
  await Bun.write(join(dataDir, "uploads", "22222222-2222-4222-8222-222222222222.jpg"), "unreferenced-photo");
  const store = new BrunchStore(dataDir);
  await store.initialize();
  const state = await store.read();
  expect(state.version).toBe(2);
  expect(state.activeBrunchId).toBe("first-brunch");
  expect(state.brunches["first-brunch"].rsvps).toEqual(legacy().rsvps);
  expect(state.brunches["first-brunch"].songs).toEqual(legacy().songs);
  expect(state.brunches["first-brunch"].photos).toEqual(legacy().photos.map(p => ({ ...p, url: `/uploads/first-brunch/${filename}` })));
  expect(await Bun.file(join(dataDir, "uploads", "first-brunch", filename)).text()).toBe("original-photo-bytes");
  expect(await Bun.file(join(dataDir, "uploads", filename)).exists()).toBe(false);
  expect(await Bun.file(join(dataDir, "uploads", "first-brunch", "22222222-2222-4222-8222-222222222222.jpg")).text()).toBe("unreferenced-photo");
  expect(await Bun.file(join(dataDir, "backups", "before-multibrunch", "state.json")).json()).toEqual(legacy());
  expect(await Bun.file(join(dataDir, "backups", "before-multibrunch", "uploads", filename)).text()).toBe("original-photo-bytes");
  await store.initialize();
  expect(await store.read()).toEqual(state);
});

test("migration resumes if interrupted after moving a photo", async () => {
  await seedLegacy();
  await mkdir(join(dataDir, "uploads", "first-brunch"));
  const { rename } = await import("node:fs/promises");
  await rename(join(dataDir, "uploads", filename), join(dataDir, "uploads", "first-brunch", filename));
  const store = new BrunchStore(dataDir);
  await store.initialize();
  expect((await store.read()).brunches["first-brunch"].photos[0].url).toBe(`/uploads/first-brunch/${filename}`);
});

test("corrupt or incomplete legacy data is never replaced with empty data", async () => {
  await Bun.write(join(dataDir, "state.json"), "not valid JSON");
  await expect(new BrunchStore(dataDir).initialize()).rejects.toThrow();
  expect(await Bun.file(join(dataDir, "state.json")).text()).toBe("not valid JSON");
  await Bun.write(join(dataDir, "state.json"), JSON.stringify(legacy()));
  await expect(new BrunchStore(dataDir).initialize()).rejects.toThrow("Missing original photo");
  expect(await Bun.file(join(dataDir, "state.json")).json()).toEqual(legacy());
});

test("active main state and explicit first-brunch state remain independent", async () => {
  const { app } = await setupTwoBrunches();
  const active = await (await app(request("/api/state"))).json();
  expect(active.brunchId).toBe("second-brunch");
  expect(active.rsvps).toHaveLength(0);
  const first = await (await app(request("/api/brunches/first-brunch/state"))).json();
  expect(first.brunchId).toBe("first-brunch");
  expect(first.rsvps).toHaveLength(1);
  expect(first.rsvps[0].name).toBe("First guest");
  for (const field of ["ownerTokenHash", "email", "phone", "contactApp", "comment"]) {
    expect(first.rsvps[0]).not.toHaveProperty(field);
  }
  expect(first.photos[0]).not.toHaveProperty("ownerTokenHash");
  expect((await app(request("/first-brunch"))).status).toBe(200);
  expect((await app(request("/first-brunch", "POST"))).status).toBe(405);
  expect((await app(request("/api/brunches/missing-brunch/state"))).status).toBe(404);
  expect((await app(request("/api/brunches/%2e%2e%2funsafe/state"))).status).toBe(404);
});

test("legacy photo links redirect to the preserved first-brunch image", async () => {
  const { app } = await setupTwoBrunches();
  const old = await app(request(`/uploads/${filename}`));
  expect(old.status).toBe(308);
  expect(old.headers.get("Location")).toBe(`/uploads/first-brunch/${filename}`);
  expect(await (await app(request(`/uploads/first-brunch/${filename}`))).text()).toBe("original-photo-bytes");
  expect((await app(request(`/uploads/second-brunch/${filename}`))).status).toBe(404);
});

test("RSVP and song writes, ownership checks, and deletes stay within their brunch", async () => {
  const { app, store } = await setupTwoBrunches();
  const rsvp = await app(request("/api/rsvp", "POST", { name: "Second guest", attendance: "yes", ownerToken: token }));
  expect(rsvp.status).toBe(201);
  const submitted = await rsvp.json();
  expect(submitted.brunchId).toBe("second-brunch");
  const song = await (await app(request("/api/brunches/second-brunch/songs", "POST", { title: "Second song", ownerToken: token }))).json();
  expect((await store.read()).brunches["first-brunch"]).toEqual({
    ...legacy(), photos: legacy().photos.map(p => ({ ...p, url: `/uploads/first-brunch/${filename}` })),
  });
  expect((await app(request(`/api/brunches/first-brunch/rsvps/${submitted.submittedRsvpId}`, "DELETE", { ownerToken: token }))).status).toBe(404);
  expect((await app(request(`/api/brunches/second-brunch/rsvps/${submitted.submittedRsvpId}`, "DELETE", { ownerToken: "wrong" }))).status).toBe(403);
  expect((await app(request(`/api/brunches/second-brunch/rsvps/${submitted.submittedRsvpId}`, "DELETE", { ownerToken: token }))).status).toBe(200);
  expect((await app(request(`/api/brunches/second-brunch/songs/${song.submittedSongId}`, "DELETE", { ownerToken: token }))).status).toBe(200);
  expect((await store.read()).brunches["second-brunch"].rsvps).toHaveLength(0);
  expect((await store.read()).brunches["second-brunch"].songs).toHaveLength(0);
});

test("photo uploads and deletions use only the selected brunch's directory", async () => {
  const { app, store } = await setupTwoBrunches();
  const form = new FormData();
  form.set("image", new File(["second-photo-bytes"], "photo.jpg", { type: "image/jpeg" }));
  form.set("ownerToken", token);
  const response = await app(new Request("http://brunch.test/api/brunches/second-brunch/photos", { method: "POST", body: form }));
  expect(response.status).toBe(201);
  const submitted = await response.json();
  const photo = submitted.photos[0];
  expect(photo.url.startsWith("/uploads/second-brunch/")).toBe(true);
  expect(await (await app(request(photo.url))).text()).toBe("second-photo-bytes");
  expect((await app(request(`/api/brunches/first-brunch/photos/${photo.id}`, "DELETE", { ownerToken: token }))).status).toBe(404);
  expect(await (await app(request(photo.url))).text()).toBe("second-photo-bytes");
  expect((await app(request(`/api/brunches/second-brunch/photos/${photo.id}`, "DELETE", { ownerToken: token }))).status).toBe(200);
  expect((await app(request(photo.url))).status).toBe(404);
  expect((await store.read()).brunches["second-brunch"].photos).toHaveLength(0);
  expect(await Bun.file(join(dataDir, "uploads", "first-brunch", filename)).text()).toBe("original-photo-bytes");
});

test("concurrent updates to different brunches do not lose data", async () => {
  const { app, store } = await setupTwoBrunches();
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    app(request(`/api/brunches/${i % 2 ? "first-brunch" : "second-brunch"}/songs`, "POST", { title: `Concurrent ${i}`, ownerToken: token }))
  ));
  expect(responses.every(r => r.status === 201)).toBe(true);
  const state = await store.read();
  expect(state.brunches["first-brunch"].songs).toHaveLength(11);
  expect(state.brunches["second-brunch"].songs).toHaveLength(10);
});

test("creating brunches is explicit and rejects duplicates and invalid IDs", async () => {
  const store = new BrunchStore(dataDir);
  await store.initialize();
  await store.create("second-brunch");
  expect((await store.read()).activeBrunchId).toBe("first-brunch");
  await expect(store.create("second-brunch")).rejects.toThrow("already exists");
  await expect(store.create("../unsafe")).rejects.toThrow();
  await store.create("third-brunch", true);
  expect((await store.read()).activeBrunchId).toBe("third-brunch");
});
