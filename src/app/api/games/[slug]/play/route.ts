import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { cookieOptions, currentUser, plays } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import { isPlayable } from "@/lib/games";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** A random id, so a signed-out player counts as one player. It says nothing about who they are. */
const VISITOR_COOKIE = "lt_visitor";
const YEAR = 365 * 24 * 60 * 60;

/**
 * The player calls this when a game opens, and again as it runs.
 * `{}` starts a play; `{ id, seconds }` adds time to one.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (request.headers.get("origin") !== getConfig().appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; seconds?: unknown };

  try {
    const store = await plays();
    if (!store) return new NextResponse(null, { status: 204 });

    const known = request.cookies.get(VISITOR_COOKIE)?.value;
    const visitor = known && /^[a-f0-9]{32}$/.test(known) ? known : randomBytes(16).toString("hex");

    if (typeof body.id === "string" && typeof body.seconds === "number") {
      await store.addTime(body.id, visitor, body.seconds);
      return new NextResponse(null, { status: 204 });
    }

    const game = await openStores().repo.get(slug);
    if (!game || !isPlayable(game)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const user = await currentUser();
    const id = await store.start(slug, visitor, user?.id ?? null);
    const response = NextResponse.json({ id });
    if (visitor !== known) response.cookies.set(VISITOR_COOKIE, visitor, cookieOptions(YEAR));
    return response;
  } catch (error) {
    // Counting a play must never get in the way of playing.
    console.error("plays: could not record:", error instanceof Error ? error.message : error);
    return new NextResponse(null, { status: 204 });
  }
}
