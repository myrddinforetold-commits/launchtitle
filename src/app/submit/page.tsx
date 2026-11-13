import type { Metadata } from "next";

import { Uploader } from "@/components/Uploader";
import { currentUser, xApp } from "@/lib/auth/current";
import { canSubmit } from "@/lib/auth/sessions";
import { getConfig, LIMITS } from "@/lib/config";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a game" };

export default async function Submit({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { openImport } = getConfig();
  const user = await currentUser();
  const hosted = openStores().uploads !== null;

  if (hosted) {
    return (
      <>
        <h1>Add a game</h1>
        <p className="lede">Upload a zip of your game. It gets its own address and is playable straight away.</p>
        {!user ? (
          <p className="notice">
            {xApp() ? (
              <>
                <a href="/api/auth/x/start">Sign in with X</a> to add a game.
              </>
            ) : (
              "Sign-in is not available right now."
            )}
          </p>
        ) : !canSubmit(user) ? (
          <p className="notice">
            Adding games is by invitation while we choose the first Launch Titles. Send your game to{" "}
            <a href="https://x.com/launchtitlegg" rel="noopener">
              @launchtitlegg
            </a>{" "}
            and we will take a look.
          </p>
        ) : (
          <Uploader maxBytes={LIMITS.maxBytes} />
        )}
      </>
    );
  }

  return (
    <>
      <h1>Add a game</h1>
      <p className="lede">Upload a zip of a static web game, or give its public address.</p>
      {!openImport && <p className="notice">Submitting is switched off. For local development, start the app with LT_OPEN_IMPORT=1.</p>}
      {error && <p className="notice error">{error}</p>}
      <form className="submit" action="/api/import" method="post" encType="multipart/form-data">
        <label>
          Name
          <input name="title" required maxLength={80} autoComplete="off" />
        </label>
        <label>
          Zip file
          <small>index.html at the top level. Up to 200 MB and 2,000 files.</small>
          <input name="zip" type="file" accept=".zip,application/zip" />
        </label>
        <label>
          Or the game&apos;s address
          <small>Only games made of static files can be copied this way.</small>
          <input name="url" type="url" placeholder="https://" inputMode="url" />
        </label>
        <button type="submit" disabled={!openImport}>
          IMPORT
        </button>
      </form>
    </>
  );
}
