import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { accounts, currentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const ROLES = ["player", "creator", "curator"] as const;

export default async function Admin() {
  const me = await currentUser();
  // Anyone who is not an admin sees the same page as for an address that does not exist.
  if (me?.role !== "admin") notFound();
  const users = (await (await accounts())?.list()) ?? [];

  return (
    <>
      <h1>People</h1>
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
