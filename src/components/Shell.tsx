"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ShellUser = { handle: string; role: string } | null;
type Section = "store" | "library" | "creators";

const ICONS: Record<Section, React.ReactNode> = {
  store: (
    <>
      <path d="M4 9l1.5-5h13L20 9" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" />
    </>
  ),
  library: (
    <>
      <path d="M7 8h10a5 5 0 0 1 5 5v1a3 3 0 0 1-5.4 1.8L15.5 14h-7l-1.1 1.8A3 3 0 0 1 2 14v-1a5 5 0 0 1 5-5z" />
      <path d="M7 11v3" />
      <path d="M5.5 12.5h3" />
      <path d="M16.5 12.5h.01" />
    </>
  ),
  creators: (
    <>
      <circle cx="12" cy="7" r="3" />
      <circle cx="5" cy="10" r="2" />
      <circle cx="19" cy="10" r="2" />
      <path d="M7 20c0-3 2.2-5 5-5s5 2 5 5" />
      <path d="M2 18c0-2 1.3-3.4 3-3.4" />
      <path d="M22 18c0-2-1.3-3.4-3-3.4" />
    </>
  ),
};

const SECTIONS: { id: Section; label: string; href: string }[] = [
  { id: "store", label: "Store", href: "/" },
  { id: "library", label: "Library", href: "/library" },
  { id: "creators", label: "Creators", href: "/creators" },
];

function Icon({ section, size = 24 }: { section: Section; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[section]}
    </svg>
  );
}

function sectionFor(path: string): Section {
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/creators") || path.startsWith("/submit") || path.startsWith("/admin")) return "creators";
  return "store";
}

type Props = { user: ShellUser; canSignIn: boolean; canSubmit: boolean; children: React.ReactNode };

/** The console window: glass navigation on the side, the page on the deck beside it. */
export function Shell({ user, canSignIn, canSubmit, children }: Props) {
  const path = usePathname() ?? "/";
  const section = sectionFor(path);
  const links: { href: string; label: string }[] =
    section === "store"
      ? [
          { href: "/", label: "Featured" },
          { href: "/#games", label: "All games" },
        ]
      : section === "library"
        ? [{ href: "/library", label: "Your games" }]
        : [
            { href: "/creators", label: "How it works" },
            ...(canSubmit ? [{ href: "/submit", label: "Add a game" }] : []),
            ...(user?.role === "admin" ? [{ href: "/admin", label: "Requests and people" }] : []),
          ];

  const account = user ? (
    <form action="/api/auth/signout" method="post" className="account">
      <span className="avatar" aria-hidden="true">
        {user.handle.slice(0, 1).toUpperCase()}
      </span>
      <span className="who">
        <b>@{user.handle}</b>
        <small>{user.role === "player" ? "Signed in" : user.role}</small>
      </span>
      <button type="submit">Sign out</button>
    </form>
  ) : canSignIn ? (
    <a className="signin" href="/api/auth/x/start">
      Sign in with X
    </a>
  ) : (
    <a className="signin" href="https://x.com/launchtitlegg" rel="noopener">
      Follow on X
    </a>
  );

  return (
    <div className="console" data-section={section}>
      <nav className="side" aria-label="Main">
        <Link href="/" className="brand" aria-label="Launch Title home">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
          <img src="/lt-mark.svg" alt="" width={34} height={34} />
          <span>LAUNCH TITLE</span>
        </Link>
        <div className="sections">
          {SECTIONS.map((s) => (
            <Link key={s.id} href={s.href} data-section={s.id} aria-label={s.label} aria-current={s.id === section ? "page" : undefined}>
              <Icon section={s.id} />
            </Link>
          ))}
        </div>
        <p className="side-title">{SECTIONS.find((s) => s.id === section)!.label}</p>
        <div className="side-links">
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={link.href === path ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </div>
        <div className="side-foot">{account}</div>
      </nav>

      <div className="main-wrap">
        <header className="topbar">
          <Link href="/" className="brand" aria-label="Launch Title home">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
            <img src="/lt-mark.svg" alt="" width={30} height={30} />
            <span>LAUNCH TITLE</span>
          </Link>
          {account}
        </header>
        <main className="main">{children}</main>
      </div>

      <nav className="tabs" aria-label="Sections">
        {SECTIONS.map((s) => (
          <Link key={s.id} href={s.href} data-section={s.id} aria-current={s.id === section ? "page" : undefined}>
            <Icon section={s.id} size={22} />
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
