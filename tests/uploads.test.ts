import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { Accounts, canSubmit } from "@/lib/auth/sessions";
import { PgGameRepo } from "@/lib/db/games";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";
import { strToU8, zipSync } from "fflate";
import { ImportError, importZip } from "@/lib/import";
import { R2UploadStore } from "@/lib/r2";
import { MemoryBlobStore } from "@/lib/storage";
import { isUploadId, uploadKey } from "@/lib/uploads";
import { randomToken } from "@/lib/auth/x";

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

const zip = (html: string) => zipSync({ "index.html": strToU8(html) });

describe("upload references", () => {
  it("accepts only ids this app issued the shape of", () => {
    expect(isUploadId(randomToken())).toBe(true);
    for (const bad of ["", "short", "../../live/x", `${randomToken()}/x`, 42, null, undefined]) {
      expect(isUploadId(bad)).toBe(false);
    }
  });

  it("keeps each person's uploads under their own id", () => {
    const id = randomToken();
    expect(uploadKey("17", id)).toBe(`uploads/17/${id}.zip`);
    expect(() => uploadKey("../17", id)).toThrow();
    expect(() => uploadKey("17", "../x")).toThrow();
  });
});

describe("R2 upload store", () => {
  const options = { accountId: "acct", bucket: "games", accessKeyId: "id", secretAccessKey: "secret" };

  it("hands out an upload address that expires and carries no secret", async () => {
    const store = new R2UploadStore({ ...options, fetch: async () => new Response(null, { status: 500 }) });
    const id = randomToken();
    const url = new URL(await store.begin("17", id));
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/games/uploads/17/${id}.zip`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain("secret");
  });

  it("refuses a zip over the limit before downloading it, and reports a missing one", async () => {
    const calls: string[] = [];
    const big = async (_url: string, init: RequestInit) => {
      calls.push(String(init.method));
      return new Response(null, { status: 200, headers: { "content-length": "999" } });
    };
    const id = randomToken();
    expect(await new R2UploadStore({ ...options, fetch: big }).read("17", id, 100)).toBe("too_large");
    expect(calls).toEqual(["HEAD"]);
    const missing = async () => new Response(null, { status: 404 });
    expect(await new R2UploadStore({ ...options, fetch: missing }).read("17", id, 100)).toBeNull();
  });
});

describe("who may add and replace games", () => {
  let accounts: Accounts;
  let repo: PgGameRepo;
  const store = new MemoryBlobStore();

  beforeEach(async () => {
    const sql = pgliteSql(new PGlite());
    await migrate(sql);
    accounts = new Accounts(sql);
    repo = new PgGameRepo(sql);
  });

  it("lets creators and admins add games, and nobody else", async () => {
    const player = await accounts.signedIn({ id: "1", handle: "player1", name: "" });
    expect(canSubmit(null)).toBe(false);
    expect(canSubmit(player)).toBe(false);
    expect(await accounts.setRole(player.id, "creator")).toBe(true);
    expect(canSubmit(await accounts.byId(player.id))).toBe(true);
  });

  it("makes the configured handles admins at sign-in, whatever their case", async () => {
    const admin = await accounts.signedIn({ id: "2", handle: "HaydnSnape", name: "" }, ["haydnsnape"]);
    expect(admin.role).toBe("admin");
    expect(canSubmit(admin)).toBe(true);
    // The admin page can neither demote an admin nor create one.
    expect(await accounts.setRole(admin.id, "player")).toBe(false);
    expect((await accounts.byId(admin.id))!.role).toBe("admin");
  });

  it("keeps a creator's role when they sign in again", async () => {
    const user = await accounts.signedIn({ id: "3", handle: "maker", name: "" });
    await accounts.setRole(user.id, "creator");
    expect((await accounts.signedIn({ id: "3", handle: "maker", name: "" }, ["someoneelse"])).role).toBe("creator");
  });

  it("records who added a game and lets only them, or an admin, replace it", async () => {
    const maker = await accounts.signedIn({ id: "10", handle: "maker", name: "" });
    const other = await accounts.signedIn({ id: "11", handle: "other", name: "" });
    const admin = await accounts.signedIn({ id: "12", handle: "boss", name: "" }, ["boss"]);
    const deps = { repo, store };

    const first = await importZip(deps, "Lantern Bay", zip("<p>1</p>"), { id: maker.id, admin: false });
    expect(first.creatorId).toBe(maker.id);

    await expect(importZip(deps, "Lantern Bay", zip("<p>stolen</p>"), { id: other.id, admin: false })).rejects.toMatchObject({
      code: "taken",
    });
    await expect(importZip(deps, "Lantern Bay", zip("<p>x</p>"), { id: other.id, admin: false })).rejects.toBeInstanceOf(ImportError);
    expect((await repo.get("lantern-bay"))!.versions).toHaveLength(1);

    const second = await importZip(deps, "Lantern Bay", zip("<p>2</p>"), { id: maker.id, admin: false });
    expect(second.versions).toHaveLength(2);

    const third = await importZip(deps, "Lantern Bay", zip("<p>3</p>"), { id: admin.id, admin: true });
    expect(third.versions).toHaveLength(3);
    // Replacing a build never changes who the game belongs to.
    expect((await repo.get("lantern-bay"))!.creatorId).toBe(maker.id);
  });
});
