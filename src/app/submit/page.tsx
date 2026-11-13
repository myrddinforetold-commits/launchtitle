import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Submit({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { openImport } = getConfig();

  return (
    <>
      <h1>Submit a game</h1>
      <p className="lede">Upload a zip of a static web game, or give its public address.</p>
      {!openImport && (
        <p className="notice">
          Submitting is switched off. Sign-in arrives in a later milestone. For local development, start the app with
          LT_OPEN_IMPORT=1.
        </p>
      )}
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
