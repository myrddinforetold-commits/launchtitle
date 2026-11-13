import { NextResponse, type NextRequest } from "next/server";

import { currentUser, xApp } from "@/lib/auth/current";
import { runLiveBot } from "@/lib/bot/live";
import { getConfig } from "@/lib/config";
import { connect } from "@/lib/db/sql";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Runs one pass of the bot straight away, so an admin does not have to wait for the schedule. */
export async function POST(request: NextRequest) {
  const { appOrigin, databaseUrl } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const me = await currentUser();
  const app = xApp();
  if (me?.role !== "admin" || !databaseUrl || !app) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const page = new URL("/admin", appOrigin);
  try {
    const report = await runLiveBot(await connect(databaseUrl), app);
    console.log(`admin: @${me.handle} ran the bot:`, JSON.stringify(report));
    page.searchParams.set(
      "note",
      report.ran
        ? `Checked X: ${count(report.mentions, "new request", "new requests")}, ${count(report.imported, "game", "games")} brought in, ${count(report.failed, "failure", "failures")}, ${count(report.replies, "reply", "replies")} posted.`
        : report.reason === "checked less than a minute ago"
          ? "X was checked less than a minute ago. Try again shortly."
          : `The bot did not run: ${report.reason}.`,
    );
  } catch (error) {
    console.error("bot: pass failed:", error instanceof Error ? error.message : error);
    page.searchParams.set("note", "The check failed. Try again in a minute.");
  }
  return NextResponse.redirect(page, 303);
}
