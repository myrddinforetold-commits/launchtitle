import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Sql } from "./sql";

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** Any fixed number: it only has to be the same for every process that migrates. */
const LOCK_KEY = 746_100_1;

/**
 * Apply every migration that has not been applied yet, in file-name order.
 * Each file runs in its own transaction and is recorded in `schema_migrations`.
 * Returns the names it applied.
 */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  await sql.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const done = new Set((await sql.query<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    // The lock makes a second build wait for the first; it then re-runs the
    // file, which is why migrations must be safe to run twice.
    await sql.exec(
      `BEGIN;
       SELECT pg_advisory_xact_lock(${LOCK_KEY});
       ${body}
       ;INSERT INTO schema_migrations (name) VALUES ('${file}') ON CONFLICT DO NOTHING;
       COMMIT;`,
    );
    applied.push(file);
  }
  return applied;
}
