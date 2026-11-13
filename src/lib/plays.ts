import type { Sql } from "./db/sql";

/** Opening the same game again within this long continues the play instead of counting a new one. */
export const SAME_SITTING_MINUTES = 30;
/** The most a single play can report, so a tab left open overnight does not count as a day of play. */
export const MAX_PLAY_SECONDS = 6 * 60 * 60;

export type PlayStats = { plays: number; seconds: number };

/** "1 play", "12 plays", "1.2K plays". */
export function playsLabel(count: number): string {
  if (count === 1) return "1 play";
  if (count < 1000) return `${count} plays`;
  const short = count < 1_000_000 ? `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K` : `${(count / 1_000_000).toFixed(1)}M`;
  return `${short.replace(".0", "")} plays`;
}

/** Who played what, for how long, and what each player has saved. */
export class Plays {
  constructor(private readonly sql: Sql) {}

  /** Records that a game was opened and returns the play's id. Reopening within the same sitting returns the same play. */
  async start(slug: string, visitor: string, userId: string | null): Promise<string | null> {
    const recent = await this.sql.query<{ id: string }>(
      `SELECT id::text FROM plays
        WHERE visitor = $1 AND game_slug = $2 AND started_at > now() - make_interval(mins => $3)
        ORDER BY started_at DESC LIMIT 1`,
      [visitor, slug, SAME_SITTING_MINUTES],
    );
    if (recent[0]) {
      // Signing in part-way through a sitting attaches the play to the account.
      if (userId) await this.sql.query("UPDATE plays SET user_id = $2 WHERE id = $1 AND user_id IS NULL", [recent[0].id, userId]);
      return recent[0].id;
    }
    const rows = await this.sql.query<{ id: string }>(
      `INSERT INTO plays (game_slug, visitor, user_id)
       SELECT slug, $2, $3 FROM games WHERE slug = $1
       RETURNING id::text`,
      [slug, visitor, userId],
    );
    return rows[0]?.id ?? null;
  }

  /** Adds time to a play. Only the visitor who started it can, and the total never goes down or past the cap. */
  async addTime(id: string, visitor: string, seconds: number): Promise<void> {
    if (!/^\d{1,18}$/.test(id) || !Number.isFinite(seconds) || seconds <= 0) return;
    await this.sql.query(
      `UPDATE plays SET seconds = LEAST($4::int, seconds + $3::int)
        WHERE id = $1 AND visitor = $2
          -- Time cannot run faster than the clock since the play began.
          AND seconds + $3::int <= EXTRACT(EPOCH FROM now() - started_at)::int + 60`,
      [id, visitor, Math.floor(seconds), MAX_PLAY_SECONDS],
    );
  }

  /** Plays and time for every game that has any. */
  async stats(): Promise<Map<string, PlayStats>> {
    const rows = await this.sql.query<{ game_slug: string; plays: string; seconds: string }>(
      "SELECT game_slug, count(*)::text AS plays, coalesce(sum(seconds), 0)::text AS seconds FROM plays GROUP BY game_slug",
    );
    return new Map(rows.map((row) => [row.game_slug, { plays: Number(row.plays), seconds: Number(row.seconds) }]));
  }

  /** The games a signed-in player opened most recently, newest first. */
  async recentFor(userId: string, limit = 12): Promise<string[]> {
    const rows = await this.sql.query<{ game_slug: string }>(
      `SELECT game_slug FROM plays WHERE user_id = $1
        GROUP BY game_slug ORDER BY max(started_at) DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => row.game_slug);
  }

  async save(userId: string, slug: string): Promise<void> {
    await this.sql.query(
      `INSERT INTO saves (user_id, game_slug) SELECT $1, slug FROM games WHERE slug = $2
       ON CONFLICT DO NOTHING`,
      [userId, slug],
    );
  }

  async unsave(userId: string, slug: string): Promise<void> {
    await this.sql.query("DELETE FROM saves WHERE user_id = $1 AND game_slug = $2", [userId, slug]);
  }

  /** A player's saved games, newest first. */
  async savedFor(userId: string): Promise<string[]> {
    const rows = await this.sql.query<{ game_slug: string }>(
      "SELECT game_slug FROM saves WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    return rows.map((row) => row.game_slug);
  }
}
