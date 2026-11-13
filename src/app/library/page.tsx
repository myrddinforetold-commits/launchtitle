import type { Metadata } from "next";
import Link from "next/link";

import { GameCard } from "@/components/GameCard";
import { currentUser, plays, xApp } from "@/lib/auth/current";
import { isPlayable, type Game } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library" };

const STATE_LABEL: Record<string, string | undefined> = { PAUSED: "PAUSED", REMOVED: "REMOVED" };

export default async function Library() {
  const user = await currentUser();
  const all = user ? await openStores().repo.list() : [];
  const bySlug = new Map(all.map((game) => [game.slug, game]));
  const store = user ? await plays().catch(() => null) : null;
  // Only games that can still be played appear on a player's shelves.
  const pick = (slugs: string[]) => slugs.flatMap((slug) => bySlug.get(slug) ?? []).filter(isPlayable);
  const recent: Game[] = user && store ? pick(await store.recentFor(user.id).catch(() => [])) : [];
  const saved: Game[] = user && store ? pick(await store.savedFor(user.id).catch(() => [])) : [];
  const mine = user ? all.filter((game) => game.creatorId === user.id) : [];
  const empty = recent.length + saved.length + mine.length === 0;

  return (
    <>
      <header className="page-head">
        <p className="crumb">Library</p>
        <h1>Your library</h1>
      </header>

      {!user ? (
        <section className="strip">
          <div>
            <h2>Sign in to keep your games</h2>
            <p>Games you play and save are kept here, on every device you sign in on.</p>
          </div>
          {xApp() && (
            <a className="button primary" href="/api/auth/x/start">
              Sign in with X
            </a>
          )}
        </section>
      ) : empty ? (
        <section className="strip">
          <div>
            <h2>Nothing here yet</h2>
            <p>Play a game and it appears here, so you can jump back in. Save one to keep it for later.</p>
          </div>
          <Link className="button primary" href="/">
            Browse games
          </Link>
        </section>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="shelf">
              <h2>Jump back in</h2>
              <div className="cards">
                {recent.map((game) => (
                  <GameCard key={game.slug} game={game} />
                ))}
              </div>
            </section>
          )}
          {saved.length > 0 && (
            <section className="shelf">
              <h2>Saved</h2>
              <div className="cards">
                {saved.map((game) => (
                  <GameCard key={game.slug} game={game} />
                ))}
              </div>
            </section>
          )}
          {mine.length > 0 && (
            <section className="shelf">
              <h2>Games you added</h2>
              <div className="cards">
                {mine.map((game) => (
                  <GameCard key={game.slug} game={game} badge={STATE_LABEL[game.state]} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
