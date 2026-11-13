# Launch Title

A console-style home for AI-made web games. Anyone tags a game on X, the creator confirms, the game is hosted here, and it plays inside one place that feels like a console. Creators keep 80% of what their game earns.

- App: `launchtitle.gg`
- Bot: `@launchtitlegg`

## Status

Planning and design are done. No product code exists yet. The next step is milestone 0 (the manual pilot), then milestone 1 (the hosting core).

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

## Where to start building

Read `docs/spec.md`, section "Build order". Milestone 1 does not depend on the brand. Milestone 2 does: use `brand/tokens.json`, `brand/brand-book.md` and `design/screens/`.

## Open decisions

The spec's last section lists them. The ones that block engineering are the second domain for serving games and the payout rail for version 1.
