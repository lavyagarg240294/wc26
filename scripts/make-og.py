#!/usr/bin/env python3
"""Generate the 1200x630 social share card -> assets/og.png. Typographic, no raster emblem."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
FB = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FBL = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FR = "/System/Library/Fonts/Supplemental/Arial.ttf"
f = lambda p, s: ImageFont.truetype(p, s)

# base vertical gradient: navy -> deep pitch green
img = Image.new("RGB", (W, H))
top, bot = (12, 24, 38), (8, 34, 27)
row = [tuple(int(top[i] + (bot[i] - top[i]) * (y / H)) for i in range(3)) for y in range(H)]
px = img.load()
for x in range(W):
    for y in range(H):
        px[x, y] = row[y]

def glow(color, cx, cy, r, alpha, blur=110):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ov).ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (alpha,))
    img.paste(ov.filter(ImageFilter.GaussianBlur(blur)), (0, 0), ov.filter(ImageFilter.GaussianBlur(blur)))

glow((11, 163, 96), 90, 70, 380, 160)      # green top-left
glow((232, 185, 49), 1130, 590, 420, 140)  # gold bottom-right
glow((45, 212, 191), 1010, 70, 260, 90)    # teal top-right

# concentric "centre-circle" motif, top-right, partly off-canvas
rings = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(rings)
ccx, ccy = 1060, 150
for r, col, a, w in [(340, (255, 255, 255), 34, 2), (250, (232, 185, 49), 60, 2), (150, (31, 214, 115), 50, 2)]:
    rd.ellipse([ccx - r, ccy - r, ccx + r, ccy + r], outline=col + (a,), width=w)
rd.ellipse([ccx - 9, ccy - 9, ccx + 9, ccy + 9], fill=(232, 185, 49, 200))
img.paste(rings, (0, 0), rings)

d = ImageDraw.Draw(img)
x = 84
d.text((x, 96), "JUNE 11 – JULY 19, 2026", font=f(FB, 28), fill=(232, 185, 49))
d.text((x, 142), "FIFA World Cup", font=f(FB, 82), fill=(255, 255, 255))
d.text((x, 226), "2026", font=f(FBL, 158), fill=(31, 214, 115))
tag = f(FR, 31)
d.text((x, 424), "Live scores & lineups, group tables, a self-filling", font=tag, fill=(200, 212, 218))
d.text((x, 464), "bracket, the Golden Boot race & a full predictor.", font=tag, fill=(200, 212, 218))
d.rectangle([x, 536, x + 320, 539], fill=(232, 185, 49))
d.text((x, 552), "104 MATCHES    ·    48 TEAMS    ·    IN YOUR TIMEZONE", font=f(FB, 24), fill=(150, 166, 176))

img.save("assets/og.png")
print("wrote assets/og.png", img.size)
