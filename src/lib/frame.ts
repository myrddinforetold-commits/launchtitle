import { getConfig } from "./config";

/**
 * What a game frame may do, from the spec. Scripts and pointer lock are allowed.
 * `allow-same-origin` is safe only because the game is served from the play
 * domain, never from the app's own origin. Top navigation, popups and forms are
 * left out on purpose, so a game cannot move the player off the console.
 */
export const GAME_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-pointer-lock";
export const GAME_FRAME_ALLOW = "fullscreen; gamepad";

/** The address a game is served from: its own subdomain of the play host. */
export function playUrl(slug: string): string {
  const { playScheme, playHost } = getConfig();
  return `${playScheme}://${slug}.${playHost}/`;
}
