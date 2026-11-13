import Link from "next/link";

import { accounts } from "@/lib/auth/current";
import { COVER_FADE } from "@/lib/frame";
import { SERVED_STATES, type Game } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

const X_URL = "https://x.com/launchtitlegg";

const STEPS = [
  {
    n: "01",
    title: "Tag it",
    body: "Reply to a game on X and tag us. The creator confirms from their own account, and nothing goes up without them.",
  },
  {
    n: "02",
    title: "We host it",
    body: "The game gets its own address and plays right here, full screen, on a phone or a desk. No downloads.",
  },
  {
    n: "03",
    title: "It gets a launch",
    body: "Every week we pick the best new games as Launch Titles and put them at the front of the store.",
  },
  {
    n: "04",
    title: "Creators get paid",
    body: "When a game earns, 80% goes to the person who made it.",
  },
];

const SIGNIN_NOTES: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Try again.",
  failed: "X could not confirm the sign-in. Try again.",
  unavailable: "Sign-in is not available right now.",
};


function Cover({ game }: { game: Game }) {
  return game.cover ? (
    // eslint-disable-next-line @next/next/no-img-element -- served from our own storage, already sized by the creator
    <img className="cover" src={`/media/${game.cover.hash}`} alt="" loading="lazy" />
  ) : (
    <span className="cover blank" aria-hidden="true">
      {game.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const note = SIGNIN_NOTES[(await searchParams).signin ?? ""];
  const games = (await openStores().repo.list()).filter((game) => SERVED_STATES.has(game.state));
  const open = games.length > 0;
  // The newest game with a cover leads the store. Without one, the horizon does.
  const featured = games.find((game) => game.cover) ?? null;
  const handles =
    (await (await accounts())
      ?.handles(games.flatMap((game) => (game.creatorId ? [game.creatorId] : [])))
      .catch(() => null)) ?? new Map<string, string>();
  const by = (game: Game) => (game.creatorId ? handles.get(game.creatorId) : undefined);

  return (
    <>
      <section className="hero">
        <div
          className={featured?.cover ? "hero-art covered" : "hero-art"}
          aria-hidden="true"
          style={featured?.cover ? { backgroundImage: `${COVER_FADE}, url(/media/${featured.cover.hash})` } : undefined}
        />
        <div className="hero-copy">
          {note && (
            <p className="notice error" role="status">
              {note}
            </p>
          )}
          {featured ? (
            <>
              <p className="eyebrow">Now playing</p>
              <h1>{featured.title}</h1>
              {by(featured) && <p className="byline">By @{by(featured)}</p>}
              {featured.description && <p className="hero-lede">{featured.description}</p>}
              <div className="actions">
                <Link className="button primary" href={`/games/${featured.slug}`}>
                  Play
                </Link>
                <a className="button" href="#games">
                  All games
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">{open ? "Now playing" : "Opening soon"}</p>
              <h1>Every game deserves a launch.</h1>
              <p className="hero-lede">
                More games are being made than ever, and most are never found. Launch Title is a store for new web
                games: a place to play them, and a way for the good ones to get seen.
              </p>
              <div className="actions">
                {open ? (
                  <a className="button primary" href="#games">
                    Browse games
                  </a>
                ) : (
                  <a className="button primary" href={X_URL} rel="noopener">
                    Follow @launchtitlegg
                  </a>
                )}
                <a className="button" href="#how">
                  How it works
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="deck">
        {open && (
          <section id="games" className="band">
            <h2>Games</h2>
            <ul className="grid">
              {games.map((game) => (
                <li key={game.slug}>
                  <Link className="tile" href={`/games/${game.slug}`}>
                    <Cover game={game} />
                    <strong>{game.title}</strong>
                    {by(game) && <span>@{by(game)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="how" className="band">
          <h2>{featured ? "Every game deserves a launch" : open ? "How it works" : "How it will work"}</h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="step-n">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="band creators">
          <div>
            <h2>Made a game?</h2>
            <p>
              We are choosing the first Launch Titles now. If you have a game that runs in a browser, send it to us on X
              and we will take a look.
            </p>
          </div>
          <a className="button primary" href={X_URL} rel="noopener">
            Send us your game
          </a>
        </section>
      </div>
    </>
  );
}
