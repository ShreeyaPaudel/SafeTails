"""Seven further figures: two charts from recorded measurements, five conceptual diagrams.

Theme-aware throughout. No text sits on a --primary fill, because that token inverts between
light and dark.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = json.loads((ROOT / "ml" / "exported" / "eval_local.json").read_text())
OUT = Path(__file__).parent / "figs_more.json"


def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"{ww}{ll}>{s}</text>'


def box(x, y, w, h, fill="var(--surface-2)", stroke="var(--rule-strong)", r=5, sw=1.3, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"{d}/>')


def arr(x1, y1, x2, y2, col="var(--ink-faint)", sw=1.5):
    return (f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{col}" stroke-width="{sw}" '
            f'fill="none" marker-end="url(#na)"/>')


DEFS = ('<defs><marker id="na" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
        '<path d="M0,0 L9,4.5 L0,9 Z" fill="var(--ink-faint)"/></marker></defs>')


# ============================================================ 1. confidence distribution (measured)
def confidence_split():
    rows = LOCAL["rows"]
    bins = [(round(0.1 * i, 1), round(0.1 * i + 0.1, 1)) for i in range(10)]
    data = []
    for lo, hi in bins:
        c = sum(1 for r in rows if lo <= r["conf"] < hi or (hi == 1.0 and r["conf"] == 1.0))
        ok = sum(1 for r in rows if (lo <= r["conf"] < hi or (hi == 1.0 and r["conf"] == 1.0)) and r["correct"])
        data.append((lo, hi, ok, c - ok))
    W, H = 760, 372
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Confidence of correct and incorrect predictions on the collected set">', DEFS]
    p.append(T(18, 22, "CONFIDENCE OF CORRECT AND INCORRECT PREDICTIONS", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Collected Kathmandu photographs, after temperature scaling. Each bar is one "
                       "confidence band.", 11, "start", "svg-mut"))
    x0, y0, plot_h, bw = 60, 66, 190, 62
    mx = max(ok + wr for _, _, ok, wr in data) or 1
    for g in range(0, mx + 1, 20):
        yy = y0 + plot_h - plot_h * g / mx
        p.append(f'<path d="M{x0},{yy} L{x0+10*bw},{yy}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(T(x0 - 8, yy + 4, str(g), 9, "end", "svg-mut"))
    p.append(T(24, y0 - 8, "photographs", 9, "start", "svg-mut", "700"))
    for i, (lo, hi, ok, wr) in enumerate(data):
        x = x0 + i * bw + 8
        w = bw - 16
        h_ok = plot_h * ok / mx
        h_wr = plot_h * wr / mx
        if wr:
            p.append(f'<rect x="{x}" y="{y0+plot_h-h_wr:.1f}" width="{w}" height="{h_wr:.1f}" '
                     f'rx="2" fill="var(--crit)" opacity="0.9"/>')
        if ok:
            p.append(f'<rect x="{x}" y="{y0+plot_h-h_wr-h_ok:.1f}" width="{w}" height="{h_ok:.1f}" '
                     f'rx="2" fill="var(--good)" opacity="0.85"/>')
        if ok or wr:
            p.append(T(x + w / 2, y0 + plot_h - h_wr - h_ok - 6, f"{ok}/{wr}", 8.5, cls="svg-mut", w="700"))
        p.append(T(x + w / 2, y0 + plot_h + 15, f"{lo:.1f}", 8.5, cls="svg-mut"))
    p.append(f'<path d="M{x0},{y0+plot_h} L{x0+10*bw},{y0+plot_h}" stroke="var(--rule-strong)" stroke-width="1.2"/>')
    p.append(T(x0 + 5 * bw, y0 + plot_h + 32, "calibrated confidence", 9.5, cls="svg-mut", w="700"))
    # legend
    p.append(f'<rect x="{x0}" y="{y0+plot_h+44}" width="11" height="11" rx="2" fill="var(--good)" opacity="0.85"/>')
    p.append(T(x0 + 18, y0 + plot_h + 53, "correct", 9.5, "start", "svg-mut", "700"))
    p.append(f'<rect x="{x0+92}" y="{y0+plot_h+44}" width="11" height="11" rx="2" fill="var(--crit)" opacity="0.9"/>')
    p.append(T(x0 + 110, y0 + plot_h + 53, "incorrect", 9.5, "start", "svg-mut", "700"))
    p.append(box(18, 318, W - 36, 46))
    p.append(T(32, 338, "Most predictions sit in the top band and most of those are right. The three "
                        "errors in that band are the problem: they are wrong at a confidence", 9.5, "start", "svg-mut"))
    p.append(T(32, 354, "no threshold could screen, and one of them is an injured animal.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 2. risk-coverage (measured)
def risk_coverage():
    rows = LOCAL["rows"]
    ths = [i / 100 for i in range(0, 100, 2)]
    pts = []
    for th in ths:
        keep = [r for r in rows if r["conf"] >= th]
        if len(keep) < 5:
            continue
        pts.append((th, 100 * len(keep) / len(rows), 100 * sum(r["correct"] for r in keep) / len(keep)))
    W, H = 760, 372
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Coverage against accuracy as the confidence threshold rises">', DEFS]
    p.append(T(18, 22, "WHAT THE THRESHOLD BUYS, AND WHAT IT COSTS", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Collected Kathmandu photographs. Raising the threshold makes the kept labels "
                       "better and leaves more work for people.", 11, "start", "svg-mut"))
    x0, y0, pw, ph = 62, 66, 640, 190

    def px(t):
        return x0 + pw * t

    def py(v):
        return y0 + ph - ph * (v - 60) / 40          # 60 to 100 percent

    for g in range(60, 101, 10):
        p.append(f'<path d="M{x0},{py(g):.1f} L{x0+pw},{py(g):.1f}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(T(x0 - 8, py(g) + 4, f"{g}%", 9, "end", "svg-mut"))
    for g in [0, 0.25, 0.5, 0.75, 1.0]:
        p.append(T(px(g), y0 + ph + 16, f"{g:.2f}", 9, cls="svg-mut"))
    p.append(T(x0 + pw / 2, y0 + ph + 34, "confidence threshold", 9.5, cls="svg-mut", w="700"))

    cov = " ".join(f"{px(t):.1f},{py(c):.1f}" for t, c, _ in pts)
    acc = " ".join(f"{px(t):.1f},{py(a):.1f}" for t, _, a in pts)
    p.append(f'<polyline points="{cov}" fill="none" stroke="var(--ink-faint)" stroke-width="2" stroke-dasharray="5 3"/>')
    p.append(f'<polyline points="{acc}" fill="none" stroke="var(--good)" stroke-width="2.4"/>')

    # the deployed threshold
    p.append(f'<path d="M{px(0.70):.1f},{y0-6} L{px(0.70):.1f},{y0+ph}" stroke="var(--accent)" '
             f'stroke-width="1.6" stroke-dasharray="4 3"/>')
    p.append(T(px(0.70), y0 - 12, "deployed threshold 0.70", 9.5, cls="svg-mut", w="700"))
    for t, c, a in pts:
        if abs(t - 0.70) < 0.011:
            p.append(f'<circle cx="{px(t):.1f}" cy="{py(a):.1f}" r="4.5" fill="var(--good)"/>')
            p.append(f'<circle cx="{px(t):.1f}" cy="{py(c):.1f}" r="4.5" fill="var(--ink-faint)"/>')
            p.append(T(px(t) + 10, py(a) - 6, f"{a:.1f}% accurate", 9.5, "start", "svg-txt", "700"))
            p.append(T(px(t) + 10, py(c) + 16, f"{c:.1f}% auto-labelled", 9.5, "start", "svg-mut", "700"))
    p.append(T(x0 + 8, py(87.1) - 8, "87.1% if every label is used", 9, "start", "svg-mut"))

    p.append(f'<path d="M{x0+430},{y0+ph+52} L{x0+452},{y0+ph+52}" stroke="var(--good)" stroke-width="2.4"/>')
    p.append(T(x0 + 458, y0 + ph + 56, "accuracy of kept labels", 9.5, "start", "svg-mut", "700"))
    p.append(f'<path d="M{x0+250},{y0+ph+52} L{x0+272},{y0+ph+52}" stroke="var(--ink-faint)" '
             f'stroke-width="2" stroke-dasharray="5 3"/>')
    p.append(T(x0 + 278, y0 + ph + 56, "coverage", 9.5, "start", "svg-mut", "700"))

    p.append(box(18, 318, W - 36, 46))
    p.append(T(32, 338, "The two lines move in opposite directions, which is the whole trade. The chosen "
                        "point keeps most of the automation and recovers most of the", 9.5, "start", "svg-mut"))
    p.append(T(32, 354, "accuracy; pushing further right buys little and sends a great deal more work "
                        "to a person who may not exist.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 3. what a post loses (section 03)
def information_loss():
    W, H = 760, 400
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="What a social media post records compared with a structured report">', DEFS]
    p.append(T(18, 22, "THE SAME SIGHTING, RECORDED TWO WAYS", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Concern is not the scarce thing. Structure is.", 11, "start", "svg-mut"))
    fields = [("Photograph", "kept, with the phone's location", "kept, metadata destroyed on upload"),
              ("Where", "“near Kalanki, by the bridge”", "coordinate generalised to about 100 m"),
              ("When", "implied by the post time", "recorded timestamp"),
              ("What animal", "written in the text, if at all", "species label with a confidence"),
              ("Injured", "described in words", "flag, marked as an estimate"),
              ("Who reported", "an account, unlinked to any history", "contributor with a reputation"),
              ("What happened", "sometimes a reply, usually nothing", "status that changes to resolved"),
              ("Findable later", "buried within hours", "indexed, filterable, aggregatable")]
    lx, mx, rx = 18, 210, 470
    p.append(box(mx, 58, 250, 306, "var(--crit-soft)", "var(--crit)"))
    p.append(box(rx, 58, 272, 306, "var(--good-soft)", "var(--good)"))
    p.append(T(mx + 125, 78, "A POST IN A GROUP", 10, "middle", "svg-mut", "700", "0.7"))
    p.append(T(rx + 136, 78, "A STRUCTURED REPORT", 10, "middle", "svg-mut", "700", "0.7"))
    for i, (name, a, b) in enumerate(fields):
        y = 100 + i * 33
        p.append(T(lx + 178, y + 4, name, 10, "end", "svg-txt", "700"))
        p.append(T(mx + 125, y + 4, a, 9, cls="svg-mut"))
        p.append(T(rx + 136, y + 4, b, 9, cls="svg-mut"))
        if i:
            p.append(f'<path d="M{mx+8},{y-13} L{rx+264},{y-13}" stroke="var(--rule)" stroke-width="0.8"/>')
    p.append(box(18, 372, W - 36, 22, "none", "none"))
    p.append(T(18, 388, "Neither column describes a person who cares more. The difference is entirely in "
                        "what survives the next hour.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 4. ethical layers (section 13)
def ethics_layers():
    rows = [("Location exposure", "A precise point identifies where a person stood",
             "Rounded to about 100 m before storage", "built"),
            ("Metadata leakage", "Phone images embed position, time and device",
             "Decode and re-encode destroys all of it", "built"),
            ("Third-party transmission", "Data leaves the system to a hosted model",
             "Derived signals only, no identifier, no image", "built"),
            ("Overstated automation", "A label read as fact rather than a guess",
             "Every output labelled an estimate, always correctable", "built"),
            ("Welfare cost of error", "A missed injury delays help",
             "Uncertain cases routed to a person, not resolved", "partial"),
            ("Dual use of the map", "The same map would serve a culling programme",
             "Generalised, aggregated, positioned as support", "unresolved"),
            ("Image provenance", "Training data was made by other people",
             "Nothing redistributed; a deployment would need licences", "partial"),
            ("Honest reporting", "The lower figure was the inconvenient one",
             "Both reported, the reproducible one treated as true", "built")]
    W, H = 760, 396
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Ethical risks and what handles each">', DEFS]
    p.append(T(18, 22, "EIGHT RISKS, AND WHAT ANSWERS EACH", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Three are fully handled inside the system, three partly, and one cannot be "
                       "solved by any control the platform holds.", 11, "start", "svg-mut"))
    style = {"built": ("var(--good)", "handled"), "partial": ("var(--warn)", "partly handled"),
             "unresolved": ("var(--crit)", "cannot be solved here")}
    y0, rh = 62, 38
    for i, (name, risk, fix, st) in enumerate(rows):
        col, word = style[st]
        y = y0 + i * rh
        p.append(box(18, y, W - 36, rh - 5, "var(--surface-2)", "var(--rule)", 4, 1))
        p.append(f'<rect x="18" y="{y}" width="5" height="{rh-5}" rx="2" fill="{col}"/>')
        p.append(T(34, y + 15, name, 10.5, "start", "svg-txt", "700"))
        p.append(T(34, y + 27, risk, 8.8, "start", "svg-mut"))
        p.append(T(330, y + 21, fix, 9.2, "start", "svg-mut"))
        p.append(T(W - 32, y + 21, word, 8.8, "end", "svg-mut", "700"))
    p.append(T(18, H - 10, "The unresolved row is stated as unresolved. A dataset useful to vaccination is "
                           "equally useful to culling, and no technical control changes that.", 9.5,
               "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 5. capability matrix (section 21)
def capability_matrix():
    caps = ["Contributions from the public", "Automatic species labelling",
            "Community verification", "Reputation weighting of contributors",
            "Spatial output an institution can use", "Works before a community exists",
            "Retains queryable data"]
    systems = [("Mission Rabies", [0, 0, 0, 0, 2, 2, 2]),
               ("iNaturalist", [2, 2, 2, 1, 2, 0, 2]),
               ("eBird", [2, 0, 2, 1, 2, 0, 2]),
               ("Lost-pet platforms", [2, 0, 0, 0, 0, 2, 0]),
               ("SafeTails", [2, 2, 2, 2, 2, 2, 2])]
    W, H = 760, 366
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="What each reviewed system provides, and the gap this project fills">', DEFS]
    p.append(T(18, 22, "WHAT EACH REVIEWED SYSTEM PROVIDES", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "No existing system fills a whole column. The gap is the combination, not any "
                       "single capability.", 11, "start", "svg-mut"))
    lx, cw, y0, rh = 296, 88, 96, 33
    for j, (name, _) in enumerate(systems):
        x = lx + j * cw + cw / 2
        last = j == len(systems) - 1
        if last:
            p.append(box(lx + j * cw + 3, y0 - 34, cw - 6, 7 * rh + 40, "var(--primary-soft)",
                         "var(--primary)", 5, 1.6))
        words = name.split()
        p.append(T(x, y0 - 18, words[0], 9.5, cls="svg-txt", w="700"))
        if len(words) > 1:
            p.append(T(x, y0 - 7, " ".join(words[1:]), 9.5, cls="svg-txt", w="700"))
    for i, cap in enumerate(caps):
        y = y0 + i * rh
        p.append(T(lx - 14, y + 20, cap, 9.8, "end", "svg-mut"))
        p.append(f'<path d="M18,{y+30} L{lx+len(systems)*cw},{y+30}" stroke="var(--rule)" stroke-width="0.8"/>')
        for j, (_, vals) in enumerate(systems):
            v = vals[i]
            cx = lx + j * cw + cw / 2
            col = {0: "var(--crit)", 1: "var(--warn)", 2: "var(--good)"}[v]
            if v == 2:
                p.append(f'<circle cx="{cx}" cy="{y+15}" r="7" fill="{col}" opacity="0.9"/>')
            elif v == 1:
                p.append(f'<circle cx="{cx}" cy="{y+15}" r="7" fill="none" stroke="{col}" stroke-width="2.2"/>')
                p.append(f'<path d="M{cx-7},{y+15} A7,7 0 0,1 {cx+7},{y+15} Z" fill="{col}" opacity="0.9"/>')
            else:
                p.append(f'<path d="M{cx-5},{y+10} L{cx+5},{y+20} M{cx+5},{y+10} L{cx-5},{y+20}" '
                         f'stroke="{col}" stroke-width="2" stroke-linecap="round"/>')
    ly = y0 + 7 * rh + 14
    for k, (mark, lab) in enumerate([("full", "provides it"), ("half", "partly"), ("none", "does not")]):
        x = 300 + k * 130
        col = {"full": "var(--good)", "half": "var(--warn)", "none": "var(--crit)"}[mark]
        if mark == "full":
            p.append(f'<circle cx="{x}" cy="{ly}" r="6" fill="{col}" opacity="0.9"/>')
        elif mark == "half":
            p.append(f'<circle cx="{x}" cy="{ly}" r="6" fill="none" stroke="{col}" stroke-width="2"/>')
        else:
            p.append(f'<path d="M{x-4},{ly-4} L{x+4},{ly+4} M{x+4},{ly-4} L{x-4},{ly+4}" '
                     f'stroke="{col}" stroke-width="2" stroke-linecap="round"/>')
        p.append(T(x + 12, ly + 4, lab, 9.5, "start", "svg-mut", "700"))
    p.append(T(18, H - 12, "Each reviewed system also depends on something a new platform does not have: "
                           "trained staff, a naturalist community, or regional experts.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 6. technology stack (section 22)
def tech_stack():
    layers = [("Interface", "Next.js, React, TypeScript, Leaflet with clustering and heat layers",
               "Open tiles, so no commercial service sees every map a user opens", "var(--primary)"),
              ("Application", "FastAPI on Python, sharing a language with the model tooling",
               "Generates its own schema, so the client cannot drift from the server", "var(--primary)"),
              ("Domain services", "Validation tiers, reputation and rewards, spatial analytics",
               "Rules written as pure functions, so they can be tested exhaustively", "var(--good)"),
              ("Models", "In-process runtime for the species model; hosted model for the rest",
               "Trained in-house so it can be measured; the delegated part cannot be", "var(--accent)"),
              ("Persistence", "PostgreSQL with PostGIS, SQLAlchemy and GeoAlchemy2, Alembic",
               "Spatial work in the database, so only the generalised point is stored", "var(--warn)")]
    W, H = 760, 356
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="The technology stack and why each layer was chosen">', DEFS]
    p.append(T(18, 22, "THE STACK, AND THE REASON FOR EACH LAYER", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "The right-hand column is the reason each choice is also an ethical one.",
               11, "start", "svg-mut"))
    y0, rh = 62, 54
    for i, (name, what, why, col) in enumerate(layers):
        y = y0 + i * rh
        p.append(box(18, y, W - 36, rh - 8, "var(--surface-2)", col, 5, 1.3))
        p.append(f'<rect x="18" y="{y}" width="6" height="{rh-8}" rx="3" fill="{col}"/>')
        p.append(T(36, y + 20, name, 11.5, "start", "svg-txt", "700"))
        p.append(T(36, y + 35, what, 9, "start", "svg-mut"))
        p.append(f'<path d="M400,{y+8} L400,{y+rh-16}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(T(414, y + 28, why, 9.2, "start", "svg-mut"))
        if i < len(layers) - 1:
            p.append(arr(W / 2, y + rh - 8, W / 2, y + rh - 1, "var(--ink-faint)", 1.2))
    p.append(box(18, 340, W - 36, 14, "none", "none"))
    p.append(T(18, 350, "Every component is open source or on a free tier, because the organisations "
                        "that would run this are volunteer-led and unfunded.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============================================================ 7. how each defect was caught (section 24)
def defects_caught():
    rows = [("Migrations created no tables", "A search path set inside a transaction rolled back silently",
             "Manual check of the database", "var(--warn)"),
            ("Coordinate rounding not idempotent", "Grid-snapping gave different answers at cell edges",
             "Automated test", "var(--good)"),
            ("Model bypassed at runtime", "87 percent of predictions fell below the threshold",
             "Measurement", "var(--good)"),
            ("Reported accuracy did not reproduce", "98.4 percent became 91.0 through the serving path",
             "Measurement", "var(--good)"),
            ("Held reports explained nothing", "The state was obvious only to its designer",
             "Heuristic inspection", "var(--primary)")]
    W, H = 760, 330
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="How each significant defect was found">', DEFS]
    p.append(T(18, 22, "HOW EACH SIGNIFICANT DEFECT WAS FOUND", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 42, "Four of the five were caught by something automatic. None was caught by reading "
                       "the code again.", 11, "start", "svg-mut"))
    y0, rh = 64, 44
    for i, (name, detail, how, col) in enumerate(rows):
        y = y0 + i * rh
        p.append(box(18, y, W - 36, rh - 7, "var(--surface-2)", "var(--rule)", 4, 1))
        p.append(f'<rect x="18" y="{y}" width="5" height="{rh-7}" rx="2" fill="{col}"/>')
        p.append(T(34, y + 17, name, 10.5, "start", "svg-txt", "700"))
        p.append(T(34, y + 30, detail, 8.8, "start", "svg-mut"))
        p.append(box(552, y + 7, 190, rh - 21, "var(--surface)", col, 3, 1))
        p.append(T(647, y + 25, how, 9.5, cls="svg-mut", w="700"))
    p.append(box(18, 292, W - 36, 30, "none", "none"))
    p.append(T(18, 308, "The pattern is the argument for the method: a test or a measurement finds what "
                        "inspection by the person who wrote it cannot.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


figs = {"confidence_split": confidence_split(), "risk_coverage": risk_coverage(),
        "information_loss": information_loss(), "ethics_layers": ethics_layers(),
        "capability_matrix": capability_matrix(), "tech_stack": tech_stack(),
        "defects_caught": defects_caught()}
OUT.write_text(json.dumps(figs))
for k, v in figs.items():
    print(f"built {k:<20} {len(v):>6} chars")
