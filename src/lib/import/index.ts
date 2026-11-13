import { ImportError, prepareFiles } from "../files";
import { addVersion, buildVersion, isValidSlug, slugify, type Game, type GameRepo, type Version } from "../games";
import type { LiveIndex } from "../live";
import type { BlobStore } from "../storage";
import { crawlSite, type CrawlOptions } from "./crawl";
import { filesFromZip } from "./zip";

export { ImportError };

type Deps = { repo: GameRepo; store: BlobStore; live?: LiveIndex };

/** Who is adding the game. Left out only in local development, where there is no sign-in. */
export type Owner = { id: string; admin: boolean };

async function publish(
  deps: Deps,
  title: string,
  raw: Iterable<readonly [string, Uint8Array]>,
  source: Version["source"],
  externalDomains: string[],
  owner?: Owner,
): Promise<Game> {
  const cleanTitle = title.trim().slice(0, 80);
  if (!cleanTitle) throw new ImportError("empty", "The game needs a name.");
  const slug = slugify(cleanTitle);
  if (!isValidSlug(slug)) throw new ImportError("empty", "That name cannot be used as a game address.");

  // Check the name before storing anything: a game's address belongs to whoever added it first.
  const existing = await deps.repo.get(slug);
  if (existing && owner && !owner.admin && existing.creatorId !== owner.id) {
    throw new ImportError("taken", "That name is already taken. Pick another.");
  }

  const files = prepareFiles(raw);
  const version = await buildVersion(deps.store, files, source, externalDomains);
  const game: Game = existing ?? {
    slug,
    title: cleanTitle,
    state: "HOSTED",
    versions: [],
    activeVersionId: null,
    createdAt: new Date().toISOString(),
    ...(owner ? { creatorId: owner.id } : {}),
  };
  const updated = addVersion(game, version);
  await deps.repo.save(updated);
  // Last, so the play domain only ever points at a build that is fully stored and recorded.
  await deps.live?.publish(updated);
  return updated;
}

/** Import a game from an uploaded zip. Importing again under the same name publishes a new version. */
export function importZip(deps: Deps, title: string, zip: Uint8Array, owner?: Owner): Promise<Game> {
  return publish(deps, title, filesFromZip(zip), { kind: "zip" }, [], owner);
}

/** A game that is a single page of HTML, such as one written in a chat with an assistant. */
const MAX_HTML_BYTES = 20 * 1024 * 1024;

export async function importHtml(deps: Deps, title: string, html: Uint8Array, owner?: Owner): Promise<Game> {
  if (html.byteLength === 0) throw new ImportError("empty", "That file is empty.");
  if (html.byteLength > MAX_HTML_BYTES) throw new ImportError("too_large", "A single page can be up to 20 MB.");
  const start = new TextDecoder().decode(html.subarray(0, 2048)).toLowerCase();
  if (!/<(!doctype|html|head|body|script|canvas|div|style|meta)\b/.test(start)) {
    throw new ImportError("no_index", "That does not look like an HTML page.");
  }
  return publish(deps, title, [["index.html", html]], { kind: "html" }, [], owner);
}

/** Import a game by copying its static files from a public URL. */
export async function importUrl(
  deps: Deps,
  title: string,
  url: string,
  options?: CrawlOptions,
  owner?: Owner,
): Promise<Game> {
  const { files, externalDomains } = await crawlSite(url, options);
  return publish(deps, title, files, { kind: "crawl", url }, externalDomains, owner);
}
