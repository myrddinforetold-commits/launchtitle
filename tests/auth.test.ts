import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { Accounts } from "@/lib/auth/sessions";
import { accountFromCode, authorizeUrl, pkceChallenge, randomToken, XAuthError } from "@/lib/auth/x";
import { migrate } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";

const app = { clientId: "client", clientSecret: "secret", redirectUri: "https://launchtitle.gg/api/auth/x/callback" };

function pgliteSql(db: PGlite): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await db.query(text, params)).rows as T[];
    },
    async exec(text) {
      await db.exec(text);
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sign in with X", () => {
  it("makes a PKCE challenge that matches the RFC 7636 example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("asks X only to read who the person is", () => {
    const url = new URL(authorizeUrl(app, "state-1", "verifier-1"));
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    const q = url.searchParams;
    expect(q.get("scope")).toBe("users.read tweet.read");
    expect(q.get("redirect_uri")).toBe(app.redirectUri);
    expect(q.get("state")).toBe("state-1");
    expect(q.get("code_challenge")).toBe(pkceChallenge("verifier-1"));
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain("secret");
  });

  it("never repeats a random token", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(seen.size).toBe(200);
    expect([...seen][0].length).toBeGreaterThanOrEqual(43);
  });

  it("trades a code for the account, sending the verifier and the app's credentials", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("/oauth2/token")
        ? json({ access_token: "tok" })
        : json({ data: { id: "1234567890", username: "lanternbay", name: "Lantern Bay" } });
    };
    expect(await accountFromCode(app, "the-code", "the-verifier", fake)).toEqual({
      id: "1234567890",
      handle: "lanternbay",
      name: "Lantern Bay",
    });
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("redirect_uri")).toBe(app.redirectUri);
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("client:secret").toString("base64")}`,
    );
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("refuses a rejected code or an unreadable account", async () => {
    await expect(accountFromCode(app, "c", "v", async () => json({}, 400))).rejects.toBeInstanceOf(XAuthError);
    const odd = async (url: string) =>
      url.endsWith("/oauth2/token") ? json({ access_token: "tok" }) : json({ data: { id: "not-a-number", username: "x" } });
    await expect(accountFromCode(app, "c", "v", odd)).rejects.toBeInstanceOf(XAuthError);
  });
});

describe("accounts and sessions", () => {
  let sql: Sql;
  let accounts: Accounts;
  const lantern = { id: "1234567890", handle: "lanternbay", name: "Lantern Bay" };

  beforeEach(async () => {
    sql = pgliteSql(new PGlite());
    await migrate(sql);
    accounts = new Accounts(sql);
  });

  it("creates a person once and follows a changed handle", async () => {
    const first = await accounts.signedIn(lantern);
    const again = await accounts.signedIn({ ...lantern, handle: "lantern_bay" });
    expect(again.id).toBe(first.id);
    expect(again.handle).toBe("lantern_bay");
    expect(first.role).toBe("player");
    expect(await sql.query("SELECT 1 FROM users")).toHaveLength(1);
  });

  it("signs in with the cookie value and with nothing else", async () => {
    const user = await accounts.signedIn(lantern);
    const token = await accounts.startSession(user.id);
    expect(await accounts.userForSession(token)).toEqual(user);
    expect(await accounts.userForSession(`${token}x`)).toBeNull();
    expect(await accounts.userForSession(undefined)).toBeNull();
    expect(await accounts.userForSession("")).toBeNull();
  });

  it("stores only a hash of the cookie value", async () => {
    const user = await accounts.signedIn(lantern);
    const token = await accounts.startSession(user.id);
    const rows = await sql.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    // The stored hash is not itself a way in.
    expect(await accounts.userForSession(rows[0].token_hash)).toBeNull();
  });

  it("expires sessions after 30 days", async () => {
    const user = await accounts.signedIn(lantern);
    const start = new Date("2026-11-13T00:00:00Z");
    const token = await accounts.startSession(user.id, start);
    expect(await accounts.userForSession(token, new Date("2026-12-12T23:00:00Z"))).not.toBeNull();
    expect(await accounts.userForSession(token, new Date("2026-12-13T01:00:00Z"))).toBeNull();
  });

  it("signs out one session without touching another", async () => {
    const user = await accounts.signedIn(lantern);
    const phone = await accounts.startSession(user.id);
    const laptop = await accounts.startSession(user.id);
    await accounts.endSession(phone);
    expect(await accounts.userForSession(phone)).toBeNull();
    expect(await accounts.userForSession(laptop)).not.toBeNull();
  });
});
