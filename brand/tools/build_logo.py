"""Build the Launch Title logo family as outlined SVG + PNG files."""
import json
import sys
from pathlib import Path

import cairosvg
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

font_dir = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

IGNITION = "#FF6A2B"
NAVY = "#0D1220"
PAPER = "#F2F4F7"

# Trigger shape: one large corner (r=32), three tight corners (r=8), on a 96 grid.
SHAPE = "M40 8H80a8 8 0 0 1 8 8V80a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8V40A32 32 0 0 1 40 8Z"


def load(weight):
    return TTFont(str(font_dir / f"urbanist-latin-{weight}-normal.woff2"))


def text_path(font, text, cap_px, tracking_em=0.0, gaps=None, dx=0.0, dy=0.0):
    """Outline `text` so its cap height is cap_px. Returns (d, width, height)."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight
    s = cap_px / cap
    x = 0.0
    parts = []
    last_right = 0.0
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        g = gs[name]
        if ch != " ":
            bp = BoundsPen(gs)
            g.draw(bp)
            xmin, _, xmax, _ = bp.bounds
            if gaps is not None:
                # optical placement: butt bounding boxes together with a fixed gap
                x = (last_right + (gaps if i else 0)) - xmin * s if i else -xmin * s
            pen = SVGPathPen(gs)
            g.draw(TransformPen(pen, (s, 0, 0, -s, x + dx, cap_px + dy)))
            parts.append(pen.getCommands())
            last_right = x + xmax * s
        if gaps is None:
            x += g.width * s + tracking_em * upm * s
    return "".join(parts), last_right, cap_px


bold = load(700)
xbold = load(800)

# Mark letters: custom geometric slab L and T, stroke 10.5, cap height 36, optically centred.
LT_X, LT_Y, lt_w, lt_h = 23, 32.5, 53, 36
lt_d = "M23 32.5h10.5v25.5H44v10.5H23Z" "M49 32.5h27v10.5h-8.25v25.5h-10.5V43H49Z"

# Wordmark: Urbanist Bold, tracked 0.2em.
CAP = 26
wm_d, wm_w, wm_h = text_path(xbold, "LAUNCH TITLE", CAP, tracking_em=0.2)


def mark(fill, letters, knock=False):
    if knock:
        return (f'<path fill-rule="evenodd" fill="{fill}" d="{SHAPE}'
                f'{lt_d}"/>')
    return (f'<path fill="{fill}" d="{SHAPE}"/>'
            f'<path fill="{letters}" d="{lt_d}"/>')


def shift_path(d, dx, dy):
    """Bake a translate into an absolute-coordinate path."""
    import re
    out_parts = []
    for cmd, args in re.findall(r"([MLQCZ])([^MLQCZ]*)", d):
        nums = [float(n) for n in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", args)]
        for i in range(0, len(nums), 2):
            nums[i] += dx
            nums[i + 1] += dy
        out_parts.append(cmd + " ".join(f"{n:.3f}" for n in nums))
    return "".join(out_parts)


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" '
            f'width="{w:g}" height="{h:g}" role="img" aria-label="Launch Title">{rect}{body}</svg>')


files = {}

# 1. Mark alone
files["lt-mark"] = svg(96, 96, mark(IGNITION, NAVY))
files["lt-mark-mono-light"] = svg(96, 96, mark(PAPER, None, knock=True))
files["lt-mark-mono-dark"] = svg(96, 96, mark(NAVY, None, knock=True))

# 2. Horizontal lockup: mark + wordmark, wordmark cap centred on the mark
GAP = 26
hw = 96 + GAP + wm_w + 8
wm_y = (96 - CAP) / 2 + 0.5


def horizontal(mark_body, text_fill):
    return (mark_body + f'<path fill="{text_fill}" transform="translate({96 + GAP:.3f} {wm_y:.3f})" d="{wm_d}"/>')


files["lt-lockup-horizontal-on-dark"] = svg(hw, 96, horizontal(mark(IGNITION, NAVY), PAPER))
files["lt-lockup-horizontal-on-light"] = svg(hw, 96, horizontal(mark(IGNITION, NAVY), NAVY))
files["lt-lockup-horizontal-mono-light"] = svg(hw, 96, horizontal(mark(PAPER, None, knock=True), PAPER))

# 3. Stacked lockup
sw = wm_w + 16
sh = 96 + 30 + CAP + 4
mx = (sw - 96) / 2


def stacked(mark_body, text_fill):
    return (f'<g transform="translate({mx:.3f} 0)">{mark_body}</g>'
            f'<path fill="{text_fill}" transform="translate(8 {96 + 30:.3f})" d="{wm_d}"/>')


files["lt-lockup-stacked-on-dark"] = svg(sw, sh, stacked(mark(IGNITION, NAVY), PAPER))
files["lt-lockup-stacked-on-light"] = svg(sw, sh, stacked(mark(IGNITION, NAVY), NAVY))

# 4. Wordmark alone
files["lt-wordmark-on-dark"] = svg(wm_w + 2, CAP, f'<path fill="{PAPER}" d="{wm_d}"/>')

# 5. App icon (1024) and X avatar (800), both on navy
icon = (f'<rect width="1024" height="1024" rx="232" fill="{NAVY}"/>'
        f'<g transform="translate(212 212) scale(6.25)">{mark(IGNITION, NAVY)}</g>')
files["lt-app-icon"] = svg(1024, 1024, icon)
avatar = (f'<rect width="800" height="800" fill="{NAVY}"/>'
          f'<g transform="translate(208 208) scale(4)">{mark(IGNITION, NAVY)}</g>')
files["lt-x-avatar"] = svg(800, 800, avatar)

for name, body in files.items():
    (out / f"{name}.svg").write_text(body)

png_sizes = {"lt-mark": 1024, "lt-app-icon": 1024, "lt-x-avatar": 800,
             "lt-lockup-horizontal-on-dark": 2400, "lt-lockup-stacked-on-dark": 1600}
for name, width in png_sizes.items():
    cairosvg.svg2png(bytestring=files[name].encode(), write_to=str(out / f"{name}.png"), output_width=width)

# Preview sheet for checking by eye
prev = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="1200" height="520">'
        f'<rect width="1200" height="520" fill="{NAVY}"/>'
        f'<rect x="700" width="500" height="520" fill="{PAPER}"/>'
        f'<g transform="translate(60 50) scale(2.4)">{mark(IGNITION, NAVY)}</g>'
        f'<g transform="translate(60 330) scale(1.1)">{horizontal(mark(IGNITION, NAVY), PAPER)}</g>'
        f'<g transform="translate(380 70) scale(0.9)">{stacked(mark(IGNITION, NAVY), PAPER)}</g>'
        f'<g transform="translate(740 60) scale(0.95)">{horizontal(mark(IGNITION, NAVY), NAVY)}</g>'
        f'<g transform="translate(740 220) scale(1.6)">{mark(NAVY, None, knock=True)}</g>'
        f'<g transform="translate(940 230)">{mark(IGNITION, NAVY)}</g>'
        f'<g transform="translate(1060 250) scale(0.5)">{mark(IGNITION, NAVY)}</g>'
        f'<g transform="translate(1130 262) scale(0.25)">{mark(IGNITION, NAVY)}</g>'
        f'</svg>')
cairosvg.svg2png(bytestring=prev.encode(), write_to=str(out / "_preview.png"))

(out / "_paths.json").write_text(json.dumps({
    "shape": SHAPE, "lt": lt_d, "lt_x": round(LT_X, 3), "lt_y": round(LT_Y, 3),
    "lt_w": round(lt_w, 3), "wordmark": wm_d, "wordmark_w": round(wm_w, 3), "cap": CAP,
    "horizontal_w": round(hw, 3), "stacked_w": round(sw, 3), "stacked_h": round(sh, 3)}))
print("lt", round(lt_w, 2), "wm", round(wm_w, 2), "hw", round(hw, 2), "len lt_d", len(lt_d), "len wm_d", len(wm_d))
