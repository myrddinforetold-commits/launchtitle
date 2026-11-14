import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameCard } from "@/components/GameCard";
import { accounts, plays } from "@/lib/auth/current";
import { isListed } from "@/lib/games";
import { playsLabel, type PlayStats } from "@/lib/plays";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

/** A creator has a page once they have a game people can play. Signing in alone does not make one. */
async function load(handle: string) {
  const creator = await (await accounts())?.byHandle(handle).catch(() => null);
  if (!creator) return null;
  const games = (await openStores().repo.list()).filter((game) => game.creatorId === creator.id && isListed(game));
  return games.length > 0 ? { creator, games } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).handle);
  if (!found) return { title: "Not found" };
  const { creator, games } = found;
  const cover = games.find((game) => game.cover)?.cover;
  return {
    title: `@${creator.handle}`,
    description: `Games by @${creator.handle} on Launch Title.`,
    openGraph: cover ? { images: [`/media/${cover.hash}`] } : undefined,
  };
}

export default async function CreatorPage({ params }: Props) {
  const found = await load((await params).handle);
  if (!found) notFound();
  const { creator, games } = found;
  const stats = (await (await plays())?.stats().catch(() => null)) ?? new Map<string, PlayStats>();
  const played = (slug: string) => stats.get(slug)?.plays ?? 0;
  const total = games.reduce((sum, game) => sum + played(game.slug), 0);

  return (
    <>
      <header className="page-head">
        <p className="crumb">
          <Link href="/creators">Creators</Link>
          <span aria-hidden="true">/</span>@{creator.handle}
        </p>
      </header>

      <section className="profile">
        <span className="profile-mark" aria-hidden="true">
          {creator.handle.slice(0, 1).toUpperCase()}
        </span>
        <div className="profile-copy">
          <h1>{creator.name || `@${creator.handle}`}</h1>
          <p className="byline">@{creator.handle}</p>
          <ul className="stats">
            <li>
              <b>{games.length}</b> {games.length === 1 ? "game" : "games"}
            </li>
            {total > 0 && (
              <li>
                <b>{playsLabel(total).split(" ")[0]}</b> {total === 1 ? "play" : "plays"}
              </li>
            )}
          </ul>
        </div>
        <a className="button" href={`https://x.com/${creator.handle}`} rel="noopener">
          Follow on X
        </a>
      </section>

      <section className="shelf">
        <h2>Games</h2>
        <div className="cards">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} plays={played(game.slug)} />
          ))}
        </div>
      </section>
    </>
  );
}
