"""Four further figures for the sections that were still carrying only one, or none."""
import json
from pathlib import Path

OUT = Path(__file__).parent / "figs_final.json"


def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"{ww}{ll}>{s}</text>'


def box(x, y, w, h, fill="var(--surface-2)", stroke="var(--rule-strong)", r=5, sw=1.3, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"{d}/>')


def arr(x1, y1, x2, y2, col="var(--ink-faint)", sw=1.5, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{col}" stroke-width="{sw}" fill="none" '
            f'marker-end="url(#fa)"{d}/>')


DEFS = ('<defs><marker id="fa" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--ink-faint)"/></marker>'
        '<marker id="fc" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--crit)"/></marker></defs>')


# ================================================ 1. pixels to a trusted label (section 15)
def label_chain():
    W, H = 760, 384
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="The chain from a photograph to a label a system can act on">', DEFS]
    p.append(T(18, 22, "FROM A PHOTOGRAPH TO A LABEL A SYSTEM CAN ACT ON", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Accuracy describes one link. Two of the others failed in this project, and "
                       "neither failure changed the accuracy figure.", 11, "start", "svg-mut"))
    stages = [("Photograph", "street conditions,\nnot studio ones", "var(--ink-faint)"),
              ("Features", "transfer learning from\na large general corpus", "var(--primary)"),
              ("Raw scores", "one number per class,\nnot yet meaningful", "var(--primary)"),
              ("Confidence", "temperature scaling makes\n0.9 mean nine in ten", "var(--accent)"),
              ("Decision", "threshold decides use\nor send to a person", "var(--good)")]
    bw, gap, y0 = 128, 16, 84
    for i, (name, sub, col) in enumerate(stages):
        x = 18 + i * (bw + gap)
        p.append(box(x, y0, bw, 76, "var(--surface-2)", col, 5, 1.4))
        p.append(f'<rect x="{x}" y="{y0}" width="{bw}" height="4" rx="2" fill="{col}"/>')
        p.append(T(x + bw / 2, y0 + 26, name, 11.5, "middle", "svg-txt", "700"))
        for j, ln in enumerate(sub.split("\n")):
            p.append(T(x + bw / 2, y0 + 44 + j * 12, ln, 8.6, cls="svg-mut"))
        if i < 4:
            p.append(arr(x + bw + 2, y0 + 38, x + bw + gap - 4, y0 + 38))

    # where the literature attaches
    p.append(T(18, y0 - 12, "WHAT THE LITERATURE COVERS", 9, "start", "svg-mut", "700", "0.6"))
    lit = [(18 + bw + gap, "Beery et al. (2018):\naccuracy falls across sources"),
           (18 + 3 * (bw + gap), "Guo et al. (2017):\nmodern networks are miscalibrated")]
    for x, txt in lit:
        p.append(f'<path d="M{x+bw/2},{y0+76} L{x+bw/2},{y0+96}" stroke="var(--rule-strong)" stroke-width="1" stroke-dasharray="3 3"/>')
        for j, ln in enumerate(txt.split("\n")):
            p.append(T(x + bw / 2, y0 + 112 + j * 13, ln, 9, cls="svg-mut"))

    # the two failures
    fy = 258
    p.append(box(18, fy, 360, 74, "var(--crit-soft)", "var(--crit)"))
    p.append(T(32, fy + 20, "FAILURE ONE: THE WRONG LINK WAS MEASURED", 9, "start", "svg-mut", "700", "0.6"))
    p.append(T(32, fy + 38, "The notebook measured a model that was not the one", 9.3, "start", "svg-mut"))
    p.append(T(32, fy + 52, "being served. 98.4 percent became 91.0 percent when", 9.3, "start", "svg-mut"))
    p.append(T(32, fy + 66, "the exported model was measured instead.", 9.3, "start", "svg-mut"))
    p.append(box(398, fy, 344, 74, "var(--crit-soft)", "var(--crit)"))
    p.append(T(412, fy + 20, "FAILURE TWO: A LATER LINK DISCARDED THE WORK", 9, "start", "svg-mut", "700", "0.6"))
    p.append(T(412, fy + 38, "Confidence was so low that the threshold diverted 87", 9.3, "start", "svg-mut"))
    p.append(T(412, fy + 52, "percent of predictions, most of them correct. Accuracy", 9.3, "start", "svg-mut"))
    p.append(T(412, fy + 66, "was unchanged and nothing reported an error.", 9.3, "start", "svg-mut"))
    p.append(T(18, H - 8, "A project that measures only the second box can ship a model that never reaches "
                          "a decision at all.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ================================================ 2. six grounds (section 09)
def six_grounds():
    W, H = 760, 300
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Six grounds on which the study is justified">', DEFS]
    p.append(T(18, 22, "SIX GROUNDS FOR DOING THIS STUDY", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "No single ground carries the case. The argument is that all six hold at once.",
               11, "start", "svg-mut"))
    cards = [("Social", "Free-roaming animals are\npart of daily life, and their\nwelfare meets public health.", "var(--crit)"),
             ("Technological", "Transfer learning, spatial\ndatabases and free hosting\nmake this feasible now.", "var(--primary)"),
             ("Academic", "The components are well\nstudied separately and not\nintegrated for this purpose.", "var(--good)"),
             ("Interdisciplinary", "Computer vision, spatial\nanalysis, psychology and\ninformation economics.", "var(--accent)"),
             ("Practical", "Vaccination programmes,\nrescuers and wards each\nhave a use for the output.", "var(--good)"),
             ("Ethical", "Worth building only if\nlocations are generalised,\nclaims hedged, errors known.", "var(--warn)")]
    cw, ch, gx, gy = 236, 96, 18, 66
    for i, (name, body, col) in enumerate(cards):
        x = gx + (i % 3) * (cw + 15)
        y = gy + (i // 3) * (ch + 16)
        p.append(box(x, y, cw, ch, "var(--surface-2)", col, 5, 1.3))
        p.append(f'<rect x="{x}" y="{y}" width="4" height="{ch}" rx="2" fill="{col}"/>')
        p.append(T(x + 16, y + 22, name, 11.5, "start", "svg-txt", "700"))
        for j, ln in enumerate(body.split("\n")):
            p.append(T(x + 16, y + 42 + j * 14, ln, 9.2, "start", "svg-mut"))
    p.append(T(18, H - 10, "The last ground is a condition rather than a reason: a version failing it "
                           "would be harder to justify than no platform at all.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ================================================ 3. promise against practice (section 25)
def promise_practice():
    rows = [("Locations will be generalised", "Rounding was not idempotent at cell edges",
             "An automated test caught it", "var(--good)"),
            ("Outputs will be labelled estimates", "The label was there; the held state explained nothing",
             "An interface change, not a label", "var(--good)"),
            ("Data leaving the system is minimised", "Only derived signals go out, no image, no identifier",
             "Held as designed", "var(--good)"),
            ("Results will be reported honestly", "The reproducible figure was the lower one",
             "Both reported, the lower treated as true", "var(--good)"),
            ("Contributors consent to what happens", "Consent covers storage, not retraining on their photos",
             "Unresolved, and recorded as such", "var(--crit)")]
    W, H = 760, 306
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Ethical commitments set at design time against what the code actually did">', DEFS]
    p.append(T(18, 22, "WHAT WAS PROMISED, AND WHAT THE CODE ACTUALLY DID", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Two of the five commitments were not kept by the implementation that claimed them.",
               11, "start", "svg-mut"))
    p.append(T(150, 62, "COMMITMENT", 8.5, "middle", "svg-mut", "700", "0.6"))
    p.append(T(420, 62, "WHAT WAS FOUND", 8.5, "middle", "svg-mut", "700", "0.6"))
    p.append(T(650, 62, "OUTCOME", 8.5, "middle", "svg-mut", "700", "0.6"))
    y0, rh = 72, 42
    for i, (promise, found, outcome, col) in enumerate(rows):
        y = y0 + i * rh
        p.append(box(18, y, W - 36, rh - 6, "var(--surface-2)", "var(--rule)", 4, 1))
        p.append(f'<rect x="18" y="{y}" width="5" height="{rh-6}" rx="2" fill="{col}"/>')
        p.append(T(34, y + 22, promise, 9.6, "start", "svg-txt", "700"))
        p.append(T(292, y + 22, found, 9.2, "start", "svg-mut"))
        p.append(f'<path d="M286,{y+6} L286,{y+rh-12}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(f'<path d="M560,{y+6} L560,{y+rh-12}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(T(572, y + 22, outcome, 9.2, "start", "svg-mut", "700"))
    p.append(T(18, H - 10, "A commitment written in a design document is not a property of the system. It "
                           "becomes one when something can fail if it is broken.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ================================================ 4. closing summary (section 30)
def closing_summary():
    W, H = 760, 330
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="What was built, measured, not claimed and left to do">', DEFS]
    p.append(T(18, 22, "WHERE THIS THESIS ENDS", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "The right-hand panels matter as much as the left. Nothing in them is claimed "
                       "anywhere in this document.", 11, "start", "svg-mut"))
    panels = [
        ("BUILT", "var(--primary)",
         ["A working platform: photo and pin to", "a structured, mappable record",
          "Five-class classifier, exported and served", "Three-tier validation with reputation",
          "Spatial clustering and ward analytics"]),
        ("MEASURED", "var(--good)",
         ["91.0% on held-out, 86.7% cross-source", "87.1% on collected Kathmandu photographs",
          "68.4% on injured animals", "Calibration error 0.357 to 0.033",
          "37 tests; gaming earns 0.02 per report"]),
        ("NOT CLAIMED", "var(--crit)",
         ["Accuracy on contributor phone photos", "Any injury-detection accuracy",
          "That anyone reports more because of this", "That any animal was rescued",
          "Any spatial fact about Kathmandu"]),
        ("NEXT", "var(--accent)",
         ["Fifty phone photographs per class", "Run the prepared usability study",
          "Real reports, then spatial findings", "Decompose the residual class",
          "A longitudinal test of the incentives"]),
    ]
    pw, ph, gx, gy = 178, 200, 18, 66
    for i, (title, col, items) in enumerate(panels):
        x = gx + i * (pw + 8)
        p.append(box(x, gy, pw, ph, "var(--surface-2)", col, 5, 1.4))
        p.append(f'<rect x="{x}" y="{gy}" width="{pw}" height="5" rx="2" fill="{col}"/>')
        p.append(T(x + pw / 2, gy + 26, title, 10.5, "middle", "svg-txt", "700", "0.7"))
        for j, it in enumerate(items):
            p.append(T(x + 10, gy + 52 + j * 29, it[:34], 8.6, "start", "svg-mut"))
            if len(it) > 34:
                p.append(T(x + 10, gy + 62 + j * 29, it[34:], 8.6, "start", "svg-mut"))
    p.append(box(18, 282, W - 36, 40))
    p.append(T(32, 302, "The most useful result was not the accuracy figure but what it concealed: a "
                        "model that looked as though it worked, and was not working at all.", 9.5,
               "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


figs = {"label_chain": label_chain(), "six_grounds": six_grounds(),
        "promise_practice": promise_practice(), "closing_summary": closing_summary()}
OUT.write_text(json.dumps(figs))
for k, v in figs.items():
    print(f"built {k:<18} {len(v):>6} chars")
