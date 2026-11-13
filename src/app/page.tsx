import Link from "next/link";

import { GameCard } from "@/components/GameCard";
import { accounts } from "@/lib/auth/current";
import { isPlayable, type Game } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

const X_URL = "https://x.com/launchtitlegg";

const SIGNIN_NOTES: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Try again.",
  failed: "X could not confirm the sign-in. Try again.",
  unavailable: "Sign-in is not available right now.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const note = SIGNIN_NOTES[(await searchParams).signin ?? ""];
  const games = (await openStores().repo.list()).filter(isPlayable);
  // The newest game with a cover leads the store. Without one, the horizon does.
  const featured = games.find((game) => game.cover) ?? games[0] ?? null;
  const handles =
    (await (await accounts())
      ?.handles(games.flatMap((game) => (game.creatorId ? [game.creatorId] : [])))
      .catch(() => null)) ?? new Map<string, string>();
  const by = (game: Game) => (game.creatorId ? handles.get(game.creatorId) : undefined);

  return (
    <>
      <header className="page-head">
        <p className="crumb">Store</p>
        <h1>{featured ? "Featured" : "Opening soon"}</h1>
      </header>

      {note && (
        <p className="notice error" role="status">
          {note}
        </p>
      )}

      <section className="feature" id="featured">
        <div className="feature-art">
          {featured?.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own storage
            <img src={`/media/${featured.cover.hash}`} alt="" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a static brand image
            <img src="/art/horizon.jpg" alt="" />
          )}
        </div>
        <div className="feature-copy">
          {featured ? (
            <>
              <p className="kicker">Now playing</p>
              <h2>{featured.title}</h2>
              {by(featured) && <p className="meta">by @{by(featured)}</p>}
              {featured.description && <p className="blurb">{featured.description}</p>}
              <div className="actions">
                <Link className="button primary" href={`/games/${featured.slug}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 4l13 8-13 8z" />
                  </svg>
                  PLAY
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="kicker">Launch Title</p>
              <h2>Every game deserves a launch.</h2>
              <p className="blurb">
                More games are being made than ever, and most are never found. This is a store for new web games: a
                place to play them, and a way for the good ones to get seen.
              </p>
              <div className="actions">
                <a className="button primary" href={X_URL} rel="noopener">
                  FOLLOW @LAUNCHTITLEGG
                </a>
                <Link className="button" href="/creators">
                  How it works
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {games.length > 0 && (
        <section id="games" className="shelf">
          <h2>All games</h2>
          <div className="cards">
            {games.map((game) => (
              <GameCard key={game.slug} game={game} by={by(game)} />
            ))}
          </div>
        </section>
      )}

      <section className="strip">
        <div>
          <h2>Made a game?</h2>
          <p>We are choosing the first Launch Titles now. Tag @launchtitlegg under your game on X, or add it yourself.</p>
        </div>
        <Link className="button" href="/creators">
          For creators
        </Link>
      </section>
    </>
  );
}
