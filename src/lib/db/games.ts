import type { Game, GameRepo, GameState, Version } from "../games";
import type { Sql } from "./sql";

type Row = {
  slug: string;
  title: string;
  state: GameState;
  active_version: string | null;
  created_at: Date | string;
  versions: Version[];
};

const SELECT_GAME = `
  SELECT g.slug, g.title, g.state, g.active_version, g.created_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.version,
        'manifest', v.manifest,
        'totalBytes', v.total_bytes,
        'createdAt', v.created_at,
        'source', v.source,
        'externalDomains', v.external_domains
      ) ORDER BY v.seq)
      FROM versions v WHERE v.game_id = g.id
    ), '[]'::jsonb) AS versions
  FROM games g`;

const iso = (value: Date | string) => new Date(value).toISOString();

function toGame(row: Row): Game {
  return {
    slug: row.slug,
    title: row.title,
    state: row.state,
    activeVersionId: row.active_version,
    createdAt: iso(row.created_at),
    versions: row.versions.map((v) => ({ ...v, totalBytes: Number(v.totalBytes), createdAt: iso(v.createdAt) })),
  };
}

/** Games in Postgres. Builds are only ever added, so saving a game twice is harmless. */
export class PgGameRepo implements GameRepo {
  constructor(private readonly sql: Sql) {}

  async list(): Promise<Game[]> {
    return (await this.sql.query<Row>(`${SELECT_GAME} ORDER BY g.created_at DESC, g.id DESC`)).map(toGame);
  }

  async get(slug: string): Promise<Game | null> {
    const rows = await this.sql.query<Row>(`${SELECT_GAME} WHERE g.slug = $1`, [slug]);
    return rows[0] ? toGame(rows[0]) : null;
  }

  /**
   * One statement, so the game row, any new builds and the live pointer change
   * together or not at all. Builds already stored are left exactly as they are.
   */
  async save(game: Game): Promise<void> {
    if (game.activeVersionId !== null && !game.versions.some((v) => v.id === game.activeVersionId)) {
      throw new Error(`Game ${game.slug} points at a build it does not have: ${game.activeVersionId}`);
    }
    await this.sql.query(
      `WITH g AS (
         INSERT INTO games (slug, title, state, active_version, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE
           SET title = EXCLUDED.title, state = EXCLUDED.state, active_version = EXCLUDED.active_version
         RETURNING id
       ), v AS (
         INSERT INTO versions (game_id, version, manifest, total_bytes, source, external_domains, created_at)
         SELECT g.id, x.id, x.manifest, x."totalBytes", x.source, x."externalDomains", x."createdAt"
         FROM g, jsonb_to_recordset($6::jsonb) AS x(
           id text, manifest jsonb, "totalBytes" bigint, source jsonb,
           "externalDomains" jsonb, "createdAt" timestamptz)
         ON CONFLICT (game_id, version) DO NOTHING
         RETURNING 1
       )
       SELECT (SELECT count(*) FROM v) AS added`,
      [game.slug, game.title, game.state, game.activeVersionId, game.createdAt, JSON.stringify(game.versions)],
    );
  }
}
