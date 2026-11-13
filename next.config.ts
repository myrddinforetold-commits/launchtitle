import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share card reads its fonts and artwork from disk, so they must ship with it.
  outputFileTracingIncludes: {
    "/games/[slug]/opengraph-image": ["./assets/*.woff", "./public/lt-mark.svg", "./public/art/horizon.jpg"],
  },
};

export default nextConfig;
