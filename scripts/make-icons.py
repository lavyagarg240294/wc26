#!/usr/bin/env python3
"""Generate PWA / home-screen icons -> assets/icon-{512,192,180}.png.
An ORIGINAL match-ball mark (not the official Adidas Trionda — our own glyph): the site's white football with
navy seams, but its central pentagon is a "three nations" heart (red/green/blue converging) framed in trophy
gold — a nod to the three 2026 host countries. On the pitch-green gradient with a gold "26". Content stays
inside the maskable safe circle (central ~80%). Rendered 2x and downscaled for smooth, anti-aliased edges."""
from PIL import Image, ImageDraw, ImageFont

FBL = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
WHITE = (250, 251, 249)
INK = (13, 27, 42)
GOLD = (232, 185, 49)
RED, GREEN, BLUE = (226, 35, 47), (11, 163, 96), (28, 110, 224)   # the three host nations

# our football glyph in 0..100 coords: circle r46 @ 50,50; central pentagon; five seams to the ball edge
PENT = [(50, 34), (65.2, 45.1), (59.4, 62.9), (40.6, 62.9), (34.8, 45.1)]
SEAMS = [((50, 34), (50, 7)), ((65.2, 45.1), (89, 33)), ((59.4, 62.9), (74, 87)),
         ((40.6, 62.9), (26, 87)), ((34.8, 45.1), (11, 33))]

def draw_ball(img, cx, cy, diameter):
    W = img.size[0]
    d = ImageDraw.Draw(img)
    s = diameter / 92.0                       # the ball spans r46 -> 92 units across
    T = lambda p: (cx + (p[0] - 50) * s, cy + (p[1] - 50) * s)
    r, lw = 46 * s, max(2, round(4.5 * s))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=INK, width=lw)   # white ball, navy rim
    for a, b in SEAMS:                        # navy seams (classic football)
        d.line([T(a), T(b)], fill=INK, width=lw)
        x, y = T(b); rr = lw / 2; d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=INK)
    # central pentagon = the "three nations" heart: paint three converging colours, clipped to the pentagon
    pent = [T(p) for p in PENT]
    layer, mask = Image.new("RGB", (W, W)), Image.new("L", (W, W), 0)
    cb = [cx - 22 * s, cy - 22 * s, cx + 22 * s, cy + 22 * s]
    ld = ImageDraw.Draw(layer)
    ld.pieslice(cb, -90, 30, fill=RED); ld.pieslice(cb, 30, 150, fill=GREEN); ld.pieslice(cb, 150, 270, fill=BLUE)
    ImageDraw.Draw(mask).polygon(pent, fill=255)
    img.paste(layer, (0, 0), mask)
    d.polygon(pent, outline=GOLD, width=max(2, round(lw * 1.15)))   # trophy-gold frame around the heart

def make(size):
    S = 1024                                  # supersample, then downscale for smooth edges
    grad = Image.new("RGB", (1, S))
    top, bot = (12, 150, 92), (7, 60, 44)     # pitch green -> deep navy-green
    for y in range(S):
        grad.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * (y / S)) for i in range(3)))
    img = grad.resize((S, S))
    draw_ball(img, S // 2, int(S * 0.39), int(S * 0.46))
    ImageDraw.Draw(img).text((S / 2, S * 0.76), "26", font=ImageFont.truetype(FBL, round(122 * S / 512)),
                             fill=GOLD, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)

for s in (512, 192, 180):
    name = f"assets/icon-{s}.png"
    make(s).save(name)
    print("wrote", name)
