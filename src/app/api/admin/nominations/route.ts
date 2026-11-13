import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { BotStore } from "@/lib/bot/store";
import { getConfig } from "@/lib/config";
import { connect } from "@/lib/db/sql";

export const dynamic = "force-dynamic";

/** Approve or turn down a game someone asked for on X. The bot brings approved games in on its next pass. */
export async function POST(request: NextRequest) {
  const { appOrigin, databaseUrl } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const me = await currentUser();
  if (me?.role !== "admin" || !databaseUrl) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const store = new BotStore(await connect(databaseUrl));
  const page = new URL("/admin", appOrigin);

  const nomination = await store.byId(id);
  if (!nomination) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // A failed import can be approved again; everything else is decided once.
  const from = nomination.state === "FAILED" ? "FAILED" : "AWAITING_REVIEW";
  let ok = false;
  const modes: Record<string, "auto" | "copy" | "link"> = { approve: "auto", "approve-copy": "copy", "approve-link": "link" };
  if (modes[action] && title) ok = await store.move(id, from, "APPROVED", { title, mode: modes[action] });
  else if (action === "reject") ok = await store.move(id, from, "REJECTED");
  console.log(`admin: @${me.handle} ${action} nomination ${id}: ${ok ? "done" : "no change"}`);
  page.searchParams.set(
    "note",
    ok ? (action === "reject" ? "Turned down." : "Approved. It will go live within a few minutes.") : "That request had already been decided, or needs a name.",
  );
  return NextResponse.redirect(page, 303);
}
