import { Accounts } from "../auth/sessions";
import { refreshTokens, type XApp } from "../auth/x";
import { getConfig } from "../config";
import type { Sql } from "../db/sql";
import { importAuto, importUrl, linkGame } from "../import";
import { openStores } from "../stores";
import { titleGuess } from "./parse";
import { runBot, type RunReport } from "./run";
import { BotStore } from "./store";
import { xClient } from "./x";

/** The bot wired to the real X, the real database and real file storage. */
export async function runLiveBot(sql: Sql, app: XApp): Promise<RunReport> {
  const { botHandle, botDailyReplies, appOrigin } = getConfig();
  const stores = openStores();
  const accounts = new Accounts(sql);

  return runBot({
    store: new BotStore(sql),
    x: xClient(),
    botHandle,
    appOrigin,
    dailyReplies: botDailyReplies,
    async refresh(refreshToken) {
      const tokens = await refreshTokens(app, refreshToken);
      if (!tokens.refresh) throw new Error("X did not return a new refresh token");
      return { access: tokens.access, refresh: tokens.refresh, expiresAt: tokens.expiresAt };
    },
    async importGame(nomination) {
      // The creator owns the game from the start, whether or not they have signed in yet.
      if (!nomination.creatorXId) throw new Error("The creator's X account is not known");
      const creator = await accounts.ensure(nomination.creatorXId, nomination.creatorHandle);
      const title = nomination.title?.trim() || titleGuess(nomination.sourceUrl);
      const owner = { id: creator.id, admin: false };
      if (nomination.mode === "link") {
        const game = await linkGame(stores, title, nomination.sourceUrl, undefined, owner);
        return { slug: game.slug, note: "Linked, as chosen at approval." };
      }
      if (nomination.mode === "copy") {
        const game = await importUrl(stores, title, nomination.sourceUrl, undefined, owner);
        return { slug: game.slug, note: "Copied, as chosen at approval." };
      }
      const { game, note } = await importAuto(stores, title, nomination.sourceUrl, undefined, owner);
      return { slug: game.slug, note };
    },
    async pauseGame(slug) {
      const game = await stores.repo.get(slug);
      if (!game || game.state === "PAUSED") return false;
      const paused = { ...game, state: "PAUSED" as const };
      await stores.repo.save(paused);
      await stores.live.publish(paused);
      return true;
    },
  });
}
