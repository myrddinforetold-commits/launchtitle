import { LIMITS } from "./config";

export class ImportError extends Error {
  constructor(
    readonly code:
      | "unsafe_path"
      | "too_many_files"
      | "too_large"
      | "no_index"
      | "empty"
      | "bad_zip"
      | "bad_url"
      | "blocked_host"
      | "fetch_failed"
      | "taken"
      | "no_upload",
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export type FileMap = Map<string, Uint8Array>;

/**
 * Turn a path from a zip or a crawl into a safe relative path.
 * Returns null for entries we skip (folders, dotfiles, archive junk).
 * Throws on anything that tries to escape the game's own folder.
 */
export function normalizePath(raw: string): string | null {
  if (raw.includes("\0") || raw.includes("\\")) {
    throw new ImportError("unsafe_path", `Unsafe file path: ${JSON.stringify(raw)}`);
  }
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    throw new ImportError("unsafe_path", `Absolute paths are not allowed: ${raw}`);
  }
  if (raw.endsWith("/")) return null;
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      throw new ImportError("unsafe_path", `Path leaves the game folder: ${raw}`);
    }
    if (part.startsWith(".") || part === "__MACOSX") return null;
    parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

/**
 * Validate a set of files and shape it into a game: safe paths, within the
 * limits, and with `index.html` at the root. A single wrapping folder (the usual
 * result of zipping a folder) is removed.
 */
export function prepareFiles(input: Iterable<readonly [string, Uint8Array]>): FileMap {
  let files: FileMap = new Map();
  let total = 0;
  for (const [raw, bytes] of input) {
    const name = normalizePath(raw);
    if (name === null) continue;
    total += bytes.byteLength;
    if (total > LIMITS.maxBytes) {
      throw new ImportError("too_large", "The game is larger than 200 MB.");
    }
    files.set(name, bytes);
    if (files.size > LIMITS.maxFiles) {
      throw new ImportError("too_many_files", "The game has more than 2,000 files.");
    }
  }
  if (files.size === 0) throw new ImportError("empty", "No files were found.");

  if (!files.has("index.html")) {
    const roots = new Set([...files.keys()].map((name) => name.split("/")[0]));
    const [only] = roots;
    if (roots.size === 1 && files.has(`${only}/index.html`)) {
      const unwrapped: FileMap = new Map();
      for (const [name, bytes] of files) unwrapped.set(name.slice(only.length + 1), bytes);
      files = unwrapped;
    }
  }
  if (!files.has("index.html")) {
    throw new ImportError("no_index", "The game needs an index.html at its top level.");
  }
  return files;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  map: "application/json",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
};

export function contentType(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}
