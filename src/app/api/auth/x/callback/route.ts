import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { accounts, cookieOptions, PENDING_COOKIE, SESSION_COOKIE, xApp } from "@/lib/auth/current";
import { SESSION_DAYS } from "@/lib/auth/sessions";
import { accountFromCode } from "@/lib/auth/x";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** X sends the person back here. Check the request is the one we started, then sign them in. */
export async function GET(request: NextRequest) {
  const home = new URL("/", getConfig().appOrigin);
  const fail = (reason: string) => {
    const url = new URL(home);
    url.searchParams.set("signin", reason);
    const response = NextResponse.redirect(url, 303);
    response.cookies.delete(PENDING_COOKIE);
    return response;
  };

  const app = xApp();
  const store = await accounts();
  if (!app || !store) return fail("unavailable");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("cancelled");
  const code = params.get("code");
  const state = params.get("state");
  const [expectedState, verifier] = (request.cookies.get(PENDING_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !expectedState || !verifier || !same(state, expectedState)) return fail("expired");

  try {
    const account = await accountFromCode(app, code, verifier);
    const user = await store.signedIn(account, getConfig().adminHandles);
    const token = await store.startSession(user.id);
    const response = NextResponse.redirect(home, 303);
    response.cookies.delete(PENDING_COOKIE);
    response.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
    return response;
  } catch (error) {
    console.error("auth: sign-in failed:", error instanceof Error ? error.message : error);
    return fail("failed");
  }
}
