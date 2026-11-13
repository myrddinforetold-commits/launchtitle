import { describe, expect, it } from "vitest";

import { R2BlobStore } from "@/lib/r2";
import { sha256 } from "@/lib/storage";

/** Stands in for R2: remembers what was stored and what was asked. */
function fakeR2() {
  const objects = new Map<string, Uint8Array>();
  const calls: { method: string; url: string; auth: string | null }[] = [];
  const fetch = async (request: Request) => {
    calls.push({ method: request.method, url: request.url, auth: request.headers.get("authorization") });
    const key = new URL(request.url).pathname;
    if (request.method === "PUT") {
      objects.set(key, new Uint8Array(await request.arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    const found = objects.get(key);
    if (!found) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : (found as BodyInit), { status: 200 });
  };
  return { objects, calls, fetch };
}

const options = { accountId: "acct", bucket: "games", accessKeyId: "id", secretAccessKey: "secret" };
const bytes = new TextEncoder().encode("<p>hello</p>");

describe("R2 file storage", () => {
  it("stores a file under its hash and reads it back", async () => {
    const r2 = fakeR2();
    const store = new R2BlobStore({ ...options, fetch: r2.fetch });
    const hash = await store.put(bytes);
    expect(hash).toBe(sha256(bytes));
    expect([...r2.objects.keys()]).toEqual([`/games/blobs/${hash.slice(0, 2)}/${hash}`]);
    expect(await store.get(hash)).toEqual(bytes);
  });

  it("talks to the account's own endpoint and signs every request", async () => {
    const r2 = fakeR2();
    const store = new R2BlobStore({ ...options, fetch: r2.fetch });
    await store.get(await store.put(bytes));
    expect(r2.calls.map((c) => c.method)).toEqual(["HEAD", "PUT", "GET"]);
    for (const call of r2.calls) {
      expect(new URL(call.url).host).toBe("acct.r2.cloudflarestorage.com");
      expect(call.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=id\/\d{8}\/auto\/s3\/aws4_request/);
      expect(call.auth).not.toContain("secret");
    }
  });

  it("does not upload a file it already has", async () => {
    const r2 = fakeR2();
    const store = new R2BlobStore({ ...options, fetch: r2.fetch });
    await store.put(bytes);
    await store.put(bytes);
    expect(r2.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("returns nothing for a missing or malformed hash", async () => {
    const r2 = fakeR2();
    const store = new R2BlobStore({ ...options, fetch: r2.fetch });
    expect(await store.get(sha256("absent"))).toBeNull();
    expect(await store.get("../../etc/passwd")).toBeNull();
    expect(r2.calls).toHaveLength(1);
  });

  it("refuses a stored file that no longer matches its hash", async () => {
    const r2 = fakeR2();
    const store = new R2BlobStore({ ...options, fetch: r2.fetch });
    const hash = await store.put(bytes);
    r2.objects.set(`/games/blobs/${hash.slice(0, 2)}/${hash}`, new TextEncoder().encode("tampered"));
    await expect(store.get(hash)).rejects.toThrow(/does not match/);
  });

  it("reports a storage failure instead of pretending the file was stored", async () => {
    const denied = async () => new Response(null, { status: 403 });
    const store = new R2BlobStore({ ...options, fetch: denied });
    await expect(store.put(bytes)).rejects.toThrow(/403/);
    await expect(store.get(sha256(bytes))).rejects.toThrow(/403/);
  });
});
