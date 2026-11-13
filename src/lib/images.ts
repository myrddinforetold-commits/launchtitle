/** Cover images are small enough to pass through the app, which caps a request at a few megabytes. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Decide what an image is from its first bytes, never from its name or the
 * type the browser claimed. Anything else, including SVG and HTML, is not an image here.
 */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}
