"""Full evaluation dump of the DEPLOYED ONNX model -> chart_data.json.
Everything a research paper needs: confusion matrix, per-class P/R/F1, one-vs-rest ROC + AUC,
confidence distributions, reliability curves before/after calibration, threshold sweep,
dataset composition. All computed through the application's inference path."""
import csv, json, os
from collections import Counter
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(r"C:/Users/TUF/Desktop/Softwarica/Thesis Code")
EXP = ROOT / "ml" / "exported"
LABELS = json.loads((EXP / "labels.json").read_text())
K = len(LABELS)
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
T_STAR = 0.30

sess = ort.InferenceSession(str(EXP / "species_model.onnx"), providers=["CPUExecutionProvider"])
INP = sess.get_inputs()[0].name


def logits_of(path):
    img = Image.open(path).convert("RGB").resize((224, 224))
    a = (np.asarray(img, np.float32) / 255.0 - MEAN) / STD
    return np.asarray(sess.run(None, {INP: a.transpose(2, 0, 1)[None].astype(np.float32)})[0][0], np.float64)


def softmax(z, T=1.0):
    z = np.asarray(z) / T
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def collect(items):
    L, Y = [], []
    for p, lab in items:
        if os.path.exists(p):
            L.append(logits_of(p)); Y.append(LABELS.index(lab))
    return np.array(L), np.array(Y)


# ---- gather splits ----
splits = {"train": [], "val": [], "test": []}
counts = Counter()
with open(ROOT / "data" / "splits.csv", newline="") as f:
    for r in csv.DictReader(f):
        p = r["path"]; p = p if os.path.isabs(p) else str(ROOT / p)
        splits[r["split"]].append((p, r["label"]))
        counts[(r["split"], r["label"])] += 1

print("scoring val + test ...")
Lv, Yv = collect(splits["val"])
Lt, Yt = collect(splits["test"])

pak = [(str(p), "Buffalo") for p in (ROOT / "data" / "raw" / "Buffalo-Pak").rglob("*")
       if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}]
print(f"scoring {len(pak)} independent buffalo images ...")
Lp, Yp = collect(pak)

out = {"labels": LABELS, "temperature": T_STAR}

# ---- dataset composition ----
out["dataset"] = {
    "per_split": {s: sum(v for (sp, _), v in counts.items() if sp == s) for s in ["train", "val", "test"]},
    "per_class_split": {s: {c: counts[(s, c)] for c in LABELS} for s in ["train", "val", "test"]},
    "independent_buffalo": len(pak),
}

# ---- core test metrics ----
P = softmax(Lt); pred = P.argmax(1)
cm = np.zeros((K, K), int)
for t, q in zip(Yt, pred):
    cm[t, q] += 1
out["confusion"] = cm.tolist()
out["accuracy"] = float((pred == Yt).mean())
out["n_test"] = int(len(Yt))

per = []
for i, c in enumerate(LABELS):
    tp = cm[i, i]; fp = cm[:, i].sum() - tp; fn = cm[i, :].sum() - tp
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    per.append({"class": c, "precision": round(prec, 4), "recall": round(rec, 4),
                "f1": round(f1, 4), "support": int(cm[i, :].sum())})
out["per_class"] = per
out["macro"] = {k: round(float(np.mean([p[k] for p in per])), 4) for k in ["precision", "recall", "f1"]}

# ---- one-vs-rest ROC ----
def roc(scores, pos):
    order = np.argsort(-scores)
    tp = np.cumsum(pos[order] == 1); fp = np.cumsum(pos[order] == 0)
    P_, N_ = max(pos.sum(), 1), max((pos == 0).sum(), 1)
    tpr = np.concatenate([[0], tp / P_, [1]]); fpr = np.concatenate([[0], fp / N_, [1]])
    return fpr, tpr, float(np.trapz(tpr, fpr))

out["roc"] = {}
for i, c in enumerate(LABELS):
    fpr, tpr, auc = roc(P[:, i], (Yt == i).astype(int))
    idx = np.linspace(0, len(fpr) - 1, 60).astype(int)  # downsample for plotting
    out["roc"][c] = {"fpr": [round(float(x), 4) for x in fpr[idx]],
                     "tpr": [round(float(x), 4) for x in tpr[idx]], "auc": round(auc, 4)}
out["macro_auc"] = round(float(np.mean([v["auc"] for v in out["roc"].values()])), 4)

# ---- confidence distributions (uncalibrated + calibrated) ----
def conf_hist(probs, correct, bins=10):
    conf = probs.max(1)
    edges = np.linspace(0, 1, bins + 1)
    return {"edges": [round(float(e), 2) for e in edges],
            "correct": [int(((conf >= edges[i]) & (conf < edges[i + 1] + (1e-9 if i == bins - 1 else 0)) & correct).sum()) for i in range(bins)],
            "wrong": [int(((conf >= edges[i]) & (conf < edges[i + 1] + (1e-9 if i == bins - 1 else 0)) & ~correct).sum()) for i in range(bins)],
            "mean_correct": round(float(conf[correct].mean()), 4),
            "mean_wrong": round(float(conf[~correct].mean()), 4)}

correct = pred == Yt
Pc = softmax(Lt, T_STAR)
out["confidence_uncal"] = conf_hist(P, correct)
out["confidence_cal"] = conf_hist(Pc, correct)

# ---- reliability + ECE ----
def reliability(probs, y, bins=10):
    conf = probs.max(1); pr = probs.argmax(1); acc = (pr == y)
    pts, ece = [], 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        m = (conf > lo) & (conf <= hi)
        if m.sum():
            pts.append({"conf": round(float(conf[m].mean()), 4),
                        "acc": round(float(acc[m].mean()), 4), "n": int(m.sum())})
            ece += m.sum() / len(y) * abs(acc[m].mean() - conf[m].mean())
    return pts, round(float(ece), 4)

out["reliability_before"], out["ece_before"] = reliability(P, Yt)
out["reliability_after"], out["ece_after"] = reliability(Pc, Yt)
rv_b, ev_b = reliability(softmax(Lv), Yv); rv_a, ev_a = reliability(softmax(Lv, T_STAR), Yv)
out["ece_val_before"], out["ece_val_after"] = ev_b, ev_a

# ---- threshold sweep ----
sweep = []
cc = Pc.max(1); cu = P.max(1)
for t in np.arange(0.30, 1.00, 0.05):
    below_c = cc < t
    kept = ~below_c
    sweep.append({"t": round(float(t), 2),
                  "routed_cal": round(float(below_c.mean()), 4),
                  "routed_uncal": round(float((cu < t).mean()), 4),
                  "acc_kept_cal": round(float(correct[kept].mean()), 4) if kept.sum() else None})
out["threshold_sweep"] = sweep

# ---- independent buffalo set ----
Pp = softmax(Lp); pp = Pp.argmax(1)
out["independent"] = {
    "n": int(len(Yp)), "accuracy": round(float((pp == Yp).mean()), 4),
    "distribution": {LABELS[i]: int((pp == i).sum()) for i in range(K)},
    "mean_conf_cal": round(float(softmax(Lp, T_STAR).max(1).mean()), 4),
    "routed_cal_at_070": round(float((softmax(Lp, T_STAR).max(1) < 0.70).mean()), 4),
    "routed_uncal_at_070": round(float((Pp.max(1) < 0.70).mean()), 4),
}

# ---- Wilson CIs ----
def wilson(k, n, z=1.96):
    p = k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z / (1 + z * z / n) * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round(float(c - h), 4), round(float(c + h), 4)]

out["ci"] = {"test": wilson(int(correct.sum()), len(Yt)),
             "independent": wilson(int((pp == Yp).sum()), len(Yp)),
             "per_class": {p["class"]: wilson(round(p["recall"] * p["support"]), p["support"]) for p in per}}

(Path(__file__).parent / "chart_data.json").write_text(json.dumps(out, indent=1))
print("\nacc", out["accuracy"], "macroF1", out["macro"]["f1"], "macroAUC", out["macro_auc"])
print("ECE", out["ece_before"], "->", out["ece_after"])
print("independent", out["independent"]["accuracy"], out["independent"]["distribution"])
print("WROTE chart_data.json")
