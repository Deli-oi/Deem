"""Make a wilting, slightly gray version of every plant sprite (transparent background).

    python generate_wilted.py            # writes wilted/<plant_type_id>.png
    python generate_wilted.py --sheet    # also writes wilted_sheet.png (healthy vs wilted)

Shown full-screen when a reading needs fixing. The same wilted image is used for every kind of
failure. It is derived from the healthy sprite, so it always matches it: the leaves sag and
spread, the color is grayed and dulled, and the tips go dry olive-brown. The pot / trunk stays
put. Needs Pillow.
"""

import sys
from pathlib import Path

from PIL import Image

N = 64  # pixel grid of the sprites
SCALE = 4  # output 256px, crisp at ~250px on screen
BG = (9, 20, 15)

HERE = Path(__file__).parent


def is_bg(c):
    return max(c) <= 34  # the dark background (the approved dracaena has a little noise)


def is_base(c):
    r, g, b = c
    return r > g + 28 and r > 100  # terracotta pot and brown trunk: they do not wilt


def load_grid(path):
    """Read a sprite as a 64x64 grid of colors (None = background)."""
    im = Image.open(path).convert("RGB")
    s = im.width // N
    grid = {}
    for y in range(N):
        for x in range(N):
            c = im.getpixel((x * s + s // 2, y * s + s // 2))
            if not is_bg(c):
                grid[(x, y)] = c
    return grid


def mix(a, b, k):
    return tuple(int(a[i] * (1 - k) + b[i] * k) for i in range(3))


def grayed(c, amount, dark):
    g = int(0.30 * c[0] + 0.59 * c[1] + 0.11 * c[2])
    return tuple(int(v * dark) for v in mix(c, (g, g, g), amount))


def wilt(grid):
    base = {p: c for p, c in grid.items() if is_base(c)}
    leaves = {p: c for p, c in grid.items() if p not in base}
    if not leaves:
        return grid
    ys = [y for _, y in leaves]
    ytop = min(ys)
    # where the leaves attach: the top of the pot/trunk, or the bottom of the leaves
    ybase = min((y for _, y in base), default=max(ys) + 1)
    ybase = max(ybase, ytop + 8)
    span = max(ybase - ytop, 1)
    cx = sum(x for x, _ in leaves) / len(leaves)
    half = max(max(abs(x - cx) for x, _ in leaves), 1)

    out = {}
    for (x, y), c in base.items():
        out[(x, y)] = grayed(c, 0.35, 0.92)

    for (x, y), c in sorted(leaves.items(), key=lambda kv: kv[0][1]):  # top first, lower leaves paint over
        t = max(0.0, min(1.0, (ybase - y) / span))  # 0 at the base, 1 at the tips
        u = (x - cx) / half  # -1 (far left) .. 1 (far right)
        reach = abs(u)
        # gravity: leaves that reach out hang down over the pot; the upright ones lean over and lose height
        ny = ybase - (ybase - y) * (0.80 - 0.12 * reach) + span * 0.50 * reach ** 1.6 * (0.45 + 0.55 * t) + 7 * t * t
        nx = cx + (x - cx) * 0.90 + (1 if x >= cx else -1) * 3 * t * (1 - reach)
        color = grayed(c, 0.50, 0.90)
        tip = max(t, reach) - 0.45
        if tip > 0:  # dry, browning tips
            color = mix(color, (116, 104, 62), min(0.5, 0.9 * tip))
        for dx in range(2):
            for dy in range(2):
                px, py = int(round(nx)) + dx - 0, int(round(ny)) + dy
                if 0 <= px < N and 0 <= py < N and (px, py) not in base:
                    out[(px, py)] = color
    return out


def to_image(grid, crop=False):
    """Grid -> RGBA PNG. crop=True trims to the plant (1px margin) so the app can scale it up to fill the screen."""
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    for (x, y), c in grid.items():
        im.putpixel((x, y), (*c, 255))
    if crop and grid:
        xs, ys = [x for x, _ in grid], [y for _, y in grid]
        im = im.crop((max(min(xs) - 1, 0), max(min(ys) - 1, 0), min(max(xs) + 2, N), min(max(ys) + 2, N)))
    return im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)


def sprite_ids():
    return sorted(p.stem for p in HERE.glob("*.png") if not p.stem.endswith("_sheet"))


def main():
    out_dir = HERE / "wilted"
    out_dir.mkdir(exist_ok=True)
    pairs = []
    for pid in sprite_ids():
        grid = load_grid(HERE / f"{pid}.png")
        wilted_grid = wilt(grid)
        to_image(wilted_grid, crop=True).save(out_dir / f"{pid}.png", optimize=True)
        pairs.append((pid, to_image(grid), to_image(wilted_grid)))
        print("wrote", f"wilted/{pid}.png")
    if "--sheet" in sys.argv:
        cell = N * SCALE
        sheet = Image.new("RGB", (cell * 4, cell * ((len(pairs) * 2 + 3) // 4)), BG)
        for i, (_, healthy, wilted) in enumerate(pairs):
            for j, im in enumerate((healthy, wilted)):
                k = i * 2 + j
                sheet.paste(im, ((k % 4) * cell, (k // 4) * cell), im)
        sheet.save(HERE / "wilted_sheet.png")
        print("wrote wilted_sheet.png")


if __name__ == "__main__":
    main()
