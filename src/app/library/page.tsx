import type { Metadata } from "next";
import Link from "next/link";

import { GameCard } from "@/components/GameCard";
import { currentUser, xApp } from "@/lib/auth/current";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library" };

const STATE_LABEL: Record<string, string | undefined> = { PAUSED: "PAUSED", REMOVED: "REMOVED" };

export default async function Library() {
  const user = await currentUser();
  const mine = user ? (await openStores().repo.list()).filter((game) => game.creatorId === user.id) : [];

  return (
    <>
      <header className="page-head">
        <p className="crumb">Library</p>
        <h1>Your games</h1>
      </header>

      {!user ? (
        <section className="strip">
          <div>
            <h2>Sign in to see your games</h2>
            <p>Games you have added to Launch Title appear here, ready to manage.</p>
          </div>
          {xApp() && (
            <a className="button primary" href="/api/auth/x/start">
              Sign in with X
            </a>
          )}
        </section>
      ) : mine.length === 0 ? (
        <section className="strip">
          <div>
            <h2>Nothing here yet</h2>
            <p>Games you add appear here. Games you play will too, once playing is tracked.</p>
          </div>
          <Link className="button" href="/creators">
            Add a game
          </Link>
        </section>
      ) : (
        <section className="shelf">
          <div className="cards">
            {mine.map((game) => (
              <GameCard key={game.slug} game={game} badge={STATE_LABEL[game.state]} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
