import { gameUrl, parseCommand, type Mention } from "./parse";
import type { BotStore, Nomination } from "./store";

export const SAY = {
  askCreator: (creator: string) => `Thanks. @${creator}, reply yes to put this on Launch Title, or no to pass.`,
  review: "Got it. We'll take a look and reply here when it's live.",
  confirmed: "Confirmed. We'll take a look and reply here when it's live.",
  declined: "Understood. We won't add it.",
  noLink: "I couldn't find a game link. Reply to the post that has the link, or include it with add.",
  already: "That one is already on Launch Title.",
  optedOut: "The creator asked us not to add that one.",
  removed: "Done. It's off Launch Title.",
  live: (url: string, creator: string) => `It's live: ${url} @${creator}, sign in with X there to manage it.`,
};

export type EngineDeps = {
  store: BotStore;
  botHandle: string;
  botXId: string;
  /** Take a live game down. Returns false if there was nothing to take down. */
  pauseGame(slug: string): Promise<boolean>;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Is this the creator a nomination is waiting on? X's permanent id decides when we have it; the handle only when we do not. */
function isCreator(n: Nomination, m: Mention): boolean {
  return n.creatorXId ? n.creatorXId === m.authorId : same(n.creatorHandle, m.authorHandle);
}

/**
 * Act on one mention. Every outcome is recorded before anything is said, and
 * replies are only queued here, so handling the same mention twice is harmless.
 */
export async function handleMention(deps: EngineDeps, m: Mention): Promise<string> {
  const { store } = deps;
  if (m.authorId === deps.botXId) return "own post";
  const command = parseCommand(m, deps.botHandle);

  if (command.kind === "add") {
    const url = gameUrl(m.urls);
    if (!url) {
      // Recorded under the post id so a second read does not reply twice.
      const first = await store.createNomination({
        postId: m.id,
        conversationId: m.conversationId,
        nominatorXId: m.authorId,
        nominatorHandle: m.authorHandle,
        creatorXId: m.authorId,
        creatorHandle: m.authorHandle,
        sourceUrl: "",
        state: "REJECTED",
      });
      if (first) await store.queueReply(m.id, SAY.noLink);
      return "add without a link";
    }

    const optedOut = (await store.forUrl(url, ["DECLINED"])).length > 0;
    const live = (await store.forUrl(url, ["LIVE"])).length > 0;
    const selfAdd = !command.creator;
    const created = await store.createNomination({
      postId: m.id,
      conversationId: m.conversationId,
      nominatorXId: m.authorId,
      nominatorHandle: m.authorHandle,
      creatorXId: selfAdd ? m.authorId : (command.creator!.id ?? null),
      creatorHandle: selfAdd ? m.authorHandle : command.creator!.handle,
      sourceUrl: url,
      state: optedOut || live ? "REJECTED" : selfAdd ? "AWAITING_REVIEW" : "AWAITING_CREATOR",
    });
    if (!created) return "already recorded";
    if (live) await store.queueReply(m.id, SAY.already);
    else if (optedOut) await store.queueReply(m.id, SAY.optedOut);
    else if (selfAdd) await store.queueReply(m.id, SAY.review);
    else await store.queueReply(m.id, SAY.askCreator(created.creatorHandle));
    return live ? "already live" : optedOut ? "opted out" : selfAdd ? "self-add queued for review" : "waiting on creator";
  }

  if (command.kind === "yes" || command.kind === "no") {
    const waiting = (await store.inConversation(m.conversationId, "AWAITING_CREATOR")).filter((n) => isCreator(n, m));
    if (waiting.length === 0) return "yes/no from someone we are not waiting on";
    for (const n of waiting) {
      const moved = await store.move(n.id, "AWAITING_CREATOR", command.kind === "yes" ? "AWAITING_REVIEW" : "DECLINED");
      if (moved && n === waiting[0]) await store.queueReply(m.id, command.kind === "yes" ? SAY.confirmed : SAY.declined);
    }
    return command.kind === "yes" ? "creator confirmed" : "creator declined";
  }

  if (command.kind === "remove") {
    const mine = (await store.inConversation(m.conversationId, "LIVE")).filter((n) => isCreator(n, m));
    for (const n of mine) {
      if (n.gameSlug) await deps.pauseGame(n.gameSlug);
      const moved = await store.move(n.id, "LIVE", "REMOVED");
      if (moved && n === mine[0]) await store.queueReply(m.id, SAY.removed);
    }
    return mine.length ? "removed by creator" : "remove from someone who is not the creator";
  }

  return "not a command";
}
