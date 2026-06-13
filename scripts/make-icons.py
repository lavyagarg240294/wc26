#!/usr/bin/env python3
"""Generate PWA / home-screen icons -> assets/icon-{512,192,180}.png.
A clean brand mark: the site's football glyph on the pitch-green gradient, with a gold "26" for identity.
Content sits inside the maskable safe zone (central ~80%) so round/squircle masks never clip it."""
from PIL import Image, ImageDraw, ImageFont

FBL = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
INK = (13, 27, 42)        # navy seams (matches --ink / the header ball)
WHITE = (250, 251, 249)
GOLD = (232, 185, 49)

# the header ball, in 0..100 viewBox coords (circle r46 @ 50,50; pentagon; five seams to the ball edge)
PENT = [(50, 34), (65.2, 45.1), (59.4, 62.9), (40.6, 62.9), (34.8, 45.1)]
SEAMS = [((50, 34), (50, 7)), ((65.2, 45.1), (89, 33)), ((59.4, 62.9), (74, 87)),
         ((40.6, 62.9), (26, 87)), ((34.8, 45.1), (11, 33))]

def draw_ball(d, cx, cy, diameter):
    s = diameter / 92.0                      # the ball spans r46 -> 92 units across
    T = lambda p: (cx + (p[0] - 50) * s, cy + (p[1] - 50) * s)
    r = 46 * s
    lw = max(2, round(4 * s))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=INK, width=lw)
    d.polygon([T(p) for p in PENT], fill=INK)
    for a, b in SEAMS:
        d.line([T(a), T(b)], fill=INK, width=lw)
        for p in (a, b):                     # round the seam ends
            x, y = T(p); rr = lw / 2
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=INK)

def make(size):
    S = 512
    img = Image.new("RGB", (S, S))
    top, bot = (12, 150, 92), (7, 60, 44)    # pitch green -> deep navy-green
    px = img.load()
    for y in range(S):
        c = tuple(int(top[i] + (bot[i] - top[i]) * (y / S)) for i in range(3))
        for x in range(S):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    draw_ball(d, S // 2, int(S * 0.39), int(S * 0.46))     # ball is the hero, kept within the maskable safe circle
    d.text((S / 2, S * 0.76), "26", font=ImageFont.truetype(FBL, 122), fill=GOLD, anchor="mm")
    if size != S:
        img = img.resize((size, size), Image.LANCZOS)
    return img

for s in (512, 192, 180):
    name = f"assets/icon-{s}.png"
    make(s).save(name)
    print("wrote", name)
