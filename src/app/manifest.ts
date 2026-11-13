import type { MetadataRoute } from "next";

/** Lets a phone add Launch Title to its home screen, where it opens without the browser's own bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Launch Title",
    short_name: "Launch Title",
    description: "A store for new web games. Every game deserves a launch.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b14",
    theme_color: "#070b14",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
