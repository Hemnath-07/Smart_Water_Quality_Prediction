// ─── Theme Types ──────────────────────────────────────────────────────────────

export type ThemeId =
  | 'slate-tech'
  | 'clean-aqua'
  | 'cyberpunk-neon'
  | 'emerald-eco'
  | 'sunset-gold';

export interface Theme {
  id: ThemeId;
  name: string;
  emoji: string;
  description: string;
  vars: Record<string, string>;
}

// ─── Dataset Types ─────────────────────────────────────────────────────────────

export interface FeatureStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
}

export interface PreprocessResult {
  columns: string[];
  shape: [number, number];
  head: Record<string, number>[];
  missing_before: Record<string, number>;
  missing_after: Record<string, number>;
  outliers_capped: Record<string, number>;
  wqi_stats: { mean: number; std: number; min: number; max: number };
  processed_data: Record<string, number>[];
  feature_stats: Record<string, FeatureStats>;
  has_target?: boolean;
  detected_features?: string[];
  column_mapping?: Record<string, string>;
  dataset_summary?: string;
}

// ─── Training Types ────────────────────────────────────────────────────────────

export interface ModelMetric {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
}

export interface ROCData {
  fpr: number[];
  tpr: number[];
}

export interface TrainResult {
  models_metrics: ModelMetric[];
  feature_importance: Record<string, Record<string, number>>;
  roc_curves: Record<string, ROCData>;
  shap_importance: Record<string, number>;
  shap_waterfall: Record<string, number>;
  best_model_name: string;
  model_b64: string;
  scaler_b64: string;
  feature_names: string[];
}

// ─── Prediction Types ──────────────────────────────────────────────────────────

export type SafetyTier = 0 | 1 | 2;

export interface PredictionRow {
  id: number;
  ph: number;
  Turbidity: number;
  WQI: number;
  prediction: number;
  probability_safe: number;
  probability_unsafe: number;
  tier: SafetyTier;
  tier_label: string;
  tier_color: string;
  feature_contributions?: Record<string, number>;
}

export interface SafetyDistribution {
  safe_count: number;
  screening_count: number;
  unsafe_count: number;
  total: number;
}

export interface PredictResult {
  predictions: PredictionRow[];
  safety_distribution: SafetyDistribution;
}

// ─── Simulator Types ───────────────────────────────────────────────────────────

export interface SimulatorParams {
  ph: number;
  Hardness: number;
  Solids: number;
  Chloramines: number;
  Sulfate: number;
  Conductivity: number;
  Organic_carbon: number;
  Trihalomethanes: number;
  Turbidity: number;
}

export const SIMULATOR_DEFAULTS: SimulatorParams = {
  ph: 7.0,
  Hardness: 150,
  Solids: 20000,
  Chloramines: 7,
  Sulfate: 300,
  Conductivity: 400,
  Organic_carbon: 12,
  Trihalomethanes: 60,
  Turbidity: 4,
};

export const SIMULATOR_RANGES: Record<keyof SimulatorParams, { min: number; max: number; step: number; unit: string }> = {
  ph:              { min: 0,   max: 14,    step: 0.1,  unit: 'pH' },
  Hardness:        { min: 50,  max: 350,   step: 1,    unit: 'mg/L' },
  Solids:          { min: 0,   max: 60000, step: 100,  unit: 'ppm' },
  Chloramines:     { min: 0,   max: 14,    step: 0.1,  unit: 'mg/L' },
  Sulfate:         { min: 100, max: 600,   step: 1,    unit: 'mg/L' },
  Conductivity:    { min: 100, max: 800,   step: 1,    unit: 'μS/cm' },
  Organic_carbon:  { min: 0,   max: 30,    step: 0.1,  unit: 'ppm' },
  Trihalomethanes: { min: 0,   max: 120,   step: 0.5,  unit: 'μg/L' },
  Turbidity:       { min: 0,   max: 10,    step: 0.1,  unit: 'NTU' },
};
