import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GAME_FRAME_ALLOW, GAME_FRAME_SANDBOX, playUrl } from "@/lib/frame";
import { MemoryGameRepo, rollback } from "@/lib/games";
import { importZip } from "@/lib/import";
import { createPlayHandler } from "@/lib/play";
import { MemoryBlobStore } from "@/lib/storage";

const PLAY_HOST = "play.test";
const APP_ORIGIN = "https://app.test";
const deps = { repo: new MemoryGameRepo(), store: new MemoryBlobStore() };
let server: Server;
let port: number;

type Reply = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

function get(host: string, path = "/", options: { method?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: { host, ...options.headers } },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  await importZip(deps, "Lantern Bay", zipSync({ "index.html": strToU8("<h1>bay v1</h1>"), "js/app.js": strToU8("1") }));
  await importZip(deps, "Dust Circuit", zipSync({ "index.html": strToU8("<h1>dust</h1>"), "secret.txt": strToU8("dust only") }));
  const handle = createPlayHandler({ ...deps, playHost: PLAY_HOST, appOrigin: APP_ORIGIN });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("play domain", () => {
  it("serves each game on its own subdomain", async () => {
    const bay = await get(`lantern-bay.${PLAY_HOST}`);
    expect(bay.status).toBe(200);
    expect(bay.body).toBe("<h1>bay v1</h1>");
    expect(bay.headers["content-type"]).toBe("text/html; charset=utf-8");

    const script = await get(`lantern-bay.${PLAY_HOST}`, "/js/app.js");
    expect(script.headers["content-type"]).toBe("text/javascript; charset=utf-8");

    // One game cannot be reached through another game's address.
    expect((await get(`dust-circuit.${PLAY_HOST}`, "/secret.txt")).body).toBe("dust only");
    expect((await get(`lantern-bay.${PLAY_HOST}`, "/secret.txt")).status).toBe(404);
  });

  it("never sets a cookie and only lets the app frame it", async () => {
    for (const reply of [await get(`lantern-bay.${PLAY_HOST}`), await get(`nope.${PLAY_HOST}`), await get("other.test")]) {
      expect(reply.headers["set-cookie"]).toBeUndefined();
      expect(reply.headers["content-security-policy"]).toBe(`frame-ancestors ${APP_ORIGIN}`);
      expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  it("is read-only and has no other surface", async () => {
    expect((await get(`lantern-bay.${PLAY_HOST}`, "/", { method: "POST" })).status).toBe(405);
    expect((await get(`lantern-bay.${PLAY_HOST}`, "/", { method: "DELETE" })).status).toBe(405);
    expect((await get(PLAY_HOST)).status).toBe(404);
    expect((await get(`www.${PLAY_HOST}`)).status).toBe(404);
    expect((await get(`lantern-bay.${PLAY_HOST}.evil.test`)).status).toBe(404);
    expect((await get(`a.b.${PLAY_HOST}`)).status).toBe(404);
  });

  it("refuses path tricks", async () => {
    for (const path of ["/%2e%2e/dust-circuit/secret.txt", "/js/%2e%2e/%2e%2e/secret.txt", "/js%5capp.js", "/%00", "/__proto__", "/constructor"]) {
      const reply = await get(`lantern-bay.${PLAY_HOST}`, path);
      expect([400, 404], path).toContain(reply.status);
    }
  });

  it("revalidates with an etag", async () => {
    const first = await get(`lantern-bay.${PLAY_HOST}`);
    const etag = String(first.headers.etag);
    expect(first.headers["cache-control"]).toBe("no-cache");
    const second = await get(`lantern-bay.${PLAY_HOST}`, "/", { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
  });

  it("serves the live version, follows a rollback, and stops for a paused game", async () => {
    const v2 = await importZip(deps, "Lantern Bay", zipSync({ "index.html": strToU8("<h1>bay v2</h1>") }));
    expect((await get(`lantern-bay.${PLAY_HOST}`)).body).toBe("<h1>bay v2</h1>");
    // A file that only existed in the old version is gone from the live one.
    expect((await get(`lantern-bay.${PLAY_HOST}`, "/js/app.js")).status).toBe(404);

    await deps.repo.save(rollback(v2, v2.versions[0].id));
    expect((await get(`lantern-bay.${PLAY_HOST}`)).body).toBe("<h1>bay v1</h1>");

    await deps.repo.save({ ...v2, state: "PAUSED" });
    expect((await get(`lantern-bay.${PLAY_HOST}`)).status).toBe(410);
  });
});

describe("game frame", () => {
  it("cannot navigate the console away, open popups or submit forms", () => {
    const granted = GAME_FRAME_SANDBOX.split(" ");
    expect(granted).toEqual(["allow-scripts", "allow-same-origin", "allow-pointer-lock"]);
    for (const denied of ["allow-top-navigation", "allow-popups", "allow-forms", "allow-modals"]) {
      expect(granted).not.toContain(denied);
    }
    expect(GAME_FRAME_ALLOW).toBe("fullscreen; gamepad; autoplay");
  });

  it("is always loaded from a different origin than the app", () => {
    process.env.LT_PLAY_HOST = "play.localhost:4001";
    process.env.LT_APP_ORIGIN = "http://localhost:3000";
    const url = new URL(playUrl("lantern-bay"));
    expect(url.host).toBe("lantern-bay.play.localhost:4001");
    expect(url.origin).not.toBe("http://localhost:3000");
  });
});
