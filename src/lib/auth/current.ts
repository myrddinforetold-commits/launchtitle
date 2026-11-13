import { cookies } from "next/headers";

import { getConfig } from "../config";
import { connect } from "../db/sql";
import { Plays } from "../plays";
import { Accounts, type User } from "./sessions";
import type { XApp } from "./x";

export const SESSION_COOKIE = "lt_session";
/** Holds the `state` and PKCE verifier for the few minutes a sign-in takes. */
export const PENDING_COOKIE = "lt_signin";

/** Sign-in needs the database and an X app. Without both it is simply switched off. */
export function xApp(): XApp | null {
  const { xClientId, xClientSecret, appOrigin, databaseUrl } = getConfig();
  if (!xClientId || !xClientSecret || !databaseUrl) return null;
  return { clientId: xClientId, clientSecret: xClientSecret, redirectUri: `${appOrigin}/api/auth/x/callback` };
}

export async function accounts(): Promise<Accounts | null> {
  const { databaseUrl } = getConfig();
  return databaseUrl ? new Accounts(await connect(databaseUrl)) : null;
}

/** Play counts and saved games need the database. Without it they are simply absent. */
export async function plays(): Promise<Plays | null> {
  const { databaseUrl } = getConfig();
  return databaseUrl ? new Plays(await connect(databaseUrl)) : null;
}

/** The signed-in person, or null. A failure to reach the database reads as signed out rather than breaking the page. */
export async function currentUser(): Promise<User | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return (await (await accounts())?.userForSession(token)) ?? null;
  } catch (error) {
    console.error("auth: could not read the session:", error instanceof Error ? error.message : error);
    return null;
  }
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: getConfig().appOrigin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
