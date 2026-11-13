import type { Metadata, Viewport } from "next";

import { Backdrop } from "@/components/Backdrop";
import { Shell } from "@/components/Shell";
import { currentUser, xApp } from "@/lib/auth/current";
import { canSubmit } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";

import "./globals.css";

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
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700;800&display=swap" />
      </head>
      <body>
        <Backdrop />
        <Shell
          user={user ? { handle: user.handle, role: user.role } : null}
          canSignIn={canSignIn}
          canSubmit={openImport || canSubmit(user)}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
