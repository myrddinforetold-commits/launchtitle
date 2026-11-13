import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { accounts } from "@/lib/auth/current";
import { SERVED_STATES } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const runtime = "nodejs";
export const alt = "A game on Launch Title";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const file = (...parts: string[]) => readFile(path.join(process.cwd(), ...parts));

/** The picture behind the card: the game's cover, or the store's own art. Resized, so any cover format works. */
async function backdrop(cover: Uint8Array | null): Promise<string> {
  const { default: sharp } = await import("sharp");
  const source = cover ?? (await file("public", "art", "horizon.jpg"));
  const jpeg = await sharp(source).resize(size.width, size.height, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/**
 * The card shown when a game's link is posted on X or anywhere else:
 * its cover, its name, who made it, and where to play it.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await params;
  const stores = openStores();
  const game = await stores.repo.get(slug);
  if (!game || !SERVED_STATES.has(game.state)) notFound();

  const [bold, medium, mark, creator, cover] = await Promise.all([
    file("assets", "urbanist-latin-800-normal.woff"),
    file("assets", "urbanist-latin-600-normal.woff"),
    file("public", "lt-mark.svg"),
    game.creatorId ? accounts().then((all) => all?.byId(game.creatorId!)).catch(() => null) : null,
    game.cover ? stores.store.get(game.cover.hash).catch(() => null) : null,
  ]);
  const art = await backdrop(cover).catch(() => null);
  const title = game.title.length > 44 ? `${game.title.slice(0, 43)}…` : game.title;
  const titleSize = title.length <= 14 ? 112 : title.length <= 24 ? 88 : 68;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#070b14", color: "#f4f6fb", fontFamily: "Urbanist" }}>
        {art && <img alt="" src={art} width={size.width} height={size.height} style={{ position: "absolute", top: 0, left: 0 }} />}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundImage:
              "linear-gradient(90deg, rgba(7,11,20,0.94) 0%, rgba(7,11,20,0.72) 46%, rgba(7,11,20,0.12) 100%), linear-gradient(180deg, rgba(7,11,20,0) 55%, rgba(7,11,20,0.85) 100%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "56px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img alt="" src={`data:image/svg+xml;base64,${mark.toString("base64")}`} width={56} height={56} />
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 6 }}>LAUNCH TITLE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
            <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>{title}</div>
            {creator && <div style={{ fontSize: 34, fontWeight: 600, color: "#b9c2d6" }}>by @{creator.handle}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 34px",
                  borderRadius: 16,
                  background: "#FF6A2B",
                  color: "#0D1220",
                  fontSize: 32,
                  fontWeight: 800,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 16 16">
                  <path d="M4 2.5v11l9-5.5z" fill="#0D1220" />
                </svg>
                Play free
              </div>
              <div style={{ fontSize: 30, fontWeight: 600, color: "#b9c2d6" }}>launchtitle.gg</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Urbanist", data: bold, weight: 800, style: "normal" },
        { name: "Urbanist", data: medium, weight: 600, style: "normal" },
      ],
      // A changed cover or name shows up on the next share without waiting long.
      headers: { "cache-control": "public, max-age=300, s-maxage=300" },
    },
  );
}
