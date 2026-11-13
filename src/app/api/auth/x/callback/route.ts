import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { accounts, cookieOptions, currentUser, PENDING_COOKIE, SESSION_COOKIE, xApp } from "@/lib/auth/current";
import { BotStore } from "@/lib/bot/store";
import { connect } from "@/lib/db/sql";
import { SESSION_DAYS } from "@/lib/auth/sessions";
import { accountFromCode, accountFromToken, tokensFromCode } from "@/lib/auth/x";
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
  const [expectedState, verifier, mode] = (request.cookies.get(PENDING_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !expectedState || !verifier || !same(state, expectedState)) return fail("expired");

  if (mode === "bot") {
    // Connecting the account the bot posts as. Only an admin may, and only for the bot's own handle.
    const admin = new URL("/admin", getConfig().appOrigin);
    const done = (note: string) => {
      admin.searchParams.set("note", note);
      const response = NextResponse.redirect(admin, 303);
      response.cookies.delete(PENDING_COOKIE);
      return response;
    };
    if ((await currentUser())?.role !== "admin") return fail("unavailable");
    try {
      const tokens = await tokensFromCode(app, code, verifier);
      const account = await accountFromToken(tokens.access);
      const { botHandle, databaseUrl } = getConfig();
      if (account.handle.toLowerCase() !== botHandle.toLowerCase()) {
        return done(`That was @${account.handle}. Switch to @${botHandle} on X and connect again.`);
      }
      if (!tokens.refresh) return done("X did not grant lasting access. Check the app is set to Read and write, then connect again.");
      await new BotStore(await connect(databaseUrl!)).connect(
        { xAccountId: account.id, handle: account.handle },
        { access: tokens.access, refresh: tokens.refresh, expiresAt: tokens.expiresAt },
      );
      return done(`Connected. The bot now posts as @${account.handle}.`);
    } catch (error) {
      console.error("auth: connecting the bot failed:", error instanceof Error ? error.message : error);
      return done("X could not connect the bot account. Try again.");
    }
  }

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
