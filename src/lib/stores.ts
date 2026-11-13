import path from "node:path";

import { getConfig } from "./config";
import { PgGameRepo } from "./db/games";
import { connect } from "./db/sql";
import { JsonFileGameRepo, type Game, type GameRepo } from "./games";
import { NoLiveIndex, type LiveIndex } from "./live";
import { R2BlobStore, R2LiveIndex, R2UploadStore } from "./r2";
import { FsBlobStore, type BlobStore } from "./storage";
import type { UploadStore } from "./uploads";

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
  async delete(slug: string) {
    return (await this.open()).delete(slug);
  }
}

/**
 * The stores the app and the play server share. Game records live in Postgres
 * when DATABASE_URL is set, and in a local JSON file otherwise. Game files live
 * in the R2 bucket when its four settings are present, and on local disk otherwise.
 */
export function openStores(): { repo: GameRepo; store: BlobStore; live: LiveIndex; uploads: UploadStore | null } {
  const { dataDir, databaseUrl, r2 } = getConfig();
  return {
    repo: databaseUrl ? new LazyPgGameRepo(databaseUrl) : new JsonFileGameRepo(path.join(dataDir, "games.json")),
    store: r2 ? new R2BlobStore(r2) : new FsBlobStore(path.join(dataDir, "blobs")),
    live: r2 ? new R2LiveIndex(r2) : new NoLiveIndex(),
    uploads: r2 ? new R2UploadStore(r2) : null,
  };
}
