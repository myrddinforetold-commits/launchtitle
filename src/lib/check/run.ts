import { isPlayable, type Game, type GameRepo } from "../games";
import type { BlobStore } from "../storage";
import type { Checker } from "./browser";

export type CheckDeps = {
  repo: GameRepo;
  store: BlobStore;
  check: Checker;
  /** Where a game plays from: its own site, or its address on the play domain. */
  playAddress(game: Game): string;
  now?: () => Date;
};

/** The longest one check may take before it is abandoned. */
const CHECK_TIMEOUT_MS = 75_000;
export const MAX_AUTO_SHOTS = 3;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("the check took too long")), ms))]);
}

/**
 * Checks that one game starts and records the result on it. A game that
 * passes and has no screenshots gets the pictures taken during the check.
 * If the check itself cannot run, the game is marked skipped and listed:
 * our tooling failing is never a reason to hold a creator's game back.
 */
export async function checkGame(deps: CheckDeps, game: Game): Promise<Game> {
  const at = (deps.now?.() ?? new Date()).toISOString();
  let updated: Game;
  try {
    const result = await withTimeout(deps.check(deps.playAddress(game), { phone: game.display === "portrait" || game.devices === "phone" }), CHECK_TIMEOUT_MS);
    // The game may have changed while the check ran. Start from what is stored now.
    updated = { ...((await deps.repo.get(game.slug)) ?? game), check: { state: result.ok ? "passed" : "failed", note: result.note, at } };
    if (result.ok && !updated.screenshots?.length && result.shots.length > 0) {
      const shots = [];
      for (const bytes of result.shots.slice(0, MAX_AUTO_SHOTS)) shots.push({ hash: await deps.store.put(bytes), type: "image/jpeg" });
      updated.screenshots = shots;
    }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    console.error(`check: could not check ${game.slug}: ${why}`);
    updated = { ...((await deps.repo.get(game.slug)) ?? game), check: { state: "skipped", note: "The start-up check could not run, so the game was listed without it.", at } };
  }
  await deps.repo.save(updated);
  return updated;
}

export type ChecksReport = { checked: number; passed: number; failed: number; skipped: number };

/** Checks games that are waiting, oldest first. A few at a time: each one takes a while. */
export async function runChecks(deps: CheckDeps, limit = 2): Promise<ChecksReport> {
  const waiting = (await deps.repo.list())
    .filter((game) => game.check?.state === "pending" && isPlayable(game))
    .sort((a, b) => (a.check?.at ?? "").localeCompare(b.check?.at ?? ""))
    .slice(0, limit);
  const report: ChecksReport = { checked: 0, passed: 0, failed: 0, skipped: 0 };
  for (const game of waiting) {
    const state = (await checkGame(deps, game)).check?.state;
    report.checked += 1;
    if (state === "passed" || state === "failed" || state === "skipped") report[state] += 1;
  }
  return report;
}
