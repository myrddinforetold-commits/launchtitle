import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { ImportError, importUrl, importZip } from "@/lib/import";
import { openStores } from "@/lib/stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, message: string) {
  const url = new URL("/submit", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

/**
 * Import a game from the submit form. There is no sign-in yet, so this stays
 * closed unless LT_OPEN_IMPORT=1 is set. Milestone 4 replaces the switch with
 * a creator's verified X account.
 */
export async function POST(request: Request) {
  if (!getConfig().openImport) {
    return NextResponse.json({ error: "Submitting is switched off." }, { status: 403 });
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "");
  const zip = form.get("zip");
  const url = String(form.get("url") ?? "").trim();
  const stores = openStores();

  try {
    let game;
    if (zip instanceof File && zip.size > 0) {
      game = await importZip(stores, title, new Uint8Array(await zip.arrayBuffer()));
    } else if (url) {
      game = await importUrl(stores, title, url);
    } else {
      return back(request, "Add a zip file or an address.");
    }
    return NextResponse.redirect(new URL(`/games/${game.slug}`, request.url), 303);
  } catch (error) {
    if (error instanceof ImportError) return back(request, error.message);
    console.error(error);
    return back(request, "The import failed. Try again.");
  }
}
