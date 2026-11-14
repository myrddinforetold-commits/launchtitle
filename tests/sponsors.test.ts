import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";
import { cleanUrl, SponsorError, Sponsors } from "@/lib/sponsors";

describe("sponsor spots", () => {
  let sponsors: Sponsors;
  const spot = { placement: "home", name: "Snape Corporation", headline: "Power, distributed.", body: "See what we build.", url: "https://snapecorp.si/" };

  beforeEach(async () => {
    const db = new PGlite();
    const sql: Sql = {
      query: async <T,>(text: string, params: unknown[] = []) => (await db.query(text, params)).rows as T[],
      exec: async (text: string) => void (await db.exec(text)),
    };
    await migrate(sql);
    sponsors = new Sponsors(sql);
  });

  it("shows a spot only in its own place and only while switched on", async () => {
    const added = await sponsors.add(spot);
    expect(await sponsors.pick("home")).toMatchObject({ id: added.id, name: "Snape Corporation", active: true, clicks: 0 });
    expect(await sponsors.pick("game")).toBeNull();
    await sponsors.setActive(added.id, false);
    expect(await sponsors.pick("home")).toBeNull();
    expect(await sponsors.all()).toHaveLength(1);
    await sponsors.remove(added.id);
    expect(await sponsors.all()).toEqual([]);
  });

  it("counts clicks and only follows a live spot's saved link", async () => {
    const added = await sponsors.add(spot);
    expect(await sponsors.click(added.id)).toBe("https://snapecorp.si/");
    expect(await sponsors.click(added.id)).toBe("https://snapecorp.si/");
    expect((await sponsors.all())[0].clicks).toBe(2);
    await sponsors.setActive(added.id, false);
    expect(await sponsors.click(added.id)).toBeNull();
    expect(await sponsors.click("999")).toBeNull();
    expect(await sponsors.click("1; drop table sponsors")).toBeNull();
  });

  it("refuses a spot with no name, no headline, a bad place or a bad link", async () => {
    await expect(sponsors.add({ ...spot, name: " " })).rejects.toBeInstanceOf(SponsorError);
    await expect(sponsors.add({ ...spot, headline: "" })).rejects.toBeInstanceOf(SponsorError);
    await expect(sponsors.add({ ...spot, placement: "popup" })).rejects.toBeInstanceOf(SponsorError);
    for (const url of ["http://snapecorp.si/", "javascript:alert(1)", "nonsense", "https://user:pass@snapecorp.si/"]) {
      expect(() => cleanUrl(url), url).toThrow(SponsorError);
    }
    // The launch screen shows only the sponsor's name, so it needs no headline.
    expect((await sponsors.add({ ...spot, placement: "launch", headline: "" })).placement).toBe("launch");
  });
});
