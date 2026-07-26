"""Research-grade architecture, model and pipeline diagrams + a headline metrics panel."""
import json
from pathlib import Path

SP = Path(__file__).parent
D = json.loads((SP / "chart_data.json").read_text())
F = {}

def T(x, y, s, size=11, a="middle", cls="svg-txt", w=None, ls=None):
    ww = f' font-weight="{w}"' if w else ""
    ll = f' letter-spacing="{ls}"' if ls else ""
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{a}" font-size="{size}"{ww}{ll}>{s}</text>'

def box(x, y, w, h, fill="var(--surface-2)", stroke="var(--rule-strong)", r=5, dash=None, sw=1.3):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>'

def chip(x, y, w, label, fill="var(--surface)", stroke="var(--rule-strong)"):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="21" rx="3" fill="{fill}" stroke="{stroke}" stroke-width="1"/>'
            + T(x + w / 2, y + 15, label, 9.5))

def arr(x1, y1, x2, y2, col="var(--ink-faint)", mid="ah", dash=None, sw=1.4):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{col}" stroke-width="{sw}" marker-end="url(#{mid})" fill="none"{d}/>'

MK = ('<defs>'
      '<marker id="ah" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="var(--ink-faint)"/></marker>'
      '<marker id="ap" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="var(--primary)"/></marker>'
      '<marker id="ag" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="var(--good)"/></marker>'
      '<marker id="aa" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="var(--accent)"/></marker>'
      '</defs>')


# ============ 1. FULL SYSTEM ARCHITECTURE ============
def arch_full():
    W, H = 780, 660
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Complete system architecture of SafeTails">', MK]
    p.append(T(W / 2, 22, "SafeTails complete system architecture", 13.5, w="700"))

    # CLIENT
    p.append(box(22, 38, 736, 92, "var(--primary-soft)", "var(--primary)"))
    p.append(T(36, 56, "CLIENT  ·  Next.js, React, TypeScript, Tailwind", 9.5, "start", "svg-mut", "700", "0.8"))
    views = ["Map + filters", "Report form", "Activity feed", "Leaderboard", "Profile + badges", "Insights", "Help requests", "Adoption"]
    for i, v in enumerate(views):
        p.append(chip(36 + (i % 4) * 182, 66 + (i // 4) * 28, 170, v, "var(--surface)", "var(--primary)"))
    p.append(T(756, 56, "Leaflet map · clustering · heat layer", 9, "end", "svg-mut"))

    # API
    p.append(box(22, 146, 736, 60, "var(--surface-2)"))
    p.append(T(36, 164, "APPLICATION PROGRAMMING INTERFACE  ·  FastAPI, JSON Web Token auth", 9.5, "start", "svg-mut", "700", "0.8"))
    routes = ["auth", "reports", "map", "gamification", "social", "help", "adoption", "insights", "notifications", "chat"]
    for i, r in enumerate(routes):
        p.append(chip(36 + i * 71, 176, 66, r))

    # SERVICES
    p.append(box(22, 222, 470, 120, "var(--surface-2)"))
    p.append(T(36, 240, "DOMAIN SERVICES  ·  pure functions, independently testable", 9.5, "start", "svg-mut", "700", "0.8"))
    svcs = ["report", "antispam", "gamification", "confirmation", "spatial", "social", "media", "auth", "email", "notifications"]
    for i, v in enumerate(svcs):
        p.append(chip(36 + (i % 4) * 113, 252 + (i // 4) * 28, 105, v))
    p.append(T(257, 334, "37 automated tests cover the shaded rules", 8.8, cls="svg-mut"))

    # AI COMPONENTS
    p.append(box(506, 222, 252, 56, "var(--good-soft)", "var(--good)"))
    p.append(T(632, 241, "SPECIES CLASSIFIER  ·  in-house", 9.5, cls="svg-mut", w="700", ls="0.6"))
    p.append(T(632, 260, "ConvNeXt-Tiny · exported model · T = 0.30", 10))
    p.append(T(632, 273, "the only trained model", 8.8, cls="svg-mut"))

    p.append(box(506, 288, 252, 54, "var(--accent-soft)", "var(--accent)"))
    p.append(T(632, 306, "HOSTED VISION-LANGUAGE MODEL", 9.5, cls="svg-mut", w="700", ls="0.6"))
    p.append(T(632, 324, "injury · safety · moderation · summaries", 10))
    p.append(T(632, 337, "degrades to a safe default", 8.8, cls="svg-mut"))

    # VALIDATION
    p.append(box(22, 358, 736, 92, "var(--surface-2)"))
    p.append(T(36, 376, "VALIDATION PIPELINE  ·  three tiers, verification-first", 9.5, "start", "svg-mut", "700", "0.8"))
    tiers = [("Tier 1  deterministic", "perceptual hash duplicate · rate limit", "var(--good)"),
             ("Tier 2  delegated", "identifier-free behavioural summary", "var(--accent)"),
             ("Tier 3  reputation", "publish at 75 · floor 45 · hold 0.7", "var(--primary)")]
    for i, (a, b, c) in enumerate(tiers):
        x = 36 + i * 240
        p.append(box(x, 388, 228, 50, "var(--surface)", c))
        p.append(T(x + 114, 406, a, 10, w="700"))
        p.append(T(x + 114, 424, b, 9, cls="svg-mut"))
    for i in range(2):
        p.append(arr(36 + i * 240 + 228, 413, 36 + (i + 1) * 240, 413))

    # PERSISTENCE
    p.append(box(22, 466, 736, 84, "var(--surface-2)"))
    p.append(T(36, 484, "PERSISTENCE  ·  PostgreSQL + PostGIS  ·  15 migrations", 9.5, "start", "svg-mut", "700", "0.8"))
    tables = ["users", "reports", "confirmations", "point_events", "badges", "user_badges", "likes", "comments", "help_requests", "adoptions"]
    for i, t in enumerate(tables):
        p.append(chip(36 + (i % 5) * 145, 496 + (i // 5) * 26, 137, t))

    # PRIVACY BAND
    p.append(box(22, 566, 736, 56, "var(--crit-soft)", "var(--crit)", dash="5 4"))
    p.append(T(36, 584, "PRIVACY BOUNDARY  ·  applied before anything is stored or sent", 9.5, "start", "svg-mut", "700", "0.8"))
    p.append(T(400, 606, "photo re-encoded so metadata is destroyed  ·  coordinate rounded to about 100 m  ·  only derived, non-identifying data leaves the system", 9.5, cls="svg-mut"))

    for y1, y2 in [(130, 144), (206, 220), (342, 356), (450, 464), (550, 564)]:
        p.append(arr(390, y1, 390, y2, "var(--primary)", "ap"))
    p.append(arr(492, 250, 504, 246, "var(--good)", "ag"))
    p.append(arr(492, 300, 504, 308, "var(--accent)", "aa"))
    p.append(T(W / 2, 646, "Exactly one model is trained in-house. Every delegated capability returns a safe default when the service is unavailable.", 9.5, cls="svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============ 2. MODEL ARCHITECTURE + INFERENCE PATH ============
def model_arch():
    W, H = 780, 400
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Species classifier architecture and inference path">', MK]
    p.append(T(W / 2, 22, "Species classifier: architecture and inference path", 13.5, w="700"))

    # training-time stack
    p.append(box(22, 40, 300, 214, "var(--good-soft)", "var(--good)"))
    p.append(T(172, 60, "MODEL", 9.5, cls="svg-mut", w="700", ls="0.8"))
    layers = [("Input  224 x 224 x 3", "photograph, three channels"),
              ("ConvNeXt-Tiny backbone", "ImageNet-pretrained, fine-tuned"),
              ("Global average pooling", "feature vector"),
              ("Linear head  ->  5 logits", "Dog Cat Cow Buffalo Other")]
    for i, (a, b) in enumerate(layers):
        y = 74 + i * 45
        p.append(box(38, y, 268, 38, "var(--surface)", "var(--good)"))
        p.append(T(172, y + 16, a, 10.5, w="700"))
        p.append(T(172, y + 30, b, 8.8, cls="svg-mut"))
        if i < 3:
            p.append(arr(172, y + 38, 172, y + 44, "var(--good)", "ag"))
    p.append(T(172, 268, "trained once, then frozen and exported", 9, cls="svg-mut"))

    # inference path
    p.append(box(352, 40, 406, 214, "var(--primary-soft)", "var(--primary)"))
    p.append(T(555, 60, "INFERENCE PATH AS DEPLOYED", 9.5, cls="svg-mut", w="700", ls="0.8"))
    steps = [("Resize 224, ImageNet normalise", "same transform as training"),
             ("Exported model  ->  logits", "Open Neural Network Exchange runtime"),
             ("Divide by temperature  T = 0.30", "calibration, argmax unchanged"),
             ("Softmax  ->  confidence", "now means what it says")]
    for i, (a, b) in enumerate(steps):
        y = 74 + i * 45
        p.append(box(368, y, 374, 38, "var(--surface)", "var(--primary)"))
        p.append(T(555, y + 16, a, 10.5, w="700"))
        p.append(T(555, y + 30, b, 8.8, cls="svg-mut"))
        if i < 3:
            p.append(arr(555, y + 38, 555, y + 44, "var(--primary)", "ap"))
    p.append(arr(322, 147, 350, 147, "var(--good)", "ag"))

    # routing decision
    p.append(f'<path d="M330,300 L400,272 L470,300 L400,328 Z" fill="var(--surface-2)" stroke="var(--rule-strong)" stroke-width="1.4"/>')
    p.append(T(400, 296, "confidence", 10, w="700")); p.append(T(400, 310, "above 0.70?", 10, w="700"))
    p.append(arr(555, 254, 430, 272, "var(--primary)", "ap"))

    p.append(box(506, 272, 252, 26, "var(--good-soft)", "var(--good)"))
    p.append(T(632, 289, "Yes, 83.7%  ->  use the label", 10.5, w="700"))
    p.append(box(506, 306, 252, 26, "var(--accent-soft)", "var(--accent)"))
    p.append(T(632, 323, "No, 16.3%  ->  ask the hosted model", 10.5, w="700"))
    p.append(arr(470, 292, 504, 285, "var(--good)", "ag"))
    p.append(arr(470, 308, 504, 315, "var(--accent)", "aa"))

    p.append(box(22, 272, 268, 60, "var(--surface-2)"))
    p.append(T(156, 292, "Label shown as an estimate", 10.5, w="700"))
    p.append(T(156, 310, "user can correct it; the report", 9, cls="svg-mut"))
    p.append(T(156, 323, "is stored either way", 9, cls="svg-mut"))
    p.append(arr(506, 340, 300, 340, "var(--ink-faint)"))

    p.append(T(W / 2, 366, "Before calibration the same threshold sent 87 percent of predictions to the fallback, including most correct ones.", 9.5, cls="svg-mut"))
    p.append(T(W / 2, 384, "Temperature scaling changed only the confidence, never the chosen class, so accuracy is identical either side of it.", 9.5, cls="svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============ 3. TRAINING AND EVALUATION PIPELINE ============
def train_pipeline():
    W, H = 780, 330
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Training and evaluation pipeline">', MK]
    p.append(T(W / 2, 22, "Training and evaluation pipeline, seed 42 throughout", 13.5, w="700"))
    cols = [("Collect", ["2,000 images", "400 per class", "public sources"], "var(--primary-soft)", "var(--primary)"),
            ("Clean", ["corrupt check", "perceptual-hash", "duplicate removal"], "var(--surface-2)", "var(--rule-strong)"),
            ("Split", ["1,399 train", "300 validation", "301 test"], "var(--surface-2)", "var(--rule-strong)"),
            ("Augment", ["RandAugment", "mixup, CutMix", "label smoothing"], "var(--surface-2)", "var(--rule-strong)"),
            ("Train two", ["EfficientNetV2-S", "ConvNeXt-Tiny", "identical recipe"], "var(--surface-2)", "var(--rule-strong)"),
            ("Select", ["macro F1 on", "validation only", "test held back"], "var(--good-soft)", "var(--good)")]
    for i, (h, items, bg, st) in enumerate(cols):
        x = 14 + i * 128
        p.append(box(x, 46, 118, 108, bg, st))
        p.append(T(x + 59, 66, h, 11.5, w="700"))
        for j, it in enumerate(items):
            p.append(T(x + 59, 88 + j * 16, it, 9, cls="svg-mut"))
        if i < 5:
            p.append(arr(x + 118, 100, x + 128, 100, "var(--primary)", "ap"))
    # export and evaluate row
    p.append(box(120, 186, 200, 58, "var(--good-soft)", "var(--good)"))
    p.append(T(220, 206, "Export", 11.5, w="700"))
    p.append(T(220, 224, "graph, class order, temperature", 9, cls="svg-mut"))
    p.append(box(356, 186, 200, 58, "var(--primary-soft)", "var(--primary)"))
    p.append(T(456, 206, "Evaluate as deployed", 11.5, w="700"))
    p.append(T(456, 224, "production inference path", 9, cls="svg-mut"))
    p.append(box(592, 186, 174, 58, "var(--accent-soft)", "var(--accent)"))
    p.append(T(679, 206, "Calibrate", 11.5, w="700"))
    p.append(T(679, 224, "fit T on validation", 9, cls="svg-mut"))
    p.append(arr(650, 154, 300, 184, "var(--good)", "ag"))
    p.append(arr(320, 215, 354, 215, "var(--primary)", "ap"))
    p.append(arr(556, 215, 590, 215, "var(--accent)", "aa"))
    p.append(T(W / 2, 276, "The split assignment for every image is written to a manifest committed with the code, so the exact evaluation can be repeated.", 9.5, cls="svg-mut"))
    p.append(T(W / 2, 296, "Evaluating through the production path rather than the notebook is what exposed both the accuracy gap and the calibration failure.", 9.5, cls="svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============ 4. DATABASE SCHEMA ============
def er():
    W, H = 760, 420
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Database schema">', MK]
    p.append(T(W / 2, 22, "Database schema, PostgreSQL with PostGIS", 13.5, w="700"))
    ents = {
      "user":     (40, 46, 200, ["identity, credentials", "reputation 0 to 100", "points, level, role", "created timestamp"], "var(--primary-soft)", "var(--primary)"),
      "report":   (300, 46, 240, ["author, image, hash", "POINT geometry, ward", "species + confidence", "injury + rationale", "spam score + reasons", "status, moderation state"], "var(--good-soft)", "var(--good)"),
      "confirmation": (600, 46, 130, ["report, voter", "vote type", "unique per voter"], "var(--surface-2)", "var(--rule-strong)"),
      "point_event": (40, 218, 200, ["user, report", "signed delta", "reason, timestamp"], "var(--surface-2)", "var(--rule-strong)"),
      "badge / award": (300, 218, 240, ["badge definition", "award links user"], "var(--surface-2)", "var(--rule-strong)"),
      "like / comment": (600, 218, 130, ["report, user", "body, timestamp"], "var(--surface-2)", "var(--rule-strong)"),
    }
    for name, (x, y, w, rows, bg, st) in ents.items():
        h = 34 + len(rows) * 16
        p.append(box(x, y, w, h, bg, st))
        p.append(T(x + w / 2, y + 20, name, 11.5, w="700"))
        p.append(f'<line x1="{x+8}" y1="{y+27}" x2="{x+w-8}" y2="{y+27}" stroke="var(--rule-strong)" stroke-width="1"/>')
        for j, r in enumerate(rows):
            p.append(T(x + w / 2, y + 42 + j * 16, r, 9, cls="svg-mut"))
    p.append(arr(240, 80, 298, 80)); p.append(T(269, 72, "1..n", 8.5, cls="svg-mut"))
    p.append(arr(540, 80, 598, 80)); p.append(T(569, 72, "1..n", 8.5, cls="svg-mut"))
    p.append(arr(140, 168, 140, 216)); p.append(T(156, 194, "1..n", 8.5, cls="svg-mut"))
    p.append(arr(420, 168, 420, 216)); p.append(T(436, 194, "n..n", 8.5, cls="svg-mut"))
    p.append(arr(665, 148, 665, 216)); p.append(T(681, 184, "1..n", 8.5, cls="svg-mut"))
    p.append(box(40, 330, 690, 62, "var(--crit-soft)", "var(--crit)", dash="5 4"))
    p.append(T(385, 350, "What the schema deliberately does not hold", 11, w="700"))
    p.append(T(385, 370, "no precise coordinate, no photo metadata, no device identifier. The rounded point is the only location that ever exists.", 9.5, cls="svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


# ============ 5. HEADLINE METRICS PANEL ============
def metrics_card():
    acc = D["accuracy"]; ci = D["ci"]["test"]; ind = D["independent"]
    W, H = 760, 250
    p = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Headline model performance">', MK]
    p.append(T(W / 2, 24, "Species classifier performance, measured through the deployed inference path", 12.5, w="700"))
    cards = [
      (f"{acc*100:.1f}%", "accuracy, held-out split", f"95% interval {ci[0]*100:.1f} to {ci[1]*100:.1f}  ·  n = {D['n_test']}", "var(--primary)"),
      (f"{ind['accuracy']*100:.1f}%", "accuracy, unseen dataset", f"different source  ·  n = {ind['n']}", "var(--accent)"),
      (f"{D['macro_auc']:.4f}", "macro area under the curve", "ranking quality, all classes above 0.998", "var(--good)"),
      (f"{D['macro']['f1']:.3f}", "macro F1", f"precision {D['macro']['precision']:.3f}  ·  recall {D['macro']['recall']:.3f}", "var(--ink-faint)"),
    ]
    for i, (big, lab, sub, col) in enumerate(cards):
        x = 16 + i * 184
        p.append(box(x, 44, 172, 96, "var(--surface)", col, sw=1.6))
        p.append(f'<rect x="{x}" y="44" width="172" height="4" rx="2" fill="{col}"/>')
        p.append(T(x + 86, 88, big, 27, w="700"))
        p.append(T(x + 86, 108, lab, 10, cls="svg-mut", w="700"))
        p.append(T(x + 86, 126, sub, 8.5, cls="svg-mut"))
    # calibration strip
    p.append(box(16, 156, 728, 52, "var(--surface-2)"))
    p.append(T(30, 176, "CALIBRATION", 9, "start", "svg-mut", "700", "0.8"))
    items = [("expected calibration error", "0.3575", "0.0327"), ("sent to fallback at 0.70", "87.0%", "16.3%"), ("accuracy", "0.9103", "0.9103")]
    for i, (lab, before, after) in enumerate(items):
        x = 150 + i * 200
        p.append(T(x, 176, lab, 9.5, cls="svg-mut"))
        p.append(T(x - 40, 196, before, 12, w="700", cls="svg-mut"))
        p.append(f'<path d="M{x-12},192 L{x+8},192" stroke="var(--good)" stroke-width="1.5" marker-end="url(#ag)"/>')
        p.append(T(x + 44, 196, after, 12, w="700"))
    p.append(T(W / 2, 232, "The training notebook recorded 98.4 percent. It does not reproduce through this path, so the figures above are the ones this thesis reports.", 9.5, cls="svg-mut"))
    p.append("</svg>")
    return "\n".join(p)


for k, fn in [("arch_full", arch_full), ("model_arch", model_arch), ("train_pipeline", train_pipeline),
              ("er", er), ("metrics_card", metrics_card)]:
    F[k] = fn()
    print("built", k, len(F[k]))
(SP / "figs4.json").write_text(json.dumps(F))
print("wrote figs4.json")
