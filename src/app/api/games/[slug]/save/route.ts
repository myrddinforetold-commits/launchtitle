import { NextResponse, type NextRequest } from "next/server";

import { currentUser, plays } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** Saves a game to the signed-in player's library, or takes it out again. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { appOrigin } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { slug } = await params;

  const user = await currentUser();
  const game = await openStores().repo.get(slug);
  const store = await plays();
  if (!user || !game || !store) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  const page = new URL(String(form.get("from") ?? "") === "library" ? "/library" : `/games/${slug}`, appOrigin);
  try {
    if (String(form.get("action") ?? "") === "unsave") await store.unsave(user.id, slug);
    else await store.save(user.id, slug);
  } catch (error) {
    console.error("plays: save failed:", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(page, 303);
}
