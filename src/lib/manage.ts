import type { User } from "./auth/sessions";
import type { Game, GameRepo, GameState } from "./games";
import { sniffImage, MAX_IMAGE_BYTES } from "./images";
import type { LiveIndex } from "./live";
import type { BlobStore } from "./storage";

type Deps = { repo: GameRepo; store: BlobStore; live: LiveIndex };

export class ManageError extends Error {}

export const MAX_DESCRIPTION = 600;

/** A game is managed by the person who added it, and by admins. */
export function canManage(user: User | null, game: Game): boolean {
  if (!user) return false;
  return user.role === "admin" || (game.creatorId !== undefined && game.creatorId === user.id);
}

/**
 * Which state changes a person may make. A creator can take their own game
 * down and put it back. Only an admin can remove a game, and only an admin
 * can bring back one that was removed.
 */
export function mayMove(user: User, game: Game, next: GameState): boolean {
  if (!canManage(user, game)) return false;
  if (user.role === "admin") return next === "HOSTED" || next === "PAUSED" || next === "REMOVED";
  if (game.state === "HOSTED" && next === "PAUSED") return true;
  if (game.state === "PAUSED" && next === "HOSTED") return true;
  return false;
}

export async function setState(deps: Deps, user: User, game: Game, next: GameState): Promise<Game> {
  if (!mayMove(user, game, next)) throw new ManageError("You cannot make that change to this game.");
  const updated = { ...game, state: next };
  await deps.repo.save(updated);
  // The play domain reads this, so a paused or removed game stops being served at once.
  await deps.live.publish(updated);
  return updated;
}

export async function setDetails(
  deps: Deps,
  user: User,
  game: Game,
  details: { description?: string; cover?: Uint8Array; display?: "fill" | "portrait" },
): Promise<Game> {
  if (!canManage(user, game)) throw new ManageError("You cannot change this game.");
  const updated: Game = { ...game };
  if (details.description !== undefined) {
    updated.description = details.description.replace(/\r\n/g, "\n").trim().slice(0, MAX_DESCRIPTION);
  }
  if (details.display === "portrait") updated.display = "portrait";
  else if (details.display === "fill") delete updated.display;
  if (details.cover && details.cover.byteLength > 0) {
    if (details.cover.byteLength > MAX_IMAGE_BYTES) throw new ManageError("The cover image is over 4 MB.");
    const type = sniffImage(details.cover);
    if (!type) throw new ManageError("The cover must be a PNG, JPEG or WebP image.");
    updated.cover = { hash: await deps.store.put(details.cover), type };
  }
  await deps.repo.save(updated);
  return updated;
}
