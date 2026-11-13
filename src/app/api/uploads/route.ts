import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { canSubmit } from "@/lib/auth/sessions";
import { randomToken } from "@/lib/auth/x";
import { getConfig, LIMITS } from "@/lib/config";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** Give a signed-in creator a one-off address to upload a zip to. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== getConfig().appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to add a game." }, { status: 401 });
  if (!canSubmit(user)) return NextResponse.json({ error: "Adding games is by invitation for now." }, { status: 403 });

  const { uploads } = openStores();
  if (!uploads) return NextResponse.json({ error: "Uploads are not set up." }, { status: 503 });

  const id = randomToken();
  return NextResponse.json(
    { id, url: await uploads.begin(user.id, id), maxBytes: LIMITS.maxBytes },
    { headers: { "cache-control": "no-store" } },
  );
}
