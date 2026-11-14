import { describe, expect, it } from "vitest";

import type { CheckResult } from "@/lib/check/browser";
import { checkGame, runChecks } from "@/lib/check/run";
import { isOptional, verdict } from "@/lib/check/verdict";
import { CHECK_WAIT_MS, isListed, MemoryGameRepo, type Game } from "@/lib/games";
import { MemoryBlobStore } from "@/lib/storage";

const fine = { loaded: true, missing: [], errors: [], blank: [false, false, false] };

describe("deciding whether a game started", () => {
  it("passes a game that loads and draws", () => {
    expect(verdict(fine)).toEqual({ ok: true, note: "It loaded and drew its first screen." });
  });

  it("fails a page that does not load, a blank screen, and a game missing its files", () => {
    expect(verdict({ ...fine, loaded: false })).toEqual({ ok: false, note: "The game's page did not load." });
    expect(verdict({ ...fine, blank: [true, true, true], errors: ["x is not defined"] })).toEqual({
      ok: false,
      note: "The game showed a blank screen. Its code reported: x is not defined",
    });
    const missing = ["models/rock.glb", "models/tree.glb", "media/sky.webp", "media/floor.webp", "media/vines.webp"];
    expect(verdict({ ...fine, missing })).toEqual({
      ok: false,
      note: "5 of the game's files could not be found (rock.glb, tree.glb, sky.webp and 2 more).",
    });
  });

  it("passes with a note when little is wrong, and when the game draws after a blank start", () => {
    expect(verdict({ ...fine, missing: ["sfx/extra.mp3"], errors: ["oops"] })).toEqual({
      ok: true,
      note: "It loaded and drew its first screen. One file could not be found (extra.mp3). Its code reported an error: oops",
    });
    expect(verdict({ ...fine, blank: [true, false, false] }).ok).toBe(true);
  });

  it("does not count files browsers ask for on their own", () => {
    for (const path of ["favicon.ico", "assets/app.js.map", "apple-touch-icon.png", "manifest.json", "robots.txt"]) expect(isOptional(path), path).toBe(true);
    for (const path of ["models/rock.glb", "assets/app.js", "map.json"]) expect(isOptional(path), path).toBe(false);
  });
});

describe("checking games", () => {
  const at = "2026-11-14T02:00:00.000Z";
  const game = (slug: string, extra: Partial<Game> = {}): Game => ({
    slug,
    title: slug,
    state: "HOSTED",
    versions: [],
    activeVersionId: null,
    createdAt: at,
    externalUrl: `https://${slug}.example/`,
    check: { state: "pending", at },
    ...extra,
  });
  const shot = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

  async function setup(results: Record<string, CheckResult | Error>) {
    const repo = new MemoryGameRepo();
    const store = new MemoryBlobStore();
    const asked: { url: string; phone?: boolean }[] = [];
    const deps = {
      repo,
      store,
      playAddress: (g: Game) => g.externalUrl!,
      now: () => new Date("2026-11-14T02:05:00.000Z"),
      check: async (url: string, options?: { phone?: boolean }) => {
        asked.push({ url, phone: options?.phone });
        const result = results[new URL(url).hostname.split(".")[0]];
        if (result instanceof Error) throw result;
        return result;
      },
    };
    return { repo, store, deps, asked };
  }

  it("records a pass and keeps the pictures as screenshots when the game has none", async () => {
    const { repo, deps } = await setup({ good: { ok: true, note: "It loaded and drew its first screen.", shots: [shot, new Uint8Array([...shot, 9])] } });
    await repo.save(game("good"));
    const checked = await checkGame(deps, (await repo.get("good"))!);
    expect(checked.check).toEqual({ state: "passed", note: "It loaded and drew its first screen.", at: "2026-11-14T02:05:00.000Z" });
    expect(checked.screenshots).toHaveLength(2);
    expect(checked.screenshots![0].type).toBe("image/jpeg");
    expect(isListed((await repo.get("good"))!)).toBe(true);
  });

  it("leaves a creator's own screenshots alone", async () => {
    const { repo, deps } = await setup({ good: { ok: true, note: "ok", shots: [shot] } });
    const own = [{ hash: "a".repeat(64), type: "image/png" }];
    await repo.save(game("good", { screenshots: own }));
    expect((await checkGame(deps, (await repo.get("good"))!)).screenshots).toEqual(own);
  });

  it("keeps a failed game off the shelves and takes no pictures from it", async () => {
    const { repo, deps } = await setup({ bad: { ok: false, note: "The game showed a blank screen.", shots: [] } });
    await repo.save(game("bad"));
    const checked = await checkGame(deps, (await repo.get("bad"))!);
    expect(checked.check?.state).toBe("failed");
    expect(checked.screenshots).toBeUndefined();
    expect(isListed(checked)).toBe(false);
  });

  it("lists a game when the check itself cannot run", async () => {
    const { repo, deps } = await setup({ odd: new Error("no browser") });
    await repo.save(game("odd"));
    const checked = await checkGame(deps, (await repo.get("odd"))!);
    expect(checked.check?.state).toBe("skipped");
    expect(isListed(checked)).toBe(true);
  });

  it("checks waiting games a few at a time, oldest first, as a phone when the game is made for one", async () => {
    const ok = { ok: true, note: "ok", shots: [] };
    const { repo, deps, asked } = await setup({ a: ok, b: ok, c: ok });
    await repo.save(game("c", { check: { state: "pending", at: "2026-11-14T02:03:00.000Z" } }));
    await repo.save(game("a", { check: { state: "pending", at: "2026-11-14T02:01:00.000Z" }, devices: "phone" }));
    await repo.save(game("b", { check: { state: "pending", at: "2026-11-14T02:02:00.000Z" } }));
    await repo.save(game("done", { check: { state: "passed", at } }));
    expect(await runChecks(deps, 2)).toEqual({ checked: 2, passed: 2, failed: 0, skipped: 0 });
    expect(asked).toEqual([
      { url: "https://a.example/", phone: true },
      { url: "https://b.example/", phone: false },
    ]);
    expect(await runChecks(deps, 2)).toMatchObject({ checked: 1 });
    expect(await runChecks(deps, 2)).toMatchObject({ checked: 0 });
  });

  it("hides a waiting game, but not for ever", () => {
    const waiting = game("w", { check: { state: "pending", at } });
    const then = Date.parse(at);
    expect(isListed(waiting, then + 60_000)).toBe(false);
    expect(isListed(waiting, then + CHECK_WAIT_MS + 1)).toBe(true);
    expect(isListed(game("old", { check: undefined }), then)).toBe(true);
    expect(isListed(game("paused", { state: "PAUSED", check: { state: "passed", at } }), then)).toBe(false);
  });
});
