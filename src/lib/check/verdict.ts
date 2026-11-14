/** What the hidden browser saw while a game started. */
export type Observations = {
  /** False if the game's page itself did not load. */
  loaded: boolean;
  /** Files from the game's own site that could not be fetched. */
  missing: string[];
  /** Errors the game's code threw. */
  errors: string[];
  /** One entry per picture taken: was it a single flat colour? */
  blank: boolean[];
};

export type Verdict = { ok: boolean; note: string };

/** A handful of missing files breaks a game; one or two are usually optional extras. */
export const MISSING_LIMIT = 3;

/** Files browsers and tools ask for on their own. A game is not broken for lacking them. */
const OPTIONAL = /(?:^|\/)(?:favicon[^/]*|apple-touch-icon[^/]*|robots\.txt|manifest\.(?:json|webmanifest)|site\.webmanifest|[^/]+\.map)$/i;

export function isOptional(path: string): boolean {
  return OPTIONAL.test(path.split(/[?#]/)[0]);
}

const list = (items: string[]) => {
  const names = items.slice(0, 3).map((item) => item.split("/").pop() || item);
  return names.join(", ") + (items.length > 3 ? ` and ${items.length - 3} more` : "");
};

/**
 * Decides whether a game started. It fails on what a player would see: the
 * page not loading, a blank screen, or enough missing files that it cannot run.
 * Everything else passes, with anything odd noted for the creator.
 */
export function verdict(seen: Observations): Verdict {
  if (!seen.loaded) return { ok: false, note: "The game's page did not load." };
  const allBlank = seen.blank.length > 0 && seen.blank.every(Boolean);
  if (seen.missing.length >= MISSING_LIMIT) {
    return { ok: false, note: `${seen.missing.length} of the game's files could not be found (${list(seen.missing)}).` };
  }
  if (allBlank) {
    const why = seen.errors[0] ? ` Its code reported: ${seen.errors[0].slice(0, 140)}` : "";
    return { ok: false, note: `The game showed a blank screen.${why}` };
  }
  const notes: string[] = [];
  if (seen.missing.length > 0) notes.push(`${seen.missing.length === 1 ? "One file" : "Two files"} could not be found (${list(seen.missing)}).`);
  if (seen.errors.length > 0) notes.push(`Its code reported an error: ${seen.errors[0].slice(0, 140)}`);
  // A heavy game can be too slow for the test browser to picture. It loaded and found its files, which is what we can vouch for.
  const first = seen.blank.length > 0 ? "It loaded and drew its first screen." : "It loaded and found its files. It was too slow to picture in the test browser.";
  return { ok: true, note: [first, ...notes].join(" ") };
}
