import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { canSubmit } from "@/lib/auth/sessions";
import { getConfig, LIMITS } from "@/lib/config";
import { ImportError, importHtml, importUrl, importZip } from "@/lib/import";
import { openStores } from "@/lib/stores";
import { isUploadId } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Unpacking and storing a large game takes a while. */
export const maxDuration = 300;

function back(request: Request, message: string) {
  const url = new URL("/submit", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

/**
 * Import a game. Two ways in:
 * - A signed-in creator's browser uploads a zip straight to file storage, then
 *   sends its reference here as JSON. This is the only way on the live site.
 * - The plain form, for local development, behind LT_OPEN_IMPORT=1.
 */
export async function POST(request: NextRequest) {
  const { appOrigin, openImport } = getConfig();
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  if (request.headers.get("content-type")?.startsWith("application/json")) return importUpload(request);

  if (!openImport) return NextResponse.json({ error: "Submitting is switched off." }, { status: 403 });
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

async function importUpload(request: NextRequest) {
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

  const user = await currentUser();
  if (!user) return fail(401, "Sign in to add a game.");
  if (!canSubmit(user)) return fail(403, "Adding games is by invitation for now.");

  let body: { uploadId?: unknown; title?: unknown; kind?: unknown; url?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "That request could not be read.");
  }
  const title = typeof body.title === "string" ? body.title : "";
  const owner = { id: user.id, admin: user.role === "admin" };
  const stores = openStores();

  // A link: copy the game's files from where it is already hosted.
  if (typeof body.url === "string" && body.url.trim()) {
    try {
      const game = await importUrl(stores, title, body.url.trim(), undefined, owner);
      return NextResponse.json({ slug: game.slug });
    } catch (error) {
      if (error instanceof ImportError) return fail(400, error.message);
      console.error("import: link failed:", error instanceof Error ? error.message : error);
      return fail(500, "The import failed. Try again.");
    }
  }

  if (!isUploadId(body.uploadId)) return fail(400, "That upload could not be found. Try again.");
  if (!stores.uploads) return fail(503, "Uploads are not set up.");

  try {
    const zip = await stores.uploads.read(user.id, body.uploadId, LIMITS.maxBytes);
    if (zip === null) return fail(400, "That upload could not be found. Try again.");
    if (zip === "too_large") return fail(400, "That zip is over the 200 MB limit.");
    const game = body.kind === "html" ? await importHtml(stores, title, zip, owner) : await importZip(stores, title, zip, owner);
    return NextResponse.json({ slug: game.slug });
  } catch (error) {
    if (error instanceof ImportError) return fail(400, error.message);
    console.error("import: failed:", error instanceof Error ? error.message : error);
    return fail(500, "The import failed. Try again.");
  } finally {
    // The zip has done its job either way. If this fails, the bucket's own clean-up rule removes it.
    await stores.uploads.remove(user.id, body.uploadId).catch(() => {});
  }
}
