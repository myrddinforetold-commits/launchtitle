// The play domain: launchtitle.games.
//
// Each game answers on its own subdomain, {slug}.launchtitle.games, so one game
// cannot read another's storage and none can read the store's. This program
// serves a game's files and does nothing else: no API, no session, no cookies,
// read-only methods. It reads the bucket. The one thing it writes is a file a
// copied game asked for that its copy lacked, fetched once from the game's own site.
//
// Keep it dependency-free: this file is deployed exactly as written.

const SERVED = new Set(["HOSTED", "CLAIMED", "PAYABLE"]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const HASH = /^[0-9a-f]{64}$/;

// Defaults, so the program needs no settings beyond its bucket. Both can be overridden.
const PLAY_HOST = "launchtitle.games";
// The only sites allowed to show a game in a frame.
const FRAME_ANCESTORS = "https://launchtitle.gg https://www.launchtitle.gg https://launchtitle.vercel.app";

// A copied game may ask for a file its copy lacks. Up to this size it is fetched from the game's site and kept.
const MAX_PULL_BYTES = 60 * 1024 * 1024;
const TYPES = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", map: "application/json",
  txt: "text/plain; charset=utf-8", wasm: "application/wasm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", mp3: "audio/mpeg",
  ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", woff: "font/woff",
  woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", glb: "model/gltf-binary", gltf: "model/gltf+json",
};

// request: a Request. env: { BUCKET, PLAY_HOST?, FRAME_ANCESTORS?, FETCH? }, where BUCKET is the R2 bucket.
export async function handle(request, env) {
  const base = {
    // Only the store may put a game in a frame.
    "content-security-policy": `frame-ancestors ${env.FRAME_ANCESTORS || FRAME_ANCESTORS}`,
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
  const suffix = `.${(env.PLAY_HOST || PLAY_HOST).toLowerCase()}`;
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
  let key;
  let headers = {
    ...base,
    // The same address serves whichever build is live, so browsers must check back each time.
    "cache-control": "no-cache",
    // Phones ask for sound and video a piece at a time, and refuse to play them from a server that cannot answer that.
    "accept-ranges": "bytes",
  };
  if (entry && HASH.test(entry.hash)) {
    const etag = `"${entry.hash}"`;
    headers = { ...headers, "content-type": entry.type, etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    key = `blobs/${entry.hash.slice(0, 2)}/${entry.hash}`;
  } else {
    // Not in the copy. If the game was copied from a site, the file may simply have been
    // missed: games often build file names as they run. Fetch it from there once and keep it.
    key = await pulled(env, game, slug, name);
    if (!key) return text(404, "Not found");
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    headers = { ...headers, "content-type": TYPES[ext] || "application/octet-stream" };
  }

  if (head) {
    const found = await env.BUCKET.head(key);
    if (!found) return text(404, "Not found");
    return new Response(null, { status: 200, headers: { ...headers, "content-length": String(found.size) } });
  }
  const asked = request.headers.get("range");
  if (asked) {
    const found = await env.BUCKET.head(key);
    if (!found) return text(404, "Not found");
    const span = byteRange(asked, found.size);
    // A range we cannot make sense of is ignored and the whole file is sent, as the standard allows.
    if (span === "unsatisfiable") return text(416, "Range not satisfiable", { "content-range": `bytes */${found.size}` });
    if (span) {
      const length = span.end - span.start + 1;
      const part = await env.BUCKET.get(key, { range: { offset: span.start, length } });
      if (!part) return text(404, "Not found");
      return new Response(part.body, {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${span.start}-${span.end}/${found.size}`, "content-length": String(length) },
      });
    }
  }
  const file = await env.BUCKET.get(key);
  if (!file) return text(404, "Not found");
  return new Response(file.body, { status: 200, headers: { ...headers, "content-length": String(file.size) } });
}

// Where a missed file is kept once fetched, or null if there is none to be had.
// Only files under the folder the game was copied from are fetched, and only from that same site.
async function pulled(env, game, slug, name) {
  if (typeof game.source !== "string" || !game.source.startsWith("https://") || !game.version || name.length > 300) return null;
  const key = `pulled/${slug}/${game.version}/${name}`;
  if (await env.BUCKET.head(key)) return key;

  let target;
  try {
    target = new URL(name.split("/").map(encodeURIComponent).join("/"), game.source);
  } catch {
    return null;
  }
  if (!target.href.startsWith(game.source)) return null;
  let response;
  try {
    response = await (env.FETCH || fetch)(target.href, { redirect: "follow" });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  // A redirect must not carry us to another site.
  if (response.url && new URL(response.url).origin !== target.origin) return null;
  // Many sites answer any unknown address with their front page. That is not the file.
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const isPage = (response.headers.get("content-type") || "").includes("text/html");
  if (isPage && ext !== "html" && ext !== "htm") return null;
  if (Number(response.headers.get("content-length") || 0) > MAX_PULL_BYTES) return null;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_PULL_BYTES) return null;
  await env.BUCKET.put(key, bytes);
  return key;
}

// Reads "bytes=0-99", "bytes=100-" or "bytes=-50" against a file of the given size.
// Returns { start, end } inclusive, "unsatisfiable", or null for anything else (several ranges, other units).
function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  if (match[1] === "") {
    const last = Number(match[2]);
    if (last === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
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
