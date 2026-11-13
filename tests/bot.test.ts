import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { handleMention, SAY } from "@/lib/bot/engine";
import { gameUrl, parseCommand, titleGuess, type Mention } from "@/lib/bot/parse";
import { runBot, type RunDeps } from "@/lib/bot/run";
import { BotStore } from "@/lib/bot/store";
import { toMentions, xClient, type XClient } from "@/lib/bot/x";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";

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

const BOT = "launchtitlegg";
let next = 1000;
const mention = (over: Partial<Mention>): Mention => ({
  id: String(next++),
  text: "",
  authorId: "50",
  authorHandle: "fan",
  conversationId: "900",
  mentions: [{ handle: BOT, id: "1" }],
  urls: [],
  ...over,
});

describe("reading a post", () => {
  it("understands add, add with a creator, remove, yes and no", () => {
    expect(parseCommand(mention({ text: "@launchtitlegg add" }), BOT)).toEqual({ kind: "add" });
    expect(
      parseCommand(mention({ text: "love this @LaunchTitleGG ADD @maker", mentions: [{ handle: BOT }, { handle: "Maker", id: "77" }] }), BOT),
    ).toEqual({ kind: "add", creator: { handle: "Maker", id: "77" } });
    expect(parseCommand(mention({ text: "@launchtitlegg remove" }), BOT)).toEqual({ kind: "remove" });
    expect(parseCommand(mention({ text: "@launchtitlegg @fan Yes!" }), BOT)).toEqual({ kind: "yes" });
    expect(parseCommand(mention({ text: "@launchtitlegg no." }), BOT)).toEqual({ kind: "no" });
  });

  it("treats tagging yourself as adding your own game", () => {
    expect(parseCommand(mention({ text: "@launchtitlegg add @fan", authorHandle: "Fan" }), BOT)).toEqual({ kind: "add" });
  });

  it("leaves ordinary conversation alone", () => {
    for (const text of [
      "@launchtitlegg this is great",
      "@launchtitlegg address?",
      "@launchtitlegg yes please add everything",
      "should I add it @launchtitlegg",
      "@launchtitlegg no way this is free",
      "@launchtitlegg adding soon?",
    ]) {
      expect(parseCommand(mention({ text }), BOT).kind).toBe("none");
    }
  });

  it("picks the first real link and ignores links back into X", () => {
    expect(gameUrl(["https://x.com/a/status/1", "https://t.co/abc", "https://maker.itch.io/saltline#play"])).toBe("https://maker.itch.io/saltline");
    expect(gameUrl(["http://insecure.example/game", "not a link"])).toBeNull();
    expect(gameUrl([])).toBeNull();
  });

  it("guesses a name for the reviewer to correct", () => {
    expect(titleGuess("https://maker.github.io/lantern-bay/")).toBe("Lantern Bay");
    expect(titleGuess("https://saltline.vercel.app/")).toBe("Saltline");
    expect(titleGuess("https://example.com/games/dust_circuit/index.html")).toBe("Dust Circuit");
    expect(titleGuess("https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp")).toBe("Claude");
  });

  it("reads links from the post being replied to", () => {
    const [m] = toMentions({
      data: [{ id: "2", text: "@launchtitlegg add", author_id: "50", conversation_id: "1", referenced_tweets: [{ type: "replied_to", id: "1" }] }],
      includes: {
        users: [{ id: "50", username: "fan" }],
        tweets: [{ id: "1", text: "my game", author_id: "77", entities: { urls: [{ expanded_url: "https://t.co/x", unwound_url: "https://maker.dev/game" }] } }],
      },
    });
    expect(m.authorHandle).toBe("fan");
    expect(m.urls).toEqual(["https://maker.dev/game"]);
  });
});

describe("the bot's decisions", () => {
  let store: BotStore;
  let paused: string[];
  const deps = () => ({ store, botHandle: BOT, botXId: "1", pauseGame: async (slug: string) => (paused.push(slug), true) });
  const replies = async () => (await store.queuedReplies(50)).map((r) => r.body);
  const GAME = "https://maker.dev/game";

  beforeEach(async () => {
    const sql = pgliteSql(new PGlite());
    await migrate(sql);
    store = new BotStore(sql);
    paused = [];
  });

  it("queues a creator's own game for review", async () => {
    await handleMention(deps(), mention({ text: "@launchtitlegg add", authorId: "77", authorHandle: "maker", urls: [GAME] }));
    const [n] = await store.recent();
    expect(n).toMatchObject({ state: "AWAITING_REVIEW", creatorXId: "77", creatorHandle: "maker", sourceUrl: GAME });
    expect(await replies()).toEqual([SAY.review]);
  });

  it("waits for the creator when someone else asks, and only the creator can answer", async () => {
    const ask = mention({ text: "@launchtitlegg add @maker", mentions: [{ handle: BOT }, { handle: "maker", id: "77" }], urls: [GAME] });
    await handleMention(deps(), ask);
    expect((await store.recent())[0].state).toBe("AWAITING_CREATOR");
    expect(await replies()).toEqual([SAY.askCreator("maker")]);

    // The person who asked cannot confirm for the creator. Nor can a stranger.
    await handleMention(deps(), mention({ text: "@launchtitlegg yes" }));
    await handleMention(deps(), mention({ text: "@launchtitlegg yes", authorId: "66", authorHandle: "stranger" }));
    // Nor can someone who has taken the creator's old handle: X's permanent id decides.
    await handleMention(deps(), mention({ text: "@launchtitlegg yes", authorId: "88", authorHandle: "maker" }));
    expect((await store.recent())[0].state).toBe("AWAITING_CREATOR");

    await handleMention(deps(), mention({ text: "@launchtitlegg @fan yes", authorId: "77", authorHandle: "maker" }));
    expect((await store.recent())[0].state).toBe("AWAITING_REVIEW");
    expect(await replies()).toEqual([SAY.askCreator("maker"), SAY.confirmed]);
  });

  it("respects a creator who says no, now and later", async () => {
    await handleMention(deps(), mention({ text: "@launchtitlegg add @maker", mentions: [{ handle: "maker", id: "77" }], urls: [GAME] }));
    await handleMention(deps(), mention({ text: "@launchtitlegg no", authorId: "77", authorHandle: "maker" }));
    expect((await store.recent())[0].state).toBe("DECLINED");

    await handleMention(deps(), mention({ text: "@launchtitlegg add @maker", conversationId: "901", mentions: [{ handle: "maker", id: "77" }], urls: [GAME] }));
    expect((await store.recent())[0].state).toBe("REJECTED");
    expect((await replies()).at(-1)).toBe(SAY.optedOut);
  });

  it("does nothing twice for the same post", async () => {
    const m = mention({ text: "@launchtitlegg add", urls: [GAME] });
    await handleMention(deps(), m);
    await handleMention(deps(), m);
    expect(await store.recent()).toHaveLength(1);
    expect(await replies()).toHaveLength(1);
  });

  it("asks for a link once when there is none, and ignores its own posts and chatter", async () => {
    const m = mention({ text: "@launchtitlegg add" });
    await handleMention(deps(), m);
    await handleMention(deps(), m);
    expect(await replies()).toEqual([SAY.noLink]);
    await handleMention(deps(), mention({ text: "@launchtitlegg add", authorId: "1", urls: [GAME] }));
    await handleMention(deps(), mention({ text: "@launchtitlegg nice work" }));
    expect(await replies()).toEqual([SAY.noLink]);
  });

  it("lets the creator, and only the creator, take a live game down", async () => {
    await handleMention(deps(), mention({ text: "@launchtitlegg add", authorId: "77", authorHandle: "maker", urls: [GAME] }));
    const [n] = await store.recent();
    await store.move(n.id, "AWAITING_REVIEW", "APPROVED", { title: "Game" });
    await store.move(n.id, "APPROVED", "LIVE", { gameSlug: "game" });

    await handleMention(deps(), mention({ text: "@launchtitlegg remove", authorId: "66", authorHandle: "stranger" }));
    expect(paused).toEqual([]);
    await handleMention(deps(), mention({ text: "@launchtitlegg remove", authorId: "77", authorHandle: "maker" }));
    expect(paused).toEqual(["game"]);
    expect((await store.recent())[0].state).toBe("REMOVED");
  });
});

describe("a pass of the bot", () => {
  let store: BotStore;
  let sql: Sql;
  let now: Date;
  let sent: { to: string; text: string }[];
  let inbox: Mention[];
  let refreshed: number;
  let imports: string[];
  const GAME = "https://maker.dev/game";

  const x: XClient = {
    async mentions() {
      const mentions = inbox;
      inbox = [];
      return { mentions, newestId: mentions.at(-1)?.id };
    },
    async reply(_token, to, text) {
      sent.push({ to, text });
      return `r${sent.length}`;
    },
  };
  const run = (over: Partial<RunDeps> = {}) =>
    runBot({
      store,
      x,
      botHandle: BOT,
      appOrigin: "https://launchtitle.gg",
      dailyReplies: 100,
      refresh: async () => (refreshed++, { access: "new-access", refresh: "new-refresh", expiresAt: new Date(now.getTime() + 7200_000) }),
      importGame: async (n) => (imports.push(n.sourceUrl), "the-game"),
      pauseGame: async () => true,
      now: () => now,
      ...over,
    });

  beforeEach(async () => {
    sql = pgliteSql(new PGlite());
    await migrate(sql);
    store = new BotStore(sql);
    now = new Date("2026-11-13T12:00:00Z");
    sent = [];
    inbox = [];
    refreshed = 0;
    imports = [];
    await store.connect({ xAccountId: "1", handle: BOT }, { access: "a", refresh: "r", expiresAt: new Date(now.getTime() + 3600_000) });
  });

  it("does nothing until an account is connected", async () => {
    await sql.exec("DELETE FROM bot");
    expect(await run()).toMatchObject({ ran: false, reason: "no bot account connected" });
  });

  it("runs at most once a minute, however often it is called", async () => {
    expect((await run()).ran).toBe(true);
    expect((await run()).ran).toBe(false);
    now = new Date(now.getTime() + 61_000);
    expect((await run()).ran).toBe(true);
  });

  it("takes a request from tag to live game, replying at each step", async () => {
    const ask = mention({ text: "@launchtitlegg add", authorId: "77", authorHandle: "maker", urls: [GAME] });
    inbox = [ask];
    expect(await run()).toMatchObject({ mentions: 1, replies: 1, imported: 0 });
    expect(sent).toEqual([{ to: ask.id, text: SAY.review }]);
    expect((await store.account())!.sinceId).toBe(ask.id);

    // Nothing goes live until a person approves it.
    now = new Date(now.getTime() + 300_000);
    await run();
    expect(imports).toEqual([]);

    const [n] = await store.recent();
    await store.move(n.id, "AWAITING_REVIEW", "APPROVED", { title: "The Game" });
    now = new Date(now.getTime() + 300_000);
    expect(await run()).toMatchObject({ imported: 1, replies: 1 });
    expect(imports).toEqual([GAME]);
    expect(sent.at(-1)).toEqual({ to: ask.id, text: SAY.live("https://launchtitle.gg/games/the-game", "maker") });
    expect((await store.recent())[0]).toMatchObject({ state: "LIVE", gameSlug: "the-game" });
  });

  it("records a failed import for a person to see, and says nothing on X", async () => {
    inbox = [mention({ text: "@launchtitlegg add", authorId: "77", authorHandle: "maker", urls: [GAME] })];
    await run();
    const [n] = await store.recent();
    await store.move(n.id, "AWAITING_REVIEW", "APPROVED", { title: "The Game" });
    now = new Date(now.getTime() + 300_000);
    const report = await run({ importGame: async () => Promise.reject(new Error("That page could not be fetched.")) });
    expect(report).toMatchObject({ failed: 1, imported: 0, replies: 0 });
    expect((await store.recent())[0]).toMatchObject({ state: "FAILED", error: "That page could not be fetched." });
  });

  it("stops replying at the daily allowance and catches up later", async () => {
    inbox = [1, 2, 3].map(() => mention({ text: "@launchtitlegg add", conversationId: String(next), urls: [`https://maker.dev/${next}`] }));
    expect((await run({ dailyReplies: 2 })).replies).toBe(2);
    now = new Date(now.getTime() + 300_000);
    expect((await run({ dailyReplies: 2 })).replies).toBe(0);
    now = new Date(now.getTime() + 25 * 3600_000);
    expect((await run({ dailyReplies: 2 })).replies).toBe(1);
  });

  it("renews its access before it runs out, keeping the replacement refresh token", async () => {
    now = new Date(now.getTime() + 3590_000);
    await run();
    expect(refreshed).toBe(1);
    expect(await store.account()).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
  });

  it("gives up on a creator who never answers, after a week", async () => {
    inbox = [mention({ text: "@launchtitlegg add @maker", mentions: [{ handle: "maker", id: "77" }], urls: [GAME] })];
    await run();
    await sql.query("UPDATE nominations SET created_at = $1", [new Date(now.getTime() - 8 * 24 * 3600_000).toISOString()]);
    now = new Date(now.getTime() + 300_000);
    expect((await run()).expired).toBe(1);
    expect((await store.recent())[0].state).toBe("EXPIRED");
  });
});

describe("talking to X", () => {
  it("asks only for new mentions and sends replies as replies", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = xClient(async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.includes("/mentions") ? { data: [], meta: {} } : { data: { id: "555" } }), { status: 200 });
    });
    await client.mentions("1", "tok", { sinceId: "999" });
    const asked = new URL(calls[0].url);
    expect(asked.pathname).toBe("/2/users/1/mentions");
    expect(asked.searchParams.get("since_id")).toBe("999");
    expect(await client.reply("tok", "123", "Got it.")).toBe("555");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ text: "Got it.", reply: { in_reply_to_tweet_id: "123" } });
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("reports a refusal from X as an error", async () => {
    const client = xClient(async () => new Response("{}", { status: 403 }));
    await expect(client.reply("tok", "1", "hi")).rejects.toThrow(/403/);
    await expect(client.mentions("1", "tok", {})).rejects.toThrow(/403/);
  });
});
