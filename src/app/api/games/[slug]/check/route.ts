import { after, NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/current";
import { getConfig } from "@/lib/config";
import { canManage } from "@/lib/manage";
import { openStores } from "@/lib/stores";

export const dynamic = "force-dynamic";

/** For the people who manage a game: run its start-up check again, or list it without passing. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { appOrigin } = getConfig();
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { slug } = await params;
  const user = await currentUser();
  const { repo } = openStores();
  const game = await repo.get(slug);
  if (!user || !game || !canManage(user, game)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const page = new URL(`/games/${slug}`, appOrigin);
  page.hash = "manage";
  const at = new Date().toISOString();
  if (String((await request.formData()).get("action") ?? "") === "list") {
    await repo.save({ ...game, check: { state: "skipped", note: `Listed by @${user.handle} without passing the start-up check.`, at } });
    console.log(`check: @${user.handle} listed ${slug} without the check`);
    page.searchParams.set("note", "Listed. It now shows in the store.");
  } else {
    await repo.save({ ...game, check: { state: "pending", at } });
    after(() => fetch(new URL("/api/cron/checks", appOrigin)).catch(() => {}));
    page.searchParams.set("note", "Checking again. Reload in a minute to see the result.");
  }
  return NextResponse.redirect(page, 303);
}
