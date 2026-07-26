"""Refresh the contents page and figure list after flattening."""
import re, html
from pathlib import Path

P = Path(r"C:/Users/TUF/Desktop/Softwarica/Thesis Code/docs/THESIS.html")
s = P.read_text(encoding="utf-8")

s = s.replace("<h3>24.6 Technical challenges encountered</h3>", "<h3>Technical challenges encountered</h3>")

# ---- harvest ----
secs = []
for m in re.finditer(r'<section class="sec" id="(s\d+)">', s):
    sid = m.group(1)
    end = s.find('<section class="sec"', m.end())
    blk = s[m.start():end if end != -1 else len(s)]
    eb = re.search(r'<div class="eyebrow">(\d+)\s*&middot;', blk)
    h2 = re.search(r'<h2>(.*?)</h2>', blk, re.S)
    if not h2:
        continue
    title = " ".join(html.unescape(re.sub(r'<[^>]+>', '', h2.group(1))).split())
    subs = [" ".join(html.unescape(re.sub(r'<[^>]+>', '', x)).split())
            for x in re.findall(r'<h[34]>(.*?)</h[34]>', blk, re.S)]
    secs.append((sid, eb.group(1) if eb else "", title, subs))

figs = [(m.group(1), " ".join(html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).split()))
        for m in re.finditer(r'<figcaption><b>((?:Figure|Table) [\dA-Z]+\.\d+)\.</b>\s*(.*?)</figcaption>', s, re.S)]

toc_rows = "".join(
    f'<tr><td class="num">{num}</td><td><a href="#{sid}"><b>{title}</b></a>'
    + (("<br><span class='sublist'>" + " &middot; ".join(subs) + "</span>") if subs else "")
    + "</td></tr>"
    for sid, num, title, subs in secs)
toc_rows += '<tr><td class="num"></td><td><a href="#refs"><b>References</b></a></td></tr>'
toc_rows += '<tr><td class="num"></td><td><a href="#appx"><b>Appendices</b></a></td></tr>'

fig_rows = "".join(f'<tr><td class="num" style="white-space:nowrap">{lab}</td><td>{cap[:150]}</td></tr>'
                   for lab, cap in figs)


def swap_tbody(anchor_id, rows):
    global s
    i = s.find(f'id="{anchor_id}"')
    assert i != -1, anchor_id
    a = s.find("<tbody>", i) + 7
    b = s.find("</tbody>", a)
    s = s[:a] + rows + s[b:]


swap_tbody("toc", toc_rows)
swap_tbody("lof", fig_rows)

P.write_text(s, encoding="utf-8")
print(f"contents refreshed: {len(secs)} sections, {len(figs)} figures/tables")
