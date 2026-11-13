import { createHash } from "node:crypto";

import type { Sql } from "../db/sql";
import { randomToken, type XAccount } from "./x";

export type User = { id: string; xAccountId: string; handle: string; name: string; role: "player" | "creator" | "curator" | "admin" };

export const SESSION_DAYS = 30;

/** During the pilot, adding games is by invitation: creators and admins only. */
export function canSubmit(user: User | null): boolean {
  return user?.role === "creator" || user?.role === "admin";
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

type UserRow = { id: string | number; x_account_id: string; handle: string; name: string; role: User["role"] };
const toUser = (row: UserRow): User => ({
  id: String(row.id),
  xAccountId: row.x_account_id,
  handle: row.handle,
  name: row.name,
  role: row.role,
});

/** Who has signed in, and the sessions that keep them signed in. */
export class Accounts {
  constructor(private readonly sql: Sql) {}

  /** Create the user on first sign-in; afterwards keep their handle and name current. Matched on X's permanent id. */
  async signedIn(account: XAccount, adminHandles: readonly string[] = []): Promise<User> {
    const admin = adminHandles.includes(account.handle.toLowerCase());
    const rows = await this.sql.query<UserRow>(
      `INSERT INTO users (x_account_id, handle, name, role)
       VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN 'admin' ELSE 'player' END)
       ON CONFLICT (x_account_id) DO UPDATE
         SET handle = EXCLUDED.handle, name = EXCLUDED.name, last_seen_at = now(),
             role = CASE WHEN $4::boolean THEN 'admin' ELSE users.role END
       RETURNING id, x_account_id, handle, name, role`,
      [account.id, account.handle, account.name, admin],
    );
    return toUser(rows[0]);
  }

  async byId(id: string): Promise<User | null> {
    if (!/^\d{1,18}$/.test(id)) return null;
    const rows = await this.sql.query<UserRow>("SELECT id, x_account_id, handle, name, role FROM users WHERE id = $1", [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async list(limit = 200): Promise<User[]> {
    const rows = await this.sql.query<UserRow>(
      "SELECT id, x_account_id, handle, name, role FROM users ORDER BY created_at DESC, id DESC LIMIT $1",
      [limit],
    );
    return rows.map(toUser);
  }

  /** Admins are made by the LT_ADMIN_HANDLES setting only, so this can neither grant nor remove admin. */
  async setRole(id: string, role: "player" | "creator" | "curator"): Promise<boolean> {
    if (!/^\d{1,18}$/.test(id)) return false;
    const rows = await this.sql.query(
      "UPDATE users SET role = $2 WHERE id = $1 AND role <> 'admin' RETURNING id",
      [id, role],
    );
    return rows.length === 1;
  }

  /** Returns the value to put in the cookie. Only its hash is stored. */
  async startSession(userId: string, now = new Date()): Promise<string> {
    const token = randomToken();
    const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.sql.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
      hash(token),
      userId,
      expires.toISOString(),
    ]);
    return token;
  }

  async userForSession(token: string | undefined, now = new Date()): Promise<User | null> {
    if (!token || token.length > 200) return null;
    const rows = await this.sql.query<UserRow>(
      `SELECT u.id, u.x_account_id, u.handle, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [hash(token), now.toISOString()],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async endSession(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.sql.query("DELETE FROM sessions WHERE token_hash = $1", [hash(token)]);
  }
}
