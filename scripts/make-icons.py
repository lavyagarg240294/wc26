#!/usr/bin/env python3
"""Generate PWA / home-screen icons -> assets/icon-{512,192,180}.png + a favicon (icon-32.png).
A restrained typographic mark: a bold "26" (DIN Condensed — the classic sport/signage numeral) in cream on a
deep, near-flat pitch-green ground, with a small letter-spaced "WORLD CUP" kicker over a thin gold rule. No
object, no clip-art. Content stays inside the maskable safe circle. Rendered 2x and downscaled for smooth edges."""
from PIL import Image, ImageDraw, ImageFont

DIN = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
DIN_ALT = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
CREAM = (250, 251, 249)
GOLD = (232, 185, 49)
TOP, BOT = (15, 90, 60), (10, 64, 43)     # deep pitch green, barely a gradient (premium, near-flat)

def tracked(d, cx, y, s, font, fill, tracking):
    """centre-anchored text with letter-spacing"""
    w = [d.textlength(c, font=font) for c in s]
    x = cx - (sum(w) + tracking * (len(s) - 1)) / 2
    for c, cw in zip(s, w):
        d.text((x, y), c, font=font, fill=fill, anchor="lm")
        x += cw + tracking

def make(size, favicon=False):
    S = 1024
    grad = Image.new("RGB", (1, S))
    for i in range(S):
        grad.putpixel((0, i), tuple(int(TOP[j] + (BOT[j] - TOP[j]) * (i / S)) for j in range(3)))
    img = grad.resize((S, S))
    d = ImageDraw.Draw(img)
    if favicon:
        d.text((S / 2, S * 0.50), "26", font=ImageFont.truetype(DIN, round(0.92 * S)), fill=CREAM, anchor="mm")
    else:
        d.text((S / 2, S * 0.43), "26", font=ImageFont.truetype(DIN, round(0.62 * S)), fill=CREAM, anchor="mm")
        d.line([(S * 0.40, S * 0.645), (S * 0.60, S * 0.645)], fill=GOLD, width=round(S * 0.012))   # gold rule
        tracked(d, S / 2, S * 0.715, "WORLD CUP", ImageFont.truetype(DIN_ALT, round(0.082 * S)), CREAM, S * 0.012)
    return img.resize((size, size), Image.LANCZOS)

for s in (512, 192, 180):
    make(s).save(f"assets/icon-{s}.png"); print("wrote", f"assets/icon-{s}.png")
make(32, favicon=True).save("assets/icon-32.png"); print("wrote assets/icon-32.png (favicon)")
