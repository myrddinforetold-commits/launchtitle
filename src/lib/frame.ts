import { getConfig } from "./config";

/**
 * What a game frame may do, from the spec. Scripts and pointer lock are allowed.
 * `allow-same-origin` is safe only because the game is served from the play
 * domain, never from the app's own origin. Top navigation, popups and forms are
 * left out on purpose, so a game cannot move the player off the console.
 */
export const GAME_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-pointer-lock";
/** Autoplay is what lets a game start its sound: pressing Play in the store counts as the player asking for it. */
export const GAME_FRAME_ALLOW = "fullscreen; gamepad; autoplay";

/** The address a game is served from: its own subdomain of the play host. */
export function playUrl(slug: string): string {
  const { playScheme, playHost } = getConfig();
  return `${playScheme}://${slug}.${playHost}/`;
}

/** The fade laid over a cover image in a hero, so the title below it stays readable. */
export const COVER_FADE =
  "linear-gradient(180deg, rgba(7,11,20,.3) 0%, rgba(7,11,20,0) 22%, rgba(7,11,20,.35) 58%, #070b14 100%)";

/**
 * For a game that plays from its creator's own site. That site is a different
 * origin from the store, so it can never read the store. It gets what a real
 * site needs to work (forms, popups for sign-in, dialogs), but may not
 * navigate the store's own window away.
 */
export const LINKED_FRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock";
