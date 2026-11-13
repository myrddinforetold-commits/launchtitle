import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/lib/auth/sessions";
import { PgGameRepo } from "@/lib/db/games";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";
import { ImportError, importHtml } from "@/lib/import";
import { sniffImage } from "@/lib/images";
import { MemoryLiveIndex } from "@/lib/live";
import { addScreenshot, canManage, deleteGame, ManageError, MAX_SCREENSHOTS, mayMove, removeScreenshot, setDetails, setState } from "@/lib/manage";
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

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const person = (id: string, role: User["role"]): User => ({ id, xAccountId: `x${id}`, handle: `user${id}`, name: "", role });

describe("images", () => {
  it("recognises PNG, JPEG and WebP from their first bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(enc("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("treats everything else as not an image, whatever it is called", () => {
    for (const other of ["<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>", "<!doctype html><script>1</script>", "GIF89a", ""]) {
      expect(sniffImage(enc(other))).toBeNull();
    }
  });
});

describe("managing a game", () => {
  let repo: PgGameRepo;
  let sql: Sql;
  const store = new MemoryBlobStore();
  const maker = person("1", "creator");
  const other = person("2", "creator");
  const admin = person("3", "admin");

  beforeEach(async () => {
    sql = pgliteSql(new PGlite());
    await migrate(sql);
    await sql.query("INSERT INTO users (x_account_id, handle) VALUES ('x1','user1'), ('x2','user2'), ('x3','user3')");
    repo = new PgGameRepo(sql);
  });

  const add = () => importHtml({ repo, store }, "Lantern Bay", enc("<!doctype html><canvas></canvas>"), { id: maker.id, admin: false });

  it("imports a single page as a game", async () => {
    const game = await add();
    expect(Object.keys(game.versions[0].manifest)).toEqual(["index.html"]);
    expect(game.versions[0].source).toEqual({ kind: "html" });
    await expect(importHtml({ repo, store }, "Notes", enc("just some text"))).rejects.toBeInstanceOf(ImportError);
    await expect(importHtml({ repo, store }, "Empty", new Uint8Array())).rejects.toBeInstanceOf(ImportError);
  });

  it("lets the creator and admins manage it, and nobody else", async () => {
    const game = await add();
    expect(canManage(maker, game)).toBe(true);
    expect(canManage(admin, game)).toBe(true);
    expect(canManage(other, game)).toBe(false);
    expect(canManage(null, game)).toBe(false);
  });

  it("saves a description and a cover, and keeps them through a new version", async () => {
    const live = new MemoryLiveIndex();
    const game = await add();
    const saved = await setDetails({ repo, store, live }, maker, game, { description: "  Row out at dusk.  ", cover: PNG });
    expect(saved.description).toBe("Row out at dusk.");
    expect(saved.cover?.type).toBe("image/png");
    expect(await store.get(saved.cover!.hash)).toEqual(PNG);

    await importHtml({ repo, store }, "Lantern Bay", enc("<!doctype html><canvas id=2></canvas>"), { id: maker.id, admin: false });
    const after = (await repo.get("lantern-bay"))!;
    expect(after.versions).toHaveLength(2);
    expect(after.description).toBe("Row out at dusk.");
    expect(after.cover).toEqual(saved.cover);
  });

  it("remembers that a game is made for phones, and can be set back", async () => {
    const live = new MemoryLiveIndex();
    const game = await add();
    const phone = await setDetails({ repo, store, live }, maker, game, { display: "portrait" });
    expect(phone.display).toBe("portrait");
    expect((await repo.get("lantern-bay"))!.display).toBe("portrait");
    const wide = await setDetails({ repo, store, live }, maker, phone, { display: "fill" });
    expect(wide.display).toBeUndefined();
    expect((await repo.get("lantern-bay"))!.display).toBeUndefined();
  });

  it("saves how to play, what it is made for, and screenshots", async () => {
    const live = new MemoryLiveIndex();
    const deps = { repo, store, live };
    let game = await setDetails(deps, maker, await add(), { howTo: "  Arrow keys to row.  ", devices: "phone" });
    expect(game.howTo).toBe("Arrow keys to row.");
    expect(game.devices).toBe("phone");

    game = await addScreenshot(deps, maker, game, PNG);
    await expect(addScreenshot(deps, maker, game, PNG)).rejects.toBeInstanceOf(ManageError);
    await expect(addScreenshot(deps, maker, game, enc("<svg>"))).rejects.toBeInstanceOf(ManageError);
    await expect(addScreenshot(deps, other, game, PNG)).rejects.toBeInstanceOf(ManageError);
    const stored = (await repo.get("lantern-bay"))!;
    expect(stored.screenshots).toEqual([{ hash: game.screenshots![0].hash, type: "image/png" }]);
    expect(stored.howTo).toBe("Arrow keys to row.");
    expect(stored.devices).toBe("phone");

    for (let i = 1; i < MAX_SCREENSHOTS; i++) game = await addScreenshot(deps, maker, game, new Uint8Array([...PNG, i]));
    await expect(addScreenshot(deps, maker, game, new Uint8Array([...PNG, 99]))).rejects.toBeInstanceOf(ManageError);

    for (const shot of game.screenshots!) game = await removeScreenshot(deps, maker, game, shot.hash);
    game = await setDetails(deps, maker, game, { howTo: "", devices: "any" });
    const cleared = (await repo.get("lantern-bay"))!;
    expect(cleared.screenshots).toBeUndefined();
    expect(cleared.howTo).toBeUndefined();
    expect(cleared.devices).toBeUndefined();
  });

  it("lets only an admin delete a game, and frees its name", async () => {
    const live = new MemoryLiveIndex();
    const deps = { repo, store, live };
    const game = await add();
    await live.publish(game);
    await expect(deleteGame(deps, maker, game)).rejects.toBeInstanceOf(ManageError);
    expect(await repo.get("lantern-bay")).not.toBeNull();

    await deleteGame(deps, admin, game);
    expect(await repo.get("lantern-bay")).toBeNull();
    expect(live.records.has("lantern-bay")).toBe(false);
    expect(await sql.query("SELECT 1 FROM versions")).toEqual([]);

    const again = await add();
    expect(again.versions).toHaveLength(1);
  });

  it("refuses a cover that is not an image, and changes from anyone else", async () => {
    const live = new MemoryLiveIndex();
    const game = await add();
    await expect(setDetails({ repo, store, live }, maker, game, { cover: enc("<svg onload=alert(1)>") })).rejects.toBeInstanceOf(ManageError);
    await expect(setDetails({ repo, store, live }, other, game, { description: "mine now" })).rejects.toBeInstanceOf(ManageError);
    expect((await repo.get("lantern-bay"))!.description).toBeUndefined();
  });

  it("lets a creator pause and restore, and only an admin remove or bring back", async () => {
    const game = await add();
    expect(mayMove(maker, game, "PAUSED")).toBe(true);
    expect(mayMove(maker, game, "REMOVED")).toBe(false);
    expect(mayMove(other, game, "PAUSED")).toBe(false);
    expect(mayMove(admin, game, "REMOVED")).toBe(true);
    const removed = { ...game, state: "REMOVED" as const };
    expect(mayMove(maker, removed, "HOSTED")).toBe(false);
    expect(mayMove(admin, removed, "HOSTED")).toBe(true);
  });

  it("tells the play domain the moment a game is paused", async () => {
    const live = new MemoryLiveIndex();
    const game = await add();
    await setState({ repo, store, live }, maker, game, "PAUSED");
    expect(live.records.get("lantern-bay")?.state).toBe("PAUSED");
    expect((await repo.get("lantern-bay"))!.state).toBe("PAUSED");
    await expect(setState({ repo, store, live }, other, game, "HOSTED")).rejects.toBeInstanceOf(ManageError);
  });
});
