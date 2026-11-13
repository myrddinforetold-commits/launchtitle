import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { currentUser, xApp } from "@/lib/auth/current";
import { canSubmit } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";

import "./globals.css";

const X_URL = "https://x.com/launchtitlegg";

export const metadata: Metadata = {
  metadataBase: new URL("https://launchtitle.gg"),
  title: { default: "Launch Title", template: "%s · Launch Title" },
  description: "A curated store for new web games. Every game deserves a launch.",
  openGraph: { siteName: "Launch Title", type: "website" },
  twitter: { card: "summary_large_image", site: "@launchtitlegg" },
};

export const viewport: Viewport = { themeColor: "#070b14" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { openImport } = getConfig();
  const canSignIn = xApp() !== null;
  const user = canSignIn ? await currentUser() : null;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- loaded once here for every page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700;800&display=swap"
        />
      </head>
      <body>
        <header className="top">
          <Link href="/" className="brand" aria-label="Launch Title home">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
            <img src="/lt-mark.svg" alt="" width={32} height={32} />
            <span>LAUNCH TITLE</span>
          </Link>
          <nav>
            {user?.role === "admin" && <Link href="/admin">Admin</Link>}
            {(openImport || canSubmit(user)) && <Link href="/submit">Add a game</Link>}
            {user ? (
              <form action="/api/auth/signout" method="post" className="who">
                <span>@{user.handle}</span>
                <button type="submit">Sign out</button>
              </form>
            ) : canSignIn ? (
              <a href="/api/auth/x/start">Sign in with X</a>
            ) : (
              <a href={X_URL} rel="noopener">
                Follow on X
              </a>
            )}
          </nav>
        </header>
        <main>{children}</main>
        <footer className="foot">
          <span>Launch Title</span>
          <a href={X_URL} rel="noopener">
            @launchtitlegg
          </a>
        </footer>
      </body>
    </html>
  );
}
