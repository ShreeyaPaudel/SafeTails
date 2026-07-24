"""Charts for the collected Kathmandu evaluation, built from ml/exported/eval_local.json."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
E = json.loads((ROOT / "ml" / "exported" / "eval_local.json").read_text())
LABELS = json.loads((ROOT / "ml" / "exported" / "labels.json").read_text())
ROWS = E["rows"]


def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"{ww}{ll}>{s}</text>'


def box(x, y, w, h, fill="var(--surface-2)", stroke="var(--rule-strong)", r=5, sw=1.3):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"/>')


def acc(sub):
    return (100 * sum(r["correct"] for r in sub) / len(sub)) if sub else 0.0


# ---------------------------------------------------------------- figure 1
def injury_gap():
    W, H = 760, 346
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" xmlns="http://www.w3.org/2000/svg">']
    p.append(T(18, 24, "ACCURACY ON THE COLLECTED KATHMANDU SET", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 44, "The model is measurably worse on injured animals, which are the reports the platform exists to collect.",
               11, "start", "svg-mut"))

    unin = [r for r in ROWS if not r["injured"]]
    inj = [r for r in ROWS if r["injured"]]
    bars = [
        ("Curated held-out split", 91.0, None, None, len(ROWS) and 1330, "var(--ink-faint)"),
        ("Collected set, all images", acc(ROWS), 79.8, 92.0, len(ROWS), "var(--primary)"),
        ("Collected set, uninjured", acc(unin), 83.3, 95.0, len(unin), "var(--good)"),
        ("Collected set, injured", acc(inj), 46.0, 84.6, len(inj), "var(--crit)"),
    ]
    x0, y0, bh, gap, plot = 214, 74, 30, 18, 470

    def px(v):
        return x0 + plot * v / 100

    for g in range(0, 101, 20):
        p.append(f'<path d="M{px(g)},{y0-8} L{px(g)},{y0+4*(bh+gap)-6}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(T(px(g), y0 + 4 * (bh + gap) + 8, f"{g}%", 9, cls="svg-mut"))

    for i, (lab, v, lo, hi, n, col) in enumerate(bars):
        y = y0 + i * (bh + gap)
        p.append(T(x0 - 12, y + 20, lab, 10.5, "end", "svg-mut"))
        p.append(f'<rect x="{x0}" y="{y}" width="{plot*v/100:.1f}" height="{bh}" rx="3" fill="{col}" opacity="0.88"/>')
        p.append(T(px(v) + 8, y + 20, f"{v:.1f}%", 12, "start", "svg-txt", "700"))
        if lo is not None:
            p.append(f'<path d="M{px(lo)},{y+bh/2} L{px(hi)},{y+bh/2}" stroke="var(--ink)" stroke-width="1.4"/>')
            for e in (lo, hi):
                p.append(f'<path d="M{px(e)},{y+bh/2-5} L{px(e)},{y+bh/2+5}" stroke="var(--ink)" stroke-width="1.4"/>')
            p.append(T(px(v) + 54, y + 20, f"n = {n}", 9, "start", "svg-mut"))
        else:
            p.append(T(px(v) + 54, y + 20, "n = 1,330", 9, "start", "svg-mut"))

    p.append(box(18, 284, W - 36, 52))
    p.append(T(32, 304, "Horizontal bars are 95 percent Wilson intervals. The injured interval is wide because only "
                        f"{len(inj)} injured photographs were available, so the gap is a signal that warrants",
               9.5, "start", "svg-mut"))
    p.append(T(32, 321, "collection of a larger injured set, not a precise effect size. The two intervals overlap, "
                        "and that is stated rather than hidden.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ---------------------------------------------------------------- figure 2
def confusion_and_routing():
    W, H = 760, 382
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" xmlns="http://www.w3.org/2000/svg">']
    p.append(T(18, 24, "WHERE THE ERRORS GO, AND WHAT THE CONFIDENCE THRESHOLD CATCHES", 9.5, "start", "svg-mut", "700", "0.8"))

    present = [c for c in LABELS if any(r["true"] == c for r in ROWS)]
    cw, ch, gx, gy = 74, 40, 150, 74
    p.append(T(gx - 10, gy - 26, "true", 9, "end", "svg-mut", "700"))
    for j, c in enumerate(LABELS):
        p.append(T(gx + j * cw + cw / 2, gy - 10, c, 10, cls="svg-mut", w="700"))
    p.append(T(gx + len(LABELS) * cw / 2, gy - 26, "predicted", 9, cls="svg-mut", w="700"))

    for i, tc in enumerate(present):
        sub = [r for r in ROWS if r["true"] == tc]
        cnt = Counter(r["pred"] for r in sub)
        p.append(T(gx - 10, gy + i * ch + 25, f"{tc}  ({len(sub)})", 10.5, "end", "svg-mut"))
        for j, pc in enumerate(LABELS):
            n = cnt.get(pc, 0)
            frac = n / len(sub)
            on_diag = pc == tc
            col = "var(--good)" if on_diag else "var(--crit)"
            op = 0.0 if n == 0 else 0.14 + 0.72 * frac
            p.append(f'<rect x="{gx+j*cw}" y="{gy+i*ch}" width="{cw-3}" height="{ch-3}" rx="3" '
                     f'fill="{col}" opacity="{op:.2f}" stroke="var(--rule)" stroke-width="1"/>')
            if n:
                p.append(T(gx + j * cw + (cw - 3) / 2, gy + i * ch + 25, str(n), 13,
                           w="700", cls="svg-txt" if frac > .25 else "svg-mut"))

    p.append(T(18, gy + 3 * ch + 24, "Every cow error is a buffalo, which costs a welfare response nothing. "
                                     "Six dogs read as cow, which would route an animal to the wrong queue.",
               10, "start", "svg-mut"))

    # routing strip
    ry = gy + 3 * ch + 44
    p.append(box(18, ry, W - 36, 124))
    p.append(T(34, ry + 22, "ROUTING AT THE DEPLOYED THRESHOLD OF 0.70", 9, "start", "svg-mut", "700", "0.8"))
    cov = 100 * E["coverage"]
    sel = 100 * E["selective_accuracy"]
    n_lo = len([r for r in ROWS if r["conf"] < E["threshold"]])
    bx, bw = 34, W - 68
    p.append(f'<rect x="{bx}" y="{ry+36}" width="{bw}" height="26" rx="4" fill="var(--warn-soft)" stroke="var(--rule-strong)" stroke-width="1"/>')
    p.append(f'<rect x="{bx}" y="{ry+36}" width="{bw*cov/100:.1f}" height="26" rx="4" fill="var(--primary)" opacity="0.9"/>')
    # Labels sit below the bar: --primary inverts between themes, so no text can
    # sit on that fill and stay legible in both.
    p.append(f'<rect x="{bx}" y="{ry+70}" width="10" height="10" rx="2" fill="var(--primary)" opacity="0.9"/>')
    p.append(T(bx + 16, ry + 79, f"auto-labelled, {cov:.1f} percent", 9.5, "start", "svg-mut", "700"))
    p.append(f'<rect x="{bx+184}" y="{ry+70}" width="10" height="10" rx="2" fill="var(--warn-soft)" stroke="var(--rule-strong)" stroke-width="1"/>')
    p.append(T(bx + 200, ry + 79, f"held for a human, {100-cov:.1f} percent", 9.5, "start", "svg-mut", "700"))
    p.append(T(34, ry + 100, f"Accuracy among auto-labelled reports rises to {sel:.1f} percent. "
                            f"The {n_lo} held reports are where the model is genuinely unsure, and a human decides them.",
               10, "start", "svg-mut"))
    p.append(T(34, ry + 116, "The threshold does real work: it converts a weak overall figure into a "
                             "trustworthy published label plus an honest queue.", 10, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


out = {"local_injury_gap": injury_gap(), "local_confusion": confusion_and_routing()}
(Path(__file__).parent / "figs_local.json").write_text(json.dumps(out))
for k, v in out.items():
    print("built", k, len(v))
