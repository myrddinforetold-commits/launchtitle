import Link from "next/link";

import { GameCard } from "@/components/GameCard";
import { accounts, currentUser, plays, xApp } from "@/lib/auth/current";
import { isPlayable, type Game } from "@/lib/games";
import { playsLabel, type PlayStats } from "@/lib/plays";
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
  const user = await currentUser();
  const stats = (await (await plays())?.stats().catch(() => null)) ?? new Map<string, PlayStats>();
  const played = (game: Game) => stats.get(game.slug)?.plays ?? 0;
  // A "Most played" shelf only means something once a few games have been played.
  const mostPlayed = games.filter((game) => played(game) > 0).sort((a, b) => played(b) - played(a)).slice(0, 8);
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const fresh = games.filter((game) => Date.now() - Date.parse(game.createdAt) < WEEK);
  const shelves = games.length >= 6;

  return (
    <>
      {!user && (
        <section className="welcome">
          <div className="welcome-copy">
            <p className="kicker">Launch Title</p>
            <h1>Every game deserves a launch.</h1>
            <p>
              A store for new web games. Press Play and you are in: no downloads, no installs, on a phone or a desk.
              Found on X, hosted here, and built so the good ones get seen.
            </p>
            <div className="actions">
              {games.length > 0 ? (
                <a className="button primary" href="#games">
                  BROWSE GAMES
                </a>
              ) : (
                <a className="button primary" href={X_URL} rel="noopener">
                  FOLLOW @LAUNCHTITLEGG
                </a>
              )}
              <Link className="button" href="/creators">
                Add your game
              </Link>
              {xApp() && (
                <a className="button quiet" href="/api/auth/x/start">
                  Sign in with X
                </a>
              )}
            </div>
          </div>
          <ul className="pillars">
            <li>
              <b>Play instantly</b>
              <span>Every game runs in your browser. Press Play.</span>
            </li>
            <li>
              <b>New every week</b>
              <span>Fresh games from independent creators, added as they launch.</span>
            </li>
            <li>
              <b>Creators first</b>
              <span>When a game earns, 80% goes to the person who made it.</span>
            </li>
          </ul>
        </section>
      )}

      <header className="page-head">
        <p className="crumb">Store</p>
        <h2 className="page-title">{featured ? "Featured" : "Opening soon"}</h2>
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
              {(by(featured) || played(featured) > 0) && (
                <p className="meta">
                  {[by(featured) && `by @${by(featured)}`, played(featured) > 0 && playsLabel(played(featured))].filter(Boolean).join(" · ")}
                </p>
              )}
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

      {shelves && mostPlayed.length >= 3 && (
        <section className="shelf">
          <h2>Most played</h2>
          <div className="cards">
            {mostPlayed.map((game) => (
              <GameCard key={game.slug} game={game} by={by(game)} plays={played(game)} />
            ))}
          </div>
        </section>
      )}

      {shelves && fresh.length >= 3 && fresh.length < games.length && (
        <section className="shelf">
          <h2>New this week</h2>
          <div className="cards">
            {fresh.slice(0, 8).map((game) => (
              <GameCard key={game.slug} game={game} by={by(game)} plays={played(game)} />
            ))}
          </div>
        </section>
      )}

      {games.length > 0 && (
        <section id="games" className="shelf">
          <h2>All games</h2>
          <div className="cards">
            {games.map((game) => (
              <GameCard key={game.slug} game={game} by={by(game)} plays={played(game)} />
            ))}
          </div>
        </section>
      )}

      <section className="shelf" id="how">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <span className="step-n">01</span>
            <h3>Someone tags a game</h3>
            <p>Reply to a game on X with @launchtitlegg add. Its creator says yes from their own account.</p>
          </li>
          <li>
            <span className="step-n">02</span>
            <h3>It lands here</h3>
            <p>The game gets its own page and plays full screen, right in the store.</p>
          </li>
          <li>
            <span className="step-n">03</span>
            <h3>The best get a launch</h3>
            <p>Each week the standout new games become Launch Titles, at the front of the store.</p>
          </li>
        </ol>
      </section>

      <section className="strip">
        <div>
          <h2>Made a game?</h2>
          <p>We are choosing the first Launch Titles now. Tag @launchtitlegg under your game on X, or add it yourself.</p>
        </div>
        <Link className="button" href="/creators">
          For creators
        </Link>
      </section>

      <footer className="foot">
        <span>Launch Title</span>
        <a href={X_URL} rel="noopener">
          @launchtitlegg
        </a>
      </footer>
    </>
  );
}
