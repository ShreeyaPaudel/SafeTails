"""Comprehensive evaluation of the exported winner ONNX on the held-out test split.

Adds per-class precision/recall/F1, one-vs-rest ROC + PR curves (and AUCs), and a normalised
confusion matrix — without retraining (runs the exported model over data/splits.csv test rows,
using the calibrated temperature). Updates ml/exported/metrics.json and writes figures to
docs/figures/. Run:  python -m ml.src.extra_eval
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import onnxruntime as ort
import pandas as pd
from PIL import Image
from sklearn.metrics import (
    auc, average_precision_score, classification_report, confusion_matrix,
    precision_recall_curve, roc_auc_score, roc_curve,
)

from ml.src.config import CLASS_NAMES, EXPORT_DIR, SPLIT_MANIFEST
from ml.src import pipeline as P

FIG = P.FIG_DIR
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)
IDX = {c: i for i, c in enumerate(CLASS_NAMES)}


def _preprocess(path: str) -> np.ndarray:
    img = Image.open(path).convert("RGB").resize((224, 224))
    arr = (np.asarray(img, np.float32) / 255.0 - _MEAN) / _STD
    return arr.transpose(2, 0, 1)[None].astype(np.float32)


def _softmax(x, T=1.0):
    x = x / T
    e = np.exp(x - x.max(1, keepdims=True))
    return e / e.sum(1, keepdims=True)


def main():
    T = json.loads((EXPORT_DIR / "calibration.json").read_text()).get("temperature", 1.0)
    df = pd.read_csv(SPLIT_MANIFEST)
    test = df[df["split"] == "test"].reset_index(drop=True)
    sess = ort.InferenceSession(str(EXPORT_DIR / "species_model.onnx"), providers=["CPUExecutionProvider"])
    name = sess.get_inputs()[0].name

    logits = np.vstack([sess.run(None, {name: _preprocess(p)})[0] for p in test["path"]])
    probs = _softmax(logits, T)
    y = test["label"].map(IDX).to_numpy()
    pred = probs.argmax(1)

    # Per-class report
    rep = classification_report(y, pred, labels=list(range(len(CLASS_NAMES))),
                                target_names=CLASS_NAMES, output_dict=True, zero_division=0)

    # Normalised confusion
    cm = confusion_matrix(y, pred, labels=list(range(len(CLASS_NAMES))))
    cmn = cm.astype(float) / cm.sum(1, keepdims=True).clip(min=1)
    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    im = ax.imshow(cmn, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(CLASS_NAMES))); ax.set_yticks(range(len(CLASS_NAMES)))
    ax.set_xticklabels(CLASS_NAMES, rotation=45, ha="right"); ax.set_yticklabels(CLASS_NAMES)
    ax.set_xlabel("Predicted"); ax.set_ylabel("True"); ax.set_title("Normalised confusion (winner)")
    for i in range(len(CLASS_NAMES)):
        for j in range(len(CLASS_NAMES)):
            ax.text(j, i, f"{cmn[i,j]:.2f}", ha="center", va="center",
                    color="white" if cmn[i, j] > 0.5 else "black", fontsize=8)
    fig.colorbar(im, fraction=0.046, pad=0.04); plt.tight_layout()
    plt.savefig(FIG / "confusion_normalized.png", dpi=130); plt.close()

    # One-vs-rest ROC + PR
    Y = np.eye(len(CLASS_NAMES))[y]
    roc_auc, pr_auc = {}, {}
    figr, axr = plt.subplots(figsize=(5.4, 4.8))
    figp, axp = plt.subplots(figsize=(5.4, 4.8))
    for i, c in enumerate(CLASS_NAMES):
        fpr, tpr, _ = roc_curve(Y[:, i], probs[:, i]); roc_auc[c] = auc(fpr, tpr)
        axr.plot(fpr, tpr, label=f"{c} (AUC {roc_auc[c]:.2f})")
        prec, rec, _ = precision_recall_curve(Y[:, i], probs[:, i]); pr_auc[c] = average_precision_score(Y[:, i], probs[:, i])
        axp.plot(rec, prec, label=f"{c} (AP {pr_auc[c]:.2f})")
    axr.plot([0, 1], [0, 1], "--", color="gray"); axr.set_xlabel("FPR"); axr.set_ylabel("TPR")
    axr.set_title("ROC — one-vs-rest"); axr.legend(fontsize=8); figr.tight_layout()
    figr.savefig(FIG / "roc_curves.png", dpi=130); plt.close(figr)
    axp.set_xlabel("Recall"); axp.set_ylabel("Precision"); axp.set_title("Precision–Recall — one-vs-rest")
    axp.legend(fontsize=8); figp.tight_layout(); figp.savefig(FIG / "pr_curves.png", dpi=130); plt.close(figp)

    macro_auc = float(roc_auc_score(Y, probs, average="macro", multi_class="ovr"))

    # Per-class F1 bar
    f1s = [rep[c]["f1-score"] for c in CLASS_NAMES]
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.bar(CLASS_NAMES, f1s, color="#157d8f"); ax.set_ylim(0, 1); ax.set_ylabel("F1")
    ax.set_title("Per-class F1 (winner)")
    for i, v in enumerate(f1s): ax.text(i, v + 0.02, f"{v:.2f}", ha="center", fontsize=9)
    plt.tight_layout(); plt.savefig(FIG / "per_class_f1.png", dpi=130); plt.close()

    # Model comparison bar (from metrics.json)
    M = json.loads((EXPORT_DIR / "metrics.json").read_text())
    archs = list(M["models"]); accs = [M["models"][a]["accuracy"] for a in archs]; f1m = [M["models"][a]["macro_f1"] for a in archs]
    x = np.arange(len(archs)); w = 0.35
    fig, ax = plt.subplots(figsize=(6, 3.8))
    ax.bar(x - w/2, accs, w, label="accuracy", color="#3aa3b5")
    ax.bar(x + w/2, f1m, w, label="macro-F1", color="#d98a1f")
    ax.set_xticks(x); ax.set_xticklabels(archs, rotation=10); ax.set_ylim(0, 1); ax.legend()
    ax.set_title("Model comparison (test split)")
    plt.tight_layout(); plt.savefig(FIG / "model_comparison.png", dpi=130); plt.close()

    # Persist into metrics.json
    M["winner_per_class"] = {c: {k: round(rep[c][k], 4) for k in ["precision", "recall", "f1-score", "support"]} for c in CLASS_NAMES}
    M["winner_weighted_f1"] = round(rep["weighted avg"]["f1-score"], 4)
    M["winner_macro_roc_auc_ovr"] = round(macro_auc, 4)
    M["winner_roc_auc_per_class"] = {c: round(v, 4) for c, v in roc_auc.items()}
    M["winner_pr_auc_per_class"] = {c: round(v, 4) for c, v in pr_auc.items()}
    (EXPORT_DIR / "metrics.json").write_text(json.dumps(M, indent=2), encoding="utf-8")

    print("Per-class F1:", {c: round(rep[c]["f1-score"], 3) for c in CLASS_NAMES})
    print(f"Macro ROC-AUC (OvR): {macro_auc:.4f}  | weighted F1: {M['winner_weighted_f1']}")
    print("Figures: confusion_normalized, roc_curves, pr_curves, per_class_f1, model_comparison")


if __name__ == "__main__":
    main()
