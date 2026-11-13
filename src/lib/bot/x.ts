import type { Mention } from "./parse";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class XApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** The two things the bot does on X: read who tagged it, and reply. */
export interface XClient {
  mentions(botId: string, token: string, from: { sinceId?: string; startTime?: string }): Promise<{ mentions: Mention[]; newestId?: string }>;
  reply(token: string, inReplyTo: string, text: string): Promise<string>;
}

type ApiUrl = { expanded_url?: string; unwound_url?: string };
type ApiTweet = {
  id: string;
  text: string;
  author_id: string;
  conversation_id?: string;
  referenced_tweets?: { type: string; id: string }[];
  entities?: { mentions?: { username: string; id?: string }[]; urls?: ApiUrl[] };
};
type ApiPage = {
  data?: ApiTweet[];
  includes?: { users?: { id: string; username: string }[]; tweets?: ApiTweet[] };
  meta?: { newest_id?: string };
};

const links = (tweet: ApiTweet | undefined) =>
  (tweet?.entities?.urls ?? []).map((u) => u.unwound_url ?? u.expanded_url).filter((u): u is string => typeof u === "string");

export function toMentions(page: ApiPage): Mention[] {
  const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u.username]));
  const tweets = new Map((page.includes?.tweets ?? []).map((t) => [t.id, t]));
  return (page.data ?? []).map((tweet) => {
    const parent = tweet.referenced_tweets?.find((r) => r.type === "replied_to");
    return {
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      authorHandle: users.get(tweet.author_id) ?? "",
      conversationId: tweet.conversation_id ?? tweet.id,
      mentions: (tweet.entities?.mentions ?? []).map((m) => ({ handle: m.username, id: m.id })),
      urls: [...links(tweet), ...links(parent ? tweets.get(parent.id) : undefined)],
    };
  });
}

export function xClient(fetchImpl: Fetch = fetch): XClient {
  return {
    async mentions(botId, token, from) {
      const url = new URL(`https://api.x.com/2/users/${botId}/mentions`);
      url.search = new URLSearchParams({
        max_results: "50",
        "tweet.fields": "author_id,conversation_id,referenced_tweets,entities",
        expansions: "author_id,referenced_tweets.id,entities.mentions.username",
        "user.fields": "username",
        ...(from.sinceId ? { since_id: from.sinceId } : from.startTime ? { start_time: from.startTime } : {}),
      }).toString();
      const response = await fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new XApiError(response.status, `X answered ${response.status} to a mentions check`);
      const page = (await response.json()) as ApiPage;
      // Oldest first, so a conversation is handled in the order it happened.
      const mentions = toMentions(page).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      return { mentions, newestId: page.meta?.newest_id };
    },

    async reply(token, inReplyTo, text) {
      const response = await fetchImpl("https://api.x.com/2/tweets", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: inReplyTo } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new XApiError(response.status, `X answered ${response.status} to a reply`);
      const body = (await response.json()) as { data?: { id?: string } };
      if (!body.data?.id) throw new XApiError(502, "X accepted a reply but returned no id");
      return body.data.id;
    },
  };
}
