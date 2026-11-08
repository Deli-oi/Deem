"""Generate the retro plant sprites (64x64 pixel art, upscaled) in the style of dracaena.png.

    python generate_sprites.py            # writes <plant_type_id>.png next to this file
    python generate_sprites.py --sheet    # also writes contact_sheet.png for a quick look

dracaena.png is the hand-approved reference and is never overwritten. Every other plant is
drawn here from the same palette: dark green background, three greens, a brown base.
Needs Pillow.
"""

import math
import sys
from pathlib import Path

from PIL import Image

N = 64  # pixel grid; each grid pixel is SCALE x SCALE in the PNG
SCALE = 4  # 64 * 4 = 256px PNGs (displayed at ~40px in the UI)

BG = (10, 18, 14)
G_LIGHT = (141, 198, 98)
G_MID = (76, 148, 64)
G_DARK = (30, 104, 56)
G_DEEP = (20, 70, 40)
YEL = (246, 224, 40)
BROWN = (150, 100, 60)
BROWN_D = (104, 66, 36)
TERRA = (196, 108, 66)
TERRA_L = (222, 140, 90)
TERRA_D = (150, 78, 48)
SOIL = (70, 44, 28)


def darker(c, k=0.62):
    return tuple(int(v * k) for v in c)


class Canvas:
    def __init__(self):
        self.px = [[BG] * N for _ in range(N)]

    def put(self, x, y, c):
        if 0 <= x < N and 0 <= y < N:
            self.px[y][x] = c

    def paint(self, shape, outline=True):
        """shape: {(x, y): color}. Draws it, with a darker outline on its border pixels."""
        for (x, y), c in shape.items():
            edge = outline and any((x + dx, y + dy) not in shape for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            self.put(x, y, darker(c) if edge else c)

    def image(self):
        im = Image.new("RGB", (N, N))
        for y in range(N):
            for x in range(N):
                im.putpixel((x, y), self.px[y][x])
        return im.resize((N * SCALE, N * SCALE), Image.NEAREST)


# ---------- shape helpers (each returns {(x, y): color}) ----------


def default_leaf(light=G_LIGHT, mid=G_MID, dark=G_DARK):
    def fn(t, rel):
        if rel < -0.25:
            return light
        if rel < 0.35:
            return mid
        return dark

    return fn


def leaf(x0, y0, ang, length, width, fn=None, taper=0.8):
    """A pointed leaf from (x0, y0) along angle `ang` (degrees, 0 = right, -90 = up)."""
    fn = fn or default_leaf()
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    out = {}
    r = int(length + width) + 2
    for y in range(int(y0) - r, int(y0) + r + 1):
        for x in range(int(x0) - r, int(x0) + r + 1):
            dx, dy = x + 0.5 - x0, y + 0.5 - y0
            t = (dx * ca + dy * sa) / length
            u = -dx * sa + dy * ca
            if t < 0 or t > 1:
                continue
            hw = width / 2 * (math.sin(math.pi * t ** 0.85) ** taper)
            if abs(u) <= max(hw, 0.55):
                out[(x, y)] = fn(t, u / max(hw, 0.55))
    return out


def ellipse(cx, cy, rx, ry, fn):
    out = {}
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            ex, ey = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if ex * ex + ey * ey <= 1:
                out[(x, y)] = fn(ex, ey)
    return out


def heart(cx, cy, s, rot, fn):
    """Heart leaf; rot=0 points the tip down, 180 points it up."""
    ca, sa = math.cos(math.radians(-rot)), math.sin(math.radians(-rot))
    out = {}
    r = int(s * 1.6) + 2
    for y in range(int(cy) - r, int(cy) + r + 1):
        for x in range(int(cx) - r, int(cx) + r + 1):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            lx, ly = dx * ca - dy * sa, dx * sa + dy * ca
            X, Y = lx / s, -ly / s
            if abs(X) < 0.2 and Y > 0.4:
                continue  # the notch where the stem meets the leaf
            if (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0:
                c = fn(X, Y)
                if c is not None:
                    out[(x, y)] = c
    return out


def bezier(p0, p1, p2, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        pts.append((x, y, t))
    return pts


def stroke(pts, w0, w1, fn):
    """A tapered curved stroke along bezier points; fn(t, rel) -> color."""
    out = {}
    for x, y, t in pts:
        hw = (w0 + (w1 - w0) * t) / 2
        for yy in range(int(y - hw) - 1, int(y + hw) + 2):
            for xx in range(int(x - hw) - 1, int(x + hw) + 2):
                d = math.hypot(xx + 0.5 - x, yy + 0.5 - y)
                if d <= max(hw, 0.6):
                    out[(xx, yy)] = fn(t, (xx + 0.5 - x) / max(hw, 0.6))
    return out


def line(cv, p0, p1, c, width=1):
    steps = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))) * 2 + 1
    for i in range(steps + 1):
        t = i / steps
        x, y = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
        for w in range(width):
            cv.put(int(x) + w, int(y), c)


def pot(cv, cx=32, top=47, w_top=22, w_bot=15, h=13):
    for i in range(h):
        y = top + i
        half = (w_top + (w_bot - w_top) * i / (h - 1)) / 2
        for x in range(int(cx - half), int(cx + half) + 1):
            c = TERRA_L if x < cx - half * 0.35 else TERRA if x < cx + half * 0.45 else TERRA_D
            if i < 3:  # rim
                c = TERRA_L if x < cx else TERRA
            cv.put(x, y, c)
    # rim shadow line + soil
    for x in range(int(cx - w_top / 2), int(cx + w_top / 2) + 1):
        cv.put(x, top - 1, SOIL)
        cv.put(x, top + 3, TERRA_D)


# ---------- the plants ----------


def golden_pothos():
    cv = Canvas()
    pot(cv)

    def var(X, Y):  # golden pothos: green leaf with yellow marbling
        if (X - 0.4) ** 2 + (Y - 0.05) ** 2 < 0.2 or (X + 0.15) ** 2 + (Y + 0.45) ** 2 < 0.1:
            return (214, 220, 70)
        return G_LIGHT if (-X + Y * 0.6) > 0.35 else G_MID

    # trailing vines first (behind), then the leaves on top
    for p0, p1, p2 in (((24, 48), (6, 50), (9, 62)), ((40, 48), (58, 50), (55, 62)), ((30, 47), (28, 34), (20, 24))):
        cv.paint(stroke(bezier(p0, p1, p2), 1.6, 1.0, lambda t, r: G_DARK), outline=False)
    for x, y, s, rot in ((19, 24, 7, 150), (30, 16, 7, 180), (42, 22, 7, 200), (10, 52, 7, 20), (8, 60, 5, 10), (54, 53, 7, -20),
                         (55, 61, 5, -10), (27, 34, 6, 120), (38, 31, 6, 240), (13, 40, 6, 70)):
        cv.paint(heart(x, y, s, rot, var))
    return cv


def philodendron():
    cv = Canvas()
    pot(cv)
    line(cv, (32, 47), (32, 12), BROWN_D, 2)  # moss pole
    for yy in range(14, 46, 4):
        cv.put(31, yy, BROWN)
        cv.put(32, yy + 1, BROWN)

    def plain(X, Y):
        if (-X + Y * 0.7) > 0.4:
            return G_LIGHT
        return G_MID if Y > -0.4 else G_DARK

    for x, y, s, rot in ((22, 18, 8, 115), (42, 24, 8, 245), (21, 33, 8, 80), (43, 38, 7, 270), (32, 8, 7, 180), (13, 46, 7, 60)):
        cv.paint(heart(x, y, s, rot, plain))
    for p0, p1, p2 in (((24, 48), (6, 52), (8, 62)),):
        cv.paint(stroke(bezier(p0, p1, p2), 1.4, 1.0, lambda t, r: G_DARK), outline=False)
        cv.paint(heart(9, 59, 5, 10, plain))
    return cv


def snake_plant():
    cv = Canvas()
    pot(cv)

    def band(t, rel):
        if abs(rel) > 0.74:
            return (212, 196, 64)  # yellow edge
        if int(t * 9) % 2 == 0:
            return G_DARK
        return G_MID if rel < 0.1 else G_DARK

    for x0, ang, ln, w in ((24, -103, 30, 6), (40, -78, 31, 6), (28, -95, 38, 7), (36, -86, 36, 7), (32, -90, 42, 7), (20, -112, 22, 5), (44, -68, 23, 5)):
        cv.paint(leaf(x0, 47, ang, ln, w, band, taper=0.55))
    return cv


def zz_plant():
    cv = Canvas()
    pot(cv)

    def glossy(t, rel):
        return G_LIGHT if rel < -0.3 else G_MID if rel < 0.4 else G_DARK

    for p2, p1 in (((12, 22), (18, 40)), ((26, 10), (24, 30)), ((40, 9), (42, 30)), ((52, 22), (46, 40))):
        pts = bezier((32, 48), p1, p2)
        cv.paint(stroke(pts, 1.8, 1.0, lambda t, r: G_DEEP), outline=False)
        for i in range(8, 41, 6):
            x, y, t = pts[i]
            nx, ny, _ = pts[min(i + 1, 40)]
            ang = math.degrees(math.atan2(ny - y, nx - x))
            for side in (-1, 1):
                cv.paint(leaf(x, y, ang + side * 62, 7, 4, glossy, taper=0.7))
        cv.paint(leaf(pts[40][0], pts[40][1], math.degrees(math.atan2(pts[40][1] - pts[38][1], pts[40][0] - pts[38][0])), 6, 4, glossy))
    return cv


def spider_plant():
    cv = Canvas()
    pot(cv, top=40, h=13, w_top=22, w_bot=15)

    def striped(t, rel):
        if abs(rel) < 0.34:
            return (222, 236, 168)  # cream stripe
        return G_LIGHT if rel < 0 else G_MID

    arcs = (((-20, -8), (2, 49)), ((-12, -14), (6, 40)), ((-4, -18), (14, 30)), ((4, -18), (50, 30)), ((12, -14), (58, 40)), ((20, -8), (62, 49)),
            ((0, -12), (30, 20)), ((-8, -10), (20, 24)), ((8, -10), (44, 24)))
    for (cx, cy), (ex, ey) in arcs:
        pts = bezier((32, 41), (32 + cx, 41 + cy), (ex, ey))
        cv.paint(stroke(pts, 3.2, 1.0, striped), outline=False)
    pot(cv, top=40, h=13, w_top=22, w_bot=15)  # redraw the rim over the leaf bases
    return cv


def peace_lily():
    cv = Canvas()
    pot(cv)

    def dark_leaf(t, rel):
        if abs(rel) < 0.12:
            return G_LIGHT
        return G_MID if rel < -0.1 else G_DARK if rel < 0.5 else G_DEEP

    for ang, ln, w in ((-90, 28, 11), (-62, 26, 10), (-118, 26, 10), (-38, 23, 9), (-142, 23, 9)):
        cv.paint(leaf(32, 47, ang, ln, w, dark_leaf, taper=0.6))

    def spathe(t, rel):
        return (248, 248, 238) if rel < 0.2 else (208, 214, 204)

    for sx, sy, ex, ey in ((22, 47, 20, 17), (42, 47, 44, 14)):
        line(cv, (sx, sy), (ex, ey + 6), G_DARK, 1)
        cv.paint(leaf(ex, ey + 8, -90, 12, 7, spathe, taper=0.7))
        line(cv, (ex, ey + 1), (ex, ey + 8), YEL, 1)
    return cv


def monstera():
    cv = Canvas()
    pot(cv, top=48, h=12, w_top=20, w_bot=14)

    def split(X, Y):
        for yc in (0.05, -0.45):  # two slits cut in from each side
            if abs(Y - yc) < 0.06 and abs(X) > 0.55:
                return None
        for hx in (-0.3, 0.3):  # holes
            if math.hypot(X - hx, Y - 0.38) < 0.08:
                return None
        if abs(X) < 0.04 and Y < 0.5:
            return G_LIGHT  # midrib
        return G_LIGHT if (-X + Y * 0.6) > 0.35 else G_MID if Y > -0.5 else G_DARK

    for sx, cx, cy, s_, rot in ((26, 16, 33, 11, 60), (38, 48, 31, 11, -60), (32, 32, 16, 11, 180)):
        line(cv, (sx, 49), (cx, cy + 6 if cy < 25 else cy), G_DEEP, 1)
        cv.paint(heart(cx, cy, s_, rot, split))
    return cv


def chinese_evergreen():
    cv = Canvas()
    pot(cv)

    def silver(t, rel):
        if abs(rel) < 0.1:
            return (200, 226, 190)
        blotch = (int(t * 7) + (1 if rel > 0 else 0)) % 2 == 0 and abs(rel) < 0.7
        if blotch:
            return (176, 208, 170)
        return G_MID if rel < 0.1 else G_DARK

    for ang, ln, w in ((-90, 28, 13), (-62, 25, 12), (-118, 25, 12), (-36, 21, 11), (-144, 21, 11)):
        cv.paint(leaf(32, 47, ang, ln, w, silver, taper=0.6))
    return cv


def rubber_plant():
    cv = Canvas()
    line(cv, (32, 58), (32, 14), BROWN_D, 3)
    line(cv, (31, 58), (31, 14), BROWN, 1)
    pot(cv, top=50, h=11, w_top=20, w_bot=14)

    def glossy(t, rel):
        if abs(rel) < 0.1:
            return (96, 168, 100)
        return (52, 128, 70) if rel < 0.2 else (28, 84, 48)

    def new_leaf(t, rel):
        return (166, 64, 78) if rel < 0.2 else (118, 40, 58)

    for x, y, ang, ln in ((32, 46, -165, 18), (32, 40, -15, 18), (32, 33, -160, 18), (32, 27, -20, 18), (32, 21, -150, 16), (32, 18, -35, 15)):
        cv.paint(leaf(x, y, ang, ln, 10, glossy, taper=0.6))
    cv.paint(leaf(32, 20, -90, 14, 7, new_leaf, taper=0.7))
    return cv


def aloe_vera():
    cv = Canvas()
    pot(cv)
    blue = (88, 160, 124)

    def aloe(t, rel):
        if abs(rel) > 0.85:
            return (226, 240, 226)  # pale teeth along the edge
        spot = (int(t * 11) * 3 + (2 if rel > 0 else 0)) % 5 == 0 and abs(rel) < 0.5
        if spot:
            return (216, 234, 216)
        return (118, 188, 142) if rel < -0.2 else blue if rel < 0.45 else (56, 116, 90)

    for ang, ln, w in ((-90, 26, 9), (-62, 25, 9), (-118, 25, 9), (-36, 23, 9), (-144, 23, 9), (-14, 19, 8), (-166, 19, 8)):
        cv.paint(leaf(32, 48, ang, ln, w, aloe, taper=0.4))
    return cv


def panda_plant():
    cv = Canvas()
    pot(cv)

    def fuzzy(t, rel):
        if t > 0.8:
            return (146, 92, 62)  # brown tip
        return (196, 212, 184) if rel < -0.2 else (150, 178, 144) if rel < 0.4 else (108, 140, 112)

    for x0, ang, ln, w in ((26, -128, 17, 8), (38, -52, 17, 8), (29, -104, 21, 9), (35, -76, 21, 9), (32, -90, 24, 10)):
        cv.paint(leaf(x0, 48, ang, ln, w, fuzzy, taper=0.3))
    return cv


PLANTS = {
    "golden_pothos": golden_pothos,
    "heartleaf_philodendron": philodendron,
    "snake_plant": snake_plant,
    "zz_plant": zz_plant,
    "spider_plant": spider_plant,
    "peace_lily": peace_lily,
    "monstera": monstera,
    "chinese_evergreen": chinese_evergreen,
    "rubber_plant": rubber_plant,
    "aloe_vera": aloe_vera,
    "panda_plant": panda_plant,
}


def main():
    here = Path(__file__).parent
    images = {}
    for name, make in PLANTS.items():
        im = make().image()
        im.save(here / f"{name}.png", optimize=True)
        images[name] = im
        print("wrote", f"{name}.png")
    if "--sheet" in sys.argv:
        ref = Image.open(here / "dracaena.png").convert("RGB").resize((N * SCALE, N * SCALE), Image.BOX)
        names = ["dracaena"] + list(PLANTS)
        cols = 4
        rows = math.ceil(len(names) / cols)
        sheet = Image.new("RGB", (cols * N * SCALE, rows * N * SCALE), BG)
        for i, name in enumerate(names):
            sheet.paste(ref if name == "dracaena" else images[name], ((i % cols) * N * SCALE, (i // cols) * N * SCALE))
        sheet.save(here / "contact_sheet.png")
        print("wrote contact_sheet.png")


if __name__ == "__main__":
    main()
