import type { IncomingMessage, ServerResponse } from "node:http";

import { activeVersion, isValidSlug, SERVED_STATES, type GameRepo } from "./games";
import type { BlobStore } from "./storage";

export type PlayOptions = {
  repo: GameRepo;
  store: BlobStore;
  /** For example `play.localhost:4001`. Games answer at `{slug}.{playHost}`. */
  playHost: string;
  /** The only origin allowed to frame a game. */
  appOrigin: string;
};

/**
 * The play domain. It serves a game's files and does nothing else: no API, no
 * session, no cookies, read-only methods. Each game answers on its own
 * subdomain, so one game cannot read another's storage, and none can read the app's.
 */
export function createPlayHandler({ repo, store, playHost, appOrigin }: PlayOptions) {
  const suffix = `.${playHost.toLowerCase()}`;

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body: string) => {
      res.writeHead(status, { ...baseHeaders(appOrigin), "content-type": "text/plain; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : body);
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("allow", "GET, HEAD");
      return send(405, "Method not allowed");
    }

    const host = (req.headers.host ?? "").toLowerCase();
    if (!host.endsWith(suffix)) return send(404, "Not found");
    const slug = host.slice(0, -suffix.length);
    if (!isValidSlug(slug)) return send(404, "Not found");

    const game = await repo.get(slug);
    if (!game) return send(404, "Not found");
    if (!SERVED_STATES.has(game.state)) return send(410, "This game is not being served right now");
    const version = activeVersion(game);
    if (!version) return send(404, "Not found");

    let name: string;
    try {
      name = decodeURIComponent(new URL(req.url ?? "/", "http://play").pathname).replace(/^\/+/, "");
    } catch {
      return send(400, "Bad request");
    }
    if (name === "" || name.endsWith("/")) name += "index.html";
    if (name.includes("\\") || name.split("/").some((part) => part === ".." || part === ".")) {
      return send(400, "Bad request");
    }

    const entry = Object.hasOwn(version.manifest, name) ? version.manifest[name] : undefined;
    if (!entry) return send(404, "Not found");

    const etag = `"${entry.hash}"`;
    const headers = {
      ...baseHeaders(appOrigin),
      "content-type": entry.type,
      etag,
      // The same address serves whichever version is live, so browsers must check back each time.
      "cache-control": "no-cache",
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      return void res.end();
    }
    const bytes = await store.get(entry.hash);
    if (!bytes) return send(404, "Not found");
    res.writeHead(200, { ...headers, "content-length": String(bytes.byteLength) });
    res.end(req.method === "HEAD" ? undefined : bytes);
  };
}

function baseHeaders(appOrigin: string): Record<string, string> {
  return {
    // Only the console may put a game in a frame.
    "content-security-policy": `frame-ancestors ${appOrigin}`,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
  };
}
