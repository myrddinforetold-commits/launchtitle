import path from "node:path";

/** Runtime settings, read from the environment on each call so tests can override them. */
export function getConfig() {
  return {
    /** Where the local stores keep their files. */
    dataDir: process.env.LT_DATA_DIR ?? path.join(process.cwd(), ".data"),
    /** Postgres connection string. Without it, game records go to a local file. */
    databaseUrl: process.env.DATABASE_URL || undefined,
    /**
     * Host that serves game files. Each game lives at `{slug}.{playHost}`.
     * In production this must be a different registrable domain from the app,
     * so game code can never share cookies or storage with it.
     */
    playHost: (process.env.LT_PLAY_HOST ?? "play.localhost:4001").toLowerCase(),
    playScheme: process.env.LT_PLAY_SCHEME ?? "http",
    /** The only origin allowed to put a game in a frame. */
    appOrigin: process.env.LT_APP_ORIGIN ?? "http://localhost:3000",
    /** Lets anyone import a game without signing in. For local development only. */
    openImport: process.env.LT_OPEN_IMPORT === "1",
  };
}

/** Import limits from the spec: 200 MB and 2,000 files per game. */
export const LIMITS = {
  maxBytes: 200 * 1024 * 1024,
  maxFiles: 2000,
} as const;
