---
name: launch-title-game
description: Build or adapt a browser game so it is ready to publish on Launch Title (launchtitle.gg), then walk the person through adding it. Use when someone wants to make a game for Launch Title, or get an existing web game onto it.
---

# Launch Title game

Launch Title (launchtitle.gg) is a store for new web games. Each game is hosted on its own address and played inside the store, on phones and desktops. This skill makes a game that works there first time, and gets it published.

## What to deliver

1. **The game as one file named `index.html`**, saved as a file the person can download. Everything is inside it: markup, styles, script, and any art or sound.
2. **A name**, 80 characters or fewer. The name also becomes the game's address, so keep it short and distinctive.
3. **A description**, one or two sentences, 600 characters at most. Say what the player does, not how the game was made.
4. **A cover image if you can make one**: wide (16:9), at least 1280 by 720, PNG, JPEG or WebP, under 4 MB. If you cannot produce an image file, tell the person to take a wide screenshot of the game in play and use that.

Do not describe the game as AI-made anywhere in the game, its name or its description. On Launch Title a game is just a game.

## How the game must be built

The game runs inside a locked-down frame on its own address. Build for that from the start.

**One self-contained page**
- A single `index.html` with inline `<style>` and `<script>`. No build step, no frameworks that need compiling, no JSX.
- No requests to other sites: no CDNs, web fonts, analytics, ads or remote images. Draw art with canvas or inline SVG, or embed it as data URIs. Use system fonts.
- Keep it under 20 MB. Most games should be far smaller.
- If the game truly needs separate files, deliver a zip instead: `index.html` at the top level, relative paths only, up to 200 MB and 2,000 files.

**What the frame blocks**
- `alert`, `confirm` and `prompt` do nothing. Show messages inside the game.
- Popups, new tabs, and navigating the page away are blocked. Do not link out.
- Form submission is blocked. Handle input with script.
- Saving with `localStorage` works, but wrap it in `try`/`catch` and keep the game playable if it fails.
- Full screen, pointer lock and gamepads are allowed.

**Fit any screen**
- Fill the whole window: `html, body { margin: 0; height: 100%; overflow: hidden }` and a canvas or root element at 100% by 100%.
- Handle `resize`, and lay out from the current size every time. Test in your head at 390 by 844 (phone, portrait) and 1440 by 900 (desktop).
- Scale a canvas by `devicePixelRatio`, capped at 2.
- Set `touch-action: none` on the play surface so the page does not scroll or zoom during play.

**Work with touch, mouse and keyboard**
- Use pointer events so one code path covers mouse and touch.
- Every action must be possible by touch alone. Nothing may depend on hover or on a keyboard.
- Also support keys where it makes sense: arrows and WASD to move, Space or Enter to act and to start.
- Touch targets at least 44 by 44 pixels.

**Behave well**
- Open on a title screen showing the game's name, one line on how to play, and how to start.
- Start, lose and restart without reloading the page.
- Drive motion with `requestAnimationFrame` and elapsed time, and clamp the time step (for example to 50 ms) so a stall does not teleport things.
- Pause when the page is hidden (`visibilitychange`), and stop any sound.
- Start audio only after the player's first tap, click or key press.
- Keep text readable: at least 16 px for anything the player must read, with strong contrast.

**Content**
- Original work only. No characters, names, logos, music or art from existing games, films, shows or brands.
- No sign-ins, payments, wallets, tracking or ads inside the game.

## Check before handing over

Go through this list and fix anything that fails. Tell the person plainly if something could not be checked.

- [ ] One `index.html`, nothing loaded from another site.
- [ ] No `alert`, `confirm`, `prompt`, popups, outbound links or form posts.
- [ ] Fills the window and re-lays out on resize, portrait and landscape.
- [ ] Fully playable by touch; keyboard also works.
- [ ] Title screen, and restart without reload.
- [ ] Pauses when hidden.
- [ ] No borrowed characters, brands or music.
- [ ] Name, description and cover (or cover instructions) provided.

If you can run code, open the page in a headless browser at a phone size and a desktop size and confirm it draws without console errors. If you cannot, say so.

## How the person publishes it

Give these steps with the game:

1. Go to **launchtitle.gg** and choose **Sign in with X**.
2. Choose **Add a game**. Adding games is by invitation while the store is opening. If the option is not there, send the game to **@launchtitlegg** on X and ask to be added as a creator.
3. Enter the game's name, pick **Single page**, and choose the `index.html` file. Or pick **Paste code** and paste the whole page. For a zip, pick **Zip file**.
4. The game opens on its own page, playable straight away. Under **Manage this game**, add the description and upload the cover image.
5. To release an update, add the game again under exactly the same name. Players get the new version at once, and earlier versions are kept.

## Adapting an existing game

When the person already has a game:

- **A React or other component that needs compiling:** rewrite it as plain HTML, CSS and JavaScript in one page. Keep the gameplay; drop the framework.
- **A page that loads libraries from a CDN:** inline what is small and essential, replace what is not, and remove fonts and analytics.
- **A game hosted elsewhere as plain files** (GitHub Pages, Netlify, Vercel): no rebuild needed. The person can choose **Link** on Add a game and give its address, as long as the game is theirs.
- **A game that needs its own server** (accounts, multiplayer, saved scores): it cannot be hosted as files. Say so, and offer a single-player version that can.

Then run the same check list.
