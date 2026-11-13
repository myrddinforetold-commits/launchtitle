import { notFound } from "next/navigation";

import { GameFrame } from "@/components/GameFrame";
import { accounts } from "@/lib/auth/current";
import { activeVersion, SERVED_STATES } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

function megabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await openStores().repo.get(slug);
  const version = game && activeVersion(game);
  if (!game || !version || !SERVED_STATES.has(game.state)) notFound();

  const creator = game.creatorId ? await (await accounts())?.byId(game.creatorId).catch(() => null) : null;

  return (
    <>
      <h1>{game.title}</h1>
      <p className="lede">
        {creator && (
          <>
            By{" "}
            <a href={`https://x.com/${creator.handle}`} rel="noopener">
              @{creator.handle}
            </a>
            .{" "}
          </>
        )}
        Click the game to play.
      </p>
      <GameFrame slug={game.slug} title={game.title} />
      <ul className="facts">
        <li>
          Version <b>{version.id}</b>
        </li>
        <li>
          <b>{Object.keys(version.manifest).length}</b> files, <b>{megabytes(version.totalBytes)}</b>
        </li>
        <li>
          Imported from <b>{version.source.kind === "zip" ? "a zip file" : version.source.url}</b>
        </li>
        {version.externalDomains.length > 0 && (
          <li>
            Also loads from <b>{version.externalDomains.join(", ")}</b>
          </li>
        )}
      </ul>
    </>
  );
}
