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

/**
 * Opens a game in a hidden browser, the way a player's browser would, and
 * reports what happened: did the page load, were files missing, did it draw.
 * It presses Enter and Space and clicks the middle, since many games wait on
 * a title screen. Throws only if the browser itself could not be run.
 */
export const bootCheck: Checker = async (url, options = {}) => {
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
      const response = await page.goto(url, { waitUntil: "load", timeout: 25_000 });
      seen.loaded = Boolean(response && response.status() < 400);
    } catch {
      seen.loaded = false;
    }
    const shots: Uint8Array[] = [];
    if (seen.loaded) {
      // Give the game time to fetch what it needs: until the network goes quiet, up to ten seconds.
      for (let waited = 0, quiet = 0; waited < 10_000 && quiet < 1_500; waited += 250) {
        await sleep(250);
        quiet = inFlight <= 0 ? quiet + 250 : 0;
      }
      const snap = async () => {
        const jpeg = await page.screenshot({ type: "jpeg", quality: 82 });
        const blank = await isBlank(jpeg);
        seen.blank.push(blank);
        if (!blank && !shots.some((shot) => Buffer.compare(shot, jpeg) === 0)) shots.push(jpeg);
      };
      await sleep(1_500);
      await snap();
      // Get past a title screen.
      await page.mouse.click(size.width / 2, size.height / 2).catch(() => {});
      await page.keyboard.press("Enter").catch(() => {});
      await page.keyboard.press("Space").catch(() => {});
      await sleep(3_000);
      await snap();
      await page.mouse.click(size.width / 2, size.height * 0.6).catch(() => {});
      await sleep(3_000);
      await snap();
    }
    return { ...verdict(seen), shots };
  } finally {
    await browser.close().catch(() => {});
  }
};
