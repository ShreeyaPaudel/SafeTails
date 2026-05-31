"""Shared ML configuration & reproducibility seed.

Single source of truth for class taxonomy, seed, and paths used by the notebooks and
training/export scripts.
"""
from __future__ import annotations

import os
import random
from pathlib import Path

SEED = 42

# Coarse, Kathmandu Valley-specific taxonomy for the trained CNN.
# "Other" absorbs goats/birds/etc.; "no animal" scenes must classify with LOW confidence
# (handled via the confidence threshold, not a dedicated class).
CLASS_NAMES = ["Dog", "Cat", "Cow", "Buffalo", "Other"]

# Paths (relative to repo root)
DATA_DIR = Path("data")
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
KATHMANDU_TEST_DIR = DATA_DIR / "kathmandu_test"  # never trained on — domain-gap eval
SPLIT_MANIFEST = DATA_DIR / "splits.csv"
EXPORT_DIR = Path("ml") / "exported"

IMG_SIZE = 224  # MobileNetV3-Small / EfficientNet-B0 input
SPLIT_RATIOS = (0.70, 0.15, 0.15)  # train / val / test, stratified


def set_global_seed(seed: int = SEED) -> None:
    """Fix all RNGs for reproducibility. Call at the top of every notebook/script."""
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except ImportError:
        pass
    try:
        import torch

        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    except ImportError:
        pass
