import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import { ManageError, setDetails } from "@/lib/manage";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { appOrigin } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { slug } = await params;
  const page = new URL(`/games/${slug}`, appOrigin);
  const back = (note?: string) => {
    if (note) page.searchParams.set("note", note);
    return NextResponse.redirect(page, 303);
  };

  const user = await currentUser();
  const stores = openStores();
  const game = await stores.repo.get(slug);
  if (!user || !game) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  const cover = form.get("cover");
  try {
    await setDetails(stores, user, game, {
      description: String(form.get("description") ?? ""),
      cover: cover instanceof File && cover.size > 0 ? new Uint8Array(await cover.arrayBuffer()) : undefined,
    });
    return back("Saved.");
  } catch (error) {
    if (error instanceof ManageError) return back(error.message);
    console.error("manage: details failed:", error instanceof Error ? error.message : error);
    return back("That could not be saved. Try again.");
  }
}
