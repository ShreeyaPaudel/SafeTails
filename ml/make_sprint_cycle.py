"""The agile sprint cycle as a ring of six stages around a hub.

Follows the ring layout of the supplied reference, adapted to the stages this project
actually repeated, and made theme-aware: colour comes from the document's custom
properties, and vector glyphs are used instead of emoji so the figure prints cleanly.
"""
import json
import math
from pathlib import Path

OUT = Path(__file__).parent / "figs_cycle.json"

CX, CY = 380, 322
RX, RY = 252, 196          # ring radii
CW, CH = 208, 58           # stage card
HUB = 78                   # hub radius


def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None, mono=False):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    ff = ' font-family="var(--font-mono)"' if mono else ""
    return (f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"'
            f'{ww}{ll}{ff}>{s}</text>')


def anchor(cx, cy, tx, ty):
    """Point where the ray from a card centre towards (tx, ty) leaves the card."""
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy
    sx = (CW / 2) / abs(dx) if dx else float("inf")
    sy = (CH / 2) / abs(dy) if dy else float("inf")
    t = min(sx, sy)
    return cx + dx * t, cy + dy * t


# ---------------------------------------------------------------- stage glyphs
def glyph_book(x, y, c):
    return (f'<path d="M{x-7},{y-6} h6 v13 h-6 z M{x+1},{y-6} h6 v13 h-6 z" fill="none" '
            f'stroke="{c}" stroke-width="1.6" stroke-linejoin="round"/>')


def glyph_db(x, y, c):
    return (f'<ellipse cx="{x}" cy="{y-5}" rx="7" ry="2.8" fill="none" stroke="{c}" stroke-width="1.6"/>'
            f'<path d="M{x-7},{y-5} v9 a7,2.8 0 0,0 14,0 v-9" fill="none" stroke="{c}" stroke-width="1.6"/>')


def glyph_net(x, y, c):
    return (f'<path d="M{x-6},{y+5} L{x},{y-6} L{x+6},{y+5}" fill="none" stroke="{c}" stroke-width="1.4"/>'
            f'<circle cx="{x}" cy="{y-6}" r="2.6" fill="{c}"/>'
            f'<circle cx="{x-6}" cy="{y+5}" r="2.6" fill="{c}"/>'
            f'<circle cx="{x+6}" cy="{y+5}" r="2.6" fill="{c}"/>')


def glyph_bars(x, y, c):
    return (f'<path d="M{x-6},{y+6} v-5 M{x},{y+6} v-11 M{x+6},{y+6} v-8" stroke="{c}" '
            f'stroke-width="2.4" stroke-linecap="round"/>')


def glyph_lens(x, y, c):
    return (f'<circle cx="{x-1}" cy="{y-2}" r="5.4" fill="none" stroke="{c}" stroke-width="1.7"/>'
            f'<path d="M{x+3},{y+2} L{x+7},{y+6}" stroke="{c}" stroke-width="1.9" stroke-linecap="round"/>')


def glyph_scale(x, y, c):
    return (f'<path d="M{x},{y-7} v13 M{x-7},{y-4} h14 M{x-7},{y-4} l-2.6,5 h5.2 z '
            f'M{x+7},{y-4} l-2.6,5 h5.2 z" fill="none" stroke="{c}" stroke-width="1.5" '
            f'stroke-linejoin="round"/>')


STAGES = [
    ("Literature Review", "desk research · theory · cases", "var(--primary)", glyph_book, "requirements"),
    ("Data Acquisition", "assemble · sanitise · split", "var(--good)", glyph_db, "committed split"),
    ("Model Building", "train · export · calibrate", "var(--accent)", glyph_net, "exported model"),
    ("Evaluation", "measure · test · simulate", "var(--primary)", glyph_bars, "measurements"),
    ("Contextualise", "compare · benchmark", "var(--warn)", glyph_lens, "what changed"),
    ("Ethical Review", "privacy · transparency · honesty", "var(--crit)", glyph_scale, "a new question"),
]
ANGLES = [-90, -30, 30, 90, 150, 210]


def sprint_cycle():
    W, H = 760, 620
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="The agile sprint cycle of six stages repeated throughout this study">']
    p.append('<defs>'
             '<marker id="ca" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">'
             '<path d="M0,0.6 L10,5 L0,9.4 Z" fill="var(--accent)"/></marker>'
             '</defs>')
    p.append(T(18, 24, "THE AGILE SPRINT CYCLE", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(18, 44, "Six stages, repeated. Ethical review is a stage inside the loop rather than a "
                       "gate at the end.", 11, "start", "svg-mut"))

    pos = []
    for a in ANGLES:
        r = math.radians(a)
        pos.append((CX + RX * math.cos(r), CY + RY * math.sin(r)))

    # ---- connecting arcs, clockwise ----
    for i in range(6):
        x1, y1 = pos[i]
        x2, y2 = pos[(i + 1) % 6]
        sx, sy = anchor(x1, y1, x2, y2)
        ex, ey = anchor(x2, y2, x1, y1)
        mx, my = (sx + ex) / 2, (sy + ey) / 2
        vx, vy = mx - CX, my - CY
        n = math.hypot(vx, vy) or 1
        qx, qy = mx + vx / n * 34, my + vy / n * 34          # bow outwards
        p.append(f'<path d="M{sx:.1f},{sy:.1f} Q{qx:.1f},{qy:.1f} {ex:.1f},{ey:.1f}" fill="none" '
                 f'stroke="var(--accent)" stroke-width="1.7" marker-end="url(#ca)" opacity="0.85"/>')
        lx, ly = mx + vx / n * 60, my + vy / n * 60
        p.append(T(lx, ly + 3, STAGES[i][4], 8.6, "middle", "svg-mut", "700", mono=True))

    # ---- hub ----
    p.append(f'<circle cx="{CX}" cy="{CY}" r="{HUB}" fill="var(--surface-2)" '
             f'stroke="var(--accent)" stroke-width="2"/>')
    p.append(f'<circle cx="{CX}" cy="{CY}" r="{HUB-9}" fill="none" stroke="var(--accent)" '
             f'stroke-width="0.9" stroke-dasharray="3 4" opacity="0.6"/>')
    p.append(T(CX, CY - 18, "AGILE", 15, "middle", "svg-txt", "700", "0.14"))
    p.append(T(CX, CY + 2, "SPRINT", 15, "middle", "svg-txt", "700", "0.14"))
    p.append(T(CX, CY + 22, "CYCLE", 15, "middle", "svg-txt", "700", "0.14"))
    p.append(T(CX, CY + 44, "desk-based", 8.6, "middle", "svg-mut", "700", mono=True))

    # ---- stage cards ----
    for (name, sub, col, glyph, _), (x, y) in zip(STAGES, pos):
        rx, ry = x - CW / 2, y - CH / 2
        p.append(f'<rect x="{rx:.1f}" y="{ry:.1f}" width="{CW}" height="{CH}" rx="7" '
                 f'fill="var(--surface)" stroke="{col}" stroke-width="1.8"/>')
        p.append(f'<rect x="{rx:.1f}" y="{ry:.1f}" width="{CW}" height="4" rx="2" fill="{col}"/>')
        p.append(glyph(rx + 22, y - 6, col))
        p.append(T(rx + 38, y - 1, name, 12, "start", "svg-txt", "700"))
        p.append(T(rx + 38, y + 16, sub, 8.8, "start", "svg-mut", mono=True))

    # ---- footer ----
    fy = 556
    p.append(f'<rect x="18" y="{fy}" width="{W-36}" height="52" rx="6" fill="none" '
             f'stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="6 4"/>')
    p.append(T(32, fy + 21, "Every loop starts by dropping an assumption that has just failed. Evidence "
                            "comes from published work, the artefact and measurements", 9.5, "start", "svg-mut"))
    p.append(T(32, fy + 37, "run on it, and never from participants, which is what makes the study "
                            "desk-based and what bounds every claim it makes.", 9.5, "start", "svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


figs = {"sprint_cycle": sprint_cycle()}
OUT.write_text(json.dumps(figs))
print(f"built sprint_cycle {len(figs['sprint_cycle'])} chars")
