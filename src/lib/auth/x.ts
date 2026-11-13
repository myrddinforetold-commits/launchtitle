import { createHash, randomBytes } from "node:crypto";

/** Sign in with X: OAuth 2.0 authorization code with PKCE. We only ever ask to read who the person is. */

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";
/** `users.read` needs `tweet.read` alongside it. Nothing here can post or read private data. */
const SCOPES = "users.read tweet.read";
/** What the bot's own account grants: read mentions, post replies, and stay connected. */
export const BOT_SCOPES = "users.read tweet.read tweet.write offline.access";

export type XApp = { clientId: string; clientSecret: string; redirectUri: string };
export type XAccount = { id: string; handle: string; name: string };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** A fresh, unguessable value for the `state` check or the PKCE verifier. */
export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

export function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function authorizeUrl(app: XApp, state: string, verifier: string, scopes = SCOPES): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    scope: scopes,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export class XAuthError extends Error {}

export type XTokens = { access: string; refresh: string | null; expiresAt: Date };

async function tokenRequest(app: XApp, form: Record<string, string>, fetchImpl: Fetch): Promise<XTokens> {
  const basic = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64");
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new XAuthError(`X refused the sign-in code (${response.status})`);
  const token = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof token.access_token !== "string") throw new XAuthError("X sent no access token");
  const seconds = typeof token.expires_in === "number" ? token.expires_in : 7200;
  return {
    access: token.access_token,
    refresh: typeof token.refresh_token === "string" ? token.refresh_token : null,
    expiresAt: new Date(Date.now() + seconds * 1000),
  };
}

export function tokensFromCode(app: XApp, code: string, verifier: string, fetchImpl: Fetch = fetch): Promise<XTokens> {
  return tokenRequest(app, { grant_type: "authorization_code", code, redirect_uri: app.redirectUri, code_verifier: verifier }, fetchImpl);
}

/** X issues a new refresh token every time, and the old one stops working. */
export function refreshTokens(app: XApp, refreshToken: string, fetchImpl: Fetch = fetch): Promise<XTokens> {
  return tokenRequest(app, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

export async function accountFromToken(accessToken: string, fetchImpl: Fetch = fetch): Promise<XAccount> {
  const meResponse = await fetchImpl(ME_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!meResponse.ok) throw new XAuthError(`X would not say who signed in (${meResponse.status})`);
  const me = (await meResponse.json()) as { data?: { id?: unknown; username?: unknown; name?: unknown } };
  const { id, username, name } = me.data ?? {};
  if (typeof id !== "string" || !/^\d{1,25}$/.test(id) || typeof username !== "string" || !/^\w{1,15}$/.test(username)) {
    throw new XAuthError("X sent an account we could not read");
  }
  return { id, handle: username, name: typeof name === "string" ? name.slice(0, 80) : "" };
}

/** Trade the code X sent back for the account it belongs to. The access token is used once and dropped. */
export async function accountFromCode(app: XApp, code: string, verifier: string, fetchImpl: Fetch = fetch): Promise<XAccount> {
  return accountFromToken((await tokensFromCode(app, code, verifier, fetchImpl)).access, fetchImpl);
}
