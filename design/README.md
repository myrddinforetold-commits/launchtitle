# Design reference

These files are the reference for milestone 2 (the console shell). They are exports from the Launch Title design canvas, not production code.

- `screens/` holds one file per screen. Every style is inline, so exact colours, sizes, radii and spacing can be read straight from the markup.
- `art/` holds the placeholder artwork. All eight games are invented samples, and the art was generated for the mockups. Replace it with real screenshots as pilot creators agree to be listed.

Two things will not work outside the canvas:

- The `<script src="./support.js">` line and the `<x-dc>` wrapper belong to the canvas runtime.
- Image sources of the form `/_blob/<id>` point at the canvas's own storage. The same images are in `art/` under readable names.

| Screen | File |
| --- | --- |
| Logo sheet | `screens/Main.dc.html` |
| Boot screen | `screens/Boot.dc.html` |
| Store home | `screens/Home.dc.html` |
| Game page | `screens/GamePage.dc.html` |
| Library | `screens/Library.dc.html` |
| In-game menu | `screens/Overlay.dc.html` |
| Creator royalties | `screens/CreatorPage.dc.html` |
| Title card | `screens/TitleCard.dc.html` |
| Phone: store | `screens/PhoneStore.dc.html` |
| Phone: game page | `screens/PhoneGame.dc.html` |
