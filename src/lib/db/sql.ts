import type { Pool } from "pg";

/**
 * The little of Postgres the app needs. Production uses a connection pool;
 * tests use an in-process Postgres. Both sit behind this.
 */
export interface Sql {
  /** One statement, with `$1`-style parameters. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Several statements, no parameters, all on one connection. For migrations. */
  exec(text: string): Promise<void>;
}

export function poolSql(pool: Pool): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pool.query(text, params)).rows as T[];
    },
    async exec(text) {
      await pool.query(text);
    },
  };
}

let shared: { url: string; pool: Pool } | undefined;

/** One pool per process, so serverless invocations that share a process share connections. */
export async function connect(url: string): Promise<Sql> {
  if (shared?.url !== url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
    // An idle connection dropping must not crash the process; the pool replaces it.
    pool.on("error", (error) => console.error("Postgres pool error:", error.message));
    shared = { url, pool };
  }
  return poolSql(shared.pool);
}

export async function disconnect(): Promise<void> {
  const pool = shared?.pool;
  shared = undefined;
  await pool?.end();
}
