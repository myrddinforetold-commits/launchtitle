import { NextResponse, type NextRequest } from "next/server";

import { cookieOptions, currentUser, PENDING_COOKIE, xApp } from "@/lib/auth/current";
import { authorizeUrl, BOT_SCOPES, randomToken } from "@/lib/auth/x";

export const dynamic = "force-dynamic";

/**
 * Send the person to X to approve the sign-in. With `?bot=1`, an admin is
 * instead connecting the account the bot posts as, which asks X for more.
 */
export async function GET(request: NextRequest) {
  const app = xApp();
  if (!app) return NextResponse.json({ error: "Sign-in is not set up." }, { status: 503 });

  const bot = request.nextUrl.searchParams.get("bot") === "1";
  if (bot && (await currentUser())?.role !== "admin") return NextResponse.json({ error: "Not found." }, { status: 404 });

  const state = randomToken();
  const verifier = randomToken(48);
  const response = NextResponse.redirect(authorizeUrl(app, state, verifier, bot ? BOT_SCOPES : undefined), 302);
  // Readable only by this site's server, and only for ten minutes.
  response.cookies.set(PENDING_COOKIE, `${state}.${verifier}.${bot ? "bot" : "user"}`, cookieOptions(600));
  return response;
}
