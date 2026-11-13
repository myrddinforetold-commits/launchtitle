import Link from "next/link";

import type { Game } from "@/lib/games";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** A tall card: the game's cover, a badge, and its name on a glass strip. */
export function GameCard({ game, by, badge }: { game: Game; by?: string; badge?: string }) {
  const fresh = Date.now() - Date.parse(game.createdAt) < WEEK;
  const label = badge ?? (fresh ? "NEW" : undefined);
  return (
    <Link className="card" href={`/games/${game.slug}`} aria-label={by ? `${game.title}, by @${by}` : game.title}>
      {game.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from our own storage
        <img src={`/media/${game.cover.hash}`} alt="" loading="lazy" />
      ) : (
        <span className="card-blank" aria-hidden="true">
          {game.title.slice(0, 1).toUpperCase()}
        </span>
      )}
      {label && <span className="card-badge">{label}</span>}
      <span className="card-title">
        <strong>{game.title}</strong>
        {by && <small>@{by}</small>}
      </span>
    </Link>
  );
}
