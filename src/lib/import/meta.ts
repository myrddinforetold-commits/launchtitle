import { MAX_IMAGE_BYTES, sniffImage } from "../images";
import { isPrivateHost } from "./crawl";

export type PageMeta = { image?: string; description?: string };

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/**
 * The preview image and description a page declares for link sharing.
 * Most game sites have both, so a game can arrive with a cover instead of a blank tile.
 */
export function pageMeta(html: string, baseUrl: string): PageMeta {
  const found = new Map<string, string>();
  for (const [tag] of html.slice(0, 200_000).matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !found.has(key)) found.set(key, decode(content).trim());
  }
  const meta: PageMeta = {};
  const image = found.get("og:image") ?? found.get("og:image:url") ?? found.get("twitter:image");
  if (image) {
    try {
      const url = new URL(image, baseUrl);
      if (url.protocol === "https:") meta.image = url.toString();
    } catch {
      // Not a usable address. Leave the cover blank.
    }
  }
  const description = found.get("og:description") ?? found.get("description") ?? found.get("twitter:description");
  if (description) meta.description = description.replace(/\s+/g, " ").slice(0, 600);
  return meta;
}

/** Fetch a declared preview image, if it really is a small PNG, JPEG or WebP. Never throws: a cover is a nicety. */
export async function fetchCover(
  url: string,
  options: { fetchImpl?: typeof fetch; allowPrivateHosts?: boolean } = {},
): Promise<Uint8Array | null> {
  try {
    const target = new URL(url);
    if (target.protocol !== "https:" && !options.allowPrivateHosts) return null;
    if (!options.allowPrivateHosts && isPrivateHost(target.hostname)) return null;
    const response = await (options.fetchImpl ?? fetch)(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "image/webp,image/png,image/jpeg" },
    });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES && sniffImage(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Whether a site forbids being shown inside the store. A site can say so in
 * two headers; either one is enough.
 */
export function framingBlocked(headers: Headers, storeOrigins: readonly string[]): boolean {
  const xfo = headers.get("x-frame-options");
  if (xfo && /deny|sameorigin/i.test(xfo)) return true;
  const csp = headers.get("content-security-policy");
  const rule = csp?.split(";").map((part) => part.trim()).find((part) => /^frame-ancestors\b/i.test(part));
  if (!rule) return false;
  const allowed = rule.split(/\s+/).slice(1).map((source) => source.toLowerCase());
  if (allowed.includes("*") || allowed.includes("https:")) return false;
  return !storeOrigins.some((origin) => allowed.includes(origin.toLowerCase()));
}
