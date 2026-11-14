import { ImportError, prepareFiles } from "../files";
import { addVersion, buildVersion, isValidSlug, slugify, type Game, type GameRepo, type Version } from "../games";
import type { LiveIndex } from "../live";
import { sniffImage } from "../images";
import type { BlobStore } from "../storage";
import { getConfig } from "../config";
import { crawlSite, isPrivateHost, type CrawlOptions } from "./crawl";
import { copyGaps, serverSigns } from "./detect";
import { fetchCover, framingBlocked, pageMeta } from "./meta";
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
  // A fresh copy of ours replaces playing from the creator's site.
  delete updated.externalUrl;
  // Every new build waits for the start-up check before the store lists it.
  updated.check = { state: "pending", at: new Date().toISOString() };
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

/**
 * Fill in a cover and description from what the game's own page declares for
 * link sharing. Only fills blanks: anything the creator set stays as it is.
 */
async function autofill(deps: Deps, game: Game, html: string, baseUrl: string, options?: CrawlOptions): Promise<Game> {
  if (game.cover && game.description) return game;
  const meta = pageMeta(html, baseUrl);
  const updated: Game = { ...game };
  if (!updated.description && meta.description) updated.description = meta.description;
  if (!updated.cover && meta.image) {
    const bytes = await fetchCover(meta.image, options);
    const type = bytes && sniffImage(bytes);
    if (bytes && type) updated.cover = { hash: await deps.store.put(bytes), type };
  }
  if (updated.cover === game.cover && updated.description === game.description) return game;
  await deps.repo.save(updated);
  return updated;
}

/** Import a game by copying its static files from where it is hosted. */
export async function importUrl(
  deps: Deps,
  title: string,
  url: string,
  options?: CrawlOptions,
  owner?: Owner,
): Promise<Game> {
  const { files, externalDomains } = await crawlSite(url, options);
  const game = await publish(deps, title, files, { kind: "crawl", url }, externalDomains, owner);
  const index = files.find(([name]) => name === "index.html");
  return index ? autofill(deps, game, new TextDecoder().decode(index[1]), url, options) : game;
}

export type AutoResult = { game: Game; how: "copy" | "link"; note: string };

/**
 * Bring a game in by link, choosing the way that suits it. The game's files
 * are fetched once. If its code shows it needs a server, or loads files a copy
 * would miss, it is linked to play from its creator's site; otherwise the files
 * are copied and hosted here. Such a game whose site refuses to be framed is copied
 * anyway, with a note, so a person can sort it out.
 */
export async function importAuto(deps: Deps, title: string, url: string, options?: CrawlOptions, owner?: Owner): Promise<AutoResult> {
  const { files, externalDomains } = await crawlSite(url, options);
  // Either kind of sign means a copy would not play properly: it needs a server, or files the copier could not see.
  const signs = [...serverSigns(files), ...copyGaps(files)];

  if (signs.length > 0) {
    try {
      const game = await linkGame(deps, title, url, options, owner);
      return { game, how: "link", note: `Linked: the game ${signs.join(", and ")}.` };
    } catch (error) {
      if (!(error instanceof ImportError) || error.code !== "blocked_host") throw error;
      // Falls through to a copy. Better listed and imperfect than not listed, and the note says why.
    }
  }

  const game = await publish(deps, title, files, { kind: "crawl", url }, externalDomains, owner);
  const index = files.find(([name]) => name === "index.html");
  const filled = index ? await autofill(deps, game, new TextDecoder().decode(index[1]), url, options) : game;
  return {
    game: filled,
    how: "copy",
    note: signs.length
      ? `Copied, but the game ${signs.join(", and ")}, and its site does not allow being shown here. It may not fully work.`
      : "Copied: the game runs entirely in the browser.",
  };
}

/**
 * List a game that keeps playing from its creator's own site. For games that
 * need their own server (accounts, multiplayer, saved progress), which a copy cannot run.
 * Nothing is copied; the store shows the game's page and frames the site when Play is pressed.
 */
export async function linkGame(deps: Deps, title: string, url: string, options?: CrawlOptions, owner?: Owner): Promise<Game> {
  const cleanTitle = title.trim().slice(0, 80);
  if (!cleanTitle) throw new ImportError("empty", "The game needs a name.");
  const slug = slugify(cleanTitle);
  if (!isValidSlug(slug)) throw new ImportError("empty", "That name cannot be used as a game address.");

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new ImportError("bad_url", "That is not a valid address.");
  }
  if (target.protocol !== "https:" && !options?.allowPrivateHosts) throw new ImportError("bad_url", "The address must start with https://.");
  if (!options?.allowPrivateHosts && isPrivateHost(target.hostname)) throw new ImportError("blocked_host", "That address cannot be used.");
  target.hash = "";

  const existing = await deps.repo.get(slug);
  if (existing && owner && !owner.admin && existing.creatorId !== owner.id) {
    throw new ImportError("taken", "That name is already taken. Pick another.");
  }

  let response: Response;
  try {
    response = await (options?.fetchImpl ?? fetch)(target.toString(), { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ImportError("fetch_failed", "That site could not be reached.");
  }
  if (!response.ok) throw new ImportError("fetch_failed", `That site answered ${response.status}.`);
  const { appOrigin } = getConfig();
  if (framingBlocked(response.headers, [appOrigin])) {
    throw new ImportError(
      "blocked_host",
      `That site does not allow being shown inside another site. Its owner needs to allow ${new URL(appOrigin).host} to frame it.`,
    );
  }
  const html = (await response.text()).slice(0, 500_000);

  const game: Game = existing ?? {
    slug,
    title: cleanTitle,
    state: "HOSTED",
    versions: [],
    activeVersionId: null,
    createdAt: new Date().toISOString(),
    ...(owner ? { creatorId: owner.id } : {}),
  };
  const updated: Game = { ...game, externalUrl: target.toString(), check: { state: "pending", at: new Date().toISOString() } };
  await deps.repo.save(updated);
  return autofill(deps, updated, html, target.toString(), options);
}
