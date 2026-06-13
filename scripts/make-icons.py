#!/usr/bin/env python3
"""Generate PWA / home-screen icons -> assets/icon-{512,192,180}.png + a favicon (icon-32.png).
The mark: the football pitch's centre circle — centre circle + halfway line + kick-off spot — in trophy gold on
a deep pitch-green ground, with a small letter-spaced "WORLD CUP" kicker. Abstract, premium, no clip-art; pure
geometry so it stays razor-sharp at any size. Content sits inside the maskable safe circle. Supersampled 2x."""
from PIL import Image, ImageDraw, ImageFont

DIN_ALT = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
GOLD = (232, 185, 49)
CREAM = (250, 251, 249)
TOP, BOT = (15, 90, 60), (10, 62, 41)     # deep pitch green

def ground(S):
    g = Image.new("RGB", (1, S))
    for i in range(S):
        g.putpixel((0, i), tuple(int(TOP[j] + (BOT[j] - TOP[j]) * (i / S)) for j in range(3)))
    return g.resize((S, S))

def tracked(d, cx, y, s, font, fill, tr):
    w = [d.textlength(c, font=font) for c in s]
    x = cx - (sum(w) + tr * (len(s) - 1)) / 2
    for c, cw in zip(s, w):
        d.text((x, y), c, font=font, fill=fill, anchor="lm"); x += cw + tr

def pitch_mark(d, S, cy, r, lw, line_half):
    cap = lw / 2
    # halfway line with rounded caps
    d.line([(S / 2 - line_half, cy), (S / 2 + line_half, cy)], fill=GOLD, width=lw)
    for ex in (S / 2 - line_half, S / 2 + line_half):
        d.ellipse([ex - cap, cy - cap, ex + cap, cy + cap], fill=GOLD)
    d.ellipse([S / 2 - r, cy - r, S / 2 + r, cy + r], outline=GOLD, width=lw)      # centre circle
    sp = lw * 1.2
    d.ellipse([S / 2 - sp, cy - sp, S / 2 + sp, cy + sp], fill=GOLD)               # kick-off spot

def make(size, favicon=False):
    S = 1024
    img = ground(S); d = ImageDraw.Draw(img)
    if favicon:
        pitch_mark(d, S, S * 0.50, r=S * 0.27, lw=round(S * 0.052), line_half=S * 0.40)
    else:
        pitch_mark(d, S, S * 0.42, r=S * 0.205, lw=round(S * 0.026), line_half=S * 0.31)
        tracked(d, S / 2, S * 0.78, "WORLD CUP", ImageFont.truetype(DIN_ALT, round(0.075 * S)), CREAM, S * 0.014)
    return img.resize((size, size), Image.LANCZOS)

for s in (512, 192, 180):
    make(s).save(f"assets/icon-{s}.png"); print("wrote", f"assets/icon-{s}.png")
make(32, favicon=True).save("assets/icon-32.png"); print("wrote assets/icon-32.png (favicon)")
