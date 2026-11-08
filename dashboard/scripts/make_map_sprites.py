"""Transparent, ground-aligned copies of the plant sprites for the greenhouse map.

    python scripts/make_map_sprites.py

The MVP sprites sit on a dark background box; on the map they must be see-through, and every
plant must stand on the same ground line. Writes public/map/<plant_type_id>.png (256px, 64-grid).
Needs Pillow.
"""
from pathlib import Path

from PIL import Image

N, SCALE = 64, 4
root = Path(__file__).resolve().parents[1]
src = root.parent / "demo/public/sprites"
out = root / "public/map"
out.mkdir(parents=True, exist_ok=True)


def is_bg(c):
    return max(c) <= 34  # the dark background (the approved dracaena has a little noise)


for f in sorted(src.glob("*.png")):
    im = Image.open(f).convert("RGB")
    s = im.width // N
    grid = {}
    for y in range(N):
        for x in range(N):
            c = im.getpixel((x * s + s // 2, y * s + s // 2))
            if not is_bg(c):
                grid[(x, y)] = c
    bottom = max(y for _, y in grid)
    shift = (N - 1) - bottom  # stand every plant on the same ground line
    sprite = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    for (x, y), c in grid.items():
        sprite.putpixel((x, y + shift), (*c, 255))
    sprite.resize((N * SCALE, N * SCALE), Image.NEAREST).save(out / f.name, optimize=True)
    print("wrote map/" + f.name)
