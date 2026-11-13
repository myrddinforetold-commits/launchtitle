import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import type { GameState } from "@/lib/games";
import { ManageError, setState } from "@/lib/manage";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<GameState>(["HOSTED", "PAUSED", "REMOVED"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { appOrigin } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { slug } = await params;

  const user = await currentUser();
  const stores = openStores();
  const game = await stores.repo.get(slug);
  if (!user || !game) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  const next = String(form.get("state") ?? "") as GameState;
  const from = String(form.get("from") ?? "") === "admin" ? "/admin" : `/games/${slug}`;
  const page = new URL(from, appOrigin);
  if (!ALLOWED.has(next)) return NextResponse.json({ error: "Unknown state." }, { status: 400 });

  try {
    await setState(stores, user, game, next);
    console.log(`manage: @${user.handle} set ${slug} to ${next}`);
  } catch (error) {
    if (!(error instanceof ManageError)) console.error("manage: state failed:", error instanceof Error ? error.message : error);
    page.searchParams.set("note", error instanceof ManageError ? error.message : "That change failed. Try again.");
  }
  return NextResponse.redirect(page, 303);
}
