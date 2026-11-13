import { handleMention, SAY, type EngineDeps } from "./engine";
import type { BotStore, Nomination } from "./store";
import type { XClient } from "./x";

export type RunDeps = {
  store: BotStore;
  x: XClient;
  botHandle: string;
  appOrigin: string;
  /** Replies the bot may post in any 24 hours. Each one costs money. */
  dailyReplies: number;
  /** Get a new access token from the refresh token. X replaces the refresh token each time. */
  refresh(refreshToken: string): Promise<{ access: string; refresh: string; expiresAt: Date }>;
  /** Bring the game in and return its address in the store, with a note on how it was done. */
  importGame(nomination: Nomination): Promise<{ slug: string; note?: string }>;
  pauseGame(slug: string): Promise<boolean>;
  now?: () => Date;
};

export type RunReport = {
  ran: boolean;
  reason?: string;
  mentions: number;
  imported: number;
  failed: number;
  replies: number;
  expired: number;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * One pass of the bot: read new mentions, bring approved games in, post queued
 * replies, and expire requests a creator never answered. Safe to call from
 * anywhere at any time: it never runs more than once a minute, and every step
 * records what it did before moving on.
 */
export async function runBot(deps: RunDeps): Promise<RunReport> {
  const now = deps.now ?? (() => new Date());
  const report: RunReport = { ran: false, mentions: 0, imported: 0, failed: 0, replies: 0, expired: 0 };
  const { store } = deps;

  let bot = await store.account();
  if (!bot) return { ...report, reason: "no bot account connected" };
  if (!(await store.beginPoll(now(), 50))) return { ...report, reason: "checked less than a minute ago" };
  report.ran = true;

  if (bot.accessExpiresAt.getTime() - now().getTime() < 2 * 60 * 1000) {
    await store.saveTokens(await deps.refresh(bot.refreshToken));
    bot = (await store.account())!;
  }

  // 1. New mentions, oldest first.
  const { mentions, newestId } = await deps.x.mentions(
    bot.xAccountId,
    bot.accessToken,
    bot.sinceId ? { sinceId: bot.sinceId } : { startTime: bot.connectedAt.toISOString() },
  );
  const engine: EngineDeps = { store, botHandle: deps.botHandle, botXId: bot.xAccountId, pauseGame: deps.pauseGame };
  for (const mention of mentions) {
    await handleMention(engine, mention);
    report.mentions += 1;
  }
  if (newestId) await store.setSinceId(newestId);

  // 2. Games a person has approved. A couple per pass, so one pass stays short.
  for (const nomination of await store.inState("APPROVED", 2)) {
    try {
      const { slug, note } = await deps.importGame(nomination);
      if (await store.move(nomination.id, "APPROVED", "LIVE", { gameSlug: slug, error: note })) {
        await store.queueReply(nomination.postId, SAY.live(`${deps.appOrigin}/games/${slug}`, nomination.creatorHandle));
        report.imported += 1;
      }
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      console.error(`bot: could not bring in ${nomination.sourceUrl}: ${message}`);
      await store.move(nomination.id, "APPROVED", "FAILED", { error: message });
      report.failed += 1;
    }
  }

  // 3. Replies, within the daily allowance.
  const allowance = Math.max(0, deps.dailyReplies - (await store.repliesSentSince(new Date(now().getTime() - DAY))));
  for (const reply of await store.queuedReplies(Math.min(10, allowance))) {
    try {
      await store.markReply(reply.id, await deps.x.reply(bot.accessToken, reply.inReplyTo, reply.body), now());
      report.replies += 1;
    } catch (error) {
      console.error("bot: a reply failed:", error instanceof Error ? error.message : error);
      await store.markReply(reply.id, null, now());
    }
  }

  // 4. Requests a creator never answered.
  report.expired = await store.expireOlderThan(new Date(now().getTime() - 7 * DAY));
  return report;
}
