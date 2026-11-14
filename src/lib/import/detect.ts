/**
 * Signs in a game's own code that it needs a server to run. A copy of such a
 * game loads its menu and then stalls, so it should play from its creator's
 * site instead. This reads the code; it does not run it, so it is a strong
 * hint and not a proof.
 */
const SIGNS: { reason: string; pattern: RegExp }[] = [
  { reason: "opens a live connection to a server", pattern: /new\s+WebSocket\s*\(|new\s+EventSource\s*\(|["'`]wss:\/\// },
  { reason: "uses a multiplayer service", pattern: /socket\.io|colyseus|partykit|liveblocks|\bably\b|pusher-js|playroomkit/i },
  {
    reason: "uses an online database or accounts",
    pattern: /supabase\.co|@supabase\/|firebaseio\.com|firestore\.googleapis|firebaseapp\.com|convex\.cloud|pocketbase|playfab|clerk\.(?:com|dev)|next-auth/i,
  },
  { reason: "calls its own server", pattern: /fetch\(\s*["'`]\/api\/|["'`]\/api\/[a-z][\w/-]*["'`]|["'`]\/trpc\// },
];

const CODE = /\.(?:m?js|html?)$/i;
const MAX_SCAN_BYTES = 40 * 1024 * 1024;

export function serverSigns(files: Iterable<readonly [string, Uint8Array]>): string[] {
  const found = new Set<string>();
  const decoder = new TextDecoder();
  let scanned = 0;
  for (const [name, bytes] of files) {
    if (!CODE.test(name) || scanned + bytes.byteLength > MAX_SCAN_BYTES) continue;
    scanned += bytes.byteLength;
    const text = decoder.decode(bytes);
    for (const sign of SIGNS) if (!found.has(sign.reason) && sign.pattern.test(text)) found.add(sign.reason);
    if (found.size === SIGNS.length) break;
  }
  return [...found];
}

/** Art, sound, models and data: the files a game fetches while it runs. */
const RUNTIME_EXT = "glb|gltf|bin|ktx2|hdr|png|jpe?g|webp|avif|gif|mp3|ogg|wav|m4a|mp4|webm|wasm|data|json";
// A path with a ${...} in the middle or at the end, such as `models/${name}.glb`.
// A ${...} only at the very start is a folder prefix and is fine: the copier follows those.
const BUILT_NAME = new RegExp(`\`[^\`\\n]{0,160}[\\w/.-]\\$\\{[^}\`]{1,60}\\}[^\`\\n]{0,60}\\.(?:${RUNTIME_EXT})\``, "i");

/**
 * Signs that a copy made by following links would be missing files. A game
 * that builds file names as it runs (`models/${name}.glb`) asks for files the
 * copier never saw. Such a game should play from its creator's site, or be
 * uploaded whole as a zip.
 */
export function copyGaps(files: Iterable<readonly [string, Uint8Array]>): string[] {
  const decoder = new TextDecoder();
  let scanned = 0;
  for (const [name, bytes] of files) {
    if (!CODE.test(name) || scanned + bytes.byteLength > MAX_SCAN_BYTES) continue;
    scanned += bytes.byteLength;
    if (BUILT_NAME.test(decoder.decode(bytes))) return ["builds the names of its files as it runs, so a copy would be missing some"];
  }
  return [];
}
