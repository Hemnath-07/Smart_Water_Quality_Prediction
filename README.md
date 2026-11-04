# 💧 Smart Water Quality Prediction System

> **AI-powered water safety analysis, real-time predictions, and interactive simulation** — built with Next.js 14, Python ML, and Web Audio API.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)
![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![ML](https://img.shields.io/badge/ML-XGBoost%20%7C%20Random%20Forest%20%7C%20Logistic%20Regression-green.svg)

---

## 🌟 Features

| Feature | Description |
|---|---|
| 🎵 **Ambient Audio Engine** | Procedural ambient music via Web Audio API — zero external assets |
| 🎨 **5 Dynamic Themes** | Slate Tech, Clean Aqua, Cyberpunk Neon, Emerald Eco, Sunset Gold |
| 📊 **Correlation Heatmap** | Interactive 9×9 feature correlation grid |
| 🤖 **3-Model ML Pipeline** | Random Forest · XGBoost · Logistic Regression compared side-by-side |
| 🧪 **What-If Simulator** | Real-time sliders with instant WQI and safety tier recalculation |
| 📋 **Batch Predictions** | Process entire CSV datasets with searchable, filterable results |
| 📄 **PDF Audit Reports** | Browser-native print-based formal water quality reports |
| 🔍 **SHAP Explainability** | Global feature importance + local SHAP waterfall explanations |

---

## 📁 Project Structure

```
smart-water-quality/
├── api/
│   ├── preprocess.py        # CSV ingestion, cleaning, WQI computation
│   ├── train.py             # Multi-model training, SHAP, ROC curves
│   └── predict.py           # Batch + single-sample prediction endpoint
├── app/
│   ├── globals.css          # 5 theme CSS variables + component styles
│   ├── layout.tsx           # Next.js app layout
│   ├── page.tsx             # Main application (splash, tabs, simulator)
│   └── lib/
│       ├── audioEngine.ts   # Web Audio API synthesizer
│       ├── pdfGenerator.ts  # Print-based PDF audit reports
│       └── types.ts         # TypeScript type definitions
├── public/
│   └── sample_water_quality.csv  # Sample dataset for testing
├── requirements.txt         # Python deps (optimized for Vercel 250MB)
├── vercel.json              # Vercel deployment config
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- npm or yarn

### 1. Install Dependencies

```bash
# Frontend
npm install

# Python backend (for local dev)
pip install -r requirements.txt
```

### 2. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Test the Pipeline

1. Click **"Generate Sample Data"** or upload `public/sample_water_quality.csv`
2. Click **"Upload & Preprocess"** → view dataset stats and correlation heatmap
3. Click **"Train ML Models"** → see model benchmarks, ROC curves, SHAP plots
4. Click **"Predict Batch"** → explore filterable safety tier results
5. Use **Tab 2 (What-If Simulator)** → drag sliders to see instant predictions

---

## 🌐 Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

The `vercel.json` configures Python serverless functions alongside the Next.js build.

> **Note**: Vercel Hobby plan has a 250MB function limit. The `requirements.txt` is optimized to stay within this limit.

---

## 🧬 ML Architecture

### Data Pipeline (`/api/preprocess`)
- Column validation (9 required features + Potability target)
- Median imputation for missing values
- IQR-based outlier capping (1.5×IQR)
- Water Quality Index (WQI) computation

### Training Pipeline (`/api/train`)
- 80/20 stratified train/test split
- StandardScaler feature normalization
- 3 models: RandomForest, XGBoost, LogisticRegression
- Metrics: Accuracy, Precision, Recall, F1, ROC-AUC
- SHAP TreeExplainer for global + local explanations

### Prediction Pipeline (`/api/predict`)
- Safety tier classification:
  - 🟢 **Safe / Potable** — probability ≥ 70%
  - 🟡 **Requires Secondary Screening** — probability 40–70%
  - 🔴 **Contaminated / Unsafe** — probability < 40%

---

## 🎨 Themes

| Theme | Mode | Accent |
|---|---|---|
| 🌑 Slate Tech | Dark | Sky Blue |
| 🌊 Clean Aqua | Light | Ocean Blue |
| ⚡ Cyberpunk Neon | Dark | Neon Purple |
| 🌿 Emerald Eco | Dark | Emerald Green |
| 🌅 Sunset Gold | Dark | Amber Gold |

---

## ⚠️ Disclaimer

> **IMPORTANT**: Predictions are generated as screening results for **educational and preliminary assessment purposes only** and are **not a substitute for certified laboratory water quality testing**. All results must be validated by qualified water safety professionals before any regulatory or public health decisions.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
