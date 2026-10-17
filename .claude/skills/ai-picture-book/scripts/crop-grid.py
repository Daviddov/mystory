"""Cuts one generated grid picture (several illustrations in one image) into separate PNGs.

    python -I crop-grid.py <grid.png> <cols>x<rows> <out-folder> <name1,name2,...> [--trim 6] [--aspect 4:3]

Names are in reading order (left to right, top to bottom), e.g. 2x2 -> page-01,page-02,page-03,page-04.
Instead of CxR you can give the panels per row, e.g. `3,2` (three panels on the first row, two on the second):
the model sometimes lays out an odd number of pictures that way, and each row is then cut on its own gutters.
The cut lines are found where a plain (low-variance) gutter band lies near the expected equal split,
so the model does not have to draw exact cells. Every panel is then trimmed by --trim px (default 6)
to drop gutter bleed. With --aspect W:H each panel is then center-cropped to that ratio
(e.g. 4:3 for book pages when the grid cells are 3:2). Prints the size of each panel; a panel under 500 px wide is a warning.
"""
import os
import sys

from PIL import Image, ImageStat

argv = sys.argv[1:]
trim, aspect = 6, None
if "--trim" in argv:
    k = argv.index("--trim")
    trim = int(argv[k + 1])
    del argv[k : k + 2]
if "--aspect" in argv:
    k = argv.index("--aspect")
    aw, ah = (int(v) for v in argv[k + 1].split(":"))
    aspect = aw / ah
    del argv[k : k + 2]
args = [a for a in argv if not a.startswith("--")]
src, size, out, names = args[0], args[1], args[2], args[3].split(",")
if "," in size:
    row_counts = [int(v) for v in size.split(",")]
else:
    c, r = (int(v) for v in size.lower().split("x"))
    row_counts = [c] * r
rows = len(row_counts)
if len(names) != sum(row_counts):
    sys.exit(f"layout {size} needs {sum(row_counts)} names, got {len(names)}")
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB")
W, H = im.size


def cuts(total, parts, axis, lo_edge=0, hi_edge=None):
    """Cut spans along one axis; a vertical cut is searched only inside the horizontal band [lo_edge, hi_edge)."""
    hi_edge = (H if axis == "x" else W) if hi_edge is None else hi_edge
    spans, prev = [], 0
    for k in range(1, parts):
        expect = round(total * k / parts)
        win = max(6, round(total * 0.06))
        best, best_score = expect, None
        for p in range(expect - win, expect + win):
            box = (p, lo_edge, p + 1, hi_edge) if axis == "x" else (0, p, W, p + 1)
            score = sum(ImageStat.Stat(im.crop(box)).stddev) / 3
            if best_score is None or score < best_score:
                best, best_score = p, score
        # widen to the plain band around the best line
        lo = hi = best
        while lo > expect - win:
            box = (lo - 1, lo_edge, lo, hi_edge) if axis == "x" else (0, lo - 1, W, lo)
            if sum(ImageStat.Stat(im.crop(box)).stddev) / 3 > best_score + 8:
                break
            lo -= 1
        while hi < expect + win:
            box = (hi + 1, lo_edge, hi + 2, hi_edge) if axis == "x" else (0, hi + 1, W, hi + 2)
            if sum(ImageStat.Stat(im.crop(box)).stddev) / 3 > best_score + 8:
                break
            hi += 1
        mid = (lo + hi) // 2
        spans.append((prev, mid))
        prev = mid
    spans.append((prev, total))
    return spans


ys = cuts(H, rows, "y")
i = 0
for (y0, y1), n in zip(ys, row_counts):
    for x0, x1 in cuts(W, n, "x", y0, y1):
        panel = im.crop((x0 + trim, y0 + trim, x1 - trim, y1 - trim))
        if aspect:
            w, h = panel.size
            if w / h > aspect:
                nw = round(h * aspect)
                panel = panel.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
            else:
                nh = round(w / aspect)
                panel = panel.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        path = os.path.join(out, names[i] + ".png")
        panel.save(path)
        warn = "  WARNING small" if panel.width < 500 else ""
        print(path, panel.size, warn)
        i += 1
