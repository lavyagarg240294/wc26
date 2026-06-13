#!/usr/bin/env python3
"""Generate PWA / home-screen icons -> assets/icon-{512,192,180}.png. Typographic, brand colours."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FB = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FBL = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
f = lambda p, s: ImageFont.truetype(p, s)

def make(size, pad_frac=0.0):
    S = 512
    img = Image.new("RGB", (S, S))
    # vertical gradient: pitch green -> deep navy-green
    top, bot = (12, 150, 92), (7, 60, 44)
    px = img.load()
    for y in range(S):
        c = tuple(int(top[i] + (bot[i] - top[i]) * (y / S)) for i in range(3))
        for x in range(S):
            px[x, y] = c
    # faint centre-circle motif (kept inside the maskable safe zone)
    ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    cx, cy = S // 2, int(S * 0.52)
    for r, a in [(150, 28), (104, 44)]:
        od.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(232, 185, 49, a), width=3)
    img.paste(ov, (0, 0), ov)
    d = ImageDraw.Draw(img)
    # "WORLD CUP" small gold over a big cream "26" — both centred (anchor mm), inside the maskable safe zone
    d.text((S / 2, S * 0.30), "WORLD CUP", font=f(FB, 44), fill=(232, 185, 49), anchor="mm")
    d.text((S / 2, S * 0.585), "26", font=f(FBL, 218), fill=(250, 251, 249), anchor="mm")
    if size != S:
        img = img.resize((size, size), Image.LANCZOS)
    return img

for s in (512, 192, 180):
    im = make(s)
    name = f"assets/icon-{s}.png"
    im.save(name)
    print("wrote", name, im.size)
