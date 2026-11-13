// The play domain: launchtitle.games.
//
// Each game answers on its own subdomain, {slug}.launchtitle.games, so one game
// cannot read another's storage and none can read the store's. This program
// serves a game's files and does nothing else: no API, no session, no cookies,
// read-only methods. It reads the bucket and nothing else.
//
// Keep it dependency-free: this file is deployed exactly as written.

const SERVED = new Set(["HOSTED", "CLAIMED", "PAYABLE"]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const HASH = /^[0-9a-f]{64}$/;

/**
 * @param {Request} request
 * @param {{ BUCKET: any, PLAY_HOST: string, FRAME_ANCESTORS: string }} env
 * @returns {Promise<Response>}
 */
export async function handle(request, env) {
  const base = {
    // Only the store may put a game in a frame.
    "content-security-policy": `frame-ancestors ${env.FRAME_ANCESTORS}`,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
  };
  const head = request.method === "HEAD";
  const text = (status, body, extra = {}) =>
    new Response(head ? null : body, {
      status,
      headers: { ...base, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra },
    });

  if (request.method !== "GET" && !head) return text(405, "Method not allowed", { allow: "GET, HEAD" });

  const url = new URL(request.url);
  const suffix = `.${env.PLAY_HOST.toLowerCase()}`;
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(suffix)) return text(404, "Not found");
  const slug = host.slice(0, -suffix.length);
  if (!SLUG.test(slug)) return text(404, "Not found");

  const live = await env.BUCKET.get(`live/${slug}.json`);
  if (!live) return text(404, "Not found");
  const game = await live.json();
  if (!SERVED.has(game.state)) return text(410, "This game is not being served right now");

  let name;
  try {
    name = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    return text(400, "Bad request");
  }
  if (name === "" || name.endsWith("/")) name += "index.html";
  if (name.includes("\\") || name.split("/").some((part) => part === ".." || part === ".")) {
    return text(400, "Bad request");
  }

  const entry = Object.hasOwn(game.files ?? {}, name) ? game.files[name] : undefined;
  if (!entry || !HASH.test(entry.hash)) return text(404, "Not found");

  const etag = `"${entry.hash}"`;
  const headers = {
    ...base,
    "content-type": entry.type,
    etag,
    // The same address serves whichever build is live, so browsers must check back each time.
    "cache-control": "no-cache",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const key = `blobs/${entry.hash.slice(0, 2)}/${entry.hash}`;
  if (head) {
    const found = await env.BUCKET.head(key);
    if (!found) return text(404, "Not found");
    return new Response(null, { status: 200, headers: { ...headers, "content-length": String(found.size) } });
  }
  const file = await env.BUCKET.get(key);
  if (!file) return text(404, "Not found");
  return new Response(file.body, { status: 200, headers });
}

const worker = {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(error);
      return new Response("Something went wrong", { status: 500, headers: { "cache-control": "no-store" } });
    }
  },
};

export default worker;
