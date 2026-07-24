"""Two diagrams of the research method: the whole design at a glance, and one sprint in detail.

Both are theme-aware. Colour comes from the document's CSS custom properties and no text sits
on a --primary fill, because that token inverts between light and dark.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "figs_method.json"


def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"{ww}{ll}>{s}</text>'


def box(x, y, w, h, fill="var(--surface-2)", stroke="var(--rule-strong)", r=5, sw=1.3, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"{d}/>')


def line(x1, y1, x2, y2, col="var(--ink-faint)", sw=1.5, head="ma", dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    h = f' marker-end="url(#{head})"' if head else ""
    return f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{col}" stroke-width="{sw}" fill="none"{h}{d}/>'


def curve(d, col="var(--primary)", sw=1.8, head="mp"):
    return f'<path d="{d}" stroke="{col}" stroke-width="{sw}" fill="none" marker-end="url(#{head})"/>'


DEFS = ('<defs>'
        '<marker id="ma" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--ink-faint)"/></marker>'
        '<marker id="mp" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--primary)"/></marker>'
        '<marker id="mg" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--good)"/></marker>'
        '<marker id="mc" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--crit)"/></marker>'
        '</defs>')


# ==================================================================== research design at a glance
def research_design():
    W, H = 780, 606
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="The agile desk-based design science method used in this study">', DEFS]
    p.append(T(16, 22, "AGILE DESK-BASED DESIGN SCIENCE RESEARCH", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(16, 42, "Three cycles run at once. The artefact in the middle is both the thing being built "
                       "and the instrument doing the measuring.", 11, "start", "svg-mut"))

    # ---- left: environment (relevance) ----
    lx, ly, lw = 16, 62, 196
    p.append(box(lx, ly, lw, 300, "var(--crit-soft)", "var(--crit)"))
    p.append(T(lx + lw / 2, ly + 22, "ENVIRONMENT", 10, "middle", "svg-mut", "700", "0.7"))
    p.append(T(lx + lw / 2, ly + 38, "the problem this must fit", 9, cls="svg-mut"))
    env = ["Animals abandoned once", "old, sick or injured",
           "Reporting runs through", "social media and vanishes",
           "Rabies endemic; nobody", "knows where dogs are",
           "Rescue is volunteer-run", "and unfunded"]
    for i, t in enumerate(env):
        p.append(T(lx + 12, ly + 62 + i * 15, t, 9.5, "start",
                   "svg-txt" if i % 2 == 0 else "svg-mut"))
    p.append(box(lx + 12, ly + 196, lw - 24, 44, "var(--surface)", "var(--crit)", 4, 1))
    p.append(T(lx + lw / 2, ly + 214, "Requirements", 10, cls="svg-txt", w="700"))
    p.append(T(lx + lw / 2, ly + 230, "and constraints", 9.5, cls="svg-mut"))
    p.append(box(lx + 12, ly + 248, lw - 24, 40, "var(--surface)", "var(--crit)", 4, 1))
    p.append(T(lx + lw / 2, ly + 264, "Does it fit the real", 9.5, cls="svg-mut"))
    p.append(T(lx + lw / 2, ly + 278, "problem?", 9.5, cls="svg-mut"))

    # ---- right: knowledge base (rigour) ----
    rx = 568
    p.append(box(rx, ly, lw, 300, "var(--good-soft)", "var(--good)"))
    p.append(T(rx + lw / 2, ly + 22, "KNOWLEDGE BASE", 10, "middle", "svg-mut", "700", "0.7"))
    p.append(T(rx + lw / 2, ly + 38, "what is already known", 9, cls="svg-mut"))
    kb = ["Theory: releasers, bystander", "effect, public goods, quality",
          "uncertainty",
          "Methods: transfer learning,", "calibration, spatial statistics,",
          "heuristic inspection",
          "Systems: Mission Rabies,", "iNaturalist, eBird, lost-pet",
          "platforms"]
    for i, t in enumerate(kb):
        p.append(T(rx + 12, ly + 62 + i * 15, t, 9.5, "start", "svg-mut"))
    p.append(box(rx + 12, ly + 212, lw - 24, 76, "var(--surface)", "var(--good)", 4, 1))
    p.append(T(rx + lw / 2, ly + 230, "Contributions back", 10, cls="svg-txt", w="700"))
    p.append(T(rx + lw / 2, ly + 248, "a documented training", 9, cls="svg-mut"))
    p.append(T(rx + lw / 2, ly + 261, "and serving discrepancy,", 9, cls="svg-mut"))
    p.append(T(rx + lw / 2, ly + 274, "a verified validation design", 9, cls="svg-mut"))

    # ---- middle: the agile design cycle ----
    mx, mw = 232, 320
    p.append(box(mx, ly, mw, 300, "var(--surface-2)", "var(--primary)", 6, 1.6))
    p.append(T(mx + mw / 2, ly + 22, "DESIGN CYCLE", 10, "middle", "svg-mut", "700", "0.7"))
    p.append(T(mx + mw / 2, ly + 38, "short sprints, each free to change the next", 9, cls="svg-mut"))
    steps = [("Build the increment", 58), ("Verify with automated tests", 100),
             ("Compare against the literature", 142), ("Review the ethics of what changed", 184),
             ("Record what the comparison changed", 226)]
    for t, yy in steps:
        p.append(box(mx + 22, ly + yy, mw - 44, 30, "var(--surface)", "var(--rule-strong)", 4, 1))
        p.append(T(mx + mw / 2, ly + yy + 19, t, 10))
        if yy < 226:
            p.append(line(mx + mw / 2, ly + yy + 30, mx + mw / 2, ly + yy + 40, "var(--primary)", 1.4, "mp"))
    p.append(curve(f"M{mx+22},{ly+241} C{mx+2},{ly+241} {mx+2},{ly+73} {mx+22},{ly+73}"))
    p.append(T(mx + 13, ly + 158, "repeat", 8, "middle", "svg-mut", "700"))

    # cross arrows
    p.append(line(lx + lw, ly + 218, mx - 2, ly + 218, "var(--crit)", 1.6, "mc"))
    p.append(T((lx + lw + mx) / 2, ly + 210, "requires", 8.5, cls="svg-mut", w="700"))
    p.append(line(mx + mw + 2, ly + 250, rx - 2, ly + 250, "var(--good)", 1.6, "mg"))
    p.append(T((mx + mw + rx) / 2, ly + 242, "adds to", 8.5, cls="svg-mut", w="700"))

    # ---- desk-based boundary ----
    by = 378
    p.append(box(16, by, W - 32, 74, "none", "var(--accent)", 6, 1.6, "6 4"))
    p.append(T(30, by + 20, "DESK-BASED BOUNDARY", 9.5, "start", "svg-mut", "700", "0.7"))
    p.append(T(30, by + 40, "Evidence comes from three places only: published work, the artefact itself, "
                            "and measurements run on the artefact.", 10, "start", "svg-txt"))
    p.append(T(30, by + 58, "No data was collected from people, so every statement about contributor "
                            "behaviour is an argument rather than a measurement.", 10, "start", "svg-mut"))

    # ---- stages strip ----
    sy = 470
    p.append(T(16, sy - 6, "STAGES (PEFFERS ET AL., 2007)", 9, "start", "svg-mut", "700", "0.7"))
    stages = ["Identify the problem", "Define objectives", "Design and develop",
              "Demonstrate", "Evaluate", "Communicate"]
    sw_ = (W - 32 - 5 * 8) / 6
    for i, st in enumerate(stages):
        x = 16 + i * (sw_ + 8)
        p.append(box(x, sy, sw_, 40, "var(--primary-soft)", "var(--primary)", 4, 1))
        words = st.split()
        if len(words) > 1:
            p.append(T(x + sw_ / 2, sy + 17, words[0], 9.5))
            p.append(T(x + sw_ / 2, sy + 30, " ".join(words[1:]), 9.5))
        else:
            p.append(T(x + sw_ / 2, sy + 24, st, 9.5))
        if i < 5:
            p.append(line(x + sw_, sy + 20, x + sw_ + 7, sy + 20, "var(--ink-faint)", 1.2))

    p.append(box(16, 526, W - 32, 66))
    p.append(T(30, 546, "The three cycles are Hevner et al. (2004): relevance on the left, rigour on the "
                        "right, design in the middle. What makes this study agile is that the middle", 9.5,
               "start", "svg-mut"))
    p.append(T(30, 562, "cycle was allowed to change the requirements and the reading, not only the code. "
                        "What makes it desk-based is the dashed boundary: the artefact could be", 9.5,
               "start", "svg-mut"))
    p.append(T(30, 578, "measured as hard as necessary, and the people who would use it could not be "
                        "studied at all.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ==================================================================== one sprint in detail
def one_sprint():
    W, H = 780, 466
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="One research sprint of unlearning, relearning and self-explanation">', DEFS]
    p.append(T(16, 22, "ONE SPRINT: UNLEARN, RELEARN, EXPLAIN", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(16, 42, "Every cycle began with something believed at the start turning out to be wrong.",
               11, "start", "svg-mut"))

    bw, bh = 216, 62
    top_y, bot_y = 62, 236
    cols = [16, 282, 548]
    nodes = [
        (cols[0], top_y, "1. An assumption fails", "A test, a measurement or a", "reading contradicts it.", "var(--crit)"),
        (cols[1], top_y, "2. Drop it", "Unlearning: the belief goes", "before the fix is attempted.", "var(--crit)"),
        (cols[2], top_y, "3. Go back", "Relearning: return to the", "literature or to the data.", "var(--warn)"),
        (cols[2], bot_y, "4. Rebuild", "Change the design, not only", "the line that broke.", "var(--primary)"),
        (cols[1], bot_y, "5. Verify", "Automated tests and a fresh", "measurement, not judgement.", "var(--primary)"),
        (cols[0], bot_y, "6. Explain it plainly", "Self-explanation: an idea that", "cannot be written simply is", "var(--good)"),
    ]
    for x, y, title, l1, l2, col in nodes:
        p.append(box(x, y, bw, bh, "var(--surface-2)", col, 5, 1.4))
        p.append(f'<rect x="{x}" y="{y}" width="{bw}" height="4" rx="2" fill="{col}"/>')
        p.append(T(x + bw / 2, y + 24, title, 11.5, "middle", "svg-txt", "700"))
        p.append(T(x + bw / 2, y + 40, l1, 9, cls="svg-mut"))
        p.append(T(x + bw / 2, y + 52, l2, 9, cls="svg-mut"))
    p.append(T(cols[0] + bw / 2, bot_y + bh + 13, "not yet understood.", 9, cls="svg-mut"))

    # flow arrows
    for i in (0, 1):
        p.append(line(cols[i] + bw + 2, top_y + bh / 2, cols[i + 1] - 4, top_y + bh / 2, "var(--ink-faint)", 1.5))
    p.append(line(cols[2] + bw / 2, top_y + bh + 2, cols[2] + bw / 2, bot_y - 4, "var(--ink-faint)", 1.5))
    for i in (2, 1):
        p.append(line(cols[i] - 4, bot_y + bh / 2, cols[i - 1] + bw + 2, bot_y + bh / 2, "var(--ink-faint)", 1.5))
    p.append(curve(f"M{cols[0]+bw/2},{bot_y+bh+22} C{cols[0]-8},{bot_y+bh+22} {cols[0]-8},{top_y+bh/2} "
                   f"{cols[0]-2},{top_y+bh/2}"))
    p.append(T(cols[0] + bw / 2 + 66, bot_y + bh + 32, "the next cycle starts from the new understanding",
               9, "start", "svg-mut"))

    # ethics band through the middle
    ey = 156
    p.append(box(cols[0], ey, W - 32, 60, "var(--accent-soft)", "var(--accent)", 5, 1.3))
    p.append(T(cols[0] + 14, ey + 20, "ETHICAL REVIEW SITS INSIDE THE LOOP, NOT AFTER IT", 9,
               "start", "svg-mut", "700", "0.7"))
    p.append(T(cols[0] + 14, ey + 38, "Two defects were found this way rather than at the end: coordinate "
                                      "generalisation that was not idempotent, and a held report that told", 9.5,
               "start", "svg-mut"))
    p.append(T(cols[0] + 14, ey + 52, "the contributor nothing. Both were privacy or transparency "
                                      "commitments that the code did not actually keep.", 9.5, "start", "svg-mut"))

    # worked examples
    wy = 358
    p.append(T(16, wy - 10, "THREE ASSUMPTIONS THAT WERE DROPPED", 9, "start", "svg-mut", "700", "0.7"))
    ex = [("A high accuracy score", "means the model works", "It was bypassed at runtime"),
          ("Grid-rounding a location", "is obviously right", "It broke at cell boundaries"),
          ("A small user study", "would settle usability", "The interval was too wide")]
    ew = (W - 32 - 16) / 3
    for i, (a, b, c) in enumerate(ex):
        x = 16 + i * (ew + 8)
        p.append(box(x, wy, ew, 62, "var(--surface)", "var(--rule-strong)", 4, 1))
        p.append(T(x + ew / 2, wy + 18, a, 9.5, cls="svg-mut"))
        p.append(T(x + ew / 2, wy + 31, b, 9.5, cls="svg-mut"))
        p.append(f'<path d="M{x+14},{wy+38} L{x+ew-14},{wy+38}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(T(x + ew / 2, wy + 53, c, 9.5, cls="svg-txt", w="700"))

    p.append(T(16, H - 10, "None of the three was planned. All three changed the work, which is the case "
                           "for a method that lets the plan move when the evidence does.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


figs = {"research_design": research_design(), "one_sprint": one_sprint()}
OUT.write_text(json.dumps(figs))
for k, v in figs.items():
    print(f"built {k:<18} {len(v):>6} chars")
