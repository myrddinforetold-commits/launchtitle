import { isOptional, verdict, type Observations, type Verdict } from "./verdict";

export type CheckResult = Verdict & {
  /** Pictures of the game running, as JPEG, with flat and repeated ones left out. */
  shots: Uint8Array[];
};

export type Checker = (url: string, options?: { phone?: boolean }) => Promise<CheckResult>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A picture is blank when every channel is one flat colour, give or take compression noise. */
async function isBlank(jpeg: Uint8Array): Promise<boolean> {
  const { default: sharp } = await import("sharp");
  const { channels } = await sharp(jpeg).stats();
  return channels.every((channel) => channel.stdev < 2.5);
}

/** The whole check must fit in this. Heavy 3D games draw slowly in a browser with no graphics card. */
const BUDGET_MS = 55_000;
/** One picture may take this long. A picture that takes longer is skipped, not waited for. */
const SHOT_MS = 8_000;

const within = <T,>(work: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/**
 * Opens a game in a hidden browser, the way a player's browser would, and
 * reports what happened: did the page load, were files missing, did it draw.
 * It presses Enter and Space and clicks the middle, since many games wait on
 * a title screen. It keeps to a time budget: when a game is too slow to
 * picture, the verdict rests on whether it loaded and found its files.
 * Throws only if the browser itself could not be run.
 */
export const bootCheck: Checker = async (url, options = {}) => {
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);
  const { default: puppeteer } = await import("puppeteer-core");
  // On the server the browser comes from a package built for it. Locally, point CHROME_PATH at any Chrome.
  const local = process.env.CHROME_PATH;
  const chromium = local ? null : (await import("@sparticuz/chromium")).default;
  const browser = await puppeteer.launch({
    executablePath: local ?? (await chromium!.executablePath()),
    // Software drawing, so games that use 3D still draw without a graphics card.
    args: [...(chromium?.args ?? ["--no-sandbox"]), "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
    headless: true,
  });
  console.log(`check: browser ready in ${Date.now() - started} ms for ${url}`);
  try {
    const page = await browser.newPage();
    const size = options.phone ? { width: 390, height: 780 } : { width: 1280, height: 720 };
    await page.setViewport({ ...size, deviceScaleFactor: 1, isMobile: Boolean(options.phone), hasTouch: Boolean(options.phone) });

    const origin = new URL(url).origin;
    const seen: Observations = { loaded: false, missing: [], errors: [], blank: [] };
    const miss = (address: string) => {
      const at = new URL(address);
      if (at.origin !== origin || isOptional(at.pathname)) return;
      const path = at.pathname.replace(/^\/+/, "");
      if (!seen.missing.includes(path)) seen.missing.push(path);
    };
    let inFlight = 0;
    page.on("request", () => (inFlight += 1));
    page.on("requestfinished", () => (inFlight -= 1));
    page.on("requestfailed", (request) => {
      inFlight -= 1;
      // A browser cancelling its own request (a video it stopped loading) is not a missing file.
      if (request.failure()?.errorText !== "net::ERR_ABORTED") miss(request.url());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) miss(response.url());
    });
    page.on("pageerror", (error) => seen.errors.push(error instanceof Error ? error.message : String(error)));

    try {
      // The page's own files are enough to call it loaded; a slow game keeps loading while we watch.
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      seen.loaded = Boolean(response && response.status() < 400);
    } catch {
      seen.loaded = false;
    }
    const shots: Uint8Array[] = [];
    if (seen.loaded) {
      // Give the game time to fetch what it needs: until the network goes quiet, up to twelve seconds.
      for (let waited = 0, quiet = 0; waited < 12_000 && quiet < 1_500 && left() > 25_000; waited += 250) {
        await sleep(250);
        quiet = inFlight <= 0 ? quiet + 250 : 0;
      }
      const snap = async () => {
        if (left() < SHOT_MS) return;
        const jpeg = await within(page.screenshot({ type: "jpeg", quality: 82 }), SHOT_MS).catch(() => null);
        if (!jpeg) return;
        const blank = await isBlank(jpeg);
        seen.blank.push(blank);
        if (!blank && !shots.some((shot) => Buffer.compare(shot, jpeg) === 0)) shots.push(jpeg);
      };
      const poke = async (y: number) => {
        await within(page.mouse.click(size.width / 2, size.height * y), 2_000).catch(() => {});
        await within(page.keyboard.press("Enter"), 2_000).catch(() => {});
        await within(page.keyboard.press("Space"), 2_000).catch(() => {});
      };
      await sleep(1_500);
      await snap();
      // Get past a title screen.
      await poke(0.5);
      await sleep(Math.max(0, Math.min(3_000, left() - SHOT_MS)));
      await snap();
      await poke(0.6);
      await sleep(Math.max(0, Math.min(3_000, left() - SHOT_MS)));
      await snap();
    }
    const result = verdict(seen);
    console.log(
      `check: ${url} ${result.ok ? "passed" : "failed"} in ${Date.now() - started} ms; pictures ${seen.blank.length}, missing ${seen.missing.length}, errors ${seen.errors.length}`,
    );
    return { ...result, shots };
  } finally {
    // Closing politely can hang on a busy page. Give it a moment, then stop the browser outright.
    if ((await within(browser.close().then(() => true), 3_000).catch(() => null)) === null) browser.process()?.kill("SIGKILL");
  }
};
