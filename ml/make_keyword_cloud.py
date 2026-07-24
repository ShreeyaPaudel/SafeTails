"""Keyword cloud for the front matter.

Words are placed largest first along an Archimedean spiral, with each candidate position
rejected if its bounding box overlaps one already placed or leaves the canvas. Colour comes
from the document's own tokens, so the figure holds in both light and dark themes.
"""
import json
import math
from pathlib import Path

OUT = Path(__file__).parent / "figs_cloud.json"
W, H = 760, 470
CX, CY = W / 2, H / 2 + 6

# (text, size, colour token). Sizes carry meaning: the largest terms are what the thesis is
# about, the smallest are methods and components it uses.
WORDS = [
    ("Artificial Intelligence", 40, "--primary"),
    ("Stray Animals", 38, "--crit"),
    ("Geo-Spatial Reporting", 30, "--good"),
    ("Gamification", 30, "--accent"),
    ("Confidence Calibration", 26, "--warn"),
    ("Image Classification", 24, "--primary"),
    ("Urban Kathmandu", 24, "--accent"),
    ("Reputation Systems", 22, "--good"),
    ("Animal Welfare", 22, "--crit"),
    ("Citizen Science", 21, "--primary"),
    ("Selective Prediction", 18, "--warn"),
    ("Convolutional Neural Network", 18, "--primary"),
    ("Volunteered Geographic Information", 17, "--good"),
    ("Distribution Shift", 17, "--crit"),
    ("Location Privacy", 17, "--accent"),
    ("Community Engagement", 17, "--good"),
    ("Spatial Clustering", 16, "--primary"),
    ("Peer Confirmation", 16, "--warn"),
    ("Design Science Research", 16, "--ink-muted"),
    ("Transfer Learning", 15, "--primary"),
    ("Free-Roaming Dogs", 15, "--crit"),
    ("Species Recognition", 15, "--good"),
    ("Public Goods", 14, "--warn"),
    ("Bystander Effect", 14, "--accent"),
    ("Supernormal Releasers", 14, "--crit"),
    ("Rabies Surveillance", 13, "--good"),
    ("Human Oversight", 13, "--primary"),
    ("Spatial Database", 13, "--ink-muted"),
    ("Anti-Gaming Design", 13, "--warn"),
    ("Model Card", 12, "--ink-muted"),
    ("Injury Indication", 12, "--crit"),
    ("Web Application", 12, "--primary"),
    ("Usability Evaluation", 12, "--accent"),
    ("Map Visualisation", 12, "--good"),
    ("Secondary Data", 11, "--ink-muted"),
    ("Selective Incentives", 11, "--warn"),
]

# width of a string at a given size, for the sans-serif heading face
CHAR = 0.545
PAD_X, PAD_Y = 7, 5


def box(text, size, cx, cy):
    w = len(text) * size * CHAR
    h = size * 1.02
    return (cx - w / 2 - PAD_X, cy - h / 2 - PAD_Y, w + 2 * PAD_X, h + 2 * PAD_Y)


def hits(a, b):
    return not (a[0] + a[2] <= b[0] or b[0] + b[2] <= a[0]
                or a[1] + a[3] <= b[1] or b[1] + b[3] <= a[1])


placed, out = [], []
for text, size, tok in WORDS:
    step, t, found = 0.22, 0.0, False
    while t < 620:
        # ellipse-biased spiral: clouds read better wider than tall
        x = CX + 1.55 * t * math.cos(t) * 0.42
        y = CY + 1.0 * t * math.sin(t) * 0.42
        b = box(text, size, x, y)
        if (b[0] >= 6 and b[1] >= 6 and b[0] + b[2] <= W - 6 and b[1] + b[3] <= H - 6
                and not any(hits(b, p) for p in placed)):
            placed.append(b)
            out.append((text, size, tok, x, y))
            found = True
            break
        t += step
    if not found:
        print(f"  could not place: {text!r}")

parts = [f'<svg viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Keyword cloud of the concepts this dissertation draws together">']
for text, size, tok, x, y in out:
    weight = "700" if size >= 22 else "600"
    parts.append(f'<text x="{x:.1f}" y="{y + size * 0.35:.1f}" text-anchor="middle" '
                 f'font-family="var(--font-head)" font-size="{size}" font-weight="{weight}" '
                 f'fill="var({tok})" opacity="{0.95 if size >= 16 else 0.85}">{text}</text>')
parts.append("</svg>")

OUT.write_text(json.dumps({"keyword_cloud": "\n".join(parts)}))
print(f"placed {len(out)} of {len(WORDS)} keywords")
