"""Conceptual diagrams, charts and infographics for the sections that carried none.

Every figure is theme-aware: colour comes from the document's CSS custom properties, and no
text is ever placed on a --primary fill, because that token inverts between light and dark.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "figs_extra.json"


def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"{ww}{ll}>{s}</text>'


def box(x, y, w, h, fill="var(--surface-2)", stroke="var(--rule-strong)", r=5, sw=1.3, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"{d}/>')


def arrow(x1, y1, x2, y2, col="var(--ink-faint)", sw=1.4, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{col}" stroke-width="{sw}" '
            f'marker-end="url(#xa)" fill="none"{d}/>')


DEFS = ('<defs><marker id="xa" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--ink-faint)"/></marker>'
        '<marker id="xc" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--crit)"/></marker></defs>')


# ============================================================ 1. theory chain (section 04)
def theory_chain():
    W, H = 760, 430
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="How the four mechanisms chain together and where the platform can act">', DEFS]
    p.append(T(18, 22, "FOUR MECHANISMS, ONE CHAIN", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Each stage is explained by a different mechanism. Only the last two are reachable by software.",
               11, "start", "svg-mut"))

    stages = [
        ("Supernormal releasers", "Lorenz (1943)",
         "Infant features fade with age.", "Care is withdrawn exactly", "when need is greatest.",
         "ANIMAL ON THE STREET", "var(--crit)", "var(--crit-soft)", False),
        ("Bystander effect", "Darley and Latané (1968)",
         "Many witnesses, divided", "responsibility, and acting", "looks futile.",
         "NOBODY REPORTS IT", "var(--warn)", "var(--warn-soft)", True),
        ("Free-riding on a public good", "Olson (1965)",
         "Everyone benefits from the", "record, nobody is paid to", "build it.",
         "NO DATA EXISTS", "var(--warn)", "var(--warn-soft)", True),
        ("Quality uncertainty", "Akerlof (1970)",
         "Reports cannot be told apart", "by quality, so bad ones", "drive out good.",
         "DATA IS NOT TRUSTED", "var(--warn)", "var(--warn-soft)", True),
    ]
    y0, bh, gap = 62, 78, 12
    for i, (name, cite, l1, l2, l3, outcome, col, soft, reachable) in enumerate(stages):
        y = y0 + i * (bh + gap)
        p.append(box(18, y, 214, bh, soft, col))
        p.append(T(28, y + 22, name, 11.5, "start", "svg-txt", "700"))
        p.append(T(28, y + 38, cite, 9, "start", "svg-mut"))
        p.append(T(28, y + 56, l1, 9.5, "start", "svg-mut"))
        p.append(T(28, y + 69, l2 + " " + l3, 9.5, "start", "svg-mut"))
        p.append(arrow(238, y + bh / 2, 286, y + bh / 2))
        p.append(box(292, y + 16, 196, bh - 32, "var(--surface)", col))
        p.append(T(390, y + bh / 2 + 4, outcome, 10.5, "middle", "svg-txt", "700"))
        if i < 3:
            p.append(arrow(390, y + bh - 14, 390, y + bh + gap + 14, "var(--ink-faint)", 1.2))

    # the reach boundary
    p.append(box(508, y0 + bh + gap - 6, 234, 3 * (bh + gap) - 6, "none", "var(--good)", 6, 1.6, "5 4"))
    p.append(T(625, y0 + bh + gap + 18, "WHAT THIS PLATFORM CAN REACH", 9, "middle", "svg-mut", "700", "0.6"))
    answers = ["One identified animal per report,",
               "attributed to a named contributor,",
               "with the outcome returned to them.",
               "",
               "Selective incentives: points, levels",
               "and reputation that only validated",
               "reports can earn.",
               "",
               "Reputation as a quality signal, so",
               "publication is screened rather than",
               "moderated after the damage."]
    for j, line in enumerate(answers):
        p.append(T(524, y0 + bh + gap + 42 + j * 15, line, 9.5, "start", "svg-mut"))

    p.append(box(508, y0, 234, bh, "none", "var(--rule-strong)", 6, 1.3, "3 3"))
    p.append(T(625, y0 + 30, "OUT OF REACH", 9, "middle", "svg-mut", "700", "0.6"))
    p.append(T(625, y0 + 50, "No platform reverses the", 9.5, cls="svg-mut"))
    p.append(T(625, y0 + 64, "decision to abandon an animal.", 9.5, cls="svg-mut"))

    p.append(T(18, H - 10, "The scope claim of this thesis is the boundary between the two dashed panels: "
                           "the artefact addresses the reporting failure, not its cause.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 2. accuracy cascade (section 27)
def accuracy_cascade():
    W, H = 760, 360
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="How the reported accuracy falls as the test conditions approach deployment">', DEFS]
    p.append(T(18, 22, "ONE MODEL, FIVE DIFFERENT ACCURACIES", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Each bar is the same model. What changes is what it was asked to recognise.",
               11, "start", "svg-mut"))

    bars = [
        ("98.4%", 98.4, "Recorded in the training notebook", "Did not reproduce. Not used in this thesis.",
         "var(--ink-faint)", True),
        ("91.0%", 91.0, "Held-out split, same source", "The honest figure for familiar images.",
         "var(--primary)", False),
        ("86.7%", 86.7, "Independent buffalo collection", "A different source, one class only.",
         "var(--primary)", False),
        ("87.1%", 87.1, "Collected Kathmandu photographs", "Mostly public imagery, three classes.",
         "var(--accent)", False),
        ("68.4%", 68.4, "Injured animals only", "The reports the platform exists to receive.",
         "var(--crit)", False),
    ]
    x0, plot, bh, gap, y0 = 236, 350, 34, 20, 66
    for i, (lab, v, what, note, col, ghost) in enumerate(bars):
        y = y0 + i * (bh + gap)
        p.append(T(x0 - 12, y + 15, what, 10, "end", "svg-txt", "700"))
        p.append(T(x0 - 12, y + 29, note, 9, "end", "svg-mut"))
        w = plot * v / 100
        if ghost:
            p.append(f'<rect x="{x0}" y="{y}" width="{w:.1f}" height="{bh}" rx="3" fill="none" '
                     f'stroke="{col}" stroke-width="1.4" stroke-dasharray="4 3"/>')
            p.append(f'<path d="M{x0+6},{y+bh/2} L{x0+w-6:.1f},{y+bh/2}" stroke="{col}" stroke-width="1.2"/>')
        else:
            p.append(f'<rect x="{x0}" y="{y}" width="{w:.1f}" height="{bh}" rx="3" fill="{col}" opacity="0.88"/>')
        p.append(T(x0 + w + 10, y + 23, lab, 13, "start", "svg-txt", "700"))

    yb = y0 + 5 * (bh + gap) + 4
    p.append(f'<path d="M{x0},{y0-6} L{x0},{yb}" stroke="var(--rule-strong)" stroke-width="1"/>')
    p.append(box(18, yb + 14, W - 36, 52))
    p.append(T(32, yb + 34, "Reading down the chart is reading towards deployment. The gap between the top bar and "
                            "the bottom one is the distance between", 9.5, "start", "svg-mut"))
    p.append(T(32, yb + 50, "a number that describes a notebook and a number that describes a street.",
               9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 3. framework coverage (section 28)
def framework_coverage():
    W, H = 760, 350
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Coverage against the seven requirements for trustworthy artificial intelligence">', DEFS]
    p.append(T(18, 22, "SEVEN REQUIREMENTS FOR TRUSTWORTHY ARTIFICIAL INTELLIGENCE", 9.5, "start",
               "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "European Commission High-Level Expert Group (2019), read against what this system actually does.",
               11, "start", "svg-mut"))

    rows = [
        ("Human agency and oversight", "Advisory labels, always correctable by a person", "met"),
        ("Technical robustness and safety", "Calibrated confidence; uncertain cases routed to people", "met"),
        ("Privacy and data governance", "Location generalised to about 100 m; metadata destroyed", "met"),
        ("Transparency", "Every automated output is labelled as an estimate", "met"),
        ("Accountability", "Submissions and predictions are logged, but no appeal route exists", "partial"),
        ("Diversity and fairness", "Never assessed across lighting, camera or neighbourhood", "none"),
        ("Societal and environmental wellbeing", "Argued in the framing, never evaluated", "none"),
    ]
    style = {"met": ("var(--good)", "var(--good-soft)", "addressed"),
             "partial": ("var(--warn)", "var(--warn-soft)", "partly addressed"),
             "none": ("var(--crit)", "var(--crit-soft)", "not assessed")}
    y0, rh = 64, 36
    for i, (name, how, state) in enumerate(rows):
        col, soft, word = style[state]
        y = y0 + i * rh
        p.append(box(18, y, W - 36, rh - 5, soft, col, 4, 1))
        p.append(f'<rect x="18" y="{y}" width="5" height="{rh-5}" rx="2" fill="{col}"/>')
        p.append(T(34, y + 20, name, 11, "start", "svg-txt", "700"))
        p.append(T(292, y + 20, how, 9.5, "start", "svg-mut"))
        p.append(T(W - 32, y + 20, word, 9.5, "end", "svg-mut", "700"))

    yb = y0 + 7 * rh + 8
    p.append(T(18, yb + 14, "Four met, one partly met, two not assessed. The two unassessed requirements are "
                            "reported as findings rather than omissions:", 9.5, "start", "svg-mut"))
    p.append(T(18, yb + 30, "a system that has never been tested for uneven accuracy cannot claim to be fair, "
                            "and saying so is part of the answer.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 4. triangulation (section 12)
def triangulation():
    W, H = 760, 330
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Independent evidence sources supporting each kind of claim">', DEFS]
    p.append(T(18, 22, "TRIANGULATION: WHAT SUPPORTS EACH KIND OF CLAIM", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Sources are grouped so that the weaknesses of one are not shared by the others.",
               11, "start", "svg-mut"))

    groups = [
        ("What the classifier does", "var(--primary)",
         ["Held-out split of the training distribution",
          "Independent buffalo collection, different authors",
          "Photographs collected in Kathmandu"], "three sources"),
        ("What the rules do", "var(--good)",
         ["Thirty-seven automated tests of the rules as written",
          "Simulation driving the production functions",
          "Live end-to-end run against the real database"], "three sources"),
        ("What the interface does", "var(--warn)",
         ["Heuristic evaluation (Nielsen, 1994)",
          "Cognitive walkthrough (Wharton et al., 1994)",
          "No third source, and no participants"], "two sources, stated as a weakness"),
    ]
    x0, cw, gap = 18, 236, 12
    for i, (title, col, items, note) in enumerate(groups):
        x = x0 + i * (cw + gap)
        p.append(box(x, 62, cw, 176, "var(--surface-2)", col, 5, 1.3))
        p.append(f'<rect x="{x}" y="62" width="{cw}" height="4" rx="2" fill="{col}"/>')
        p.append(T(x + cw / 2, 88, title, 11.5, "middle", "svg-txt", "700"))
        for j, it in enumerate(items):
            yy = 112 + j * 40
            faded = (i == 2 and j == 2)
            p.append(box(x + 10, yy, cw - 20, 32, "var(--surface)",
                         "var(--rule)" if faded else "var(--rule-strong)", 3, 1))
            words = it.split()
            half = len(words) // 2 + 1
            p.append(T(x + cw / 2, yy + 14, " ".join(words[:half]), 8.8,
                       cls="svg-mut" if faded else "svg-txt"))
            p.append(T(x + cw / 2, yy + 25, " ".join(words[half:]), 8.8,
                       cls="svg-mut" if faded else "svg-txt"))
        p.append(T(x + cw / 2, 254, note, 9, "middle", "svg-mut", "700"))

    p.append(box(18, 270, W - 36, 48))
    p.append(T(32, 290, "The value is visible in the result: the held-out split alone would have reported a "
                        "working model. It was the second and third", 9.5, "start", "svg-mut"))
    p.append(T(32, 306, "image sources that showed where it fails.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 5. future work map (section 29)
def future_map():
    W, H = 760, 330
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Future work by category and effort">', DEFS]
    p.append(T(18, 22, "WHAT WOULD CLOSE THE GAPS, AND WHAT IT WOULD TAKE", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Ordered left to right by how much the result would change what this thesis may claim.",
               11, "start", "svg-mut"))

    cats = [
        ("Evidential", "var(--crit)", ["Contributor phone photographs", "Run the prepared usability study"],
         "Turns bounds into measurements"),
        ("Technical", "var(--primary)", ["Decompose the residual class", "Reconcile the two measurements",
                                         "Cost-sensitive evaluation"], "Improves the artefact"),
        ("Deployment", "var(--good)", ["Real reports, then spatial findings"], "Makes it useful to others"),
        ("Behavioural", "var(--accent)", ["Longitudinal incentive study"], "Tests what is only argued"),
    ]
    x0, cw, gap = 18, 175, 10
    for i, (name, col, items, why) in enumerate(cats):
        x = x0 + i * (cw + gap)
        p.append(box(x, 64, cw, 190, "var(--surface-2)", col, 5, 1.3))
        p.append(f'<rect x="{x}" y="64" width="{cw}" height="4" rx="2" fill="{col}"/>')
        p.append(T(x + cw / 2, 90, name, 12, "middle", "svg-txt", "700"))
        for j, it in enumerate(items):
            yy = 108 + j * 42
            p.append(box(x + 9, yy, cw - 18, 34, "var(--surface)", "var(--rule-strong)", 3, 1))
            words = it.split()
            half = len(words) // 2 + 1
            p.append(T(x + cw / 2, yy + 15, " ".join(words[:half]), 8.8))
            p.append(T(x + cw / 2, yy + 26, " ".join(words[half:]), 8.8))
        p.append(T(x + cw / 2, 240, why, 8.6, "middle", "svg-mut"))

    p.append(box(18, 268, W - 36, 48))
    p.append(T(32, 288, "Only the first column changes what may be claimed. The others improve the system or "
                        "extend it, which is why the collection of", 9.5, "start", "svg-mut"))
    p.append(T(32, 304, "contributor photographs is named as the single highest-value piece of remaining work.",
               9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


figs = {"theory_chain": theory_chain(), "accuracy_cascade": accuracy_cascade(),
        "framework_coverage": framework_coverage(), "triangulation": triangulation(),
        "future_map": future_map()}
OUT.write_text(json.dumps(figs))
for k, v in figs.items():
    print(f"built {k:<20} {len(v):>6} chars")
