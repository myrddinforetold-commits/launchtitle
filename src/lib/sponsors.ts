import type { Sql } from "./db/sql";

export const PLACEMENTS = ["home", "game", "launch"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const PLACEMENT_LABEL: Record<Placement, string> = {
  home: "Home page band",
  game: "Game page card",
  launch: "Launch screen line",
};

export type Sponsor = {
  id: string;
  placement: Placement;
  name: string;
  headline: string;
  body: string;
  url: string;
  imageHash: string | null;
  active: boolean;
  clicks: number;
};

type Row = { id: string; placement: Placement; name: string; headline: string; body: string; url: string; image_hash: string | null; active: boolean; clicks: number };
const COLUMNS = "id::text, placement, name, headline, body, url, image_hash, active, clicks";
const toSponsor = (row: Row): Sponsor => ({ ...row, imageHash: row.image_hash, clicks: Number(row.clicks) });

export class SponsorError extends Error {}

/** A sponsor's link must be an ordinary https address. */
export function cleanUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SponsorError("The link is not a web address.");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new SponsorError("The link must start with https://");
  return url.toString();
}

/** The labelled sponsor spots in the store. Never shown over a game. */
export class Sponsors {
  constructor(private readonly sql: Sql) {}

  async all(): Promise<Sponsor[]> {
    return (await this.sql.query<Row>(`SELECT ${COLUMNS} FROM sponsors ORDER BY created_at DESC, id DESC`)).map(toSponsor);
  }

  /** One sponsor to show in a place, or null. With several switched on, each page view picks one at random. */
  async pick(placement: Placement): Promise<Sponsor | null> {
    const rows = await this.sql.query<Row>(`SELECT ${COLUMNS} FROM sponsors WHERE active AND placement = $1 ORDER BY random() LIMIT 1`, [placement]);
    return rows[0] ? toSponsor(rows[0]) : null;
  }

  async add(input: { placement: string; name: string; headline: string; body: string; url: string; imageHash?: string | null }): Promise<Sponsor> {
    if (!PLACEMENTS.includes(input.placement as Placement)) throw new SponsorError("Choose where it shows.");
    const name = input.name.trim().slice(0, 40);
    const headline = input.headline.trim().slice(0, 70);
    if (!name) throw new SponsorError("Say who the sponsor is.");
    if (!headline && input.placement !== "launch") throw new SponsorError("Add a headline.");
    const rows = await this.sql.query<Row>(
      `INSERT INTO sponsors (placement, name, headline, body, url, image_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [input.placement, name, headline, input.body.trim().slice(0, 160), cleanUrl(input.url), input.imageHash ?? null],
    );
    return toSponsor(rows[0]);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.sql.query("UPDATE sponsors SET active = $2 WHERE id = $1", [id, active]);
  }

  async remove(id: string): Promise<void> {
    await this.sql.query("DELETE FROM sponsors WHERE id = $1", [id]);
  }

  /** Counts a click and returns where to send the visitor, or null if the spot is gone or switched off. */
  async click(id: string): Promise<string | null> {
    if (!/^\d{1,18}$/.test(id)) return null;
    const rows = await this.sql.query<{ url: string }>("UPDATE sponsors SET clicks = clicks + 1 WHERE id = $1 AND active RETURNING url", [id]);
    return rows[0]?.url ?? null;
  }
}
