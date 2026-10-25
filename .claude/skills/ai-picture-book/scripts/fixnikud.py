"""Fixes common Dicta nikud slips in data/books/<slug>/book.json textNikud and writes the result for review.

    python -I .claude/skills/ai-picture-book/scripts/fixnikud.py <out.txt> <slug> [<slug> ...]   (run from the project root)

Rules: consonant+holam+vav -> consonant+holam (הַכֹּול -> הַכֹּל); qubuts+vav -> shuruk; dual -ayim with a doubled yod.
Read <out.txt> afterwards and fix names, gender and shin/sin by hand.
"""
import io, json, re, sys

H, Q, D = "\u05b9", "\u05bb", "\u05bc"

def fix(t):
    t = re.sub(H + "ו(?![" + H + D + "])", H, t)
    t = t.replace(Q + "ו", "ו" + D)
    t = t.replace("ַיִים", "ַיִם").replace("ָיִים", "ָיִם")
    t = t.replace("שִׁישִּׁי", "שִׁשִּׁי")
    return t

out = io.open(sys.argv[1], "w", encoding="utf8")
for slug in sys.argv[2:]:
    f = "data/books/%s/book.json" % slug
    d = json.load(io.open(f, encoding="utf8"))
    out.write("##### " + slug + "\n")
    for i, p in enumerate(d["pages"], 1):
        p["textNikud"] = fix(p.get("textNikud", ""))
        out.write("[%d] %s\n" % (i, p["textNikud"]))
    io.open(f, "w", encoding="utf8").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
