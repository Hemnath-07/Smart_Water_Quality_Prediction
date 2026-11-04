# Python Water Quality ML Engine

This directory contains standalone Python scripts for water quality data preprocessing, multi-model benchmarking (Random Forest, XGBoost, Logistic Regression), and risk tier prediction.

## Requirements
To install dependencies for running the Python scripts locally:
```bash
pip install -r requirements.txt
```

## Structure
- `preprocess.py`: Universal water quality CSV ingestion, column alias fuzzy matching, median imputation, IQR outlier capping, and Water Quality Index (WQI) computation.
- `train.py`: Model comparison engine training Random Forest, XGBoost, and Logistic Regression with evaluation metrics (Accuracy, Precision, Recall, F1, ROC-AUC) and XAI feature importance / SHAP values.
- `predict.py`: Batch classification and single-sample "What-If" risk tier simulator.

*Note: The production Next.js web application deployed on Vercel runs these exact algorithms natively via Next.js App Router API routes (`app/api/`), ensuring instant sub-second responses with zero Lambda size limits.*
