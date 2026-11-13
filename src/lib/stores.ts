import path from "node:path";

import { getConfig } from "./config";
import { JsonFileGameRepo, type GameRepo } from "./games";
import { FsBlobStore, type BlobStore } from "./storage";

/**
 * The stores the app and the play server share. Today both are local files
 * under the data folder. Postgres and object storage replace them behind the
 * same two interfaces.
 */
export function openStores(): { repo: GameRepo; store: BlobStore } {
  const { dataDir } = getConfig();
  return {
    repo: new JsonFileGameRepo(path.join(dataDir, "games.json")),
    store: new FsBlobStore(path.join(dataDir, "blobs")),
  };
}
