import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { BotStore } from "@/lib/bot/store";
import { PgGameRepo } from "@/lib/db/games";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";
import { isPlayable } from "@/lib/games";
import { ImportError, importHtml, linkGame } from "@/lib/import";
import { framingBlocked, pageMeta } from "@/lib/import/meta";
import { MemoryBlobStore } from "@/lib/storage";

function pgliteSql(db: PGlite): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await db.query(text, params)).rows as T[];
    },
    async exec(text) {
      await db.exec(text);
    },
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const PAGE = `<!doctype html><html><head>
  <meta property="og:image" content="/share.png">
  <meta name="description" content="Explore, find glints &amp; keep   what you find.">
  <title>Finders</title></head><body><button>Play</button></body></html>`;

/** Stands in for a creator's own site. */
function site(headers: Record<string, string> = {}, page = PAGE) {
  const asked: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith("/share.png")) return new Response(PNG as BodyInit, { status: 200, headers: { "content-type": "image/png" } });
    return new Response(page, { status: 200, headers: { "content-type": "text/html", ...headers } });
  }) as typeof fetch;
  return { fetchImpl, asked };
}

describe("what a page says about itself", () => {
  it("finds the preview image and description, and makes the image address absolute", () => {
    expect(pageMeta(PAGE, "https://finders.gg/")).toEqual({
      image: "https://finders.gg/share.png",
      description: "Explore, find glints & keep what you find.",
    });
  });

  it("ignores an image that is not served securely, and pages that declare nothing", () => {
    expect(pageMeta('<meta property="og:image" content="http://x.example/a.png">', "https://a.example/")).toEqual({});
    expect(pageMeta("<p>hello</p>", "https://a.example/")).toEqual({});
  });
});

describe("whether a site may be shown inside the store", () => {
  const store = ["https://launchtitle.gg"];
  const h = (init: Record<string, string>) => new Headers(init);

  it("is fine when the site says nothing, or names the store", () => {
    expect(framingBlocked(h({}), store)).toBe(false);
    expect(framingBlocked(h({ "content-security-policy": "default-src 'self'; frame-ancestors 'self' https://launchtitle.gg" }), store)).toBe(false);
    expect(framingBlocked(h({ "content-security-policy": "frame-ancestors *" }), store)).toBe(false);
  });

  it("is blocked by either header that forbids it", () => {
    expect(framingBlocked(h({ "x-frame-options": "DENY" }), store)).toBe(true);
    expect(framingBlocked(h({ "x-frame-options": "SAMEORIGIN" }), store)).toBe(true);
    expect(framingBlocked(h({ "content-security-policy": "frame-ancestors 'none'" }), store)).toBe(true);
    expect(framingBlocked(h({ "content-security-policy": "frame-ancestors 'self' https://other.example" }), store)).toBe(true);
  });
});

describe("games that play from their creator's site", () => {
  let repo: PgGameRepo;
  let sql: Sql;
  const store = new MemoryBlobStore();
  const maker = { id: "1", admin: false };

  beforeEach(async () => {
    sql = pgliteSql(new PGlite());
    await migrate(sql);
    await sql.query("INSERT INTO users (x_account_id, handle) VALUES ('x1','maker'), ('x2','other')");
    repo = new PgGameRepo(sql);
  });

  it("lists the game without copying it, and fills in its cover and description", async () => {
    const { fetchImpl, asked } = site();
    const game = await linkGame({ repo, store }, "Finders Keepers", "https://finders.gg/#start", { fetchImpl }, maker);
    expect(game).toMatchObject({ slug: "finders-keepers", externalUrl: "https://finders.gg/", versions: [], creatorId: "1" });
    expect(game.description).toBe("Explore, find glints & keep what you find.");
    expect(game.cover?.type).toBe("image/png");
    expect(asked).toEqual(["https://finders.gg/", "https://finders.gg/share.png"]);
    expect(isPlayable(game)).toBe(true);
    expect(await repo.get("finders-keepers")).toEqual(game);
  });

  it("says so plainly when the site forbids being framed", async () => {
    const { fetchImpl } = site({ "x-frame-options": "DENY" });
    await expect(linkGame({ repo, store }, "Locked", "https://locked.example/", { fetchImpl }, maker)).rejects.toThrow(/does not allow being shown/);
    expect(await repo.get("locked")).toBeNull();
  });

  it("refuses addresses that are not secure or point inward", async () => {
    const { fetchImpl } = site();
    await expect(linkGame({ repo, store }, "A", "http://finders.gg/", { fetchImpl }, maker)).rejects.toBeInstanceOf(ImportError);
    await expect(linkGame({ repo, store }, "B", "https://127.0.0.1/", { fetchImpl }, maker)).rejects.toBeInstanceOf(ImportError);
    await expect(linkGame({ repo, store }, "C", "not an address", { fetchImpl }, maker)).rejects.toBeInstanceOf(ImportError);
  });

  it("switches a copied game to its creator's site, keeps what the creator set, and switches back on a new upload", async () => {
    const html = new TextEncoder().encode("<!doctype html><canvas></canvas>");
    const copied = await importHtml({ repo, store }, "Finders Keepers", html, maker);
    await repo.save({ ...copied, description: "My own words." });

    const { fetchImpl } = site();
    await expect(linkGame({ repo, store }, "Finders Keepers", "https://finders.gg/", { fetchImpl }, { id: "2", admin: false })).rejects.toMatchObject({ code: "taken" });

    const linked = await linkGame({ repo, store }, "Finders Keepers", "https://finders.gg/", { fetchImpl }, { id: "9", admin: true });
    expect(linked.externalUrl).toBe("https://finders.gg/");
    expect(linked.creatorId).toBe("1");
    expect(linked.versions).toHaveLength(1);
    expect(linked.description).toBe("My own words.");
    expect(linked.cover?.type).toBe("image/png");

    const back = await importHtml({ repo, store }, "Finders Keepers", new TextEncoder().encode("<!doctype html><canvas id=2></canvas>"), maker);
    expect(back.externalUrl).toBeUndefined();
    expect((await repo.get("finders-keepers"))!.externalUrl).toBeUndefined();
    expect(back.versions).toHaveLength(2);
  });

  it("is not playable while paused, or with neither a copy nor a site", async () => {
    const { fetchImpl } = site();
    const game = await linkGame({ repo, store }, "Finders Keepers", "https://finders.gg/", { fetchImpl }, maker);
    expect(isPlayable({ ...game, state: "PAUSED" })).toBe(false);
    expect(isPlayable({ ...game, externalUrl: undefined })).toBe(false);
  });

  it("remembers whether an approved request should be copied or linked", async () => {
    const bot = new BotStore(sql);
    const n = (await bot.createNomination({
      postId: "1", conversationId: "1", nominatorXId: "5", nominatorHandle: "fan", creatorXId: "x1", creatorHandle: "maker",
      sourceUrl: "https://finders.gg/", state: "AWAITING_REVIEW",
    }))!;
    expect(n.mode).toBe("copy");
    await bot.move(n.id, "AWAITING_REVIEW", "APPROVED", { title: "Finders", mode: "link" });
    expect((await bot.byId(n.id))!).toMatchObject({ state: "APPROVED", mode: "link", title: "Finders" });
  });
});
