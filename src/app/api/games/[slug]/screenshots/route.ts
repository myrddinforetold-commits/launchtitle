import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import { addScreenshot, ManageError, removeScreenshot } from "@/lib/manage";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** Adds one screenshot to a game's page, or removes one. One image per request keeps each upload small. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { appOrigin } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { slug } = await params;
  const page = new URL(`/games/${slug}`, appOrigin);
  const back = (note: string) => {
    page.searchParams.set("note", note);
    page.hash = "manage";
    return NextResponse.redirect(page, 303);
  };

  const user = await currentUser();
  const stores = openStores();
  const game = await stores.repo.get(slug);
  if (!user || !game) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  try {
    const remove = String(form.get("remove") ?? "");
    if (remove) {
      await removeScreenshot(stores, user, game, remove);
      return back("Screenshot removed.");
    }
    const image = form.get("image");
    await addScreenshot(stores, user, game, image instanceof File ? new Uint8Array(await image.arrayBuffer()) : new Uint8Array());
    return back("Screenshot added.");
  } catch (error) {
    if (error instanceof ManageError) return back(error.message);
    console.error("manage: screenshot failed:", error instanceof Error ? error.message : error);
    return back("That could not be saved. Try again.");
  }
}
