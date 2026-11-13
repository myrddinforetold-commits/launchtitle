import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { BotStore } from "@/lib/bot/store";
import { getConfig } from "@/lib/config";
import { connect } from "@/lib/db/sql";
import { deleteGame } from "@/lib/manage";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** Erases a game for good. Admins only. */
export async function POST(request: NextRequest) {
  const { appOrigin, databaseUrl } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const me = await currentUser();
  if (me?.role !== "admin") return NextResponse.json({ error: "Not found." }, { status: 404 });

  const slug = String((await request.formData()).get("slug") ?? "");
  const stores = openStores();
  const game = await stores.repo.get(slug);
  const page = new URL("/admin", appOrigin);
  if (!game) {
    page.searchParams.set("note", "That game is already gone.");
    return NextResponse.redirect(page, 303);
  }
  try {
    await deleteGame(stores, me, game);
    // Its link can now be tagged and added again.
    if (databaseUrl) await new BotStore(await connect(databaseUrl)).releaseGame(slug);
    console.log(`admin: @${me.handle} deleted ${slug}`);
    page.searchParams.set("note", `Deleted ${game.title}.`);
  } catch (error) {
    console.error("admin: delete failed:", error instanceof Error ? error.message : error);
    page.searchParams.set("note", `Could not delete ${game.title}. Try again.`);
  }
  return NextResponse.redirect(page, 303);
}
