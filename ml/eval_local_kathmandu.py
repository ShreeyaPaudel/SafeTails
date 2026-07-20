"""Evaluate the deployed model on the locally collected Kathmandu photographs.

This is the real-world held-out set. It runs through the same inference path the
application uses: the exported ONNX graph, the same preprocessing, the same
temperature and the same confidence threshold that decides whether a species
label is accepted or the report is routed for human verification.

Only Cat, Cow and Dog are present in the collected set. Buffalo, Other and the
no-animal case have no images, so nothing is reported for them.
"""
import json
from collections import Counter, defaultdict
from math import sqrt
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
EXP = ROOT / "ml" / "exported"
TEST = ROOT / "data" / "kathmandu_test"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

LABELS = json.loads((EXP / "labels.json").read_text())
CAL = json.loads((EXP / "calibration.json").read_text())
T_STAR = CAL["temperature"]
THRESHOLD = 0.70                      # species_confidence_threshold in backend config
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

# Two files are the same stock photograph downloaded twice; keeping both would
# double-count one image.
DROP = {"kathmandu-nepal-durbar-square-where-cows-and-pigeons-roam-freely-BBRTXY (1).jpg"}

sess = ort.InferenceSession(str(EXP / "species_model.onnx"), providers=["CPUExecutionProvider"])
INP = sess.get_inputs()[0].name


def logits_of(path):
    with Image.open(path) as im:
        img = im.convert("RGB").resize((224, 224))
    a = (np.asarray(img, np.float32) / 255.0 - MEAN) / STD
    return np.asarray(sess.run(None, {INP: a.transpose(2, 0, 1)[None].astype(np.float32)})[0][0], np.float64)


def softmax(z, T=1.0):
    z = np.asarray(z, np.float64) / T
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(100 * max(0, c - h), 1), round(100 * min(1, c + h), 1))


# ---- gather ----
items = []
for cls_dir in sorted(p for p in TEST.iterdir() if p.is_dir()):
    if cls_dir.name not in LABELS:
        continue
    for f in sorted(cls_dir.rglob("*")):
        if f.suffix.lower() in EXTS and f.is_file() and f.name not in DROP:
            items.append((f, cls_dir.name, "injured" in f.parent.name.lower()))

rows = []
for f, lab, injured in items:
    p = softmax(logits_of(f), T_STAR)
    k = int(p.argmax())
    rows.append({"file": f.name, "true": lab, "pred": LABELS[k],
                 "conf": float(p[k]), "injured": injured,
                 "correct": LABELS[k] == lab})

n = len(rows)
correct = sum(r["correct"] for r in rows)
present = [c for c in LABELS if any(r["true"] == c for r in rows)]

print(f"images evaluated: {n}   (classes present: {', '.join(present)})")
print(f"\nOVERALL argmax accuracy: {100*correct/n:.1f}%  ({correct}/{n})  "
      f"95% CI {wilson(correct, n)}")

print("\nper class:")
print(f"   {'class':<9}{'n':>4}{'recall':>9}{'95% CI':>16}{'precision':>11}")
for c in present:
    sub = [r for r in rows if r["true"] == c]
    k = sum(r["correct"] for r in sub)
    pk = [r for r in rows if r["pred"] == c]
    prec = f"{100*sum(r['correct'] for r in pk)/len(pk):.1f}%" if pk else "n/a"
    lo, hi = wilson(k, len(sub))
    print(f"   {c:<9}{len(sub):>4}{100*k/len(sub):>8.1f}%{f'[{lo}, {hi}]':>16}{prec:>11}")

print("\nconfusion (rows = true, columns = predicted):")
print(f"   {'':<9}" + "".join(f"{c:>9}" for c in LABELS))
for c in present:
    row = Counter(r["pred"] for r in rows if r["true"] == c)
    print(f"   {c:<9}" + "".join(f"{row.get(p, 0):>9}" for p in LABELS))

print("\ninjured vs uninjured animals:")
for flag, name in [(False, "uninjured"), (True, "injured")]:
    sub = [r for r in rows if r["injured"] == flag]
    if not sub:
        continue
    k = sum(r["correct"] for r in sub)
    lo, hi = wilson(k, len(sub))
    mc = np.mean([r["conf"] for r in sub])
    print(f"   {name:<11}{len(sub):>4} images   accuracy {100*k/len(sub):>5.1f}%  "
          f"95% CI [{lo}, {hi}]   mean confidence {mc:.3f}")
for c in present:
    inj = [r for r in rows if r["injured"] and r["true"] == c]
    if inj:
        print(f"      of which {c}: {sum(r['correct'] for r in inj)}/{len(inj)} correct")

print(f"\nrouting at the deployed confidence threshold of {THRESHOLD:.2f}:")
acc_hi = [r for r in rows if r["conf"] >= THRESHOLD]
acc_lo = [r for r in rows if r["conf"] < THRESHOLD]
print(f"   auto-labelled (confidence >= {THRESHOLD:.2f}): {len(acc_hi)} of {n} "
      f"({100*len(acc_hi)/n:.1f}%)")
if acc_hi:
    k = sum(r["correct"] for r in acc_hi)
    lo, hi = wilson(k, len(acc_hi))
    print(f"      accuracy among those: {100*k/len(acc_hi):.1f}%  95% CI [{lo}, {hi}]")
print(f"   sent for human verification: {len(acc_lo)} ({100*len(acc_lo)/n:.1f}%)")
if acc_lo:
    k = sum(r["correct"] for r in acc_lo)
    print(f"      the model would have been right on {k} of those {len(acc_lo)}")

print("\nconfidence distribution:")
conf = np.array([r["conf"] for r in rows])
print(f"   mean {conf.mean():.3f}   median {np.median(conf):.3f}   "
      f"correct {conf[[r['correct'] for r in rows]].mean():.3f}   "
      f"wrong {conf[[not r['correct'] for r in rows]].mean():.3f}")

print("\nevery misclassification:")
for r in sorted((r for r in rows if not r["correct"]), key=lambda r: -r["conf"]):
    tag = " [injured]" if r["injured"] else ""
    print(f"   {r['true']:<7} -> {r['pred']:<8} conf {r['conf']:.3f}{tag}   {r['file'][:58]}")

out = {"n": n, "accuracy": correct / n, "accuracy_ci": wilson(correct, n),
       "threshold": THRESHOLD, "temperature": T_STAR,
       "classes_present": present, "rows": rows,
       "coverage": len(acc_hi) / n,
       "selective_accuracy": (sum(r["correct"] for r in acc_hi) / len(acc_hi)) if acc_hi else None}
(EXP / "eval_local.json").write_text(json.dumps(out, indent=1))
print(f"\nwritten to {(EXP / 'eval_local.json').relative_to(ROOT)}")
