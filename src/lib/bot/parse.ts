/** A mention of the bot, reduced to what the bot needs. */
export type Mention = {
  id: string;
  text: string;
  authorId: string;
  authorHandle: string;
  conversationId: string;
  /** Accounts tagged in the post, with X's permanent id where X gave one. */
  mentions: { handle: string; id?: string }[];
  /** Links in the post itself, then links in the post it replies to. */
  urls: string[];
};

export type Command =
  | { kind: "add"; creator?: { handle: string; id?: string } }
  | { kind: "remove" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "none" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Work out what a post is asking for. Deliberately strict: the bot acts on
 * `@bot add`, `@bot add @creator`, `@bot remove`, and a reply of yes or no.
 * Anything else is left alone, so ordinary conversation never triggers it.
 */
export function parseCommand(mention: Mention, botHandle: string): Command {
  const bot = escape(botHandle);
  const add = new RegExp(`@${bot}\\s+add\\b(?:\\s+@(\\w{1,15}))?`, "i").exec(mention.text);
  if (add) {
    const tagged = add[1];
    if (!tagged || tagged.toLowerCase() === botHandle.toLowerCase() || tagged.toLowerCase() === mention.authorHandle.toLowerCase()) {
      return { kind: "add" };
    }
    const known = mention.mentions.find((m) => m.handle.toLowerCase() === tagged.toLowerCase());
    return { kind: "add", creator: { handle: known?.handle ?? tagged, id: known?.id } };
  }
  if (new RegExp(`@${bot}\\s+remove\\b`, "i").test(mention.text)) return { kind: "remove" };

  // A reply starts with the handles it is replying to. What follows is the message.
  const said = mention.text.replace(/^(?:\s*@\w{1,15})+/, "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (said === "yes") return { kind: "yes" };
  if (said === "no") return { kind: "no" };
  return { kind: "none" };
}

const NOT_A_GAME = /(^|\.)(x\.com|twitter\.com|t\.co|pic\.x\.com|pic\.twitter\.com)$/i;

/** The first link that could be a game: https, and not a link back into X. */
export function gameUrl(urls: readonly string[]): string | null {
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || NOT_A_GAME.test(url.hostname)) continue;
      url.hash = "";
      return url.toString();
    } catch {
      // Not a link. Skip it.
    }
  }
  return null;
}

/** A starting point for the game's name, for the person reviewing it to correct. */
export function titleGuess(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const parts = url.pathname.split("/").filter((part) => part && !/^index\.html?$/i.test(part));
  const last = parts.pop();
  const host = url.hostname.replace(/^www\./, "").split(".")[0];
  // A long run of letters and digits is an id, not a name.
  const raw = last && !/^[A-Za-z0-9_-]{16,}$/.test(last) ? last : host;
  return decodeURIComponent(raw)
    .replace(/\.html?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 80);
}
