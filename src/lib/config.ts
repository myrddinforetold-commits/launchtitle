import path from "node:path";

/** Runtime settings, read from the environment on each call so tests can override them. */
export function getConfig() {
  return {
    /** Where the local stores keep their files. */
    dataDir: process.env.LT_DATA_DIR ?? path.join(process.cwd(), ".data"),
    /** Postgres connection string. Without it, game records go to a local file. */
    databaseUrl: process.env.DATABASE_URL || undefined,
    /** Cloudflare R2 bucket for game files. Unless all four are set, files stay on local disk. */
    r2: readR2(),
    /** The X app used for sign-in. Without both, sign-in is switched off. */
    xClientId: process.env.X_CLIENT_ID?.trim() || undefined,
    xClientSecret: process.env.X_CLIENT_SECRET?.trim() || undefined,
    /** X handles that become admins when they sign in. How the first admin exists at all. */
    adminHandles: (process.env.LT_ADMIN_HANDLES ?? "")
      .split(",")
      .map((h) => h.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
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

function readR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return undefined;
  // Values pasted into a dashboard often carry a stray space or newline.
  return {
    accountId: accountId.trim(),
    bucket: bucket.trim(),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
  };
}

/** Import limits from the spec: 200 MB and 2,000 files per game. */
export const LIMITS = {
  maxBytes: 200 * 1024 * 1024,
  maxFiles: 2000,
} as const;
