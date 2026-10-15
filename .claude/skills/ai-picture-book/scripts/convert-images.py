"""Converts Gemini PNGs to the library's JPEGs.

    python -I convert-images.py <img-folder> <data/media/books/<id>>

Takes cover.png and page-NN.png, writes cover.jpg and page-NN.jpg at 1200 px wide, quality 88.
"""
import os
import re
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
names = sorted(n for n in os.listdir(src) if re.fullmatch(r"(cover|page-\d{2})\.png", n))
if "cover.png" not in names:
    sys.exit("cover.png is missing")
for name in names:
    im = Image.open(os.path.join(src, name)).convert("RGB")
    if im.width != 1200:
        im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
    out = os.path.join(dst, name[:-4] + ".jpg")
    im.save(out, "JPEG", quality=88, optimize=True)
    print(out, im.size)
