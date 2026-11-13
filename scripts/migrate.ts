import { migrate } from "../src/lib/db/migrate";
import { connect, disconnect } from "../src/lib/db/sql";

/**
 * Bring the database up to date. Runs before the production build on Vercel,
 * and by hand with `npm run migrate`. Without DATABASE_URL it does nothing,
 * so a checkout with no database still builds.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.log("migrate: no DATABASE_URL, skipping");
    return;
  }
  // Preview builds share the production database for now, so only production may change it.
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    console.log(`migrate: skipping on a ${process.env.VERCEL_ENV} build`);
    return;
  }
  try {
    const applied = await migrate(await connect(url));
    console.log(applied.length ? `migrate: applied ${applied.join(", ")}` : "migrate: nothing to do");
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  console.error("migrate: failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
