"use client";

import { useRef, useState } from "react";

type Stage = { name: "idle" } | { name: "uploading"; percent: number } | { name: "importing" } | { name: "error"; message: string };

function put(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload")));
    xhr.onerror = () => reject(new Error("upload"));
    xhr.send(file);
  });
}

/** Sends the zip straight to file storage, then asks the app to import it. */
export function Uploader({ maxBytes }: { maxBytes: number }) {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const form = useRef<HTMLFormElement>(null);
  const busy = stage.name === "uploading" || stage.name === "importing";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const data = new FormData(form.current!);
    const title = String(data.get("title") ?? "").trim();
    const file = data.get("zip");
    if (!(file instanceof File) || file.size === 0) return setStage({ name: "error", message: "Choose a zip file." });
    if (file.size > maxBytes) return setStage({ name: "error", message: "That zip is over the 200 MB limit." });

    try {
      setStage({ name: "uploading", percent: 0 });
      const started = await fetch("/api/uploads", { method: "POST" });
      const upload = await started.json();
      if (!started.ok) return setStage({ name: "error", message: upload.error ?? "The upload could not start." });

      await put(upload.url, file, (percent) => setStage({ name: "uploading", percent }));

      setStage({ name: "importing" });
      const imported = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uploadId: upload.id, title }),
      });
      const result = await imported.json().catch(() => ({}));
      if (!imported.ok) return setStage({ name: "error", message: result.error ?? "The import failed. Try again." });
      window.location.assign(`/games/${result.slug}`);
    } catch {
      setStage({ name: "error", message: "The upload was interrupted. Check your connection and try again." });
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
      <label>
        Zip file
        <small>index.html at the top level. Up to 200 MB and 2,000 files.</small>
        <input name="zip" type="file" accept=".zip,application/zip" required disabled={busy} />
      </label>
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
          Unpacking and checking the game. Large games can take a minute.
        </div>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "WORKING" : "ADD GAME"}
      </button>
    </form>
  );
}
