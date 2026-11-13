import type { User } from "./auth/sessions";
import type { Game, GameRepo, GameState } from "./games";
import { sniffImage, MAX_IMAGE_BYTES } from "./images";
import type { LiveIndex } from "./live";
import type { BlobStore } from "./storage";

type Deps = { repo: GameRepo; store: BlobStore; live: LiveIndex };

export class ManageError extends Error {}

export const MAX_DESCRIPTION = 600;
export const MAX_HOW_TO = 400;
export const MAX_SCREENSHOTS = 5;

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
  details: { description?: string; cover?: Uint8Array; display?: "fill" | "portrait"; howTo?: string; devices?: "any" | "phone" | "desktop" },
): Promise<Game> {
  if (!canManage(user, game)) throw new ManageError("You cannot change this game.");
  const updated: Game = { ...game };
  if (details.description !== undefined) {
    updated.description = details.description.replace(/\r\n/g, "\n").trim().slice(0, MAX_DESCRIPTION);
  }
  if (details.howTo !== undefined) {
    const howTo = details.howTo.replace(/\r\n/g, "\n").trim().slice(0, MAX_HOW_TO);
    if (howTo) updated.howTo = howTo;
    else delete updated.howTo;
  }
  if (details.devices === "phone" || details.devices === "desktop") updated.devices = details.devices;
  else if (details.devices === "any") delete updated.devices;
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

/** Adds one picture of the game to its page. */
export async function addScreenshot(deps: Deps, user: User, game: Game, image: Uint8Array): Promise<Game> {
  if (!canManage(user, game)) throw new ManageError("You cannot change this game.");
  const current = game.screenshots ?? [];
  if (current.length >= MAX_SCREENSHOTS) throw new ManageError(`A game can have up to ${MAX_SCREENSHOTS} screenshots. Remove one first.`);
  if (image.byteLength === 0) throw new ManageError("Choose an image first.");
  if (image.byteLength > MAX_IMAGE_BYTES) throw new ManageError("The screenshot is over 4 MB.");
  const type = sniffImage(image);
  if (!type) throw new ManageError("A screenshot must be a PNG, JPEG or WebP image.");
  const hash = await deps.store.put(image);
  if (current.some((shot) => shot.hash === hash)) throw new ManageError("That screenshot is already on the page.");
  const updated: Game = { ...game, screenshots: [...current, { hash, type }] };
  await deps.repo.save(updated);
  return updated;
}

export async function removeScreenshot(deps: Deps, user: User, game: Game, hash: string): Promise<Game> {
  if (!canManage(user, game)) throw new ManageError("You cannot change this game.");
  const left = (game.screenshots ?? []).filter((shot) => shot.hash !== hash);
  const updated: Game = { ...game };
  if (left.length > 0) updated.screenshots = left;
  else delete updated.screenshots;
  await deps.repo.save(updated);
  return updated;
}

/**
 * Erases a game for good: its page, builds, plays and saves. Admins only.
 * The play domain is told first, so the game stops being served even if the rest fails.
 * The files themselves stay in storage, where other games may share them.
 */
export async function deleteGame(deps: Deps, user: User, game: Game): Promise<void> {
  if (user.role !== "admin") throw new ManageError("Only an admin can delete a game.");
  await deps.live.retract(game.slug);
  await deps.repo.delete(game.slug);
}
