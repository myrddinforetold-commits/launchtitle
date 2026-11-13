import type { Game, GameRepo, GameState, Version } from "../games";
import type { Sql } from "./sql";

type Row = {
  slug: string;
  title: string;
  state: GameState;
  active_version: string | null;
  created_at: Date | string;
  creator_user_id: string | number | null;
  description: string;
  cover_hash: string | null;
  cover_type: string | null;
  external_url: string | null;
  display: "fill" | "portrait";
  screenshots: { hash: string; type: string }[];
  how_to: string;
  devices: "any" | "phone" | "desktop";
  versions: Version[];
};

const SELECT_GAME = `
  SELECT g.slug, g.title, g.state, g.active_version, g.created_at, g.creator_user_id,
    g.description, g.cover_hash, g.cover_type, g.external_url, g.display, g.screenshots, g.how_to, g.devices,
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
    ...(row.creator_user_id === null ? {} : { creatorId: String(row.creator_user_id) }),
    ...(row.description ? { description: row.description } : {}),
    ...(row.cover_hash && row.cover_type ? { cover: { hash: row.cover_hash, type: row.cover_type } } : {}),
    ...(row.external_url ? { externalUrl: row.external_url } : {}),
    ...(row.display === "portrait" ? { display: "portrait" as const } : {}),
    ...(row.screenshots?.length ? { screenshots: row.screenshots } : {}),
    ...(row.how_to ? { howTo: row.how_to } : {}),
    ...(row.devices === "phone" || row.devices === "desktop" ? { devices: row.devices } : {}),
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
         INSERT INTO games (slug, title, state, active_version, created_at, creator_user_id,
                            description, cover_hash, cover_type, external_url, display,
                            screenshots, how_to, devices)
         VALUES ($1, $2, $3, $4, $5, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
         ON CONFLICT (slug) DO UPDATE
           SET title = EXCLUDED.title, state = EXCLUDED.state, active_version = EXCLUDED.active_version,
               description = EXCLUDED.description, cover_hash = EXCLUDED.cover_hash, cover_type = EXCLUDED.cover_type,
               external_url = EXCLUDED.external_url, display = EXCLUDED.display,
               screenshots = EXCLUDED.screenshots, how_to = EXCLUDED.how_to, devices = EXCLUDED.devices,
               -- A game's creator is set once and never reassigned by a save.
               creator_user_id = COALESCE(games.creator_user_id, EXCLUDED.creator_user_id)
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
      [
        game.slug,
        game.title,
        game.state,
        game.activeVersionId,
        game.createdAt,
        JSON.stringify(game.versions),
        game.creatorId ?? null,
        game.description ?? "",
        game.cover?.hash ?? null,
        game.cover?.type ?? null,
        game.externalUrl ?? null,
        game.display ?? "fill",
        JSON.stringify(game.screenshots ?? []),
        game.howTo ?? "",
        game.devices ?? "any",
      ],
    );
  }

  /** Builds, plays and saves go with the game: each refers to it and is removed by the database. */
  async delete(slug: string): Promise<void> {
    await this.sql.query("DELETE FROM games WHERE slug = $1", [slug]);
  }
}
