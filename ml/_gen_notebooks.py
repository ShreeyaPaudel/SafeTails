"""Generate notebooks/01 and /02 as thin, runnable narratives over ml.src.pipeline.
Run with the ml venv:  python ml/_gen_notebooks.py
"""
import nbformat as nbf
from pathlib import Path

NB = Path("notebooks")
NB.mkdir(exist_ok=True)

BOOT = (
    "import sys\n"
    "from pathlib import Path\n"
    "ROOT = Path.cwd().parent if Path.cwd().name == 'notebooks' else Path.cwd()\n"
    "sys.path.insert(0, str(ROOT))\n"
    "import os; os.chdir(ROOT)\n"
    "print('repo root:', ROOT)"
)

# ---------------------------------------------------------------- Notebook 01
n1 = nbf.v4.new_notebook()
n1.cells = [
    nbf.v4.new_markdown_cell(
        "# 01 — Data Acquisition, EDA & Dataset Construction\n"
        "**Phase 1** of SafeTails. The species classifier is the *only* in-house trained model.\n\n"
        "Public, reproducible sources (see `ml/src/acquire_data.py`): Cat/Dog from "
        "`Bingsu/Cat_and_Dog`; Cow=ImageNet *ox*, Buffalo=ImageNet *water buffalo*; Other = a mix "
        "of ImageNet animal synsets. `SEED=42` throughout.\n\n"
        "> **v2 update:** the *deployed* model is now **ConvNeXt-Tiny (98.4% acc)**, retrained on an "
        "upgraded pipeline (Oxford-IIIT Pet + Stanford Dogs + ImageNet, RandAugment/MixUp/CutMix, "
        "Optuna, calibration) in **`03_colab_train_species.ipynb`** (Colab Pro). Notebooks 01-02 "
        "document the Phase-2 baseline (v1 EfficientNet-B0, 94.4%) kept for the comparison narrative."
    ),
    nbf.v4.new_code_cell(BOOT),
    nbf.v4.new_markdown_cell(
        "## 1. Acquisition\n"
        "Run once (downloads into `data/raw/<Class>/`):\n"
        "```bash\npython -m ml.src.acquire_data --per-class 400\n```"
    ),
    nbf.v4.new_code_cell(
        "from ml.src import pipeline as P\n"
        "from ml.src.config import CLASS_NAMES\n"
        "df = P.scan_raw()\n"
        "print('total images:', len(df))\n"
        "df.groupby('label').size().reindex(CLASS_NAMES)"
    ),
    nbf.v4.new_markdown_cell("## 2. EDA — class balance, image sizes, sample grid"),
    nbf.v4.new_code_cell(
        "import matplotlib.pyplot as plt\n"
        "from PIL import Image\n"
        "counts = df.groupby('label').size().reindex(CLASS_NAMES)\n"
        "counts.plot(kind='bar', color='#157d8f', title='Images per class'); plt.tight_layout(); plt.show()"
    ),
    nbf.v4.new_code_cell(
        "import numpy as np\n"
        "samp = df.sample(min(500, len(df)), random_state=42)\n"
        "ws, hs, ars, brs = [], [], [], []\n"
        "for p in samp['path']:\n"
        "    try:\n"
        "        with Image.open(p) as im:\n"
        "            im = im.convert('RGB'); ws.append(im.width); hs.append(im.height)\n"
        "            ars.append(im.width/max(im.height,1))\n"
        "            brs.append(np.asarray(im.resize((64,64))).mean()/255)\n"
        "    except Exception: pass\n"
        "fig, ax = plt.subplots(2,2, figsize=(9,6))\n"
        "ax[0,0].hist(ws, bins=30, color='#3aa3b5'); ax[0,0].set_title('width (px)')\n"
        "ax[0,1].hist(hs, bins=30, color='#d98a1f'); ax[0,1].set_title('height (px)')\n"
        "ax[1,0].hist(ars, bins=30, color='#6d5bd0'); ax[1,0].set_title('aspect ratio (w/h)')\n"
        "ax[1,1].hist(brs, bins=30, color='#3f7ec2'); ax[1,1].set_title('mean brightness (0-1)')\n"
        "plt.tight_layout(); plt.show()\n"
        "print('median size:', int(np.median(ws)), 'x', int(np.median(hs)),\n"
        "      '| median aspect:', round(float(np.median(ars)),2),\n"
        "      '| median brightness:', round(float(np.median(brs)),2))"
    ),
    nbf.v4.new_code_cell(
        "fig, axes = plt.subplots(len(CLASS_NAMES), 5, figsize=(11, 2.1*len(CLASS_NAMES)))\n"
        "for r, cls in enumerate(CLASS_NAMES):\n"
        "    rows = df[df['label']==cls]['path'].head(5).tolist()\n"
        "    for c in range(5):\n"
        "        ax = axes[r][c]; ax.axis('off')\n"
        "        if c < len(rows):\n"
        "            ax.imshow(Image.open(rows[c]).convert('RGB').resize((128,128)))\n"
        "        if c==0: ax.set_title(cls, loc='left', fontsize=11)\n"
        "plt.tight_layout(); plt.show()"
    ),
    nbf.v4.new_markdown_cell(
        "## 3. Duplicate check (perceptual hash)\n"
        "The same pHash guard the anti-spam system uses, applied to the dataset."
    ),
    nbf.v4.new_code_cell(
        "import imagehash\n"
        "seen, dups = {}, 0\n"
        "for p in samp['path']:\n"
        "    try:\n"
        "        h = str(imagehash.phash(Image.open(p)))\n"
        "        dups += 1 if h in seen else 0; seen[h]=p\n"
        "    except Exception: pass\n"
        "print(f'near-duplicate hashes in sample: {dups}')"
    ),
    nbf.v4.new_markdown_cell("## 4. Stratified 70/15/15 split → `data/splits.csv`"),
    nbf.v4.new_code_cell(
        "m = P.build_split_manifest()\n"
        "print(m['split'].value_counts().to_dict())\n"
        "m.groupby(['label','split']).size().unstack(fill_value=0).reindex(CLASS_NAMES)"
    ),
    nbf.v4.new_markdown_cell("## 5. Augmentation preview (mimics noisy phone photos)"),
    nbf.v4.new_code_cell(
        "train_tf, eval_tf = P.build_transforms(augment=True)\n"
        "import torch\n"
        "inv = lambda t: (t*torch.tensor(P._STD)[:,None,None]+torch.tensor(P._MEAN)[:,None,None]).clamp(0,1).permute(1,2,0).numpy()\n"
        "path = df.iloc[0]['path']; img = Image.open(path).convert('RGB')\n"
        "fig, ax = plt.subplots(1,5, figsize=(11,2.4))\n"
        "for i in range(5): ax[i].imshow(inv(train_tf(img))); ax[i].axis('off')\n"
        "plt.suptitle('5 random augmentations'); plt.tight_layout(); plt.show()"
    ),
    nbf.v4.new_markdown_cell("**Next →** `02_species_classification.ipynb` (train, compare, calibrate, export)."),
]
nbf.write(n1, NB / "01_data_eda_and_prep.ipynb")

# ---------------------------------------------------------------- Notebook 02
n2 = nbf.v4.new_notebook()
n2.cells = [
    nbf.v4.new_markdown_cell(
        "# 02 — Species Classification (MobileNetV3-Small vs EfficientNet-B0)\n"
        "**Phase 2.** Identical transfer-learning recipe for both backbones, then comparison, "
        "ablation (augmentation), temperature-scaling calibration + ECE, an honest domain-gap slot, "
        "and ONNX export of the winner. All logic in `ml/src/pipeline.py`; the full study is "
        "`ml/src/run_study.py`. `SEED=42`.\n\n"
        "> **v2 update:** this is the Phase-2 **baseline** (EfficientNet-B0, 94.4%). The deployed "
        "model was later upgraded to **ConvNeXt-Tiny (98.4%)** via **`03_colab_train_species.ipynb`** "
        "(stronger datasets, modern augmentation, Optuna tuning, richer evaluation charts)."
    ),
    nbf.v4.new_code_cell(BOOT),
    nbf.v4.new_code_cell(
        "from ml.src import pipeline as P\n"
        "from ml.src.config import CLASS_NAMES\n"
        "for a in ['mobilenet_v3_small','efficientnet_b0']:\n"
        "    mdl = P.build_model(a)\n"
        "    print(f'{a:22s} params={P.param_count(mdl):,}  size={P.model_size_mb(mdl)}MB  "
        "cpu_latency={P.cpu_latency_ms(mdl)}ms')"
    ),
    nbf.v4.new_markdown_cell(
        "## Recipe (identical for both)\n"
        "Two stages: (1) freeze backbone, train the new classifier head; (2) unfreeze and "
        "fine-tune at a lower LR. AdamW, cross-entropy, best-val checkpoint. See "
        "`P.train_model`. To train from scratch here:\n"
        "```python\n"
        "m = P.build_split_manifest(); loaders = P.make_loaders(m, P.TrainConfig())\n"
        "model, hist = P.train_model('efficientnet_b0', loaders, P.TrainConfig())\n"
        "```\n"
        "The full study (both models + ablation + calibration + export) is run once via "
        "`python -m ml.src.run_study`; we load its artefacts below."
    ),
    nbf.v4.new_markdown_cell("## Results (loaded from the executed study)"),
    nbf.v4.new_code_cell(
        "import json, pandas as pd\n"
        "from pathlib import Path\n"
        "mp = Path('ml/exported/metrics.json')\n"
        "assert mp.exists(), 'Run `python -m ml.src.run_study` first.'\n"
        "R = json.loads(mp.read_text())\n"
        "rows = []\n"
        "for a, mm in R['models'].items():\n"
        "    rows.append({'model': a + (' (winner)' if a==R['winner'] else ''), 'accuracy': mm['accuracy'],\n"
        "                 'macro_f1': mm['macro_f1'], 'params': mm['params'], 'size_MB': mm['size_mb'],\n"
        "                 'cpu_ms': mm['cpu_latency_ms']})\n"
        "pd.DataFrame(rows)"
    ),
    nbf.v4.new_code_cell(
        "print('Ablation (augmentation):', R['ablation'])\n"
        "print('Calibration:', R['calibration'])\n"
        "print('Macro ROC-AUC (OvR):', R.get('winner_macro_roc_auc_ovr'))\n"
        "print('Kathmandu domain gap:', R['kathmandu_domain_gap'])"
    ),
    nbf.v4.new_markdown_cell("### Per-class metrics (winner)"),
    nbf.v4.new_code_cell(
        "import pandas as pd\n"
        "pc = R.get('winner_per_class', {})\n"
        "roc = R.get('winner_roc_auc_per_class', {})\n"
        "pd.DataFrame([{'class':c, **{k:v[k] for k in ['precision','recall','f1-score','support']},"
        " 'roc_auc':roc.get(c)} for c,v in pc.items()]) if pc else 'run extra_eval'"
    ),
    nbf.v4.new_markdown_cell("### Figures"),
    nbf.v4.new_code_cell(
        "import matplotlib.pyplot as plt, matplotlib.image as mpimg\n"
        "from pathlib import Path\n"
        "figs = ['model_comparison.png', 'class_distribution.png', f\"training_curves_{R['winner']}.png\",\n"
        "        f\"confusion_{R['winner']}.png\", 'confusion_normalized.png', 'per_class_f1.png',\n"
        "        'roc_curves.png', 'pr_curves.png', 'reliability_diagram.png']\n"
        "for f in figs:\n"
        "    p = Path('docs/figures')/f\n"
        "    if p.exists():\n"
        "        plt.figure(figsize=(6,4)); plt.imshow(mpimg.imread(p)); plt.axis('off'); plt.title(f); plt.show()"
    ),
    nbf.v4.new_markdown_cell("## ONNX export — verify it loads & matches the backend contract"),
    nbf.v4.new_code_cell(
        "import numpy as np, onnxruntime as ort\n"
        "sess = ort.InferenceSession('ml/exported/species_model.onnx', providers=['CPUExecutionProvider'])\n"
        "x = np.random.randn(1,3,224,224).astype('float32')\n"
        "out = sess.run(None, {sess.get_inputs()[0].name: x})[0]\n"
        "print('ONNX output shape:', out.shape, '→ classes:', CLASS_NAMES)\n"
        "print('Set SPECIES_TEMPERATURE=%s in backend .env (calibrated).' % R['calibration']['temperature'])"
    ),
    nbf.v4.new_markdown_cell(
        "**Done.** The winner is exported to `ml/exported/species_model.onnx`; the FastAPI backend "
        "auto-loads it (`backend/app/ml/species.py`) and routes low-confidence predictions to "
        "`Unverified` → Gemini second opinion."
    ),
]
nbf.write(n2, NB / "02_species_classification.ipynb")
print("wrote notebooks 01 + 02")
