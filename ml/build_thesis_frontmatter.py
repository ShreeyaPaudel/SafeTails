"""Add dissertation front matter: declaration, acknowledgements, contents, list of figures."""
import re, html
from pathlib import Path

P = Path(r"C:/Users/TUF/Desktop/Softwarica/Thesis Code/docs/THESIS.html")
s = P.read_text(encoding="utf-8")

# ---------- harvest structure ----------
secs = []  # (id, number, title, [subsection titles])
for m in re.finditer(r'<section class="sec" id="(s\d+)">(.*?)(?=<section class="sec"|<section class="sec" id="refs")', s, re.S):
    sid, blk = m.group(1), m.group(2)
    eb = re.search(r'<div class="eyebrow">(\d+)\s*&middot;', blk)
    h2 = re.search(r'<h2>(.*?)</h2>', blk, re.S)
    if not h2:
        continue
    num = eb.group(1) if eb else sid[1:]
    title = " ".join(html.unescape(re.sub(r'<[^>]+>', '', h2.group(1))).split())
    subs = [" ".join(html.unescape(re.sub(r'<[^>]+>', '', x)).split())
            for x in re.findall(r'<h3>(.*?)</h3>', blk, re.S)]
    secs.append((sid, num, title, subs))

figs = []  # (label, caption-start)
for m in re.finditer(r'<figcaption><b>((?:Figure|Table) [\dA-D]+\.\d+)\.</b>\s*(.*?)</figcaption>', s, re.S):
    cap = " ".join(html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).split())
    figs.append((m.group(1), cap))

print(f"harvested {len(secs)} sections, {len(figs)} figures/tables")

# ---------- build front matter ----------
toc_rows = []
for sid, num, title, subs in secs:
    toc_rows.append(f'<tr><td class="num">{num}</td><td><a href="#{sid}"><b>{title}</b></a>'
                    + (("<br><span class='sublist'>" + " &middot; ".join(subs) + "</span>") if subs else "")
                    + "</td></tr>")
toc_rows.append('<tr><td class="num"></td><td><a href="#refs"><b>References</b></a></td></tr>')
toc_rows.append('<tr><td class="num"></td><td><a href="#appx"><b>Appendices</b></a></td></tr>')

fig_rows = "".join(f'<tr><td class="num" style="white-space:nowrap">{lab}</td><td>{cap[:150]}</td></tr>'
                   for lab, cap in figs)

FM = '''
<!-- ============ FRONT MATTER ============ -->
<section class="sec" id="declaration">
<div class="eyebrow">Declaration</div>
<h2>Declaration of Originality</h2>
<p>I declare that this dissertation is my own work, carried out for the module ST6000CEM as part of
the BSc (Hons) Computing programme at Softwarica College of Information Technology and E-Commerce in
academic partnership with Coventry University. All sources are acknowledged and referenced, and all
material taken from other works is identified as such.</p>
<p>The software artefact described here was designed and built by me. Every quantitative result
reported was produced by running the artefact and recording the output, and the procedures used are
described in enough detail to be repeated. Where a result did not reproduce, both figures are
reported and the difference is examined rather than resolved in favour of the more flattering one.
Where something was not measured, it is stated plainly and no claim rests on it.</p>
<div class="ev ev-note">
<span class="ev-tag">Use of artificial intelligence tools</span>
<p>Artificial intelligence assistance was used during development and writing. All measured results,
all evaluation procedures and all claims in this document were verified by running the code and
inspecting the output. Responsibility for the accuracy of everything reported here is mine.</p>
</div>
</section>

<section class="sec" id="ack">
<div class="eyebrow">Acknowledgements</div>
<h2>Acknowledgements</h2>
<p>I thank my supervisor, Manoj Shrestha, for guidance throughout this project, and the staff of
Softwarica College of Information Technology and E-Commerce for their teaching and support.</p>
<p>I also acknowledge the people and organisations who feed, treat and rescue street animals in the
Kathmandu Valley without recognition or funding. This project exists because that work is real and
because so little of it is currently recorded anywhere.</p>
</section>

<section class="sec" id="toc">
<div class="eyebrow">Contents</div>
<h2>Table of Contents</h2>
<figure>
<div class="fig-body">
<table class="toc-table">
<thead><tr><th class="num" style="width:52px">No.</th><th>Section</th></tr></thead>
<tbody>''' + "".join(toc_rows) + '''</tbody>
</table>
</div>
</figure>
</section>

<section class="sec" id="lof">
<div class="eyebrow">Figures</div>
<h2>List of Figures and Tables</h2>
<figure>
<div class="fig-body">
<table>
<thead><tr><th style="width:96px">Label</th><th>Caption</th></tr></thead>
<tbody>''' + fig_rows + '''</tbody>
</table>
</div>
<figcaption>All figures and tables were generated for this dissertation. Charts reporting model
performance are produced directly from the recorded evaluation output rather than drawn by hand.</figcaption>
</figure>
</section>
'''

# insert before Section 01
i = s.find('<!-- ============ 01 ARCHITECTURE ============ -->')
if i == -1:
    i = s.find('<section class="sec" id="s01">')
assert i != -1
s = s[:i] + FM + "\n" + s[i:]

# ---------- nav entries ----------
navmark = '<div class="toc-grp">Overview</div> <a href="#s00"><span class="n">00</span>Cover Page</a>'
assert navmark in s, 'nav anchor'
s = s.replace(navmark,
  '<div class="toc-grp">Front Matter</div> '
  '<a href="#s00"><span class="n"></span>Cover and Abstract</a> '
  '<a href="#declaration"><span class="n"></span>Declaration</a> '
  '<a href="#ack"><span class="n"></span>Acknowledgements</a> '
  '<a href="#toc"><span class="n"></span>Table of Contents</a> '
  '<a href="#lof"><span class="n"></span>List of Figures</a> '
  '<div class="toc-grp">Overview</div>', 1)

# ---------- styles for the contents table ----------
s = s.replace("@media print{.toc{display:none}.shell{grid-template-columns:1fr}}",
 ".toc-table td{vertical-align:top}\n"
 ".toc-table a{text-decoration:none}\n"
 ".toc-table a:hover{text-decoration:underline}\n"
 ".sublist{color:var(--ink-faint);font-size:11.5px;line-height:1.5}\n"
 "@media print{.toc{display:none}.shell{grid-template-columns:1fr}}")

P.write_text(s, encoding="utf-8")
print("front matter added; length", len(s))
