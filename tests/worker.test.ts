import { describe, expect, it } from "vitest";

import { addVersion, buildVersion, type Game } from "@/lib/games";
import { liveKey, liveRecord } from "@/lib/live";
import { blobKey } from "@/lib/r2";
import { MemoryBlobStore, sha256 } from "@/lib/storage";

import { handle } from "../worker/src/index.js";

const enc = (s: string) => new TextEncoder().encode(s);

/** Stands in for the bucket binding a Worker is given. */
function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return { body: bytes, size: bytes.byteLength, json: async () => JSON.parse(new TextDecoder().decode(bytes)) };
    },
    async head(key: string) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
  };
}

const FILES = new Map([
  ["index.html", enc("<h1>Lantern Bay</h1>")],
  ["assets/game.js", enc("console.log('play')")],
]);

/** Publish a game the way the app does, into a bucket the Worker then reads. */
async function setup(state: Game["state"] = "HOSTED") {
  const bucket = fakeBucket();
  const store = new MemoryBlobStore();
  const version = await buildVersion(store, FILES, { kind: "zip" });
  const game = addVersion(
    { slug: "lantern-bay", title: "Lantern Bay", state, versions: [], activeVersionId: null, createdAt: "" },
    version,
  );
  for (const bytes of FILES.values()) bucket.objects.set(blobKey(sha256(bytes)), bytes);
  bucket.objects.set(liveKey(game.slug), enc(JSON.stringify(liveRecord(game))));
  const env = { BUCKET: bucket, PLAY_HOST: "launchtitle.games", FRAME_ANCESTORS: "https://launchtitle.gg" };
  const ask = (url: string, init?: RequestInit) => handle(new Request(url, init), env);
  return { bucket, ask };
}

describe("play domain worker", () => {
  it("serves a game's index at its own subdomain", async () => {
    const { ask } = await setup();
    const res = await ask("https://lantern-bay.launchtitle.games/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<h1>Lantern Bay</h1>");
  });

  it("serves nested files with their own type", async () => {
    const { ask } = await setup();
    const res = await ask("https://lantern-bay.launchtitle.games/assets/game.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
  });

  it("lets only the store frame a game, and sets no cookies", async () => {
    const { ask } = await setup();
    for (const path of ["/", "/missing.png"]) {
      const res = await ask(`https://lantern-bay.launchtitle.games${path}`);
      expect(res.headers.get("content-security-policy")).toBe("frame-ancestors https://launchtitle.gg");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("answers 304 when the browser already has the file", async () => {
    const { ask } = await setup();
    const first = await ask("https://lantern-bay.launchtitle.games/");
    const etag = first.headers.get("etag")!;
    const again = await ask("https://lantern-bay.launchtitle.games/", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(first.headers.get("cache-control")).toBe("no-cache");
  });

  it("answers HEAD without a body", async () => {
    const { ask } = await setup();
    const res = await ask("https://lantern-bay.launchtitle.games/", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(FILES.get("index.html")!.byteLength));
    expect(await res.text()).toBe("");
  });

  it("refuses anything but reading", async () => {
    const { ask } = await setup();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect((await ask("https://lantern-bay.launchtitle.games/", { method })).status).toBe(405);
    }
  });

  it("knows nothing outside the game's own file list", async () => {
    const { ask, bucket } = await setup();
    bucket.objects.set("live/secret.json", enc("{}"));
    const base = "https://lantern-bay.launchtitle.games";
    expect((await ask(`${base}/nope.js`)).status).toBe(404);
    expect((await ask(`${base}/live/secret.json`)).status).toBe(404);
    expect((await ask(`${base}/%2e%2e/live/secret.json`)).status).toBeGreaterThanOrEqual(400);
    expect((await ask(`${base}/constructor`)).status).toBe(404);
    expect((await ask(`${base}/a%5Cb`)).status).toBe(400);
  });

  it("does not answer for unknown games, the bare domain or other domains", async () => {
    const { ask } = await setup();
    expect((await ask("https://unknown-game.launchtitle.games/")).status).toBe(404);
    expect((await ask("https://launchtitle.games/")).status).toBe(404);
    expect((await ask("https://a.lantern-bay.launchtitle.games/")).status).toBe(404);
    expect((await ask("https://lantern-bay.example.com/")).status).toBe(404);
  });

  it("stops serving a game that is paused or removed", async () => {
    for (const state of ["PAUSED", "REMOVED", "OPTED_OUT", "NOMINATED"] as const) {
      const { ask } = await setup(state);
      expect((await ask("https://lantern-bay.launchtitle.games/")).status).toBe(410);
    }
  });
});
