/**
 * Zips waiting to be imported. A request to the hosted app can only carry a
 * few megabytes, so the browser sends the zip straight to file storage and
 * the app picks it up from there.
 */
export interface UploadStore {
  /** Returns the address the browser should PUT the zip to. */
  begin(userId: string, id: string): Promise<string>;
  read(userId: string, id: string, maxBytes: number): Promise<Uint8Array | null | "too_large">;
  remove(userId: string, id: string): Promise<void>;
}

const ID = /^[A-Za-z0-9_-]{43}$/;
const USER = /^[a-z0-9]{1,18}$/;

export function isUploadId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** Each person's uploads sit under their own id, so one person can never name another's upload. */
export function uploadKey(userId: string, id: string): string {
  if (!USER.test(userId) || !ID.test(id)) throw new Error("Bad upload reference");
  return `uploads/${userId}/${id}.zip`;
}
