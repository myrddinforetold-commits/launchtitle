import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Launch Title",
  description: "Every game deserves a launch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
            <Link href="/submit">Submit a game</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
