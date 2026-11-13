import type { Sql } from "../db/sql";

export type NominationState =
  | "AWAITING_CREATOR"
  | "AWAITING_REVIEW"
  | "APPROVED"
  | "LIVE"
  | "DECLINED"
  | "REJECTED"
  | "FAILED"
  | "EXPIRED"
  | "REMOVED";

export type Nomination = {
  id: string;
  postId: string;
  conversationId: string;
  nominatorXId: string;
  nominatorHandle: string;
  creatorXId: string | null;
  creatorHandle: string;
  sourceUrl: string;
  state: NominationState;
  title: string | null;
  gameSlug: string | null;
  error: string | null;
  createdAt: string;
};

export type BotAccount = {
  xAccountId: string;
  handle: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  connectedAt: Date;
  sinceId: string | null;
  pollStartedAt: Date;
};

type NomRow = {
  id: string | number;
  post_id: string;
  conversation_id: string;
  nominator_x_id: string;
  nominator_handle: string;
  creator_x_id: string | null;
  creator_handle: string;
  source_url: string;
  state: NominationState;
  title: string | null;
  game_slug: string | null;
  error: string | null;
  created_at: Date | string;
};

const toNom = (r: NomRow): Nomination => ({
  id: String(r.id),
  postId: r.post_id,
  conversationId: r.conversation_id,
  nominatorXId: r.nominator_x_id,
  nominatorHandle: r.nominator_handle,
  creatorXId: r.creator_x_id,
  creatorHandle: r.creator_handle,
  sourceUrl: r.source_url,
  state: r.state,
  title: r.title,
  gameSlug: r.game_slug,
  error: r.error,
  createdAt: new Date(r.created_at).toISOString(),
});

const NOM = "id, post_id, conversation_id, nominator_x_id, nominator_handle, creator_x_id, creator_handle, source_url, state, title, game_slug, error, created_at";

/** Everything the bot remembers. */
export class BotStore {
  constructor(private readonly sql: Sql) {}

  // --- the bot's own account

  async account(): Promise<BotAccount | null> {
    const rows = await this.sql.query<{
      x_account_id: string;
      handle: string;
      access_token: string;
      refresh_token: string;
      access_expires_at: Date | string;
      connected_at: Date | string;
      since_id: string | null;
      poll_started_at: Date | string;
    }>("SELECT * FROM bot WHERE id = 1");
    const r = rows[0];
    return r
      ? {
          xAccountId: r.x_account_id,
          handle: r.handle,
          accessToken: r.access_token,
          refreshToken: r.refresh_token,
          accessExpiresAt: new Date(r.access_expires_at),
          connectedAt: new Date(r.connected_at),
          sinceId: r.since_id,
          pollStartedAt: new Date(r.poll_started_at),
        }
      : null;
  }

  /** Connect, or reconnect, the account the bot posts as. Reading starts from now, never from old posts. */
  async connect(account: { xAccountId: string; handle: string }, tokens: { access: string; refresh: string; expiresAt: Date }) {
    await this.sql.query(
      `INSERT INTO bot (id, x_account_id, handle, access_token, refresh_token, access_expires_at)
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET x_account_id = EXCLUDED.x_account_id, handle = EXCLUDED.handle, access_token = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token, access_expires_at = EXCLUDED.access_expires_at`,
      [account.xAccountId, account.handle, tokens.access, tokens.refresh, tokens.expiresAt.toISOString()],
    );
  }

  async saveTokens(tokens: { access: string; refresh: string; expiresAt: Date }) {
    await this.sql.query("UPDATE bot SET access_token = $1, refresh_token = $2, access_expires_at = $3 WHERE id = 1", [
      tokens.access,
      tokens.refresh,
      tokens.expiresAt.toISOString(),
    ]);
  }

  /** True if this caller may run a check now. At most one check starts in any `gapSeconds`. */
  async beginPoll(now: Date, gapSeconds: number): Promise<boolean> {
    const rows = await this.sql.query(
      "UPDATE bot SET poll_started_at = $1 WHERE id = 1 AND poll_started_at <= $2 RETURNING id",
      [now.toISOString(), new Date(now.getTime() - gapSeconds * 1000).toISOString()],
    );
    return rows.length === 1;
  }

  async setSinceId(id: string) {
    await this.sql.query("UPDATE bot SET since_id = $1 WHERE id = 1", [id]);
  }

  // --- nominations

  /** Returns null when this post was already recorded. */
  async createNomination(n: Omit<Nomination, "id" | "title" | "gameSlug" | "error" | "createdAt">): Promise<Nomination | null> {
    const rows = await this.sql.query<NomRow>(
      `INSERT INTO nominations (post_id, conversation_id, nominator_x_id, nominator_handle, creator_x_id, creator_handle, source_url, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (post_id) DO NOTHING
       RETURNING ${NOM}`,
      [n.postId, n.conversationId, n.nominatorXId, n.nominatorHandle, n.creatorXId, n.creatorHandle, n.sourceUrl, n.state],
    );
    return rows[0] ? toNom(rows[0]) : null;
  }

  async byId(id: string): Promise<Nomination | null> {
    if (!/^\d{1,18}$/.test(id)) return null;
    const rows = await this.sql.query<NomRow>(`SELECT ${NOM} FROM nominations WHERE id = $1`, [id]);
    return rows[0] ? toNom(rows[0]) : null;
  }

  async inConversation(conversationId: string, state: NominationState): Promise<Nomination[]> {
    const rows = await this.sql.query<NomRow>(
      `SELECT ${NOM} FROM nominations WHERE conversation_id = $1 AND state = $2 ORDER BY id`,
      [conversationId, state],
    );
    return rows.map(toNom);
  }

  async forUrl(sourceUrl: string, states: NominationState[]): Promise<Nomination[]> {
    const rows = await this.sql.query<NomRow>(
      `SELECT ${NOM} FROM nominations WHERE source_url = $1 AND state = ANY($2::text[]) ORDER BY id`,
      [sourceUrl, states],
    );
    return rows.map(toNom);
  }

  async inState(state: NominationState, limit = 50): Promise<Nomination[]> {
    const rows = await this.sql.query<NomRow>(`SELECT ${NOM} FROM nominations WHERE state = $1 ORDER BY id LIMIT $2`, [state, limit]);
    return rows.map(toNom);
  }

  async recent(limit = 100): Promise<Nomination[]> {
    const rows = await this.sql.query<NomRow>(`SELECT ${NOM} FROM nominations ORDER BY id DESC LIMIT $1`, [limit]);
    return rows.map(toNom);
  }

  /** Move a nomination on, but only from the state the caller believes it is in. */
  async move(
    id: string,
    from: NominationState,
    to: NominationState,
    set: { title?: string; gameSlug?: string; error?: string } = {},
  ): Promise<boolean> {
    const rows = await this.sql.query(
      `UPDATE nominations
       SET state = $3, title = COALESCE($4, title), game_slug = COALESCE($5, game_slug), error = $6, updated_at = now()
       WHERE id = $1 AND state = $2 RETURNING id`,
      [id, from, to, set.title ?? null, set.gameSlug ?? null, set.error ?? null],
    );
    return rows.length === 1;
  }

  async expireOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.sql.query(
      "UPDATE nominations SET state = 'EXPIRED', updated_at = now() WHERE state = 'AWAITING_CREATOR' AND created_at < $1 RETURNING id",
      [cutoff.toISOString()],
    );
    return rows.length;
  }

  // --- replies

  async queueReply(inReplyTo: string, body: string) {
    await this.sql.query("INSERT INTO bot_replies (in_reply_to, body) VALUES ($1, $2)", [inReplyTo, body]);
  }

  async queuedReplies(limit: number): Promise<{ id: string; inReplyTo: string; body: string }[]> {
    const rows = await this.sql.query<{ id: string | number; in_reply_to: string; body: string }>(
      "SELECT id, in_reply_to, body FROM bot_replies WHERE state = 'QUEUED' ORDER BY id LIMIT $1",
      [limit],
    );
    return rows.map((r) => ({ id: String(r.id), inReplyTo: r.in_reply_to, body: r.body }));
  }

  async markReply(id: string, sentPostId: string | null, now: Date) {
    await this.sql.query("UPDATE bot_replies SET state = $2, sent_post_id = $3, sent_at = $4 WHERE id = $1", [
      id,
      sentPostId ? "SENT" : "FAILED",
      sentPostId,
      now.toISOString(),
    ]);
  }

  async repliesSentSince(since: Date): Promise<number> {
    const rows = await this.sql.query<{ n: string | number }>(
      "SELECT count(*) AS n FROM bot_replies WHERE state = 'SENT' AND sent_at >= $1",
      [since.toISOString()],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
