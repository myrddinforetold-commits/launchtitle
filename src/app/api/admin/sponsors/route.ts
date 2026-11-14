import { NextResponse, type NextRequest } from "next/server";

import { currentUser, sponsors } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/images";
import { SponsorError } from "@/lib/sponsors";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** Admins add, switch on and off, and remove sponsor spots. */
export async function POST(request: NextRequest) {
  const { appOrigin } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const me = await currentUser();
  const store = await sponsors();
  if (me?.role !== "admin" || !store) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  const page = new URL("/admin", appOrigin);
  page.hash = "sponsors";
  const done = (note: string) => {
    page.searchParams.set("note", note);
    return NextResponse.redirect(page, 303);
  };
  const id = String(form.get("id") ?? "");
  try {
    switch (String(form.get("action") ?? "")) {
      case "on":
      case "off":
        await store.setActive(id, form.get("action") === "on");
        return done(form.get("action") === "on" ? "Sponsor spot switched on." : "Sponsor spot switched off.");
      case "remove":
        await store.remove(id);
        return done("Sponsor spot removed.");
      default: {
        const image = form.get("image");
        let imageHash: string | null = null;
        if (image instanceof File && image.size > 0) {
          const bytes = new Uint8Array(await image.arrayBuffer());
          if (bytes.byteLength > MAX_IMAGE_BYTES) throw new SponsorError("The image is over 4 MB.");
          if (!sniffImage(bytes)) throw new SponsorError("The image must be a PNG, JPEG or WebP.");
          imageHash = await openStores().store.put(bytes);
        }
        const added = await store.add({
          placement: String(form.get("placement") ?? ""),
          name: String(form.get("name") ?? ""),
          headline: String(form.get("headline") ?? ""),
          body: String(form.get("body") ?? ""),
          url: String(form.get("url") ?? ""),
          imageHash,
        });
        console.log(`admin: @${me.handle} added sponsor spot ${added.id} (${added.placement})`);
        return done("Sponsor spot added. It is showing now.");
      }
    }
  } catch (error) {
    if (error instanceof SponsorError) return done(error.message);
    console.error("admin: sponsor change failed:", error instanceof Error ? error.message : error);
    return done("That could not be saved. Try again.");
  }
}
