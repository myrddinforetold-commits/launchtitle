import type { NextConfig } from "next";

/** The hidden browser used by the start-up check ships as files, not code, so they must be listed. */
const BROWSER = ["./node_modules/@sparticuz/chromium/bin/**"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    // The share card reads its fonts and artwork from disk, so they must ship with it.
    "/games/[slug]/opengraph-image": ["./assets/*.woff", "./public/lt-mark.svg", "./public/art/horizon.jpg"],
    "/api/cron/checks": BROWSER,
    "/api/cron/bot": BROWSER,
  },
};

export default nextConfig;
