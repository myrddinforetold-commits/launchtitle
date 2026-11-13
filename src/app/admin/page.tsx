import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "next/link";

import { accounts, currentUser } from "@/lib/auth/current";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const ROLES = ["player", "creator", "curator"] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const me = await currentUser();
  // Anyone who is not an admin sees the same page as for an address that does not exist.
  if (me?.role !== "admin") notFound();
  const users = (await (await accounts())?.list()) ?? [];
  const games = await openStores().repo.list();
  const handle = new Map(users.map((user) => [user.id, user.handle]));
  const { note } = await searchParams;

  return (
    <>
      <h1>Games</h1>
      <p className="lede">Every game, including paused and removed ones. A paused or removed game stops being served at once.</p>
      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
      <table className="people">
        <thead>
          <tr>
            <th scope="col">Game</th>
            <th scope="col">State</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <tr key={game.slug}>
              <td>
                <b>
                  <Link href={`/games/${game.slug}`}>{game.title}</Link>
                </b>
                <span>{game.creatorId && handle.get(game.creatorId) ? `@${handle.get(game.creatorId)}` : "No creator recorded"}</span>
              </td>
              <td>{game.state.toLowerCase()}</td>
              <td>
                <form action={`/api/games/${game.slug}/state`} method="post">
                  <input type="hidden" name="from" value="admin" />
                  <select name="state" defaultValue={game.state} aria-label={`State for ${game.title}`}>
                    <option value="HOSTED">up</option>
                    <option value="PAUSED">paused</option>
                    <option value="REMOVED">removed</option>
                  </select>
                  <button type="submit">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>People</h2>
      <p className="lede">
        Everyone who has signed in. Make someone a creator to let them add games. Admins are set in the site&apos;s
        settings, not here.
      </p>
      <table className="people">
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <b>@{user.handle}</b>
                <span>{user.name}</span>
              </td>
              <td>
                {user.role === "admin" ? (
                  "admin"
                ) : (
                  <form action="/api/admin/role" method="post">
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="role" defaultValue={user.role} aria-label={`Role for @${user.handle}`}>
                      {ROLES.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                    <button type="submit">Save</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
