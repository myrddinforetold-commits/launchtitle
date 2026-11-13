import path from "node:path";

import { getConfig } from "./config";
import { PgGameRepo } from "./db/games";
import { connect } from "./db/sql";
import { JsonFileGameRepo, type Game, type GameRepo } from "./games";
import { FsBlobStore, type BlobStore } from "./storage";

/** Connects on first use, so opening the stores never touches the network. */
class LazyPgGameRepo implements GameRepo {
  private repo?: Promise<PgGameRepo>;
  constructor(private readonly url: string) {}
  private open() {
    return (this.repo ??= connect(this.url).then((sql) => new PgGameRepo(sql)));
  }
  async list() {
    return (await this.open()).list();
  }
  async get(slug: string) {
    return (await this.open()).get(slug);
  }
  async save(game: Game) {
    return (await this.open()).save(game);
  }
}

/**
 * The stores the app and the play server share. Game records live in Postgres
 * when DATABASE_URL is set, and in a local JSON file otherwise. Game files are
 * still local files; object storage replaces them behind the same interface.
 */
export function openStores(): { repo: GameRepo; store: BlobStore } {
  const { dataDir, databaseUrl } = getConfig();
  return {
    repo: databaseUrl ? new LazyPgGameRepo(databaseUrl) : new JsonFileGameRepo(path.join(dataDir, "games.json")),
    store: new FsBlobStore(path.join(dataDir, "blobs")),
  };
}
