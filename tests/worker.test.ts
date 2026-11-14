import { describe, expect, it } from "vitest";

import { addVersion, buildVersion, type Game, type Version } from "@/lib/games";
import { liveKey, liveRecord, sourceFolder } from "@/lib/live";
import { blobKey } from "@/lib/r2";
import { MemoryBlobStore, sha256 } from "@/lib/storage";

import { handle } from "../worker/src/index.js";

const enc = (s: string) => new TextEncoder().encode(s);

/** Stands in for the bucket binding a Worker is given. */
function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async get(key: string, options?: { range?: { offset: number; length: number } }) {
      const whole = objects.get(key);
      if (!whole) return null;
      const bytes = options?.range ? whole.slice(options.range.offset, options.range.offset + options.range.length) : whole;
      return { body: bytes, size: bytes.byteLength, json: async () => JSON.parse(new TextDecoder().decode(bytes)) };
    },
    async head(key: string) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
    async put(key: string, bytes: ArrayBuffer) {
      objects.set(key, new Uint8Array(bytes));
    },
  };
}

const FILES = new Map([
  ["index.html", enc("<h1>Lantern Bay</h1>")],
  ["assets/game.js", enc("console.log('play')")],
]);

/** Publish a game the way the app does, into a bucket the Worker then reads. */
async function setup(state: Game["state"] = "HOSTED", source: Version["source"] = { kind: "zip" }, FETCH?: typeof fetch) {
  const bucket = fakeBucket();
  const store = new MemoryBlobStore();
  const version = await buildVersion(store, FILES, source);
  const game = addVersion(
    { slug: "lantern-bay", title: "Lantern Bay", state, versions: [], activeVersionId: null, createdAt: "" },
    version,
  );
  for (const bytes of FILES.values()) bucket.objects.set(blobKey(sha256(bytes)), bytes);
  bucket.objects.set(liveKey(game.slug), enc(JSON.stringify(liveRecord(game))));
  const env = { BUCKET: bucket, PLAY_HOST: "launchtitle.games", FRAME_ANCESTORS: "https://launchtitle.gg", FETCH };
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

  it("sends part of a file when asked, as phones require for sound and video", async () => {
    const { ask } = await setup();
    const url = "https://lantern-bay.launchtitle.games/assets/game.js";
    const whole = "console.log('play')";

    const full = await ask(url);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(full.headers.get("content-length")).toBe(String(whole.length));

    const first = await ask(url, { headers: { range: "bytes=0-1" } });
    expect(first.status).toBe(206);
    expect(first.headers.get("content-range")).toBe(`bytes 0-1/${whole.length}`);
    expect(first.headers.get("content-length")).toBe("2");
    expect(await first.text()).toBe("co");

    const rest = await ask(url, { headers: { range: "bytes=8-" } });
    expect(rest.status).toBe(206);
    expect(await rest.text()).toBe(whole.slice(8));

    const tail = await ask(url, { headers: { range: "bytes=-6" } });
    expect(await tail.text()).toBe(whole.slice(-6));

    const beyond = await ask(url, { headers: { range: "bytes=0-99999" } });
    expect(beyond.headers.get("content-range")).toBe(`bytes 0-${whole.length - 1}/${whole.length}`);

    const past = await ask(url, { headers: { range: "bytes=500-" } });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe(`bytes */${whole.length}`);

    const odd = await ask(url, { headers: { range: "bytes=0-1,4-5" } });
    expect(odd.status).toBe(200);
    expect(await odd.text()).toBe(whole);
  });

  describe("a file the copy lacks", () => {
    const SITE = "https://macaw.example/play/";
    /** The creator's site: one model, a front page for anything else, and a redirect off-site. */
    function origin() {
      const asked: string[] = [];
      const fetchImpl = (async (input: RequestInfo | URL) => {
        const url = String(input);
        asked.push(url);
        const respond = (body: string, type: string, at = url) => {
          const res = new Response(body, { status: 200, headers: { "content-type": type } });
          Object.defineProperty(res, "url", { value: at });
          return res;
        };
        if (url === `${SITE}models/tree-palm.glb`) return respond("palm", "model/gltf-binary");
        if (url === `${SITE}moved.png`) return respond("elsewhere", "image/png", "https://other.example/moved.png");
        if (url === `${SITE}gone.png`) return new Response("no", { status: 404 });
        return respond("<html>front page</html>", "text/html");
      }) as typeof fetch;
      return { fetchImpl, asked };
    }

    it("is fetched from the game's own site once, then served from storage", async () => {
      const { fetchImpl, asked } = origin();
      const { ask, bucket } = await setup("HOSTED", { kind: "crawl", url: SITE }, fetchImpl);
      const url = "https://lantern-bay.launchtitle.games/models/tree-palm.glb";

      const first = await ask(url);
      expect(first.status).toBe(200);
      expect(first.headers.get("content-type")).toBe("model/gltf-binary");
      expect(first.headers.get("content-security-policy")).toBe("frame-ancestors https://launchtitle.gg");
      expect(await first.text()).toBe("palm");
      expect([...bucket.objects.keys()].some((key) => key.startsWith("pulled/lantern-bay/") && key.endsWith("/models/tree-palm.glb"))).toBe(true);

      const again = await ask(url, { headers: { range: "bytes=0-1" } });
      expect(again.status).toBe(206);
      expect(await again.text()).toBe("pa");
      expect(asked).toEqual([`${SITE}models/tree-palm.glb`]);
    });

    it("is not found when the site lacks it, answers with its front page, or sends us elsewhere", async () => {
      const { fetchImpl } = origin();
      const { ask, bucket } = await setup("HOSTED", { kind: "crawl", url: SITE }, fetchImpl);
      for (const path of ["/gone.png", "/models/unknown.glb", "/moved.png"]) {
        expect((await ask(`https://lantern-bay.launchtitle.games${path}`)).status, path).toBe(404);
      }
      expect([...bucket.objects.keys()].filter((key) => key.startsWith("pulled/"))).toEqual([]);
    });

    it("is never fetched for a game that was uploaded, which is already whole", async () => {
      const { fetchImpl, asked } = origin();
      const { ask } = await setup("HOSTED", { kind: "zip" }, fetchImpl);
      expect((await ask("https://lantern-bay.launchtitle.games/models/tree-palm.glb")).status).toBe(404);
      expect(asked).toEqual([]);
    });

    it("knows the folder a game was copied from", () => {
      expect(sourceFolder("https://macaw.example/")).toBe("https://macaw.example/");
      expect(sourceFolder("https://macaw.example/play")).toBe("https://macaw.example/play/");
      expect(sourceFolder("https://macaw.example/play/index.html")).toBe("https://macaw.example/play/");
      expect(sourceFolder("http://macaw.example/")).toBeNull();
      expect(sourceFolder("nonsense")).toBeNull();
    });
  });
});
