"""Count the running prose from the introduction to the conclusion.

This is the figure a word limit normally refers to: paragraphs and list items in the
numbered sections only. It excludes front matter, the diagram-only overview section,
figure and table captions, text inside tables, text inside diagrams, the reference list
and the appendices.
"""
import html
import re
import sys
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "docs" / "THESIS.html"
s = P.read_text(encoding="utf-8")

start = s.find('<section class="sec" id="s02">')
end = s.find('<section class="sec" id="refs">')
assert start != -1 and end > start
body = s[start:end]


def prose(blk):
    blk = re.sub(r"<figure>.*?</figure>", "", blk, flags=re.S)
    blk = re.sub(r"<table>.*?</table>", "", blk, flags=re.S)
    return [" ".join(html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).split())
            for m in re.finditer(r"<(p|li)(?:\s[^>]*)?>(.*?)</\1>", blk, re.S)]


rows, total = [], 0
for m in re.finditer(r'<section class="sec" id="(s\d+)">(.*?)(?=<section class="sec"|$)', body, re.S):
    w = sum(len(t.split()) for t in prose(m.group(2)))
    rows.append((m.group(1), w))
    total += w

if "--per-section" in sys.argv:
    for sid, w in rows:
        print(f"  {sid} {w:>5}")
    print()
print(f"INTRODUCTION TO CONCLUSION: {total} words")
print(f"target 20,000: {'under by ' + str(20000 - total) if total <= 20000 else 'over by ' + str(total - 20000)}")
