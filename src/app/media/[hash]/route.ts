import { sniffImage } from "@/lib/images";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/**
 * Serve a cover image from file storage. File storage also holds game files,
 * so this answers only for bytes that really are a PNG, JPEG or WebP, and
 * labels them as exactly that. Nothing else in storage can be reached from the store's own address.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return new Response("Not found", { status: 404 });
  const bytes = await openStores().store.get(hash);
  const type = bytes && sniffImage(bytes);
  if (!bytes || !type) return new Response("Not found", { status: 404 });
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": type,
      // The address is the hash of the contents, so it can be cached forever.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
