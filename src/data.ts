import { constants } from "node:fs";
import { copyFile, cp, mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

export type RSVP = {
  id: string;
  name: string;
  attendance: "yes" | "maybe" | "no";
  partySize: number;
  email?: string;
  phone?: string;
  contactApp?: string;
  dietary: string;
  contribution: string;
  comment?: string;
  createdAt: string;
  ownerTokenHash?: string;
};
export type Song = {
  id: string;
  title: string;
  artist: string;
  url: string;
  addedBy: string;
  createdAt: string;
  ownerTokenHash?: string;
};
export type Photo = {
  id: string;
  url: string;
  previewUrl?: string;
  previewWidth?: number;
  previewHeight?: number;
  caption: string;
  uploader: string;
  createdAt: string;
  ownerTokenHash?: string;
};
export type BrunchData = { rsvps: RSVP[]; songs: Song[]; photos: Photo[] };
export type DataState = {
  version: 2;
  activeBrunchId: string;
  brunches: Record<string, BrunchData>;
};

export const FIRST_BRUNCH_ID = "first-brunch";
export const imageFilenamePattern = /^[a-f0-9-]+\.(jpg|png|webp|gif)$/i;
export const validBrunchId = (id: string) => typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const emptyBrunch = (): BrunchData => ({ rsvps: [], songs: [], photos: [] });

export class DataError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function validateBrunch(value: unknown): asserts value is BrunchData {
  const brunch = value as BrunchData;
  if (!brunch || !Array.isArray(brunch.rsvps) || !Array.isArray(brunch.songs) || !Array.isArray(brunch.photos)) {
    throw new Error("Invalid brunch data. Refusing to replace it with empty data.");
  }
}

function validateState(value: unknown): asserts value is DataState {
  const state = value as DataState;
  if (!state || state.version !== 2 || !state.brunches ||
      !validBrunchId(state.activeBrunchId) || !Object.hasOwn(state.brunches, state.activeBrunchId)) {
    throw new Error("Invalid brunch state or active brunch.");
  }
  for (const [id, brunch] of Object.entries(state.brunches)) {
    if (!validBrunchId(id)) throw new Error("Invalid brunch ID.");
    validateBrunch(brunch);
  }
}

export function publicState(state: BrunchData, brunchId: string) {
  return {
    brunchId,
    rsvps: state.rsvps.map(({ email: _email, phone: _phone, contactApp: _contactApp, comment: _comment, ownerTokenHash: _ownerTokenHash, ...rsvp }) => rsvp),
    songs: state.songs.map(({ ownerTokenHash: _ownerTokenHash, ...song }) => song),
    photos: state.photos.map(({ ownerTokenHash: _ownerTokenHash, ...photo }) => photo),
  };
}

export class BrunchStore {
  readonly stateFile: string;
  readonly uploadDir: string;
  readonly previewDir: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(readonly dataDir: string) {
    this.stateFile = join(dataDir, "state.json");
    this.uploadDir = join(dataDir, "uploads");
    this.previewDir = join(dataDir, "previews");
  }

  private async write(state: DataState) {
    validateState(state);
    const temporary = join(this.dataDir, `state-${crypto.randomUUID()}.tmp`);
    await Bun.write(temporary, JSON.stringify(state, null, 2) + "\n");
    await rename(temporary, this.stateFile);
  }

  async read(): Promise<DataState> {
    const state = await Bun.file(this.stateFile).json();
    validateState(state);
    return state;
  }

  async initialize() {
    await mkdir(this.uploadDir, { recursive: true });
    if (!(await Bun.file(this.stateFile).exists())) {
      await mkdir(join(this.uploadDir, FIRST_BRUNCH_ID), { recursive: true });
      await this.write({
        version: 2,
        activeBrunchId: FIRST_BRUNCH_ID,
        brunches: { [FIRST_BRUNCH_ID]: emptyBrunch() },
      });
      return;
    }
    const original = await Bun.file(this.stateFile).json();
    if (original.version !== undefined) {
      validateState(original);
      for (const id of Object.keys(original.brunches)) {
        await mkdir(join(this.uploadDir, id), { recursive: true });
      }
      return;
    }
    validateBrunch(original);

    // Back up the legacy layout once before moving any originals.
    const backupDir = join(this.dataDir, "backups", "before-multibrunch");
    await mkdir(backupDir, { recursive: true });
    if (!(await Bun.file(join(backupDir, "state.json")).exists())) {
      await cp(this.uploadDir, join(backupDir, "uploads"), { recursive: true });
      await copyFile(this.stateFile, join(backupDir, "state.json"), constants.COPYFILE_EXCL);
    }

    const destination = join(this.uploadDir, FIRST_BRUNCH_ID);
    await mkdir(destination, { recursive: true });
    for (const photo of original.photos) {
      const filename = photo.url.slice("/uploads/".length);
      if (!photo.url.startsWith("/uploads/") || !imageFilenamePattern.test(filename)) {
        throw new Error("Invalid legacy photo URL. Migration stopped; original data is backed up.");
      }
      if (!(await Bun.file(join(this.uploadDir, filename)).exists()) &&
          !(await Bun.file(join(destination, filename)).exists())) {
        throw new Error("Missing original photo. Migration stopped; original data is backed up.");
      }
    }
    // Include unreferenced uploads too; never discard original files.
    for (const entry of await readdir(this.uploadDir, { withFileTypes: true })) {
      if (!entry.isFile() || !imageFilenamePattern.test(entry.name)) continue;
      if (await Bun.file(join(destination, entry.name)).exists()) {
        throw new Error("Upload destination already exists. Refusing to overwrite a photo.");
      }
      await rename(join(this.uploadDir, entry.name), join(destination, entry.name));
    }
    const migrated: BrunchData = {
      ...original,
      photos: original.photos.map((photo: Photo) => ({
        ...photo,
        url: `/uploads/${FIRST_BRUNCH_ID}/${photo.url.slice("/uploads/".length)}`,
      })),
    };
    await this.write({
      version: 2,
      activeBrunchId: FIRST_BRUNCH_ID,
      brunches: { [FIRST_BRUNCH_ID]: migrated },
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  async run(
    requestedId: string | undefined,
    mutate: boolean,
    handler: (brunch: BrunchData, brunchId: string) => Promise<Response>,
  ): Promise<Response> {
    const operation = async () => {
      const state = await this.read();
      const id = requestedId ?? state.activeBrunchId;
      if (!validBrunchId(id) || !Object.hasOwn(state.brunches, id)) {
        throw new DataError("That brunch does not exist.", 404);
      }
      const response = await handler(state.brunches[id], id);
      if (mutate && response.ok) await this.write(state);
      return response;
    };
    // Read the entire JSON inside the queue so concurrent changes to different
    // brunches cannot overwrite one another.
    return mutate ? this.enqueue(operation) : operation();
  }

  async create(id: string, activate = false) {
    if (!validBrunchId(id)) throw new DataError("Use a brunch ID such as second-brunch.");
    return this.enqueue(async () => {
      const state = await this.read();
      if (Object.hasOwn(state.brunches, id)) throw new DataError("That brunch already exists.");
      state.brunches[id] = emptyBrunch();
      if (activate) state.activeBrunchId = id;
      await mkdir(join(this.uploadDir, id), { recursive: true });
      await this.write(state);
    });
  }
}
