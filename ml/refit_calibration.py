"""Refit temperature scaling for the DEPLOYED inference path.

Calibration is a property of (model + preprocessing), not of the weights alone. When the
serving preprocessing changes, the previously fitted temperature no longer describes the
confidences the application actually produces, so it is refitted here through the same
`app.ml.species._preprocess` the API uses.

Fits T on the validation split by minimising negative log-likelihood, reports expected
calibration error before and after, and sweeps the confidence threshold so the operating
point is chosen from evidence rather than habit.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.species import CLASS_NAMES, _preprocess, get_classifier  # noqa: E402

clf = get_classifier()
assert clf.available, "ONNX model not loaded"


def logits_for(split: str) -> tuple[np.ndarray, np.ndarray]:
    rows = [r for r in csv.DictReader(open(ROOT / "data/splits.csv")) if r["split"] == split]
    L, Y = [], []
    for r in rows:
        p = ROOT / r["path"]
        if not p.exists():
            continue
        out = clf._session.run(None, {clf._input_name: _preprocess(Image.open(p))})[0][0]
        L.append(np.asarray(out, np.float64))
        Y.append(CLASS_NAMES.index(r["label"]))
    return np.array(L), np.array(Y)


def softmax(z: np.ndarray, T: float = 1.0) -> np.ndarray:
    z = z / T
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def nll(z: np.ndarray, y: np.ndarray, T: float) -> float:
    p = softmax(z, T)
    return float(-np.mean(np.log(p[np.arange(len(y)), y] + 1e-12)))


def ece(z: np.ndarray, y: np.ndarray, T: float, bins: int = 10) -> float:
    p = softmax(z, T)
    conf, pred = p.max(1), p.argmax(1)
    correct = (pred == y).astype(float)
    total = 0.0
    for i in range(bins):
        lo, hi = i / bins, (i + 1) / bins
        m = (conf > lo) & (conf <= hi)
        if m.sum():
            total += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(total)


print("computing validation logits through the deployed preprocessing...")
zv, yv = logits_for("val")
print(f"  val n={len(yv)}")

grid = np.arange(0.05, 3.01, 0.01)
best_T = float(min(grid, key=lambda t: nll(zv, yv, float(t))))
print(f"\nfitted temperature (val NLL): T = {best_T:.4f}")
print(f"  val ECE  T=1.0 : {ece(zv, yv, 1.0):.4f}")
print(f"  val ECE  T={best_T:.3f}: {ece(zv, yv, best_T):.4f}")

print("\ncomputing test logits...")
zt, yt = logits_for("test")
acc = float((softmax(zt, best_T).argmax(1) == yt).mean())
print(f"  test n={len(yt)}  top-1 accuracy = {acc:.4f}  (temperature-invariant)")
print(f"  test ECE T=1.0 : {ece(zt, yt, 1.0):.4f}")
print(f"  test ECE T={best_T:.3f}: {ece(zt, yt, best_T):.4f}")

print(f"\nthreshold sweep on test (T={best_T:.4f}):")
print(f"  {'thr':>5} {'coverage':>9} {'acc kept':>9}")
sweep = []
p = softmax(zt, best_T)
conf, pred = p.max(1), p.argmax(1)
for thr in [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.86, 0.90]:
    keep = conf >= thr
    cov = float(keep.mean())
    a = float((pred[keep] == yt[keep]).mean()) if keep.any() else 0.0
    sweep.append({"t": thr, "coverage": round(cov, 4), "acc_kept": round(a, 4)})
    print(f"  {thr:>5.2f} {100*cov:8.1f}% {100*a:8.1f}%")

out = {
    "temperature": round(best_T, 4),
    "method": "temperature scaling (Guo et al. 2017), fit on val NLL through the deployed preprocessing",
    "preprocessing": "aspect-preserving resize (short side 256, bilinear) + centre crop 224",
    "ece_before": round(ece(zt, yt, 1.0), 4),
    "ece_after": round(ece(zt, yt, best_T), 4),
    "test_accuracy_argmax": round(acc, 4),
    "threshold_sweep": sweep,
}
(ROOT / "ml/exported/calibration.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print(f"\nwrote ml/exported/calibration.json")
