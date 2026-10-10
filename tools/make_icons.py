"""Draws the app icons (a sage progress ring on warm grey) at the sizes iOS and Android want.

Run from the repo root:  python3 tools/make_icons.py
Needs Pillow:            pip install pillow
"""
from PIL import Image, ImageDraw

BG = (245, 244, 241)
TRACK = (226, 223, 216)
SAGE = (91, 122, 85)


def icon(size: int) -> Image.Image:
    scale = 4  # draw big, then shrink, for smooth edges
    s = size * scale
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    margin = s * 0.22          # keeps the ring inside the "safe zone" for rounded/masked icons
    width = int(s * 0.11)
    box = [margin, margin, s - margin, s - margin]
    d.arc(box, 0, 360, fill=TRACK, width=width)
    d.arc(box, -90, -90 + 260, fill=SAGE, width=width)
    # round end caps
    import math
    r = (s - 2 * margin) / 2 - width / 2
    cx = cy = s / 2
    for ang in (-90, -90 + 260):
        a = math.radians(ang)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        d.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=SAGE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    icon(192).save("icons/icon-192.png")
    icon(512).save("icons/icon-512.png")
    icon(180).save("icons/apple-touch-icon.png")
    print("icons written")
