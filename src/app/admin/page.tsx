import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "next/link";

import { accounts, currentUser } from "@/lib/auth/current";
import { BotStore } from "@/lib/bot/store";
import { titleGuess } from "@/lib/bot/parse";
import { getConfig } from "@/lib/config";
import { connect } from "@/lib/db/sql";
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
  const { databaseUrl, botHandle } = getConfig();
  const botStore = databaseUrl ? new BotStore(await connect(databaseUrl)) : null;
  const bot = (await botStore?.account()) ?? null;
  const nominations = (await botStore?.recent(60)) ?? [];
  const sentToday = bot && botStore ? await botStore.repliesSentSince(new Date(Date.now() - 24 * 60 * 60 * 1000)) : 0;
  const lastCheck = bot && bot.pollStartedAt.getTime() > 0 ? bot.pollStartedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never";
  const guess = (url: string) => {
    try {
      return titleGuess(url);
    } catch {
      return "";
    }
  };

  return (
    <>
      <header className="page-head">
        <p className="crumb">Creators</p>
        <h1>Requests from X</h1>
      </header>
      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
      <p className="lede">
        <b>Approve</b> checks the game&apos;s code and picks for you: it copies a game that runs entirely in the
        browser, and links one that needs its own server so it plays from the creator&apos;s site. The status shows
        which it chose and why. <b>Copy</b> and <b>Link</b> force one or the other.
      </p>
      <p className="lede">
        {bot ? (
          <>
            The bot posts as <b>@{bot.handle}</b>. Last check: {lastCheck}. Replies in the last 24 hours: {sentToday}.{" "}
            <a href="/api/auth/x/start?bot=1">Reconnect</a>
          </>
        ) : (
          <>
            The bot is not connected. Sign in to X as <b>@{botHandle}</b> in this browser, then{" "}
            <a href="/api/auth/x/start?bot=1">connect the bot account</a>.
          </>
        )}
      </p>
      {nominations.length === 0 ? (
        <p className="empty">No requests yet. They appear here when someone tags @{botHandle} with add.</p>
      ) : (
        <table className="people">
          <thead>
            <tr>
              <th scope="col">Game</th>
              <th scope="col">Status</th>
              <th scope="col">Decide</th>
            </tr>
          </thead>
          <tbody>
            {nominations.map((n) => (
              <tr key={n.id}>
                <td>
                  <b>{n.sourceUrl ? <a href={n.sourceUrl} rel="noopener noreferrer nofollow" target="_blank">{n.sourceUrl.replace(/^https:\/\//, "").slice(0, 60)}</a> : "No link given"}</b>
                  <span>
                    Creator @{n.creatorHandle}
                    {n.nominatorHandle !== n.creatorHandle && <>, asked by @{n.nominatorHandle}</>}.{" "}
                    <a href={`https://x.com/i/status/${n.postId}`} rel="noopener noreferrer" target="_blank">
                      The post
                    </a>
                  </span>
                </td>
                <td>
                  {n.state.toLowerCase().replace(/_/g, " ")}
                  {n.gameSlug && (
                    <span>
                      <Link href={`/games/${n.gameSlug}`}>{n.gameSlug}</Link>
                    </span>
                  )}
                  {n.error && <span>{n.error}</span>}
                </td>
                <td>
                  {(n.state === "AWAITING_REVIEW" || n.state === "FAILED") && (
                    <form action="/api/admin/nominations" method="post">
                      <input type="hidden" name="id" value={n.id} />
                      <input name="title" defaultValue={n.title ?? guess(n.sourceUrl)} maxLength={80} aria-label="Name for the game" required />
                      <button type="submit" name="action" value="approve" title="Bring it in whichever way suits the game">
                        Approve
                      </button>
                      <button type="submit" name="action" value="approve-copy" title="Copy the game's files and host them here">
                        Copy
                      </button>
                      <button type="submit" name="action" value="approve-link" title="List it here, play it from the creator's own site">
                        Link
                      </button>
                      <button type="submit" name="action" value="reject" formNoValidate>
                        Turn down
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Games</h2>
      <p className="lede">Every game, including paused and removed ones. A paused or removed game stops being served at once.</p>
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
