"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = { slug: string; title: string; src: string; sandbox: string; allow: string; portrait?: boolean; cover?: string };

/** How often a running game reports its time. */
const REPORT_EVERY_MS = 30_000;
/** The launch screen stays at least this long, so it never flickers past. */
const LAUNCH_MIN_MS = 1100;
/** And lifts after this long whatever happens, in case a game never says it has loaded. */
const LAUNCH_MAX_MS = 12_000;

/**
 * The Play button and the screen it opens. The game fills the window with a
 * slim bar above it, like switching to a game on a console. Nothing loads
 * from the game until Play is pressed.
 */
export function Player({ slug, title, src, sandbox, allow, portrait = false, cover }: Props) {
  const [open, setOpen] = useState(false);
  const [launching, setLaunching] = useState(true);
  const screen = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const openedAt = useRef(0);

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setOpen(false);
    opener.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) close();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // The launch screen: up when the game opens, down once it has loaded.
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    setLaunching(true);
    const giveUp = setTimeout(() => setLaunching(false), LAUNCH_MAX_MS);
    return () => clearTimeout(giveUp);
  }, [open]);

  const loaded = () => {
    const wait = Math.max(0, LAUNCH_MIN_MS - (Date.now() - openedAt.current));
    setTimeout(() => setLaunching(false), wait);
  };

  // Tell the store a play began, then how long the game stayed on screen.
  useEffect(() => {
    if (!open) return;
    const url = `/api/games/${slug}/play`;
    const post = (body: object) =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    let id: string | null = null;
    let mark = Date.now();
    let stopped = false;

    void post({})
      .then((response) => (response.ok && response.status !== 204 ? response.json() : null))
      .then((data: { id?: string } | null) => {
        if (!stopped) id = data?.id ?? null;
      })
      .catch(() => {});

    const report = () => {
      const now = Date.now();
      // Time only counts while the game is actually in front of the player.
      const seconds = document.visibilityState === "visible" ? Math.round((now - mark) / 1000) : 0;
      mark = now;
      if (id && seconds > 0) void post({ id, seconds }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") report();
      else mark = Date.now();
    };
    const timer = setInterval(report, REPORT_EVERY_MS);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", report);
    return () => {
      report();
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", report);
    };
  }, [open, slug]);

  const fullscreen = () => {
    const el = screen.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  };

  return (
    <>
      <button ref={opener} type="button" className="button primary play" onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
        </svg>
        Play
      </button>
      {open &&
        // Drawn at the top of the page, outside whatever holds the Play button,
        // so the game's screen sits above the store's own bars on every device.
        createPortal(
          <div ref={screen} className={portrait ? "player portrait" : "player"} role="dialog" aria-modal="true" aria-label={`Playing ${title}`}>
            <div className="player-bar">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
              <img src="/lt-mark.svg" alt="" width={24} height={24} />
              <strong>{title}</strong>
              <button type="button" onClick={fullscreen}>
                Full screen
              </button>
              <button type="button" onClick={close} autoFocus>
                Close
              </button>
            </div>
            <div className="player-stage">
              <iframe src={src} title={title} sandbox={sandbox} allow={allow} referrerPolicy="no-referrer" onLoad={loaded} />
              <div className={launching ? "launch" : "launch done"} aria-hidden={!launching}>
                {cover && <div className="launch-art" style={{ backgroundImage: `url(${cover})` }} />}
                <div className="launch-copy">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
                  <img src="/lt-mark.svg" alt="" width={44} height={44} />
                  <strong>{title}</strong>
                  <span className="launch-bar" />
                  <small role="status">{launching ? "Launching" : ""}</small>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
