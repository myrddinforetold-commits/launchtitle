import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameCard } from "@/components/GameCard";
import { Player } from "@/components/Player";
import { accounts, currentUser, plays, xApp } from "@/lib/auth/current";
import { GAME_FRAME_ALLOW, GAME_FRAME_SANDBOX, LINKED_FRAME_SANDBOX, playUrl } from "@/lib/frame";
import { activeVersion, isPlayable, SERVED_STATES } from "@/lib/games";
import { canManage, MAX_DESCRIPTION, mayMove } from "@/lib/manage";
import { playsLabel } from "@/lib/plays";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ note?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = await openStores().repo.get(slug);
  if (!game || !SERVED_STATES.has(game.state)) return { title: "Not found" };
  return {
    title: game.title,
    description: game.description || `Play ${game.title} on Launch Title.`,
    openGraph: game.cover ? { images: [`/media/${game.cover.hash}`] } : undefined,
  };
}

export default async function GamePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { note } = await searchParams;
  const game = await openStores().repo.get(slug);
  const version = game && activeVersion(game);
  const user = await currentUser();
  const manages = game ? canManage(user, game) : false;
  // People who manage a game can still see it while it is paused or removed. Nobody else can.
  if (!game || (!version && !game.externalUrl) || (!SERVED_STATES.has(game.state) && !manages)) notFound();

  const creator = game.creatorId ? await (await accounts())?.byId(game.creatorId).catch(() => null) : null;
  const playable = isPlayable(game);
  const others = (await openStores().repo.list()).filter((other) => other.slug !== game.slug && isPlayable(other)).slice(0, 8);
  const cover = game.cover ? `/media/${game.cover.hash}` : null;
  const store = await plays().catch(() => null);
  const stats = (await store?.stats().catch(() => null))?.get(game.slug);
  const saved = user && store ? (await store.savedFor(user.id).catch(() => [] as string[])).includes(game.slug) : false;
  const minutes = stats ? Math.round(stats.seconds / 60) : 0;

  return (
    <>
      <header className="page-head">
        <p className="crumb">
          <Link href="/">Store</Link>
          <span aria-hidden="true">/</span>
          {game.title}
        </p>
      </header>
      <section className="hero game-hero">
        <div
          className={cover ? "hero-art covered" : "hero-art"}
          aria-hidden="true"
          style={cover ? { backgroundImage: `url(${cover})` } : undefined}
        />
        <div className="hero-copy">
          {!playable && <p className="eyebrow">{game.state === "PAUSED" ? "Paused" : "Removed"}</p>}
          <h1>{game.title}</h1>
          {creator && (
            <p className="byline">
              By{" "}
              <a href={`https://x.com/${creator.handle}`} rel="noopener">
                @{creator.handle}
              </a>
            </p>
          )}
          {game.description && <p className="hero-lede">{game.description}</p>}
          {stats && stats.plays > 0 && (
            <ul className="stats">
              <li>
                <b>{playsLabel(stats.plays).split(" ")[0]}</b> {stats.plays === 1 ? "play" : "plays"}
              </li>
              {minutes >= 1 && (
                <li>
                  <b>{minutes < 120 ? minutes : Math.round(minutes / 60)}</b> {minutes < 120 ? (minutes === 1 ? "minute" : "minutes") : "hours"} played
                </li>
              )}
            </ul>
          )}
          <div className="actions">
            {playable ? (
              <Player
                title={game.title}
                src={game.externalUrl ?? playUrl(game.slug)}
                sandbox={game.externalUrl ? LINKED_FRAME_SANDBOX : GAME_FRAME_SANDBOX}
                allow={GAME_FRAME_ALLOW}
                portrait={game.display === "portrait"}
                slug={game.slug}
                cover={cover ?? undefined}
              />
            ) : (
              <p className="notice">This game is not playable right now. Only you and the Launch Title team can see this page.</p>
            )}
            {playable && user && store && (
              <form action={`/api/games/${game.slug}/save`} method="post">
                <input type="hidden" name="action" value={saved ? "unsave" : "save"} />
                <button type="submit" className={saved ? "button saved" : "button"}>
                  {saved ? "Saved to library" : "Save to library"}
                </button>
              </form>
            )}
            {playable && !user && xApp() && (
              <a className="button quiet" href="/api/auth/x/start">
                Sign in to save
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="deck">
        {manages && user && (
          <section className="band manage">
            <h2>Manage this game</h2>
            {note && (
              <p className="notice" role="status">
                {note}
              </p>
            )}
            <form className="submit" action={`/api/games/${game.slug}/details`} method="post" encType="multipart/form-data">
              <label>
                Description
                <small>A sentence or two. Up to {MAX_DESCRIPTION} characters.</small>
                <textarea name="description" rows={3} maxLength={MAX_DESCRIPTION} defaultValue={game.description ?? ""} />
              </label>
              <label>
                Cover image
                <small>Wide, 16:9, at least 1280 by 720. PNG, JPEG or WebP, up to 4 MB.</small>
                <input name="cover" type="file" accept="image/png,image/jpeg,image/webp" />
              </label>
              <label>
                On a wide screen
                <small>Pick the phone shape for a game made for phones, so it is not stretched across a laptop.</small>
                <select name="display" defaultValue={game.display ?? "fill"}>
                  <option value="fill">Fill the window</option>
                  <option value="portrait">Phone shape, in the middle</option>
                </select>
              </label>
              <button type="submit">SAVE</button>
            </form>

            <div className="manage-row">
              <p>
                To publish a new version, <Link href="/submit">add the game again</Link> under the same name. Players get
                the new version at once.
              </p>
              <div className="actions">
                {(["HOSTED", "PAUSED", "REMOVED"] as const)
                  .filter((next) => next !== game.state && mayMove(user, game, next))
                  .map((next) => (
                    <form key={next} action={`/api/games/${game.slug}/state`} method="post">
                      <input type="hidden" name="state" value={next} />
                      <button type="submit" className="button">
                        {next === "HOSTED" ? "Put back up" : next === "PAUSED" ? "Pause" : "Remove"}
                      </button>
                    </form>
                  ))}
              </div>
            </div>

            {game.externalUrl ? (
              <ul className="facts">
                <li>
                  Plays from <b>{new URL(game.externalUrl).host}</b>, the creator&apos;s own site
                </li>
              </ul>
            ) : (
              version && (
                <ul className="facts">
                  <li>
                    Version <b>{version.id}</b>
                  </li>
                  <li>
                    <b>{Object.keys(version.manifest).length}</b> {Object.keys(version.manifest).length === 1 ? "file" : "files"},{" "}
                    <b>{size(version.totalBytes)}</b>
                  </li>
                  <li>
                    <b>{game.versions.length}</b> {game.versions.length === 1 ? "version" : "versions"} kept
                  </li>
                  {version.externalDomains.length > 0 && (
                    <li>
                      Also loads from <b>{version.externalDomains.join(", ")}</b>
                    </li>
                  )}
                </ul>
              )
            )}
          </section>
        )}
        {others.length > 0 && (
          <section className="shelf">
            <h2>More games</h2>
            <div className="cards">
              {others.map((other) => (
                <GameCard key={other.slug} game={other} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
