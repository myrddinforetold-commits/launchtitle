import { playUrl } from "../frame";
import type { Game } from "../games";
import { openStores } from "../stores";
import { bootCheck } from "./browser";
import type { CheckDeps } from "./run";

/** The check wired to the real stores and a real hidden browser. */
export function liveCheckDeps(): CheckDeps {
  const { repo, store, live } = openStores();
  return { repo, store, live, check: bootCheck, playAddress: (game: Game) => game.externalUrl ?? playUrl(game.slug) };
}
