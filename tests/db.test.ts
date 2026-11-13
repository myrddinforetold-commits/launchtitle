import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { PgGameRepo } from "@/lib/db/games";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";
import { addVersion, buildVersion, rollback, type Game } from "@/lib/games";
import { MemoryBlobStore } from "@/lib/storage";

/** A real Postgres, running inside the test process. */
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

const text = (s: string) => new TextEncoder().encode(s);

async function build(store: MemoryBlobStore, html: string) {
  return buildVersion(store, new Map([["index.html", text(html)]]), { kind: "zip" }, ["cdn.example.com"]);
}

function newGame(slug: string, createdAt: string): Game {
  return { slug, title: slug.toUpperCase(), state: "HOSTED", versions: [], activeVersionId: null, createdAt };
}

describe("Postgres game store", () => {
  let sql: Sql;
  let repo: PgGameRepo;
  const store = new MemoryBlobStore();

  beforeEach(async () => {
    sql = pgliteSql(new PGlite());
    await migrate(sql);
    repo = new PgGameRepo(sql);
  });

  it("applies migrations once", async () => {
    expect(await migrate(sql)).toEqual([]);
    const rows = await sql.query<{ name: string }>("SELECT name FROM schema_migrations");
    expect(rows.map((r) => r.name).sort()).toEqual(["0001_games.sql", "0002_users.sql", "0003_game_creator.sql", "0004_game_details.sql"]);
  });

  it("returns nothing for a game it does not have", async () => {
    expect(await repo.get("missing")).toBeNull();
    expect(await repo.list()).toEqual([]);
  });

  it("gives back exactly the game that was saved", async () => {
    const game = addVersion(newGame("lantern-bay", "2026-11-13T04:00:00.000Z"), await build(store, "<p>one</p>"));
    await repo.save(game);
    expect(await repo.get("lantern-bay")).toEqual(game);
  });

  it("keeps every build, in order, and moves the live pointer", async () => {
    const v1 = await build(store, "<p>one</p>");
    const v2 = await build(store, "<p>two</p>");
    let game = addVersion(newGame("dust-circuit", "2026-11-13T04:00:00.000Z"), v1);
    await repo.save(game);
    game = addVersion(game, v2);
    await repo.save(game);

    let saved = (await repo.get("dust-circuit"))!;
    expect(saved.versions.map((v) => v.id)).toEqual([v1.id, v2.id]);
    expect(saved.activeVersionId).toBe(v2.id);

    await repo.save(rollback(saved, v1.id));
    saved = (await repo.get("dust-circuit"))!;
    expect(saved.versions).toHaveLength(2);
    expect(saved.activeVersionId).toBe(v1.id);
  });

  it("never rewrites a stored build", async () => {
    const v1 = await build(store, "<p>one</p>");
    const game = addVersion(newGame("night-ferry", "2026-11-13T04:00:00.000Z"), v1);
    await repo.save(game);
    const tampered = { ...game, versions: [{ ...v1, totalBytes: 1, manifest: {} }] };
    await repo.save(tampered);
    expect((await repo.get("night-ferry"))!.versions[0]).toEqual(v1);
  });

  it("updates title and state without touching builds", async () => {
    const game = addVersion(newGame("low-tide", "2026-11-13T04:00:00.000Z"), await build(store, "<p>one</p>"));
    await repo.save(game);
    await repo.save({ ...game, title: "Low Tide", state: "PAUSED" });
    const saved = (await repo.get("low-tide"))!;
    expect(saved.title).toBe("Low Tide");
    expect(saved.state).toBe("PAUSED");
    expect(saved.versions).toEqual(game.versions);
  });

  it("refuses a live pointer to a build the game does not have", async () => {
    const game = { ...newGame("cold-harbor", "2026-11-13T04:00:00.000Z"), activeVersionId: "nope" };
    await expect(repo.save(game)).rejects.toThrow(/does not have/);
    expect(await repo.get("cold-harbor")).toBeNull();
  });

  it("refuses a state the spec does not define", async () => {
    const game = { ...newGame("orbit-garden", "2026-11-13T04:00:00.000Z"), state: "LIVE" as Game["state"] };
    await expect(repo.save(game)).rejects.toThrow();
  });

  it("lists newest first", async () => {
    await repo.save(newGame("older", "2026-11-01T00:00:00.000Z"));
    await repo.save(newGame("newer", "2026-11-12T00:00:00.000Z"));
    expect((await repo.list()).map((g) => g.slug)).toEqual(["newer", "older"]);
  });
});
