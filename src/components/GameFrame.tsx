import { GAME_FRAME_ALLOW, GAME_FRAME_SANDBOX, playUrl } from "@/lib/frame";

/** A game, running in a sandboxed frame from its own subdomain of the play host. */
export function GameFrame({ slug, title }: { slug: string; title: string }) {
  return (
    <iframe
      className="game-frame"
      src={playUrl(slug)}
      title={title}
      sandbox={GAME_FRAME_SANDBOX}
      allow={GAME_FRAME_ALLOW}
      referrerPolicy="no-referrer"
      loading="eager"
    />
  );
}
