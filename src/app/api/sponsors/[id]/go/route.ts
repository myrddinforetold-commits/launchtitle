import { NextResponse } from "next/server";

import { sponsors } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** A sponsor's link passes through here so the click is counted. Only links an admin saved are ever followed. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = await (await sponsors())?.click(id).catch(() => null);
  return NextResponse.redirect(url ?? new URL("/", getConfig().appOrigin), 302);
}
