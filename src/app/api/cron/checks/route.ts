import { NextResponse } from "next/server";

import { liveCheckDeps } from "@/lib/check/live";
import { runChecks } from "@/lib/check/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs the start-up check on games that are waiting for it. Vercel calls this
 * every five minutes, and the app calls it when a game is added. It needs no
 * secret: with nothing waiting it does nothing, and a game is only checked once.
 */
export async function GET() {
  try {
    const report = await runChecks(liveCheckDeps());
    if (report.checked > 0) console.log("checks:", JSON.stringify(report));
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("checks: pass failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The pass failed. See the server log." }, { status: 500 });
  }
}
