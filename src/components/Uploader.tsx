"use client";

import { useRef, useState } from "react";

type Stage = { name: "idle" } | { name: "uploading"; percent: number } | { name: "importing" } | { name: "error"; message: string };
type Mode = "zip" | "html" | "paste" | "link" | "linked";

const MODES: { id: Mode; label: string }[] = [
  { id: "zip", label: "Zip file" },
  { id: "html", label: "Single page" },
  { id: "paste", label: "Paste code" },
  { id: "link", label: "Copy from a link" },
  { id: "linked", label: "Play from my site" },
];

function put(url: string, body: Blob, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload")));
    xhr.onerror = () => reject(new Error("upload"));
    xhr.send(body);
  });
}

/**
 * Four ways to add a game: a zip, one HTML page, pasted code, or a link to
 * where it is already hosted. Files go straight to file storage, then the app imports them.
 */
export function Uploader({ maxBytes }: { maxBytes: number }) {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [mode, setMode] = useState<Mode>("zip");
  const form = useRef<HTMLFormElement>(null);
  const busy = stage.name === "uploading" || stage.name === "importing";
  const error = (message: string) => setStage({ name: "error", message });

  async function finish(body: Record<string, string>) {
    setStage({ name: "importing" });
    const imported = await fetch("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await imported.json().catch(() => ({}));
    if (!imported.ok) return error(result.error ?? "The import failed. Try again.");
    window.location.assign(`/games/${result.slug}`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const data = new FormData(form.current!);
    const title = String(data.get("title") ?? "").trim();

    try {
      if (mode === "link" || mode === "linked") {
        const url = String(data.get("url") ?? "").trim();
        if (!url) return error("Add the game\u2019s address.");
        setStage({ name: "importing" });
        const imported = await fetch("/api/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, url, linked: mode === "linked" }),
        });
        const result = await imported.json().catch(() => ({}));
        if (!imported.ok) return error(result.error ?? "The import failed. Try again.");
        return window.location.assign(`/games/${result.slug}`);
      }

      let body: Blob;
      if (mode === "paste") {
        const code = String(data.get("code") ?? "");
        if (!code.trim()) return error("Paste the game\u2019s code.");
        body = new Blob([code], { type: "text/html" });
      } else {
        const file = data.get(mode);
        if (!(file instanceof File) || file.size === 0) return error("Choose a file.");
        body = file;
      }
      if (body.size > maxBytes) return error("That file is over the 200 MB limit.");

      setStage({ name: "uploading", percent: 0 });
      const started = await fetch("/api/uploads", { method: "POST" });
      const upload = await started.json();
      if (!started.ok) return error(upload.error ?? "The upload could not start.");
      await put(upload.url, body, (percent) => setStage({ name: "uploading", percent }));
      await finish({ title, uploadId: upload.id, kind: mode === "zip" ? "zip" : "html" });
    } catch {
      error("The upload was interrupted. Check your connection and try again.");
    }
  }

  return (
    <form ref={form} className="submit" onSubmit={submit}>
      {stage.name === "error" && (
        <p className="notice error" role="alert">
          {stage.message}
        </p>
      )}
      <label>
        Name
        <small>This also becomes the game&apos;s address.</small>
        <input name="title" required maxLength={80} autoComplete="off" disabled={busy} />
      </label>

      <fieldset className="modes" disabled={busy}>
        <legend>How is the game packaged?</legend>
        {MODES.map((m) => (
          <label key={m.id}>
            <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      {mode === "zip" && (
        <label>
          Zip file
          <small>index.html at the top level. Up to 200 MB and 2,000 files.</small>
          <input name="zip" type="file" accept=".zip,application/zip" disabled={busy} />
        </label>
      )}
      {mode === "html" && (
        <label>
          HTML file
          <small>A game that is one self-contained page, such as one made in Claude, ChatGPT or Gemini.</small>
          <input name="html" type="file" accept=".html,.htm,text/html" disabled={busy} />
        </label>
      )}
      {mode === "paste" && (
        <label>
          The game&apos;s code
          <small>Paste the whole HTML page. It must run on its own, without a build step.</small>
          <textarea name="code" rows={10} spellCheck={false} disabled={busy} />
        </label>
      )}
      {mode === "linked" && (
        <label>
          Where the game is hosted
          <small>
            For games that need their own server: accounts, multiplayer, saved progress. The game is listed here and
            plays from your site, so your site must allow launchtitle.gg to show it in a frame. Only add games that are
            yours.
          </small>
          <input name="url" type="url" placeholder="https://" inputMode="url" disabled={busy} />
        </label>
      )}
      {mode === "link" && (
        <label>
          Where the game is hosted
          <small>
            We copy its files from there. This works for games made of plain files, such as most on GitHub Pages,
            Netlify or Vercel. Only add games that are yours.
          </small>
          <input name="url" type="url" placeholder="https://" inputMode="url" disabled={busy} />
        </label>
      )}

      {stage.name === "uploading" && (
        <div className="progress" role="status">
          <div className="bar">
            <span style={{ width: `${stage.percent}%` }} />
          </div>
          Uploading, {stage.percent}%
        </div>
      )}
      {stage.name === "importing" && (
        <div className="progress" role="status">
          Copying and checking the game. Large games can take a minute.
        </div>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "WORKING" : "ADD GAME"}
      </button>
    </form>
  );
}
