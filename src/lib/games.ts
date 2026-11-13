import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { contentType, type FileMap } from "./files";
import { sha256, type BlobStore } from "./storage";

/** The game states from the spec. Milestone 1 only produces HOSTED. */
export type GameState =
  | "NOMINATED"
  | "CONFIRMED"
  | "HOSTED"
  | "CLAIMED"
  | "PAYABLE"
  | "PAUSED"
  | "OPTED_OUT"
  | "REMOVED";

/** States in which the hosted copy is served to players. */
export const SERVED_STATES: ReadonlySet<GameState> = new Set(["HOSTED", "CLAIMED", "PAYABLE"]);

export type ManifestEntry = { hash: string; size: number; type: string };
export type Manifest = Record<string, ManifestEntry>;

export type Version = {
  /** Derived from the file list and contents, so the same build always gets the same id. */
  id: string;
  manifest: Manifest;
  totalBytes: number;
  createdAt: string;
  source: { kind: "zip" } | { kind: "html" } | { kind: "crawl"; url: string };
  /** Other sites the game's files refer to. Logged for review, not blocked. */
  externalDomains: string[];
};

export type Game = {
  slug: string;
  title: string;
  state: GameState;
  versions: Version[];
  activeVersionId: string | null;
  createdAt: string;
  /** The signed-in person who added the game. Absent for games added before sign-in existed. */
  creatorId?: string;
  /** A sentence or two for the game's page. */
  description?: string;
  /** The cover image: its key in file storage and its type. */
  cover?: { hash: string; type: string };
  /** On a wide screen, a game made for phones is shown phone-shaped instead of stretched across the window. */
  display?: "portrait";
  /** Set when the game plays from its creator's own site instead of from our copy. */
  externalUrl?: string;
  /** Pictures of the game being played, in the order they are shown. */
  screenshots?: { hash: string; type: string }[];
  /** The controls and the aim, in the creator's words. */
  howTo?: string;
  /** What the game is made for. Absent when it plays well on both. */
  devices?: "phone" | "desktop";
};

/** A game can be played if it has a build of ours to serve, or a site of its own to play from. */
export function isPlayable(game: Game): boolean {
  return SERVED_STATES.has(game.state) && Boolean(game.externalUrl || activeVersion(game));
}

export interface GameRepo {
  list(): Promise<Game[]>;
  get(slug: string): Promise<Game | null>;
  save(game: Game): Promise<void>;
}

/** The health check publishes a tiny built-in page under this address. No game may take it. */
export const PROBE_SLUG = "lt-probe";

const RESERVED = new Set(["www", "api", "app", "admin", "play", "static", "assets", "cdn", PROBE_SLUG]);

/** A slug is also the game's subdomain, so it must be a valid DNS label. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !RESERVED.has(slug);
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return isValidSlug(slug) ? slug : `game-${sha256(title).slice(0, 8)}`;
}

/** Store every file and describe the build. Nothing is written twice. */
export async function buildVersion(
  store: BlobStore,
  files: FileMap,
  source: Version["source"],
  externalDomains: string[] = [],
): Promise<Version> {
  const manifest: Manifest = {};
  let totalBytes = 0;
  const names = [...files.keys()].sort();
  // A few at a time: fast enough for a game of 2,000 files, gentle on file storage.
  const UPLOADS_AT_ONCE = 8;
  for (let i = 0; i < names.length; i += UPLOADS_AT_ONCE) {
    const batch = names.slice(i, i + UPLOADS_AT_ONCE);
    const hashes = await Promise.all(batch.map((name) => store.put(files.get(name)!)));
    batch.forEach((name, j) => {
      const bytes = files.get(name)!;
      manifest[name] = { hash: hashes[j], size: bytes.byteLength, type: contentType(name) };
      totalBytes += bytes.byteLength;
    });
  }
  const id = sha256(JSON.stringify(Object.entries(manifest).map(([name, e]) => [name, e.hash]))).slice(0, 16);
  return {
    id,
    manifest,
    totalBytes,
    createdAt: new Date().toISOString(),
    source,
    externalDomains: [...new Set(externalDomains)].sort(),
  };
}

/** Add a build and make it the live one. Importing the same build again changes nothing but the live pointer. */
export function addVersion(game: Game, version: Version): Game {
  const known = game.versions.some((v) => v.id === version.id);
  return {
    ...game,
    versions: known ? game.versions : [...game.versions, version],
    activeVersionId: version.id,
  };
}

/** Point the game back at an earlier build. Every build is kept, so this is always possible. */
export function rollback(game: Game, versionId: string): Game {
  if (!game.versions.some((v) => v.id === versionId)) {
    throw new Error(`Unknown version ${versionId} for ${game.slug}`);
  }
  return { ...game, activeVersionId: versionId };
}

export function activeVersion(game: Game): Version | null {
  return game.versions.find((v) => v.id === game.activeVersionId) ?? null;
}

export class MemoryGameRepo implements GameRepo {
  private readonly games = new Map<string, Game>();
  async list() {
    return [...this.games.values()];
  }
  async get(slug: string) {
    return this.games.get(slug) ?? null;
  }
  async save(game: Game) {
    this.games.set(game.slug, structuredClone(game));
  }
}

/**
 * A single JSON file, for local development before the Postgres database exists.
 * It is not safe for concurrent writers and must not be used in production.
 */
export class JsonFileGameRepo implements GameRepo {
  constructor(private readonly file: string) {}

  private async read(): Promise<Record<string, Game>> {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async list() {
    return Object.values(await this.read()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(slug: string) {
    return (await this.read())[slug] ?? null;
  }

  async save(game: Game) {
    const all = await this.read();
    all[game.slug] = game;
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 1));
    await rename(tmp, this.file);
  }
}
