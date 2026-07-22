"""Wrap the thesis body content into a standalone, self-contained HTML document.

docs/THESIS.html is authored as artifact-body content: the hosting runtime supplies
the doctype, head and a CSS reset. This script produces a file that opens correctly
on its own by double-clicking, and that prints to a clean A4 PDF for submission.

No text is rewritten. Only the document shell and print rules are added.
"""
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
SRC = DOCS / "THESIS.html"
OUT = DOCS / "SafeTails_Thesis.html"

s = SRC.read_text(encoding="utf-8")

split = s.find("</style>") + len("</style>")
assert split > len("</style>"), "expected exactly one style block at the top"
head, body = s[:split], s[split:]

# Reuse the light palette verbatim so the printed copy is readable regardless of
# the reader's colour scheme. A dark-mode screen must not produce a dark printout.
root = re.search(r":root\{(.*?)\n\}", head, re.S)
assert root, "could not locate the light token block"
light_tokens = root.group(1).strip()

EXTRA = f"""
<style>
*,*::before,*::after{{box-sizing:border-box}}
img,svg{{max-width:100%}}
table{{border-collapse:collapse}}
:target{{scroll-margin-top:18px}}

@page{{size:A4;margin:20mm 18mm}}
@media print{{
  :root{{{light_tokens}}}
  html,body{{background:#FFFFFF}}
  body{{font-size:11.2pt;line-height:1.55;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .shell{{display:block;max-width:none}}
  main{{padding:0}}
  .wrap{{max-width:none}}
  a{{color:inherit;text-decoration:none}}
  section.sec{{break-before:page}}
  section.sec:first-of-type{{break-before:auto}}
  h1,h2,h3,h4{{break-after:avoid}}
  figure,tr,li{{break-inside:avoid}}
  thead{{display:table-header-group}}
}}
</style>
"""

DOC = (
    '<!doctype html>\n<html lang="en-GB">\n<head>\n'
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    '<meta name="color-scheme" content="light dark">\n'
    '<meta name="author" content="Shreeya Paudel">\n'
    '<meta name="description" content="BSc (Hons) Computing dissertation on SafeTails, '
    'a gamified, artificial-intelligence-supported geo-spatial reporting framework for '
    'stray animals in urban Kathmandu.">\n'
    f"{head}\n{EXTRA}</head>\n<body>{body}\n</body>\n</html>\n"
)

OUT.write_text(DOC, encoding="utf-8")
print(f"wrote {OUT.name}  ({len(DOC.encode('utf-8')) / 1024:.0f} KB, self-contained)")
