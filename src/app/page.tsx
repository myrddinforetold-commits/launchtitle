import Link from "next/link";

import { SERVED_STATES } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

export default async function Home() {
  const games = (await openStores().repo.list()).filter((game) => SERVED_STATES.has(game.state));

  return (
    <>
      <h1>Games</h1>
      <p className="lede">Every game hosted so far.</p>
      {games.length === 0 ? (
        <p className="empty">
          No games yet. <Link href="/submit">Submit the first one.</Link>
        </p>
      ) : (
        <ul className="grid">
          {games.map((game) => (
            <li key={game.slug}>
              <Link className="card" href={`/games/${game.slug}`}>
                <strong>{game.title}</strong>
                <span>
                  {game.versions.length} {game.versions.length === 1 ? "version" : "versions"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
