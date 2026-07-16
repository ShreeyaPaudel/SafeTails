"""Run the full species-classification study and save real artefacts.

Produces (all from a clean dataset under data/raw/, SEED=42):
  - ml/exported/species_model.onnx        (winner, backend drop-in)
  - ml/exported/labels.json               (class order)
  - ml/exported/metrics.json              (comparison / ablation / calibration / latency)
  - docs/figures/*.png                    (class dist, confusion, training curves, reliability)
  - docs/MODEL_RESULTS.md                 (human-readable tables)

Usage (from repo root, ml venv):
    python -m ml.src.run_study
CPU-feasible defaults; override epochs via env: ST_EPOCHS_HEAD, ST_EPOCHS_FT, ST_BATCH.
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch

from ml.src.config import CLASS_NAMES, EXPORT_DIR, SEED, SPLIT_MANIFEST, set_global_seed
from ml.src import pipeline as P

FIG = P.FIG_DIR
ARCHS = ["mobilenet_v3_small", "efficientnet_b0"]


def _save_class_distribution(manifest):
    FIG.mkdir(parents=True, exist_ok=True)
    counts = manifest.groupby(["label", "split"]).size().unstack(fill_value=0).reindex(CLASS_NAMES)
    counts = counts[[c for c in ["train", "val", "test"] if c in counts.columns]]
    ax = counts.plot(kind="bar", stacked=True, figsize=(7, 4), colormap="viridis")
    ax.set_title("Class distribution by split")
    ax.set_ylabel("images"); ax.set_xlabel("")
    plt.tight_layout(); plt.savefig(FIG / "class_distribution.png", dpi=130); plt.close()


def _save_confusion(cm, arch):
    cm = np.array(cm)
    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(CLASS_NAMES))); ax.set_yticks(range(len(CLASS_NAMES)))
    ax.set_xticklabels(CLASS_NAMES, rotation=45, ha="right"); ax.set_yticklabels(CLASS_NAMES)
    ax.set_xlabel("Predicted"); ax.set_ylabel("True"); ax.set_title(f"Confusion — {arch}")
    thr = cm.max() / 2 if cm.max() else 0.5
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, int(cm[i, j]), ha="center", va="center",
                    color="white" if cm[i, j] > thr else "black", fontsize=9)
    fig.colorbar(im, fraction=0.046, pad=0.04)
    plt.tight_layout(); plt.savefig(FIG / f"confusion_{arch}.png", dpi=130); plt.close()


def _save_training_curves(history, arch):
    ep = range(1, len(history["val_acc"]) + 1)
    fig, ax = plt.subplots(1, 2, figsize=(9, 3.6))
    ax[0].plot(ep, history["train_loss"], label="train"); ax[0].plot(ep, history["val_loss"], label="val")
    ax[0].set_title(f"Loss — {arch}"); ax[0].set_xlabel("epoch"); ax[0].legend()
    ax[1].plot(ep, history["train_acc"], label="train"); ax[1].plot(ep, history["val_acc"], label="val")
    ax[1].set_title(f"Accuracy — {arch}"); ax[1].set_xlabel("epoch"); ax[1].legend()
    plt.tight_layout(); plt.savefig(FIG / f"training_curves_{arch}.png", dpi=130); plt.close()


def _save_reliability(probs, labels, ece_before, ece_after, n_bins=15):
    conf = probs.max(1); pred = probs.argmax(1); acc = (pred == labels).astype(float)
    bins = np.linspace(0, 1, n_bins + 1); mids = (bins[:-1] + bins[1:]) / 2
    accs = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (conf > lo) & (conf <= hi)
        accs.append(acc[m].mean() if m.sum() else np.nan)
    fig, ax = plt.subplots(figsize=(4.8, 4.6))
    ax.plot([0, 1], [0, 1], "--", color="gray", label="perfect")
    ax.bar(mids, np.nan_to_num(accs), width=1 / n_bins * 0.9, alpha=0.75, edgecolor="k", label="model")
    ax.set_xlabel("confidence"); ax.set_ylabel("accuracy")
    ax.set_title(f"Reliability (ECE {ece_before:.3f}→{ece_after:.3f})"); ax.legend()
    plt.tight_layout(); plt.savefig(FIG / "reliability_diagram.png", dpi=130); plt.close()


def main():
    set_global_seed(SEED)
    print(f"Device: {P.DEVICE}")
    manifest = P.build_split_manifest()
    print("Split sizes:", manifest["split"].value_counts().to_dict())
    _save_class_distribution(manifest)

    loaders = P.make_loaders(manifest, P.TrainConfig(), augment=True)
    results = {"classes": CLASS_NAMES, "seed": SEED, "models": {}}

    trained = {}
    for arch in ARCHS:
        print(f"\n=== Training {arch} ===")
        model, history = P.train_model(arch, loaders, P.TrainConfig())
        _save_training_curves(history, arch)
        test_logits, test_labels = P.collect_logits(model, loaders["test"])
        m = P.metrics_from_logits(test_logits, test_labels)
        _save_confusion(m["confusion_matrix"], arch)
        results["models"][arch] = {
            **{k: v for k, v in m.items() if k != "confusion_matrix"},
            "params": P.param_count(model),
            "size_mb": P.model_size_mb(model),
            "cpu_latency_ms": P.cpu_latency_ms(model),
        }
        trained[arch] = (model, history)
        print(f"  {arch}: acc={m['accuracy']:.3f} macroF1={m['macro_f1']:.3f}")

    # Winner by macro-F1
    winner = max(results["models"], key=lambda a: results["models"][a]["macro_f1"])
    results["winner"] = winner
    win_model = trained[winner][0]
    print(f"\nWinner: {winner}")

    # Ablation — winner arch trained WITHOUT augmentation
    print(f"\n=== Ablation: {winner} without augmentation ===")
    loaders_noaug = P.make_loaders(manifest, P.TrainConfig(), augment=False)
    abl_model, _ = P.train_model(winner, loaders_noaug, P.TrainConfig())
    abl_logits, abl_labels = P.collect_logits(abl_model, loaders_noaug["test"])
    abl_m = P.metrics_from_logits(abl_logits, abl_labels)
    results["ablation"] = {
        "winner_with_aug_macro_f1": results["models"][winner]["macro_f1"],
        "winner_no_aug_macro_f1": abl_m["macro_f1"],
        "delta_macro_f1": round(results["models"][winner]["macro_f1"] - abl_m["macro_f1"], 4),
    }

    # Calibration — temperature scaling on val, ECE on test (winner)
    print("\n=== Calibration (temperature scaling) ===")
    val_logits, val_labels = P.collect_logits(win_model, loaders["val"])
    test_logits, test_labels = P.collect_logits(win_model, loaders["test"])
    T = P.fit_temperature(val_logits, val_labels)
    probs_before = P.softmax_np(test_logits, 1.0)
    probs_after = P.softmax_np(test_logits, T)
    yt = test_labels.numpy()
    ece_b = P.expected_calibration_error(probs_before, yt)
    ece_a = P.expected_calibration_error(probs_after, yt)
    _save_reliability(probs_after, yt, ece_b, ece_a)
    results["calibration"] = {"temperature": round(T, 4), "ece_before": round(ece_b, 4), "ece_after": round(ece_a, 4)}
    print(f"  T={T:.3f}  ECE {ece_b:.3f} -> {ece_a:.3f}")

    # Domain-gap (Kathmandu) — only if photos are present
    kt = Path("data/kathmandu_test")
    if kt.exists() and any(kt.rglob("*.jpg")):
        try:
            man_k = P.scan_raw(kt).assign(split="test")
            ld = P.DataLoader(P.SpeciesDataset(man_k, "test", P.build_transforms(augment=False)[1]),
                              batch_size=32, num_workers=0)
            kl, klab = P.collect_logits(win_model, ld)
            results["kathmandu_domain_gap"] = {k: v for k, v in P.metrics_from_logits(kl, klab).items() if k != "confusion_matrix"}
        except Exception as e:
            results["kathmandu_domain_gap"] = {"error": str(e)}
    else:
        results["kathmandu_domain_gap"] = {"status": "pending — add real Kathmandu phone photos to data/kathmandu_test/<Class>/"}

    # Export winner to ONNX + sidecars
    onnx_path = P.export_onnx(win_model)
    (EXPORT_DIR / "labels.json").write_text(json.dumps(CLASS_NAMES), encoding="utf-8")
    (EXPORT_DIR / "calibration.json").write_text(json.dumps(results["calibration"]), encoding="utf-8")
    (EXPORT_DIR / "metrics.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nExported ONNX -> {onnx_path}")

    _write_model_results_md(results)
    print("Wrote docs/MODEL_RESULTS.md")
    return results


def _write_model_results_md(r):
    lines = ["# Species model — results\n",
             f"_Reproducible run, SEED={SEED}. Public datasets (see ml/src/acquire_data.py). "
             "Trained on CPU with a CPU-feasible recipe; epochs configurable via env._\n",
             "## Model comparison (held-out test split)\n",
             "| Model | Accuracy | Macro-F1 | Macro-P | Macro-R | Params | Size (MB) | CPU latency (ms) |",
             "|---|---|---|---|---|---|---|---|"]
    for a, m in r["models"].items():
        mark = " **(winner)**" if a == r["winner"] else ""
        lines.append(f"| {a}{mark} | {m['accuracy']:.3f} | {m['macro_f1']:.3f} | {m['macro_precision']:.3f} "
                     f"| {m['macro_recall']:.3f} | {m['params']:,} | {m['size_mb']} | {m['cpu_latency_ms']} |")
    ab = r["ablation"]
    lines += ["\n## Ablation — data augmentation (winner)\n",
              f"- With augmentation: macro-F1 **{ab['winner_with_aug_macro_f1']:.3f}**",
              f"- Without augmentation: macro-F1 **{ab['winner_no_aug_macro_f1']:.3f}**",
              f"- Delta: **{ab['delta_macro_f1']:+.3f}**\n",
              "## Calibration (temperature scaling)\n",
              f"- Temperature T = **{r['calibration']['temperature']}** "
              f"(set `SPECIES_TEMPERATURE` in backend `.env`)",
              f"- ECE: **{r['calibration']['ece_before']:.3f} → {r['calibration']['ece_after']:.3f}**\n",
              "## Kathmandu domain-gap test\n",
              f"- {r['kathmandu_domain_gap']}\n",
              "## Figures\n",
              "See `docs/figures/`: class_distribution, training_curves_*, confusion_*, reliability_diagram."]
    Path("docs/MODEL_RESULTS.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
