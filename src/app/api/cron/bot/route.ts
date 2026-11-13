import { NextResponse } from "next/server";

import { xApp } from "@/lib/auth/current";
import { runLiveBot } from "@/lib/bot/live";
import { getConfig } from "@/lib/config";
import { connect } from "@/lib/db/sql";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One pass of the bot. Vercel calls this every five minutes. It needs no
 * secret: a pass changes nothing that the schedule would not, and the bot
 * itself refuses to run more than once a minute, so calling it by hand does no harm.
 */
export async function GET() {
  const app = xApp();
  const { databaseUrl } = getConfig();
  if (!app || !databaseUrl) return NextResponse.json({ ran: false, reason: "not set up" });
  try {
    const report = await runLiveBot(await connect(databaseUrl), app);
    if (report.ran) console.log("bot:", JSON.stringify(report));
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("bot: pass failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ran: true, error: "The pass failed. See the server log." }, { status: 500 });
  }
}
