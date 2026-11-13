import { getConfig } from "@/lib/config";
import { playUrl } from "@/lib/frame";
import { addVersion, buildVersion, PROBE_SLUG, type Game } from "@/lib/games";
import { randomToken } from "@/lib/auth/x";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

const PROBE_PAGE = "<!doctype html><title>Launch Title</title><p>Launch Title play domain: OK</p>\n";

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
 * Proves the deployment can reach its database, its file storage and the play
 * domain. It publishes one fixed, tiny page as a built-in game that no real
 * game can replace, then loads it the way a player's browser would. Because
 * files are keyed by their contents, repeating this stores nothing new.
 */
export async function GET() {
  const { repo, store, live, uploads } = openStores();
  const { databaseUrl, r2 } = getConfig();
  const page = new TextEncoder().encode(PROBE_PAGE);

  const database = await check("database", async () => {
    await repo.list();
  });

  const storage = await check("storage", async () => {
    const hash = await store.put(page);
    const back = await store.get(hash);
    if (!back || back.byteLength !== page.byteLength) throw new Error("read back a different file");
  });

  const play = await check("play", async () => {
    const version = await buildVersion(store, new Map([["index.html", page]]), { kind: "zip" });
    const probe: Game = addVersion(
      { slug: PROBE_SLUG, title: "Probe", state: "HOSTED", versions: [], activeVersionId: null, createdAt: "" },
      version,
    );
    await live.publish(probe);
    const response = await fetch(playUrl(PROBE_SLUG), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`play domain answered ${response.status}`);
    if ((await response.text()) !== PROBE_PAGE) throw new Error("play domain served a different page");
  });

  // The same path a creator's browser takes: a one-off upload address, then read it back and clear it.
  const upload =
    uploads === null ||
    (await check("uploads", async () => {
      const id = randomToken();
      const sent = await fetch(await uploads.begin("health", id), { method: "PUT", body: page });
      if (!sent.ok) throw new Error(`upload address answered ${sent.status}`);
      const back = await uploads.read("health", id, 1024);
      await uploads.remove("health", id);
      if (!(back instanceof Uint8Array) || back.byteLength !== page.byteLength) throw new Error("read back a different upload");
    }));

  const body = {
    ok: database && storage && play && upload,
    database: { ok: database, kind: databaseUrl ? "postgres" : "local file" },
    storage: { ok: storage, kind: r2 ? "r2" : "local disk" },
    play: { ok: play, address: playUrl(PROBE_SLUG) },
    uploads: { ok: upload, kind: uploads ? "r2" : "form" },
  };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
