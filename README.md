# Launch Title

A console-style home for AI-made web games. Anyone tags a game on X, the creator confirms, the game is hosted here, and it plays inside one place that feels like a console. Creators keep 80% of what their game earns.

- App: `launchtitle.gg`
- Bot: `@launchtitlegg`

## Status

Planning and design are done. Milestone 1 (the hosting core) is in progress: games can be imported from a zip or a public URL, stored as immutable versions, and served from their own subdomain into a sandboxed frame. It runs locally only. Nothing is deployed.

## Run it locally

Needs Node 22.

```sh
npm install
LT_OPEN_IMPORT=1 npm run dev   # the app, on http://localhost:3000
npm run play                   # the play server, on http://{slug}.play.localhost:4001
```

Open http://localhost:3000/submit and import a zip that has `index.html` at its top level. Browsers resolve any `*.localhost` name to your own machine, so each game gets its own origin with no DNS setup.

`LT_OPEN_IMPORT=1` lets anyone import without signing in. It exists for local development and must never be set on a public deployment.

```sh
npm test            # unit and server tests
npm run typecheck
npm run lint
```

| Setting | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | unset | Postgres connection string. Unset, game records go to a JSON file in `LT_DATA_DIR` |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | unset | Cloudflare R2 bucket for game files. Unless all four are set, files go to `LT_DATA_DIR` |
| `LT_DATA_DIR` | `./.data` | Local fallback for game files and game records |
| `LT_PLAY_HOST` | `play.localhost:4001` | Host that serves games, at `{slug}.<host>` |
| `LT_PLAY_SCHEME` | `http` | `https` in production |
| `LT_APP_ORIGIN` | `http://localhost:3000` | The only origin allowed to frame a game |
| `LT_OPEN_IMPORT` | off | Allow imports without sign-in (local only) |

### Database

Game records live in Postgres (Neon, attached to the Vercel project as `launchtitle-db`). Schema changes are numbered SQL files in `db/migrations/`. `npm run migrate` applies the ones a database has not seen; Vercel runs it before each production build. Each file must be safe to run twice.

Preview deployments share the production database for now, so preview builds do not migrate. Give previews their own Neon branch before a second person works on the schema.

Tests run against a real Postgres inside the test process, so they need no database.

### File storage

Game files live in a private Cloudflare R2 bucket (`launchtitle-games`), keyed by the hash of their contents. `GET /api/health` reports whether the deployment can reach its database and its bucket.

### What milestone 1 still needs

- The play server deployed on `launchtitle.games`, reading the same bucket.
- Imports that fit a hosted deployment: uploads go straight to the bucket, since a request to the app is capped at a few megabytes.
- The scan, boot test and screenshot steps of the import pipeline.
- A browser test proving a game frame cannot read the app's cookies or storage. Today's tests prove the server side of that: separate origins, no cookies, framing limited to the app.
- Pinning the resolved IP address when crawling a URL. Today the private-address check looks at the host name only.

## What is in this repo

| Path | What it is |
| --- | --- |
| `docs/spec.md` | The build spec: flows, X bot, verification tiers, hosting and sandbox, console shell, curation, money, data model, stack, and seven milestones with acceptance checks |
| `docs/pilot-games.md` | The 20 candidate games for the pilot, with creators, links and a copyright-risk rating |
| `brand/brand-book.md` | Voice, vocabulary, colour, glass and glow rules, type, shape, artwork, icons |
| `brand/tokens.json` | Design tokens: colours, text styles, spacing, radii, shadows |
| `brand/logo/` | The logo family as SVG and PNG, with usage rules |
| `brand/tools/build_logo.py` | The script that builds the logo files from the mark's geometry |
| `design/` | Reference screens and placeholder artwork for the console shell |
| `src/`, `play/`, `tests/` | The app, the play server and their tests |
| `db/migrations/`, `scripts/` | Database schema changes and the script that applies them |

## Where to start building

Read `docs/spec.md`, section "Build order". Milestone 1 does not depend on the brand. Milestone 2 does: use `brand/tokens.json`, `brand/brand-book.md` and `design/screens/`.

## Open decisions

The spec's last section lists them. The ones that block engineering are the second domain for serving games and the payout rail for version 1.
