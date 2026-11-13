import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { Accounts } from "@/lib/auth/sessions";
import { PgGameRepo } from "@/lib/db/games";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";
import { Plays, playsLabel } from "@/lib/plays";

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

describe("plays", () => {
  let sql: Sql;
  let plays: Plays;
  let userId: string;

  beforeEach(async () => {
    sql = pgliteSql(new PGlite());
    await migrate(sql);
    const repo = new PgGameRepo(sql);
    for (const slug of ["alpha", "beta"]) {
      await repo.save({ slug, title: slug, state: "HOSTED", versions: [], activeVersionId: null, createdAt: new Date().toISOString() });
    }
    userId = (await new Accounts(sql).ensure("111", "player")).id;
    plays = new Plays(sql);
  });

  it("counts one play per sitting", async () => {
    const first = await plays.start("alpha", "v1", null);
    const again = await plays.start("alpha", "v1", null);
    const other = await plays.start("alpha", "v2", null);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
    expect((await plays.stats()).get("alpha")?.plays).toBe(2);
  });

  it("counts a new play after the sitting ends", async () => {
    const first = await plays.start("alpha", "v1", null);
    await sql.query("UPDATE plays SET started_at = now() - interval '2 hours'");
    expect(await plays.start("alpha", "v1", null)).not.toBe(first);
  });

  it("does not record a play for a game that does not exist", async () => {
    expect(await plays.start("nope", "v1", null)).toBeNull();
  });

  it("adds time only for the visitor who started, and never faster than the clock", async () => {
    const id = (await plays.start("alpha", "v1", null))!;
    await sql.query("UPDATE plays SET started_at = now() - interval '10 minutes'");
    await plays.addTime(id, "v1", 30);
    await plays.addTime(id, "someone-else", 30);
    await plays.addTime(id, "v1", 100_000);
    await plays.addTime(id, "v1", -5);
    expect((await plays.stats()).get("alpha")).toEqual({ plays: 1, seconds: 30 });
  });

  it("lists a player's recent games, newest first, once each", async () => {
    await plays.start("alpha", "v1", userId);
    await sql.query("UPDATE plays SET started_at = now() - interval '3 hours'");
    await plays.start("beta", "v1", userId);
    await plays.start("alpha", "v1", userId);
    expect(await plays.recentFor(userId)).toEqual(["alpha", "beta"]);
  });

  it("attaches a play to the account when the player signs in mid-sitting", async () => {
    await plays.start("alpha", "v1", null);
    await plays.start("alpha", "v1", userId);
    expect(await plays.recentFor(userId)).toEqual(["alpha"]);
  });

  it("saves and unsaves games", async () => {
    await plays.save(userId, "alpha");
    await plays.save(userId, "alpha");
    await plays.save(userId, "nope");
    expect(await plays.savedFor(userId)).toEqual(["alpha"]);
    await plays.unsave(userId, "alpha");
    expect(await plays.savedFor(userId)).toEqual([]);
  });

  it("labels counts", () => {
    expect([1, 12, 999, 1000, 1250, 12_400, 2_500_000].map(playsLabel)).toEqual([
      "1 play", "12 plays", "999 plays", "1K plays", "1.3K plays", "12K plays", "2.5M plays",
    ]);
  });
});
