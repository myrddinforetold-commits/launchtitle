import { NextResponse, type NextRequest } from "next/server";

import { accounts, currentUser } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const ROLES = new Set(["player", "creator", "curator"]);

export async function POST(request: NextRequest) {
  const { appOrigin } = getConfig();
  // A form post always carries its origin. Refuse anything that does not come from this site.
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const me = await currentUser();
  if (me?.role !== "admin") return NextResponse.json({ error: "Not found." }, { status: 404 });

  const form = await request.formData();
  const userId = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "");
  if (!ROLES.has(role)) return NextResponse.json({ error: "Unknown role." }, { status: 400 });

  await (await accounts())?.setRole(userId, role as "player" | "creator" | "curator");
  console.log(`admin: @${me.handle} set user ${userId} to ${role}`);
  return NextResponse.redirect(new URL("/admin", appOrigin), 303);
}
