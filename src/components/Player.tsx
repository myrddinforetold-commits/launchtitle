"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = { title: string; src: string; sandbox: string; allow: string };

/**
 * The Play button and the screen it opens. The game fills the window with a
 * slim bar above it, like switching to a game on a console. Nothing loads
 * from the game until Play is pressed.
 */
export function Player({ title, src, sandbox, allow }: Props) {
  const [open, setOpen] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

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
      {open && (
        <div ref={screen} className="player" role="dialog" aria-modal="true" aria-label={`Playing ${title}`}>
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
          <iframe src={src} title={title} sandbox={sandbox} allow={allow} referrerPolicy="no-referrer" />
        </div>
      )}
    </>
  );
}
