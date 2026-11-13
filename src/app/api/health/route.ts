import { getConfig } from "@/lib/config";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

const PROBE = new TextEncoder().encode("launchtitle health probe\n");

async function check(name: string, run: () => Promise<void>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    // Details go to the server log only; the response says pass or fail.
    console.error(`health: ${name} failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Proves the deployment can reach its database and its file storage.
 * The storage check stores one fixed, tiny file and reads it back; because
 * files are keyed by their contents, repeating it stores nothing new.
 */
export async function GET() {
  const { repo, store } = openStores();
  const { databaseUrl, r2 } = getConfig();

  const [database, storage] = await Promise.all([
    check("database", async () => {
      await repo.list();
    }),
    check("storage", async () => {
      const hash = await store.put(PROBE);
      const back = await store.get(hash);
      if (!back || back.byteLength !== PROBE.byteLength) throw new Error("read back a different file");
    }),
  ]);

  const body = {
    ok: database && storage,
    database: { ok: database, kind: databaseUrl ? "postgres" : "local file" },
    storage: { ok: storage, kind: r2 ? "r2" : "local disk" },
  };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
