/**
 * PDF Audit Report Generator
 * Uses browser's native print functionality with a tailored print stylesheet.
 * Generates a formal water quality audit report from dashboard data.
 */

import type { PreprocessResult, TrainResult, PredictResult } from './types';

interface ReportOptions {
  preprocessData: PreprocessResult | null;
  trainData: TrainResult | null;
  predictData: PredictResult | null;
  reportTitle?: string;
}

export function generatePDFReport(opts: ReportOptions): void {
  const { preprocessData, trainData, predictData } = opts;
  const reportDate = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Water Quality Audit Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 10pt;
    color: #1e293b;
    background: #fff;
    padding: 0;
  }

  .page { 
    padding: 40px 48px; 
    max-width: 794px; 
    margin: 0 auto; 
  }

  /* Header */
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #0284c7;
    padding-bottom: 20px;
    margin-bottom: 28px;
  }

  .report-title { font-size: 22pt; font-weight: 800; color: #0c4a6e; }
  .report-subtitle { font-size: 10pt; color: #64748b; margin-top: 4px; }
  .report-meta { text-align: right; font-size: 8pt; color: #94a3b8; }
  .report-meta .badge {
    background: #e0f2fe;
    color: #0284c7;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 8pt;
    font-weight: 600;
    display: inline-block;
    margin-top: 4px;
  }

  /* Disclaimer */
  .disclaimer {
    background: #fef3c7;
    border: 1px solid #d97706;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 24px;
    font-size: 8pt;
    color: #92400e;
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  /* Sections */
  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 12pt;
    font-weight: 700;
    color: #0c4a6e;
    border-left: 4px solid #0284c7;
    padding-left: 10px;
    margin-bottom: 14px;
  }

  /* Grid layouts */
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .metric-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }

  .metric-box .value { font-size: 18pt; font-weight: 800; color: #0284c7; }
  .metric-box .label { font-size: 7pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { 
    background: #0284c7; 
    color: #fff; 
    padding: 7px 10px; 
    text-align: left; 
    font-size: 8pt; 
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td { 
    padding: 6px 10px; 
    font-size: 8.5pt; 
    border-bottom: 1px solid #e2e8f0;
    color: #334155;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  tr:last-child td { border-bottom: none; }

  /* Model metric colors */
  .metric-high { color: #16a34a; font-weight: 600; }
  .metric-med { color: #ca8a04; font-weight: 600; }
  .metric-low { color: #dc2626; font-weight: 600; }

  /* Safety distribution */
  .dist-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .dist-box { border-radius: 8px; padding: 14px; text-align: center; border: 1px solid; }
  .dist-box.safe { background: #f0fdf4; border-color: #22c55e; }
  .dist-box.warn { background: #fefce8; border-color: #eab308; }
  .dist-box.danger { background: #fef2f2; border-color: #ef4444; }
  .dist-box .dist-value { font-size: 20pt; font-weight: 800; }
  .dist-box.safe .dist-value { color: #16a34a; }
  .dist-box.warn .dist-value { color: #ca8a04; }
  .dist-box.danger .dist-value { color: #dc2626; }
  .dist-box .dist-label { font-size: 8pt; color: #64748b; margin-top: 4px; }

  /* Bar for feature importance */
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 8.5pt; }
  .bar-label { width: 130px; text-align: right; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { flex: 1; background: #e2e8f0; border-radius: 999px; height: 8px; }
  .bar-fill { background: linear-gradient(90deg, #0284c7, #6366f1); border-radius: 999px; height: 8px; }
  .bar-val { width: 40px; font-size: 7.5pt; color: #64748b; }

  /* Footer */
  .report-footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #94a3b8;
  }

  @page {
    size: A4;
    margin: 0;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="report-header">
    <div>
      <div class="report-title">💧 Water Quality Audit Report</div>
      <div class="report-subtitle">Smart Water Quality Prediction System — AI/ML Analysis</div>
    </div>
    <div class="report-meta">
      <div>Generated: ${reportDate}</div>
      <div class="badge">CONFIDENTIAL — PRELIMINARY SCREENING</div>
    </div>
  </div>

  <!-- Disclaimer -->
  <div class="disclaimer">
    <strong>⚠️ IMPORTANT DISCLAIMER:</strong>
    Predictions are generated as screening results for educational and preliminary assessment purposes 
    and are not a substitute for certified laboratory water quality testing. 
    All results must be validated by qualified water safety professionals before any regulatory or public health decisions.
  </div>

  ${preprocessData ? `
  <!-- Section 1: Dataset Summary -->
  <div class="section">
    <div class="section-title">1. Dataset Summary</div>
    <div class="metric-grid">
      <div class="metric-box">
        <div class="value">${preprocessData.shape[0].toLocaleString()}</div>
        <div class="label">Total Samples</div>
      </div>
      <div class="metric-box">
        <div class="value">${preprocessData.shape[1]}</div>
        <div class="label">Features</div>
      </div>
      <div class="metric-box">
        <div class="value">${preprocessData.wqi_stats.mean.toFixed(1)}</div>
        <div class="label">Avg WQI Score</div>
      </div>
      <div class="metric-box">
        <div class="value">${Object.values(preprocessData.outliers_capped).reduce((a, b) => a + b, 0)}</div>
        <div class="label">Outliers Capped</div>
      </div>
    </div>

    <table>
      <tr><th>Feature</th><th>Mean</th><th>Std Dev</th><th>Min</th><th>Max</th><th>Median</th></tr>
      ${Object.entries(preprocessData.feature_stats || {}).map(([feat, stats]) => `
        <tr>
          <td>${feat}</td>
          <td>${stats.mean.toFixed(3)}</td>
          <td>${stats.std.toFixed(3)}</td>
          <td>${stats.min.toFixed(3)}</td>
          <td>${stats.max.toFixed(3)}</td>
          <td>${stats.median.toFixed(3)}</td>
        </tr>
      `).join('')}
    </table>

    <p style="font-size:8.5pt; color:#64748b;">
      WQI Range: ${preprocessData.wqi_stats.min.toFixed(1)} – ${preprocessData.wqi_stats.max.toFixed(1)} 
      | Std Dev: ${preprocessData.wqi_stats.std.toFixed(2)}
    </p>
  </div>
  ` : '<div class="section"><p style="color:#94a3b8;">No dataset loaded.</p></div>'}

  ${trainData ? `
  <!-- Section 2: Model Benchmark -->
  <div class="section">
    <div class="section-title">2. Model Performance Benchmark</div>
    <p style="margin-bottom:10px; font-size:8.5pt; color:#64748b;">
      Best Model: <strong style="color:#0284c7;">${trainData.best_model_name}</strong>
    </p>
    <table>
      <tr><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1-Score</th><th>ROC-AUC</th></tr>
      ${trainData.models_metrics.map(m => `
        <tr>
          <td><strong>${m.name}</strong>${m.name === trainData.best_model_name ? ' ⭐' : ''}</td>
          <td class="${m.accuracy >= 0.75 ? 'metric-high' : m.accuracy >= 0.6 ? 'metric-med' : 'metric-low'}">${(m.accuracy * 100).toFixed(1)}%</td>
          <td class="${m.precision >= 0.75 ? 'metric-high' : m.precision >= 0.6 ? 'metric-med' : 'metric-low'}">${(m.precision * 100).toFixed(1)}%</td>
          <td class="${m.recall >= 0.75 ? 'metric-high' : m.recall >= 0.6 ? 'metric-med' : 'metric-low'}">${(m.recall * 100).toFixed(1)}%</td>
          <td class="${m.f1 >= 0.75 ? 'metric-high' : m.f1 >= 0.6 ? 'metric-med' : 'metric-low'}">${(m.f1 * 100).toFixed(1)}%</td>
          <td class="${m.roc_auc >= 0.75 ? 'metric-high' : m.roc_auc >= 0.6 ? 'metric-med' : 'metric-low'}">${(m.roc_auc * 100).toFixed(1)}%</td>
        </tr>
      `).join('')}
    </table>

    <div class="section-title" style="margin-top:16px;">Feature Importance (Top 9)</div>
    ${Object.entries(trainData.feature_importance[trainData.best_model_name] || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([feat, val]) => `
      <div class="bar-row">
        <div class="bar-label">${feat}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(val * 100).toFixed(1)}%;"></div></div>
        <div class="bar-val">${(val * 100).toFixed(1)}%</div>
      </div>
    `).join('')}

    ${Object.keys(trainData.shap_importance || {}).length > 0 ? `
    <div class="section-title" style="margin-top:16px;">SHAP Feature Impact (Global)</div>
    ${Object.entries(trainData.shap_importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([feat, val]) => `
      <div class="bar-row">
        <div class="bar-label">${feat}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, val * 200).toFixed(1)}%;"></div></div>
        <div class="bar-val">${val.toFixed(4)}</div>
      </div>
    `).join('')}
    ` : ''}
  </div>
  ` : '<div class="section"><p style="color:#94a3b8;">Model training not completed.</p></div>'}

  ${predictData ? `
  <!-- Section 3: Prediction Results -->
  <div class="section">
    <div class="section-title">3. Batch Prediction Safety Distribution</div>
    <div class="dist-grid">
      <div class="dist-box safe">
        <div class="dist-value">${predictData.safety_distribution.safe_count}</div>
        <div class="dist-label">✅ Safe / Potable</div>
        <div style="font-size:9pt; color:#16a34a; margin-top:4px; font-weight:600;">
          ${((predictData.safety_distribution.safe_count / predictData.safety_distribution.total) * 100).toFixed(1)}%
        </div>
      </div>
      <div class="dist-box warn">
        <div class="dist-value">${predictData.safety_distribution.screening_count}</div>
        <div class="dist-label">🟡 Requires Screening</div>
        <div style="font-size:9pt; color:#ca8a04; margin-top:4px; font-weight:600;">
          ${((predictData.safety_distribution.screening_count / predictData.safety_distribution.total) * 100).toFixed(1)}%
        </div>
      </div>
      <div class="dist-box danger">
        <div class="dist-value">${predictData.safety_distribution.unsafe_count}</div>
        <div class="dist-label">🔴 Contaminated</div>
        <div style="font-size:9pt; color:#dc2626; margin-top:4px; font-weight:600;">
          ${((predictData.safety_distribution.unsafe_count / predictData.safety_distribution.total) * 100).toFixed(1)}%
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-top:16px;">Sample Predictions (First 20 Rows)</div>
    <table>
      <tr><th>#</th><th>pH</th><th>Turbidity</th><th>WQI</th><th>Prob Safe</th><th>Safety Tier</th></tr>
      ${(predictData.predictions || []).slice(0, 20).map((p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${p.ph.toFixed(2)}</td>
          <td>${p.Turbidity.toFixed(2)}</td>
          <td>${p.WQI.toFixed(1)}</td>
          <td>${(p.probability_safe * 100).toFixed(1)}%</td>
          <td>
            <span style="
              background: ${p.tier === 0 ? '#f0fdf4' : p.tier === 1 ? '#fefce8' : '#fef2f2'};
              color: ${p.tier === 0 ? '#16a34a' : p.tier === 1 ? '#ca8a04' : '#dc2626'};
              border: 1px solid ${p.tier_color};
              padding: 2px 8px; border-radius: 999px; font-size: 7.5pt; font-weight: 600;
            ">${p.tier_label}</span>
          </td>
        </tr>
      `).join('')}
    </table>
    <p style="font-size:8pt; color:#94a3b8;">Showing 20 of ${predictData.predictions.length} total predictions.</p>
  </div>
  ` : '<div class="section"><p style="color:#94a3b8;">Batch predictions not available.</p></div>'}

  <!-- Footer -->
  <div class="report-footer">
    <span>Smart Water Quality Prediction System — AI Screening Report</span>
    <span>Generated: ${reportDate}</span>
    <span>For educational purposes only</span>
  </div>

</div>
</body>
</html>`;

  // Open print window
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Please allow pop-ups to generate the PDF report.');
    return;
  }
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}
