import { LIMITS } from "../config";
import { ImportError } from "../files";

export type CrawlResult = {
  files: Array<[string, Uint8Array]>;
  /** Hosts the game's files point at but that we did not copy. */
  externalDomains: string[];
};

export type CrawlOptions = {
  fetchImpl?: typeof fetch;
  /** Allow localhost and private addresses. Tests only. */
  allowPrivateHosts?: boolean;
  maxFiles?: number;
  maxBytes?: number;
};

const ASSET_EXT =
  "js|mjs|css|json|wasm|png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|wav|m4a|mp4|webm|woff2?|ttf|otf|glb|gltf|bin|data|txt|map";

/**
 * Refuse addresses that point back into our own network. The server fetches a
 * URL a stranger supplied, so without this check it could be used to read
 * internal services. This checks the host name only; production must also pin
 * the resolved IP address, because a name can be re-pointed after the check.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return host.includes(":");
  }
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  );
}

function refsInHtml(html: string): string[] {
  const refs: string[] = [];
  for (const m of html.matchAll(/\b(?:src|href|poster|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    refs.push(m[1] ?? m[2] ?? m[3]);
  }
  for (const m of html.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const part of (m[1] ?? m[2]).split(",")) refs.push(part.trim().split(/\s+/)[0]);
  }
  return refs.concat(refsInCss(html), refsInScript(html));
}

function refsInCss(css: string): string[] {
  const refs: string[] = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi)) refs.push(m[1] ?? m[2] ?? m[3]);
  for (const m of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) refs.push(m[1] ?? m[2]);
  return refs;
}

/** Best effort: quoted strings in scripts that look like asset paths. Misses are expected. */
function refsInScript(js: string): string[] {
  const refs: string[] = [];
  const re = new RegExp(`["'\`]([^"'\`\\s<>{}$]{1,200}\\.(?:${ASSET_EXT}))(?:\\?[^"'\`\\s]*)?["'\`]`, "gi");
  for (const m of js.matchAll(re)) refs.push(m[1]);
  return refs;
}

/**
 * Copy a static web game from its public URL. Only files on the same origin
 * and under the game's own folder are copied; everything else is listed in
 * `externalDomains`. A game that builds its asset paths at runtime will be
 * incomplete: that is what the zip route is for.
 */
export async function crawlSite(entry: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxFiles = options.maxFiles ?? LIMITS.maxFiles;
  const maxBytes = options.maxBytes ?? LIMITS.maxBytes;

  let start: URL;
  try {
    start = new URL(entry);
  } catch {
    throw new ImportError("bad_url", "That is not a valid web address.");
  }
  if (start.protocol !== "https:" && start.protocol !== "http:") {
    throw new ImportError("bad_url", "Only http and https addresses can be imported.");
  }
  if (!options.allowPrivateHosts && isPrivateHost(start.hostname)) {
    throw new ImportError("blocked_host", "That address is not on the public internet.");
  }
  start.hash = "";

  // The game's folder: everything we copy must live under it.
  const lastSegment = start.pathname.slice(start.pathname.lastIndexOf("/") + 1);
  const base = new URL(lastSegment.includes(".") ? "./" : start.pathname.replace(/\/?$/, "/"), start);

  const files = new Map<string, Uint8Array>();
  const external = new Set<string>();
  const seen = new Set<string>();
  const queue: Array<{ url: URL; name: string; required: boolean }> = [{ url: start, name: "index.html", required: true }];
  seen.add(start.href);
  let total = 0;

  const enqueue = (ref: string, from: URL) => {
    if (!ref || /^(data|blob|javascript|mailto|about|tel):/i.test(ref) || ref.startsWith("#")) return;
    let url: URL;
    try {
      url = new URL(ref, from);
    } catch {
      return;
    }
    url.hash = "";
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    if (url.origin !== base.origin) {
      external.add(url.host);
      return;
    }
    if (!url.pathname.startsWith(base.pathname)) return;
    let name = decodeURIComponent(url.pathname.slice(base.pathname.length));
    if (name === "" || name.endsWith("/")) name += "index.html";
    if (seen.has(url.href)) return;
    seen.add(url.href);
    queue.push({ url, name, required: false });
  };

  while (queue.length) {
    const item = queue.shift()!;
    if (files.size >= maxFiles) throw new ImportError("too_many_files", "The game has more than 2,000 files.");
    let response: Response;
    try {
      response = await fetchImpl(item.url.href, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    } catch {
      if (item.required) throw new ImportError("fetch_failed", "The game's page could not be reached.");
      continue;
    }
    // A redirect must not carry us to another site.
    if (response.url && new URL(response.url).origin !== base.origin) {
      if (item.required) throw new ImportError("fetch_failed", "The game's page redirects to another site.");
      continue;
    }
    if (!response.ok) {
      if (item.required) throw new ImportError("fetch_failed", `The game's page answered ${response.status}.`);
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    total += bytes.byteLength;
    if (total > maxBytes) throw new ImportError("too_large", "The game is larger than 200 MB.");
    files.set(item.name, bytes);

    const type = response.headers.get("content-type") ?? "";
    const isHtml = type.includes("html") || /\.html?$/i.test(item.name);
    const isCss = type.includes("css") || /\.css$/i.test(item.name);
    const isJs = type.includes("javascript") || /\.m?js$/i.test(item.name);
    if (!isHtml && !isCss && !isJs) continue;
    const text = new TextDecoder().decode(bytes);
    if (isHtml) for (const ref of refsInHtml(text)) enqueue(ref, item.url);
    if (isCss) for (const ref of refsInCss(text)) enqueue(ref, item.url);
    if (isJs) {
      // Script paths are usually relative to the page, sometimes to the script. Try both.
      for (const ref of refsInScript(text)) {
        enqueue(ref, start);
        enqueue(ref, item.url);
      }
    }
  }

  return { files: [...files.entries()], externalDomains: [...external].sort() };
}
