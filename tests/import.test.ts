import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { ImportError, normalizePath, prepareFiles } from "@/lib/files";
import { addVersion, buildVersion, isValidSlug, MemoryGameRepo, rollback, slugify, type Game } from "@/lib/games";
import { importUrl, importZip } from "@/lib/import";
import { crawlSite, isPrivateHost } from "@/lib/import/crawl";
import { filesFromZip } from "@/lib/import/zip";
import { MemoryBlobStore } from "@/lib/storage";

const u8 = strToU8;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof ImportError ? error.code : `other: ${error}`;
  }
  return "no error";
};

describe("file paths", () => {
  it("refuses paths that leave the game folder", () => {
    for (const bad of ["../evil.js", "a/../../evil.js", "/etc/passwd", "C:/x.js", "a\\b.js", "a\0.js"]) {
      expect(code(() => normalizePath(bad)), bad).toBe("unsafe_path");
    }
  });

  it("skips folders, dotfiles and archive junk", () => {
    expect(normalizePath("assets/")).toBeNull();
    expect(normalizePath(".git/config")).toBeNull();
    expect(normalizePath("__MACOSX/index.html")).toBeNull();
    expect(normalizePath("./assets/./a.png")).toBe("assets/a.png");
  });

  it("unwraps a single top-level folder", () => {
    const files = prepareFiles([
      ["my-game/index.html", u8("<p>hi</p>")],
      ["my-game/js/app.js", u8("1")],
    ]);
    expect([...files.keys()].sort()).toEqual(["index.html", "js/app.js"]);
  });

  it("needs an index.html at the top", () => {
    expect(code(() => prepareFiles([["a/x.js", u8("1")], ["b/index.html", u8("x")]]))).toBe("no_index");
    expect(code(() => prepareFiles([]))).toBe("empty");
  });

  it("enforces the file count limit", () => {
    const many = Array.from({ length: 2001 }, (_, i) => [`f${i}.txt`, u8("x")] as const);
    expect(code(() => prepareFiles([["index.html", u8("x")], ...many]))).toBe("too_many_files");
  });
});

describe("zip import", () => {
  it("reads a zip and refuses a zip that escapes its folder", () => {
    const good = zipSync({ "index.html": u8("<h1>ok</h1>"), "a/b.js": u8("1") });
    expect(filesFromZip(good).map(([name]) => name).sort()).toEqual(["a/b.js", "index.html"]);

    const slip = zipSync({ "index.html": u8("x"), "../evil.js": u8("boom") });
    expect(code(() => prepareFiles(filesFromZip(slip)))).toBe("unsafe_path");
    expect(code(() => filesFromZip(u8("this is not a zip")))).toBe("bad_zip");
  });

  it("publishes a game, then a second version under the same name", async () => {
    const deps = { repo: new MemoryGameRepo(), store: new MemoryBlobStore() };
    const first = await importZip(deps, "Lantern Bay", zipSync({ "index.html": u8("v1") }));
    expect(first.slug).toBe("lantern-bay");
    expect(first.state).toBe("HOSTED");
    expect(first.versions).toHaveLength(1);

    const second = await importZip(deps, "Lantern Bay", zipSync({ "index.html": u8("v2") }));
    expect(second.versions).toHaveLength(2);
    expect(second.activeVersionId).toBe(second.versions[1].id);

    // The same build again adds nothing.
    const again = await importZip(deps, "Lantern Bay", zipSync({ "index.html": u8("v2") }));
    expect(again.versions).toHaveLength(2);
  });
});

describe("versions", () => {
  it("gives the same build the same id, and can roll back", async () => {
    const store = new MemoryBlobStore();
    const a = await buildVersion(store, new Map([["index.html", u8("one")]]), { kind: "zip" });
    const b = await buildVersion(store, new Map([["index.html", u8("one")]]), { kind: "zip" });
    const c = await buildVersion(store, new Map([["index.html", u8("two")]]), { kind: "zip" });
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);

    let game: Game = { slug: "demo", title: "Demo", state: "HOSTED", versions: [], activeVersionId: null, createdAt: "" };
    game = addVersion(addVersion(game, a), c);
    expect(game.activeVersionId).toBe(c.id);
    game = rollback(game, a.id);
    expect(game.activeVersionId).toBe(a.id);
    expect(game.versions).toHaveLength(2);
    expect(() => rollback(game, "nope")).toThrow();
  });

  it("only allows slugs that work as a subdomain", () => {
    expect(isValidSlug("lantern-bay")).toBe(true);
    for (const bad of ["", "ab", "-abc", "abc-", "Has Caps", "a.b", "www", "api", "x".repeat(41)]) {
      expect(isValidSlug(bad), bad).toBe(false);
    }
    expect(slugify("  Night Ferry!! ")).toBe("night-ferry");
    expect(isValidSlug(slugify("雾锁山门"))).toBe(true);
  });
});

function fakeSite(pages: Record<string, { body: string; type?: string; redirectTo?: string }>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const page = pages[url];
    if (!page) return new Response("missing", { status: 404 });
    const response = new Response(page.body, { headers: { "content-type": page.type ?? "text/html" } });
    Object.defineProperty(response, "url", { value: page.redirectTo ?? url });
    return response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("crawl import", () => {
  const site = {
    "https://games.example/boat/": {
      body: `<link rel="stylesheet" href="style.css"><script src="./js/app.js"></script>
             <img src="https://cdn.other.example/logo.png"><a href="/elsewhere/page.html">x</a>
             <script src="https://games.example/boat/vendor.js"></script>`,
    },
    "https://games.example/boat/style.css": { body: `body{background:url("img/bg.png")}`, type: "text/css" },
    "https://games.example/boat/js/app.js": { body: `load("assets/level1.json")`, type: "text/javascript" },
    "https://games.example/boat/vendor.js": { body: "1", type: "text/javascript" },
    "https://games.example/boat/img/bg.png": { body: "png", type: "image/png" },
    "https://games.example/boat/assets/level1.json": { body: "{}", type: "application/json" },
    "https://games.example/elsewhere/page.html": { body: "should not be copied" },
  };

  it("copies same-site files under the game's folder and lists other hosts", async () => {
    const { fetchImpl } = fakeSite(site);
    const result = await crawlSite("https://games.example/boat/", { fetchImpl });
    expect(result.files.map(([name]) => name).sort()).toEqual([
      "assets/level1.json",
      "img/bg.png",
      "index.html",
      "js/app.js",
      "style.css",
      "vendor.js",
    ]);
    expect(result.externalDomains).toEqual(["cdn.other.example"]);
  });

  it("refuses private addresses and cross-site redirects", async () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.5", "169.254.169.254", "172.20.0.1", "[::1]", "db.internal"]) {
      expect(isPrivateHost(host.replace(/^\[|\]$/g, "")), host).toBe(true);
      await expect(crawlSite(`http://${host}/`)).rejects.toMatchObject({ code: "blocked_host" });
    }
    expect(isPrivateHost("games.example")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);

    const { fetchImpl } = fakeSite({
      "https://games.example/boat/": { body: "x", redirectTo: "https://evil.example/boat/" },
    });
    await expect(crawlSite("https://games.example/boat/", { fetchImpl })).rejects.toMatchObject({ code: "fetch_failed" });
    await expect(crawlSite("ftp://games.example/x")).rejects.toMatchObject({ code: "bad_url" });
  });

  it("imports a crawled game end to end", async () => {
    const deps = { repo: new MemoryGameRepo(), store: new MemoryBlobStore() };
    const { fetchImpl } = fakeSite(site);
    const game = await importUrl(deps, "Boat", "https://games.example/boat/", { fetchImpl });
    expect(game.slug).toBe("boat");
    expect(game.versions[0].source).toEqual({ kind: "crawl", url: "https://games.example/boat/" });
    expect(game.versions[0].externalDomains).toEqual(["cdn.other.example"]);
  });
});

describe("the downloadable skill", () => {
  it("is the same skill as the one in the repository, in a folder named after it", async () => {
    const { readFile } = await import("node:fs/promises");
    const { filesFromZip } = await import("@/lib/import/zip");
    const files = filesFromZip(new Uint8Array(await readFile("public/launch-title-game.zip")));
    expect(files.map(([name]) => name)).toEqual(["launch-title-game/SKILL.md"]);
    expect(new TextDecoder().decode(files[0][1])).toBe(await readFile("skills/launch-title-game/SKILL.md", "utf8"));
  });
});
