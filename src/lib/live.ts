import { activeVersion, type Game, type GameState } from "./games";

/**
 * What the play domain needs to serve one game: its state and the files of
 * its live build. The play domain reads this and file storage, and nothing
 * else, so it never needs the database or any credential of the app's.
 */
export type LiveRecord = {
  slug: string;
  state: GameState;
  version: string | null;
  /** Path -> where the file is and how to serve it. */
  files: Record<string, { hash: string; type: string; size: number }>;
};

export interface LiveIndex {
  /** Call after every change to a game's state or live build. */
  publish(game: Game): Promise<void>;
  /** Call when a game is erased, so the play domain no longer knows it. */
  retract(slug: string): Promise<void>;
}

export function liveKey(slug: string): string {
  return `live/${slug}.json`;
}

export function liveRecord(game: Game): LiveRecord {
  const version = activeVersion(game);
  return { slug: game.slug, state: game.state, version: version?.id ?? null, files: version?.manifest ?? {} };
}

/** For local development, where the play server reads the game store directly. */
export class NoLiveIndex implements LiveIndex {
  async publish(): Promise<void> {}
  async retract(): Promise<void> {}
}

export class MemoryLiveIndex implements LiveIndex {
  readonly records = new Map<string, LiveRecord>();
  async publish(game: Game) {
    this.records.set(game.slug, liveRecord(game));
  }
  async retract(slug: string) {
    this.records.delete(slug);
  }
}
