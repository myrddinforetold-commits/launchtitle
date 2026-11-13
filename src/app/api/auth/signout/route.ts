import { NextResponse, type NextRequest } from "next/server";

import { accounts, SESSION_COOKIE } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { appOrigin } = getConfig();
  // Only this site's own sign-out button may sign someone out.
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  await (await accounts())?.endSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.redirect(new URL("/", appOrigin), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
