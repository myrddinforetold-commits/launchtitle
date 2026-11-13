import { NextResponse } from "next/server";

import { cookieOptions, PENDING_COOKIE, xApp } from "@/lib/auth/current";
import { authorizeUrl, randomToken } from "@/lib/auth/x";

export const dynamic = "force-dynamic";

/** Send the person to X to approve the sign-in. */
export async function GET() {
  const app = xApp();
  if (!app) return NextResponse.json({ error: "Sign-in is not set up." }, { status: 503 });

  const state = randomToken();
  const verifier = randomToken(48);
  const response = NextResponse.redirect(authorizeUrl(app, state, verifier), 302);
  // Readable only by this site's server, and only for ten minutes.
  response.cookies.set(PENDING_COOKIE, `${state}.${verifier}`, cookieOptions(600));
  return response;
}
