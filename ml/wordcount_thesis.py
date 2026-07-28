"""Definitive word counts, several ways, so the reported figure is defensible."""
import re, html
from pathlib import Path

s = Path(r"C:/Users/TUF/Desktop/Softwarica/Thesis Code/docs/THESIS.html").read_text(encoding="utf-8")
s_nostyle = re.sub(r'<style>.*?</style>', '', s, flags=re.S)


def w(frag, pat=r'<(?:p|li)(?:\s[^>]*)?>(.*?)</(?:p|li)>'):
    return sum(len(html.unescape(re.sub(r'<[^>]+>', ' ', c)).split())
               for c in re.findall(pat, frag, re.S))


def region(rid):
    i = s.find(f'id="{rid}"')
    if i == -1: return ""
    i = s.rfind("<section", 0, i)
    return s[i:s.find("</section>", i) + 10]


prose_all = w(s_nostyle)
fm = sum(w(region(r)) for r in ["declaration", "ack", "toc", "lof"])
refs = w(region("refs"))
body = prose_all - fm - refs

# captions
caps = sum(len(html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1))).split())
           for m in re.finditer(r'<figcaption>(.*?)</figcaption>', s, re.S))
# table cell text
cells = sum(len(html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1))).split())
            for m in re.finditer(r'<t[dh](?:\s[^>]*)?>(.*?)</t[dh]>', s, re.S))
# svg label text
svgtxt = sum(len(html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1))).split())
             for m in re.finditer(r'<text(?:\s[^>]*)?>(.*?)</text>', s, re.S))

print("BODY PROSE  (paragraphs and lists only, excl. front matter and references)")
print(f"  {body:>6}   <-- the thesis word count")
print()
print("Excluded from that figure:")
print(f"  {fm:>6}   front matter (declaration, acknowledgements)")
print(f"  {refs:>6}   reference list")
print(f"  {caps:>6}   figure and table captions")
print(f"  {cells:>6}   table cell text")
print(f"  {svgtxt:>6}   text labels inside diagrams")
print()
print(f"If captions and tables were also counted: {body + caps + cells}")
print(f"Under 20,000? {'YES' if body < 20000 else 'NO'}")
