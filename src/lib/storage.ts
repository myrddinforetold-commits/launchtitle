import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Content-addressed storage for game files. A blob's key is the hash of its
 * bytes, so every stored version is immutable and identical files are stored once.
 * Production will use object storage behind this same interface.
 */
export interface BlobStore {
  put(bytes: Uint8Array): Promise<string>;
  get(hash: string): Promise<Uint8Array | null>;
}

const HASH = /^[0-9a-f]{64}$/;

export class FsBlobStore implements BlobStore {
  constructor(private readonly dir: string) {}

  private file(hash: string) {
    return path.join(this.dir, hash.slice(0, 2), hash.slice(2));
  }

  async put(bytes: Uint8Array): Promise<string> {
    const hash = sha256(bytes);
    const file = this.file(hash);
    await mkdir(path.dirname(file), { recursive: true });
    // Write to a temporary name, then rename, so a reader never sees a partial blob.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
    return hash;
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!HASH.test(hash)) return null;
    try {
      return await readFile(this.file(hash));
    } catch {
      return null;
    }
  }
}

export class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async put(bytes: Uint8Array): Promise<string> {
    const hash = sha256(bytes);
    this.blobs.set(hash, bytes);
    return hash;
  }

  async get(hash: string): Promise<Uint8Array | null> {
    return this.blobs.get(hash) ?? null;
  }
}
