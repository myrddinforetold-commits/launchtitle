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
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | unset | The X app's OAuth 2.0 client, for sign-in. Unset, sign-in is switched off |
| `LT_ADMIN_HANDLES` | unset | X handles, comma-separated, that become admins when they sign in |
| `LT_BOT_HANDLE` | `launchtitlegg` | The X account the bot reads mentions of and posts as |
| `LT_BOT_DAILY_REPLIES` | `100` | The most replies the bot may post in any 24 hours |
| `LT_DATA_DIR` | `./.data` | Local fallback for game files and game records |
| `LT_PLAY_HOST` | `play.localhost:4001` | Host that serves games, at `{slug}.<host>` |
| `LT_PLAY_SCHEME` | `http` | `https` in production |
| `LT_APP_ORIGIN` | `http://localhost:3000` | The only origin allowed to frame a game |
| `LT_OPEN_IMPORT` | off | Allow imports without sign-in (local only) |

### Database

Game records live in Postgres (Neon, attached to the Vercel project as `launchtitle-db`). Schema changes are numbered SQL files in `db/migrations/`. `npm run migrate` applies the ones a database has not seen; Vercel runs it before each production build. Each file must be safe to run twice.

Preview deployments share the production database for now, so preview builds do not migrate. Give previews their own Neon branch before a second person works on the schema.

Tests run against a real Postgres inside the test process, so they need no database.

### Sign-in

People sign in with X (OAuth 2.0 with PKCE). We ask only to read who they are, match them on X's permanent account id, and keep the session in Postgres: the cookie holds a random value and the database holds only its hash. The X app's callback address must be `{LT_APP_ORIGIN}/api/auth/x/callback`.

### Adding games

During the pilot, adding games is by invitation. Admins come from `LT_ADMIN_HANDLES`; an admin makes someone a creator at `/admin`. A creator's browser uploads the zip straight to the bucket through a one-off address that lasts ten minutes, then the app unpacks it from there. A game's name belongs to whoever added it first: only they, or an admin, can publish a new build of it.

The bucket needs a CORS rule allowing `PUT` from the store's origin.

A game can arrive four ways as a copy: a zip, a single HTML page, pasted code, or a link to where it is already hosted (the app copies its static files). A fifth way keeps the game where it is: a **linked** game is listed in the store but plays from its creator's own site, framed in the store's player. That is for games that need their own server, which a copy cannot run. The creator's site must allow the store to frame it; the app checks this up front and says so if not. Uploading a fresh copy later switches a linked game back.

When a game comes in by link, either way, the app fills a blank cover and description from the preview image and description the game's page declares. Each game has a description and a cover image, shown on its page and on the store's front. Cover images are served from `/media/{hash}`, which answers only for real PNG, JPEG or WebP data, so game files in the same storage can never be reached from the store's own address.

Creators can pause and restore their own games. Admins can also remove a game, at `/admin`. A paused or removed game stops being served at once.

### The tag-to-add bot

Every five minutes Vercel calls `/api/cron/bot`, which runs one pass: read new mentions of the bot account, bring in games an admin has approved, post queued replies, and expire requests a creator never answered.

- `@bot add` under a post with a game link asks to add your own game. `@bot add @creator` nominates someone else's, and waits for that creator to reply `yes` or `no` from their own account. `@bot remove`, from the creator, takes a live game down.
- Nothing goes live without an admin approving it at `/admin`, where the game is also given its name. Approve reads the game's code: a game that runs entirely in the browser is copied, and one that shows signs of needing a server is linked to play from its creator's site. The request records which was chosen and why. Copy and Link force one or the other.
- A creator who says no is remembered: later requests for the same link are turned away.
- Replies are plain text, except the one that says a game is live, which carries its link.
- An admin connects the bot account once, from `/admin`. Its X tokens are kept in the `bot` table.
- The pass needs no secret. It never runs more than once a minute, and calling it by hand does nothing the schedule would not.

### File storage

Game files live in a private Cloudflare R2 bucket (`launchtitle-games`), keyed by the hash of their contents. The app also writes one small file per game, `live/{slug}.json`, saying which build is live.

### Play domain

`worker/` is a Cloudflare Worker on `*.launchtitle.games`. It reads the bucket and nothing else: the live file tells it which files a game has, and it serves them with the same rules as the local play server (read-only, no cookies, framing limited to the store). It has no dependencies and is deployed exactly as written, with `npx wrangler deploy` from `worker/`.

`GET /api/health` reports whether the deployment can reach its database, its bucket and the play domain. For the last, it publishes a tiny built-in page at `lt-probe.launchtitle.games` and loads it.

### What milestone 1 still needs

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
| `src/`, `play/`, `tests/` | The app, the local play server and their tests |
| `worker/` | The play domain: the Cloudflare Worker that serves games on `launchtitle.games` |
| `skills/launch-title-game/` | A skill that teaches an assistant to build a store-ready game and how to publish it |
| `db/migrations/`, `scripts/` | Database schema changes and the script that applies them |

## Where to start building

Read `docs/spec.md`, section "Build order". Milestone 1 does not depend on the brand. Milestone 2 does: use `brand/tokens.json`, `brand/brand-book.md` and `design/screens/`.

## Open decisions

The spec's last section lists them. The ones that block engineering are the second domain for serving games and the payout rail for version 1.
