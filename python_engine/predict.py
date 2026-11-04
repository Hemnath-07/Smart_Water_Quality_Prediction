import base64
import json
import pickle
from http.server import BaseHTTPRequestHandler
import numpy as np
import pandas as pd


TIERS = {
    0: {
        "tier": 0,
        "tier_label": "Safe / Potable",
        "tier_color": "#22c55e"
    },
    1: {
        "tier": 1,
        "tier_label": "Requires Secondary Screening",
        "tier_color": "#eab308"
    },
    2: {
        "tier": 2,
        "tier_label": "Contaminated / Unsafe",
        "tier_color": "#ef4444"
    }
}


def sanitize_float(val, precision=4):
    """Convert numpy / pandas floats to safe JSON float."""
    if val is None or pd.isna(val) or np.isneginf(val) or np.isposinf(val):
        return 0.0
    return float(round(float(val), precision))


def compute_sample_wqi(sample):
    """
    Compute Water Quality Index (WQI) safely with fallbacks.
    """
    def get_num(key, default_val=0.0):
        val = sample.get(key)
        if val is None:
            for k, v in sample.items():
                if k.lower() == key.lower():
                    val = v
                    break
        if val is None or pd.isna(val):
            return default_val
        try:
            return float(val)
        except (ValueError, TypeError):
            return default_val

    ph = get_num('ph', 7.0)
    turbidity = get_num('Turbidity', 4.0)
    chloramines = get_num('Chloramines', 7.0)
    solids = get_num('Solids', 20000.0)
    sulfate = get_num('Sulfate', 330.0)
    thm = get_num('Trihalomethanes', 66.0)
    cond = get_num('Conductivity', 420.0)
    oc = get_num('Organic_carbon', 14.0)

    ph_comp = max(0.0, 1.0 - abs(ph - 7.0) / 7.0) * 15.0
    turb_comp = max(0.0, 1.0 - turbidity / 10.0) * 20.0
    chlor_comp = max(0.0, 1.0 - chloramines / 10.0) * 20.0
    solids_comp = max(0.0, 1.0 - solids / 50000.0) * 15.0
    sulfate_comp = max(0.0, 1.0 - sulfate / 500.0) * 10.0
    thm_comp = max(0.0, 1.0 - thm / 100.0) * 10.0
    cond_comp = min(1.0, cond / 800.0) * 5.0
    oc_comp = max(0.0, 1.0 - oc / 25.0) * 5.0

    raw_wqi = (
        ph_comp +
        turb_comp +
        chlor_comp +
        solids_comp +
        sulfate_comp +
        thm_comp +
        cond_comp +
        oc_comp
    )
    return sanitize_float(np.clip(raw_wqi, 0.0, 100.0), 2)


def classify_tier(prob_safe, wqi):
    """Categorize water sample into 3 safety tiers."""
    if prob_safe >= 0.65 and wqi >= 50.0:
        return TIERS[0]
    elif prob_safe >= 0.35 and wqi >= 35.0:
        return TIERS[1]
    else:
        return TIERS[2]


class handler(BaseHTTPRequestHandler):
    """Vercel Serverless Function handler for Water Quality Prediction and Tier Classification."""

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept')
        self.send_header('Access-Control-Max-Age', '86400')

    def _send_json(self, status_code, data):
        response_bytes = json.dumps(data, allow_nan=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response_bytes)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(response_bytes)

    def _send_error(self, status_code, message):
        self._send_json(status_code, {
            "status": "error",
            "error": message
        })

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Health check endpoint."""
        self._send_json(200, {
            "status": "online",
            "endpoint": "predict",
            "tiers": list(TIERS.values()),
            "description": "Post JSON with 'samples' (list or dict), optional 'model_b64' and 'scaler_b64'."
        })

    def do_POST(self):
        """Perform predictions and return risk vectors and safety tiers."""
        try:
            content_length_header = self.headers.get('Content-Length')
            content_length = int(content_length_header) if content_length_header else 0

            if content_length <= 0:
                self._send_error(400, "Empty request body received.")
                return

            post_data = self.rfile.read(content_length)
            try:
                body = json.loads(post_data.decode('utf-8'))
            except json.JSONDecodeError as jde:
                self._send_error(400, f"Invalid JSON payload: {str(jde)}")
                return

            if not isinstance(body, dict):
                self._send_error(400, "Expected a JSON object as the root payload.")
                return

            # Extract samples (can be 'samples', 'processed_data', or 'sample')
            samples = body.get('samples')
            if samples is None:
                samples = body.get('processed_data')
            if samples is None and 'sample' in body:
                samples = [body['sample']]

            if not samples:
                self._send_error(400, "No sample data provided for prediction.")
                return

            if isinstance(samples, dict):
                samples = [samples]

            model_b64 = body.get('model_b64')
            scaler_b64 = body.get('scaler_b64')
            feature_names = body.get('feature_names')

            model = None
            scaler = None

            if model_b64:
                try:
                    model = pickle.loads(base64.b64decode(model_b64))
                except Exception:
                    model = None

            if scaler_b64:
                try:
                    scaler = pickle.loads(base64.b64decode(scaler_b64))
                except Exception:
                    scaler = None

            canonical_defaults = [
                'ph', 'Hardness', 'Solids', 'Chloramines', 'Sulfate',
                'Conductivity', 'Organic_carbon', 'Trihalomethanes', 'Turbidity'
            ]
            if not feature_names:
                feature_names = canonical_defaults

            results = []
            safe_count = 0
            screening_count = 0
            unsafe_count = 0

            for idx, raw_sample in enumerate(samples):
                sample_dict = dict(raw_sample)

                # Extract feature values
                feature_vals = []
                for feat in feature_names:
                    val = sample_dict.get(feat)
                    if val is None:
                        for k, v in sample_dict.items():
                            if k.lower() == feat.lower():
                                val = v
                                break
                    try:
                        feature_vals.append(float(val) if val is not None else 0.0)
                    except (ValueError, TypeError):
                        feature_vals.append(0.0)

                wqi = compute_sample_wqi(sample_dict)

                # ML Inference or Rule-Based Fallback
                if model is not None:
                    try:
                        X_vec = np.array([feature_vals])
                        if scaler is not None:
                            X_vec = scaler.transform(X_vec)

                        if hasattr(model, 'predict_proba'):
                            probs = model.predict_proba(X_vec)[0]
                            prob_safe = float(probs[1]) if len(probs) > 1 else float(probs[0])
                        elif hasattr(model, 'decision_function'):
                            df_val = float(model.decision_function(X_vec)[0])
                            prob_safe = 1.0 / (1.0 + np.exp(-df_val))
                        else:
                            pred = model.predict(X_vec)[0]
                            prob_safe = float(pred)
                    except Exception:
                        prob_safe = float(wqi / 100.0)
                else:
                    prob_safe = float(wqi / 100.0)

                prob_unsafe = 1.0 - prob_safe
                tier_info = classify_tier(prob_safe, wqi)

                if tier_info['tier'] == 0:
                    safe_count += 1
                elif tier_info['tier'] == 1:
                    screening_count += 1
                else:
                    unsafe_count += 1

                ph_val = sample_dict.get('ph') or sample_dict.get('PH') or 7.0
                turb_val = sample_dict.get('Turbidity') or sample_dict.get('turbidity') or 4.0

                results.append({
                    "id": idx + 1,
                    "ph": sanitize_float(ph_val, 2),
                    "Turbidity": sanitize_float(turb_val, 2),
                    "WQI": wqi,
                    "prediction": 1 if prob_safe >= 0.50 else 0,
                    "probability_safe": sanitize_float(prob_safe, 4),
                    "probability_unsafe": sanitize_float(prob_unsafe, 4),
                    "tier": tier_info['tier'],
                    "tier_label": tier_info['tier_label'],
                    "tier_color": tier_info['tier_color'],
                })

            response_payload = {
                "status": "success",
                "predictions": results,
                "safety_distribution": {
                    "safe_count": safe_count,
                    "screening_count": screening_count,
                    "unsafe_count": unsafe_count,
                    "total": len(results)
                }
            }

            self._send_json(200, response_payload)

        except Exception as e:
            self._send_error(500, f"Internal prediction error: {str(e)}")
