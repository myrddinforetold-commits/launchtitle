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
