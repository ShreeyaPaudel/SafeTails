"""SafeTails species-classification pipeline (the ONE in-house trained model).

Everything notebooks 01 & 02 need lives here so the notebooks stay thin, readable, and
re-runnable. Covers: stratified split manifest, datasets/augmentation, MobileNetV3-Small vs
EfficientNet-B0 transfer learning (identical recipe), evaluation (accuracy / macro P-R-F1 /
confusion), temperature-scaling calibration + ECE, latency/size, and ONNX export.

Class order is fixed to ml/src/config.CLASS_NAMES — the SAME order the backend ONNX consumer
(backend/app/ml/species.py) expects: ["Dog","Cat","Cow","Buffalo","Other"].

Reproducible: SEED=42 everywhere. CPU-feasible defaults; override via TrainConfig / env.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

from ml.src.config import (
    CLASS_NAMES, EXPORT_DIR, IMG_SIZE, KATHMANDU_TEST_DIR, RAW_DIR, SEED,
    SPLIT_MANIFEST, SPLIT_RATIOS, set_global_seed,
)

NUM_CLASSES = len(CLASS_NAMES)
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASS_NAMES)}
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
FIG_DIR = Path("docs/figures")
_MEAN = [0.485, 0.456, 0.406]
_STD = [0.229, 0.224, 0.225]
_VALID_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# --------------------------------------------------------------------------- splits
def scan_raw(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    rows = []
    for cls in CLASS_NAMES:
        d = Path(raw_dir) / cls
        if not d.exists():
            continue
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in _VALID_EXT:
                rows.append({"path": str(p), "label": cls})
    return pd.DataFrame(rows)


def _is_readable(path: str) -> bool:
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


def build_split_manifest(
    raw_dir: Path = RAW_DIR, ratios=SPLIT_RATIOS, out: Path = SPLIT_MANIFEST, drop_unreadable=True
) -> pd.DataFrame:
    """Stratified 70/15/15 split written to data/splits.csv (columns: path,label,split)."""
    set_global_seed(SEED)
    df = scan_raw(raw_dir)
    if df.empty:
        raise RuntimeError(f"No images under {raw_dir}. Run `python -m ml.src.acquire_data` first.")
    if drop_unreadable:
        df = df[df["path"].map(_is_readable)].reset_index(drop=True)
    from sklearn.model_selection import train_test_split

    train_ratio, val_ratio, test_ratio = ratios
    train_df, tmp_df = train_test_split(
        df, test_size=(1 - train_ratio), random_state=SEED, stratify=df["label"]
    )
    rel = test_ratio / (val_ratio + test_ratio)
    val_df, test_df = train_test_split(
        tmp_df, test_size=rel, random_state=SEED, stratify=tmp_df["label"]
    )
    train_df = train_df.assign(split="train")
    val_df = val_df.assign(split="val")
    test_df = test_df.assign(split="test")
    out_df = pd.concat([train_df, val_df, test_df]).reset_index(drop=True)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(out, index=False)
    return out_df


# --------------------------------------------------------------------------- data
def build_transforms(img_size: int = IMG_SIZE, augment: bool = True):
    eval_tf = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
    ])
    if not augment:
        return eval_tf, eval_tf
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(img_size, scale=(0.6, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(0.2, 0.2, 0.2, 0.05),
        transforms.RandomRotation(12),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
    ])
    return train_tf, eval_tf


class SpeciesDataset(Dataset):
    def __init__(self, manifest: pd.DataFrame, split: str, transform):
        self.df = manifest[manifest["split"] == split].reset_index(drop=True)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        row = self.df.iloc[i]
        img = Image.open(row["path"]).convert("RGB")
        return self.transform(img), CLASS_TO_IDX[row["label"]]


def make_loaders(manifest: pd.DataFrame, cfg: "TrainConfig", augment: bool = True):
    train_tf, eval_tf = build_transforms(cfg.img_size, augment)
    dl = lambda ds, shuf: DataLoader(ds, batch_size=cfg.batch_size, shuffle=shuf, num_workers=0)
    return {
        "train": dl(SpeciesDataset(manifest, "train", train_tf), True),
        "val": dl(SpeciesDataset(manifest, "val", eval_tf), False),
        "test": dl(SpeciesDataset(manifest, "test", eval_tf), False),
    }


# --------------------------------------------------------------------------- models
def build_model(arch: str) -> nn.Module:
    if arch == "mobilenet_v3_small":
        m = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        in_f = m.classifier[3].in_features
        m.classifier[3] = nn.Linear(in_f, NUM_CLASSES)
    elif arch == "efficientnet_b0":
        m = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        in_f = m.classifier[1].in_features
        m.classifier[1] = nn.Linear(in_f, NUM_CLASSES)
    else:
        raise ValueError(f"unknown arch {arch}")
    return m.to(DEVICE)


def _set_backbone_trainable(model: nn.Module, trainable: bool):
    for p in model.parameters():
        p.requires_grad = trainable
    head = model.classifier
    for p in head.parameters():
        p.requires_grad = True


@dataclass
class TrainConfig:
    img_size: int = IMG_SIZE
    batch_size: int = int(os.environ.get("ST_BATCH", 32))
    epochs_head: int = int(os.environ.get("ST_EPOCHS_HEAD", 4))
    epochs_ft: int = int(os.environ.get("ST_EPOCHS_FT", 3))
    lr_head: float = 1e-3
    lr_ft: float = 1e-4
    weight_decay: float = 1e-4


def _run_epoch(model, loader, criterion, optimizer=None):
    train = optimizer is not None
    model.train(train)
    tot, correct, loss_sum = 0, 0, 0.0
    for x, y in loader:
        x, y = x.to(DEVICE), y.to(DEVICE)
        with torch.set_grad_enabled(train):
            out = model(x)
            loss = criterion(out, y)
            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
        loss_sum += loss.item() * x.size(0)
        correct += (out.argmax(1) == y).sum().item()
        tot += x.size(0)
    return loss_sum / max(tot, 1), correct / max(tot, 1)


def train_model(arch: str, loaders, cfg: TrainConfig, log=print):
    """Two-stage transfer learning: train head (frozen backbone) then fine-tune."""
    set_global_seed(SEED)
    model = build_model(arch)
    criterion = nn.CrossEntropyLoss()
    history = {"train_loss": [], "train_acc": [], "val_loss": [], "val_acc": [], "stage": []}
    best_acc, best_state = -1.0, None

    def record(stage):
        nonlocal best_acc, best_state
        tr_l, tr_a = _run_epoch(model, loaders["train"], criterion, optimizer)
        va_l, va_a = _run_epoch(model, loaders["val"], criterion)
        history["train_loss"].append(tr_l); history["train_acc"].append(tr_a)
        history["val_loss"].append(va_l); history["val_acc"].append(va_a)
        history["stage"].append(stage)
        log(f"  [{arch}|{stage}] ep{len(history['stage'])}: train_acc={tr_a:.3f} val_acc={va_a:.3f}")
        if va_a > best_acc:
            best_acc = va_a
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    # Stage 1 — frozen backbone, train head
    _set_backbone_trainable(model, False)
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=cfg.lr_head, weight_decay=cfg.weight_decay
    )
    for _ in range(cfg.epochs_head):
        record("head")
    # Stage 2 — unfreeze, fine-tune
    _set_backbone_trainable(model, True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr_ft, weight_decay=cfg.weight_decay)
    for _ in range(cfg.epochs_ft):
        record("finetune")

    if best_state is not None:
        model.load_state_dict(best_state)
    return model, history


# --------------------------------------------------------------------------- evaluation
@torch.no_grad()
def collect_logits(model, loader):
    model.eval()
    logits, labels = [], []
    for x, y in loader:
        logits.append(model(x.to(DEVICE)).cpu())
        labels.append(y)
    return torch.cat(logits), torch.cat(labels)


def metrics_from_logits(logits: torch.Tensor, labels: torch.Tensor) -> dict:
    from sklearn.metrics import precision_recall_fscore_support, confusion_matrix, accuracy_score
    preds = logits.argmax(1).numpy()
    y = labels.numpy()
    p, r, f1, _ = precision_recall_fscore_support(y, preds, average="macro", zero_division=0)
    return {
        "accuracy": float(accuracy_score(y, preds)),
        "macro_precision": float(p),
        "macro_recall": float(r),
        "macro_f1": float(f1),
        "confusion_matrix": confusion_matrix(y, preds, labels=list(range(NUM_CLASSES))).tolist(),
    }


def model_size_mb(model: nn.Module) -> float:
    n_bytes = sum(p.numel() * p.element_size() for p in model.parameters())
    return round(n_bytes / 1e6, 2)


def param_count(model: nn.Module) -> int:
    return int(sum(p.numel() for p in model.parameters()))


@torch.no_grad()
def cpu_latency_ms(model: nn.Module, img_size: int = IMG_SIZE, runs: int = 30) -> float:
    model.eval()
    x = torch.randn(1, 3, img_size, img_size)
    for _ in range(3):  # warmup
        model(x)
    t0 = time.perf_counter()
    for _ in range(runs):
        model(x)
    return round((time.perf_counter() - t0) / runs * 1000, 2)


# --------------------------------------------------------------------------- calibration
class TemperatureScaler(nn.Module):
    def __init__(self):
        super().__init__()
        self.temperature = nn.Parameter(torch.ones(1) * 1.0)

    def forward(self, logits):
        return logits / self.temperature


def fit_temperature(val_logits: torch.Tensor, val_labels: torch.Tensor) -> float:
    scaler = TemperatureScaler()
    nll = nn.CrossEntropyLoss()
    opt = torch.optim.LBFGS([scaler.temperature], lr=0.05, max_iter=100)

    def closure():
        opt.zero_grad()
        loss = nll(scaler(val_logits), val_labels)
        loss.backward()
        return loss

    opt.step(closure)
    return float(scaler.temperature.detach().clamp(min=0.05).item())


def expected_calibration_error(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    conf = probs.max(1)
    pred = probs.argmax(1)
    acc = (pred == labels).astype(np.float32)
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.sum() > 0:
            ece += (m.mean()) * abs(acc[m].mean() - conf[m].mean())
    return float(ece)


def softmax_np(logits: torch.Tensor, temperature: float = 1.0) -> np.ndarray:
    return F.softmax(logits / temperature, dim=1).numpy()


# --------------------------------------------------------------------------- export
def export_onnx(model: nn.Module, out_path: Path = EXPORT_DIR / "species_model.onnx", img_size: int = IMG_SIZE):
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    model.eval().cpu()
    dummy = torch.randn(1, 3, img_size, img_size)
    torch.onnx.export(
        model, dummy, str(out_path),
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    return out_path
