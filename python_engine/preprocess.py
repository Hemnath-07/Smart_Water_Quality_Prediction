import base64
import io
import json
import re
from email import message_from_bytes
from http.server import BaseHTTPRequestHandler
import numpy as np
import pandas as pd


# Canonical columns and their extensive alias mappings
COLUMN_ALIASES = {
    'ph': [
        'ph', 'ph_value', 'ph_level', 'water_ph', 'ph_water', 'phval',
        'potential_hydrogen', 'ph_in_water', 'ph_units', 'ph_std_units'
    ],
    'Hardness': [
        'hardness', 'total_hardness', 'hardness_mg_l', 'hardness_ppm',
        'water_hardness', 'calcium_hardness', 'ca_hardness', 'mg_hardness',
        'hardness_mg_caco3_l', 'ca_mg_hardness'
    ],
    'Solids': [
        'solids', 'tds', 'total_dissolved_solids', 'solids_ppm', 'solids_mg_l',
        'dissolved_solids', 'total_solids', 'filter_residue', 'ts'
    ],
    'Chloramines': [
        'chloramines', 'chloramine', 'total_chloramines', 'chloramines_ppm',
        'chloramines_mg_l', 'chlorine', 'free_chlorine', 'residual_chlorine',
        'chlorine_residual'
    ],
    'Sulfate': [
        'sulfate', 'sulphate', 'sulfates', 'sulphates', 'so4', 'sulfate_mg_l',
        'so4_mg_l', 'sulphate_mg_l'
    ],
    'Conductivity': [
        'conductivity', 'electrical_conductivity', 'ec', 'cond', 'cond_us_cm',
        'sp_cond', 'conductance', 'specific_conductance', 'ec_us_cm'
    ],
    'Organic_carbon': [
        'organic_carbon', 'toc', 'total_organic_carbon', 'organic_carbon_ppm',
        'organic_carbon_mg_l', 'doc', 'dissolved_organic_carbon'
    ],
    'Trihalomethanes': [
        'trihalomethanes', 'thm', 'total_trihalomethanes', 'trihalomethanes_ug_l',
        'tthm', 'trihalomethane', 'thms'
    ],
    'Turbidity': [
        'turbidity', 'turb', 'turbidity_ntu', 'turbidity_ftu', 'clarity',
        'turbidity_jtu', 'nephelometric_turbidity'
    ],
    'Potability': [
        'potability', 'potable', 'is_potable', 'safe', 'is_safe', 'target',
        'class', 'label', 'quality', 'status', 'drinkable', 'water_quality',
        'is_safe_for_drinking', 'result', 'drinking_water_potability'
    ]
}

CANONICAL_FEATURES = [
    'ph', 'Hardness', 'Solids', 'Chloramines', 'Sulfate',
    'Conductivity', 'Organic_carbon', 'Trihalomethanes', 'Turbidity'
]

# Baseline reference values for imputing missing optional columns
DEFAULT_FEATURE_VALUES = {
    'ph': 7.08,
    'Hardness': 196.37,
    'Solids': 22014.09,
    'Chloramines': 7.12,
    'Sulfate': 333.78,
    'Conductivity': 426.21,
    'Organic_carbon': 14.28,
    'Trihalomethanes': 66.40,
    'Turbidity': 3.97
}


def normalize_col_name(name):
    """Normalize column name by lowercasing and stripping non-alphanumeric chars."""
    return re.sub(r'[^a-z0-9]', '', str(name).lower())


def resolve_columns(df_columns):
    """Map arbitrary dataset column names to canonical water quality features."""
    mapping = {}
    used_canonicals = set()

    # Pre-calculate normalized aliases
    norm_alias_map = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        norm_canonical = normalize_col_name(canonical)
        norm_alias_map[norm_canonical] = canonical
        for a in aliases:
            norm_alias_map[normalize_col_name(a)] = canonical

    for col in df_columns:
        norm_col = normalize_col_name(col)
        # 1. Exact or alias match
        if norm_col in norm_alias_map:
            matched_canonical = norm_alias_map[norm_col]
            if matched_canonical not in used_canonicals:
                mapping[col] = matched_canonical
                used_canonicals.add(matched_canonical)
                continue

        # 2. Substring matching for descriptive headers (e.g. "pH value in water", "Sulfate (mg/L)")
        found = False
        for norm_alias, canonical in norm_alias_map.items():
            if (norm_alias in norm_col or norm_col in norm_alias) and canonical not in used_canonicals:
                mapping[col] = canonical
                used_canonicals.add(canonical)
                found = True
                break

    return mapping


def map_target_series(series):
    """Convert any target column variants (strings, booleans, floats) into binary 0/1."""
    if pd.api.types.is_numeric_dtype(series):
        # Convert numeric values: >= 0.5 to 1, < 0.5 to 0
        return series.apply(lambda v: 1 if pd.notna(v) and float(v) >= 0.5 else 0).astype(int)

    def parse_val(v):
        if pd.isna(v):
            return 0
        s = str(v).strip().lower()
        if s in ['1', '1.0', 'true', 'yes', 'safe', 'potable', 'good', 'drinkable', 'positive', 'pass']:
            return 1
        return 0

    return series.apply(parse_val).astype(int)


def sanitize_float(val, precision=4):
    """Safely convert numpy/pandas floats to standard float without NaN or Inf."""
    if val is None or pd.isna(val) or np.isneginf(val) or np.isposinf(val):
        return 0.0
    return float(round(float(val), precision))


def sanitize_record(record):
    """Ensure all values in a record dict are JSON-serializable."""
    clean = {}
    for k, v in record.items():
        if v is None or pd.isna(v) or (isinstance(v, (float, np.floating)) and (np.isnan(v) or np.isinf(v))):
            clean[k] = 0.0
        elif isinstance(v, (np.integer, int)):
            clean[k] = int(v)
        elif isinstance(v, (np.floating, float)):
            clean[k] = round(float(v), 4)
        else:
            try:
                clean[k] = round(float(v), 4)
            except (ValueError, TypeError):
                clean[k] = str(v)
    return clean


def calculate_wqi(df):
    """
    Compute Water Quality Index (WQI) as a weighted composite:
    ph (15%), Turbidity (20%), Chloramines (20%), Solids (15%), Sulfate (10%),
    Trihalomethanes (10%), Conductivity (5%), Organic_carbon (5%), normalized 0-100.
    """
    ph_s = df['ph'] if 'ph' in df.columns else pd.Series(7.0, index=df.index)
    turb_s = df['Turbidity'] if 'Turbidity' in df.columns else pd.Series(4.0, index=df.index)
    chlor_s = df['Chloramines'] if 'Chloramines' in df.columns else pd.Series(7.0, index=df.index)
    solids_s = df['Solids'] if 'Solids' in df.columns else pd.Series(20000.0, index=df.index)
    sulf_s = df['Sulfate'] if 'Sulfate' in df.columns else pd.Series(330.0, index=df.index)
    thm_s = df['Trihalomethanes'] if 'Trihalomethanes' in df.columns else pd.Series(66.0, index=df.index)
    cond_s = df['Conductivity'] if 'Conductivity' in df.columns else pd.Series(420.0, index=df.index)
    oc_s = df['Organic_carbon'] if 'Organic_carbon' in df.columns else pd.Series(14.0, index=df.index)

    ph_comp = np.maximum(0.0, 1.0 - np.abs(ph_s - 7.0) / 7.0) * 15.0
    turb_comp = np.maximum(0.0, 1.0 - turb_s / 10.0) * 20.0
    chlor_comp = np.maximum(0.0, 1.0 - chlor_s / 10.0) * 20.0
    solids_comp = np.maximum(0.0, 1.0 - solids_s / 50000.0) * 15.0
    sulfate_comp = np.maximum(0.0, 1.0 - sulf_s / 500.0) * 10.0
    thm_comp = np.maximum(0.0, 1.0 - thm_s / 100.0) * 10.0
    cond_comp = np.clip(cond_s / 800.0, 0.0, 1.0) * 5.0
    oc_comp = np.maximum(0.0, 1.0 - oc_s / 25.0) * 5.0

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
    return np.clip(raw_wqi, 0.0, 100.0).round(2)


class handler(BaseHTTPRequestHandler):
    """Universal Vercel Serverless Function handler for Water Quality Data Ingestion & Preprocessing."""

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
        """Health check and schema endpoint."""
        self._send_json(200, {
            "status": "online",
            "endpoint": "preprocess",
            "supported_columns": CANONICAL_FEATURES + ['Potability'],
            "description": "Flexible ingestion endpoint supporting all water quality CSV formats with automatic column resolution, missing value imputation, and WQI calculation."
        })

    def do_POST(self):
        """Handle CSV preprocessing."""
        try:
            content_length_header = self.headers.get('Content-Length')
            content_length = int(content_length_header) if content_length_header else 0
            content_type = self.headers.get('Content-Type', '')

            if content_length <= 0:
                self._send_error(400, "Empty request body received.")
                return

            post_data = self.rfile.read(content_length)
            csv_bytes = None
            df = None

            # 1. Parse Multipart Form Data
            if 'multipart/form-data' in content_type:
                mime_msg = message_from_bytes(
                    b"Content-Type: " + content_type.encode('latin-1', errors='replace') + b"\r\n\r\n" + post_data
                )
                if mime_msg.is_multipart():
                    for part in mime_msg.walk():
                        if part.get_content_maintype() == 'multipart':
                            continue
                        filename = part.get_filename()
                        part_name = part.get_param('name', header='content-disposition')
                        payload = part.get_payload(decode=True)
                        if payload and (
                            (filename and filename.lower().endswith('.csv')) or
                            part_name in ['file', 'csv', 'csv_file', 'data'] or
                            part.get_content_type() in ['text/csv', 'text/plain', 'application/vnd.ms-excel']
                        ):
                            csv_bytes = payload
                            break
                        elif payload and csv_bytes is None:
                            csv_bytes = payload

                if csv_bytes is None and 'boundary=' in content_type:
                    boundary = content_type.split('boundary=')[-1].split(';')[0].strip('"').strip()
                    boundary_bytes = ('--' + boundary).encode('utf-8')
                    parts = post_data.split(boundary_bytes)
                    for p in parts:
                        if b'\r\n\r\n' in p:
                            header_part, body_part = p.split(b'\r\n\r\n', 1)
                            body_part = body_part.rstrip(b'\r\n--')
                            if b'filename=' in header_part or b'name=' in header_part:
                                csv_bytes = body_part
                                break

            # 2. Parse Application JSON
            elif 'application/json' in content_type or post_data.strip().startswith(b'{'):
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    if isinstance(payload, dict):
                        # Extract CSV content whether passed as base64, raw string, or array
                        if 'csv_base64' in payload:
                            csv_bytes = base64.b64decode(payload['csv_base64'])
                        elif 'file' in payload and isinstance(payload['file'], str) and 'base64,' in payload['file']:
                            csv_bytes = base64.b64decode(payload['file'].split('base64,')[-1])
                        elif 'csv_text' in payload:
                            csv_bytes = payload['csv_text'].encode('utf-8')
                        elif 'csv_data' in payload:
                            raw_val = payload['csv_data']
                            if isinstance(raw_val, str):
                                # Detect if csv_data is base64 encoded or raw text
                                is_b64 = False
                                stripped_val = raw_val.strip()
                                if ',' not in stripped_val[:50] and len(stripped_val) % 4 == 0:
                                    try:
                                        decoded = base64.b64decode(stripped_val)
                                        if b',' in decoded or b'\n' in decoded:
                                            csv_bytes = decoded
                                            is_b64 = True
                                    except Exception:
                                        pass
                                if not is_b64:
                                    csv_bytes = raw_val.encode('utf-8')
                        elif 'data' in payload and isinstance(payload['data'], list):
                            df = pd.DataFrame(payload['data'])
                except json.JSONDecodeError as jde:
                    self._send_error(400, f"Malformed JSON body: {str(jde)}")
                    return

            # 3. Direct CSV or Plain Text payload
            elif 'text/csv' in content_type or 'text/plain' in content_type:
                csv_bytes = post_data

            # If df was not directly provided from JSON array, parse from csv_bytes
            if df is None:
                if csv_bytes is None:
                    csv_bytes = post_data

                # Robust parsing supporting commas, semicolons, tabs, and auto-delimiter
                try:
                    df = pd.read_csv(io.BytesIO(csv_bytes), sep=None, engine='python')
                except Exception:
                    try:
                        df = pd.read_csv(io.BytesIO(csv_bytes))
                    except Exception:
                        try:
                            df = pd.read_csv(io.StringIO(csv_bytes.decode('latin-1')), sep=None, engine='python')
                        except Exception as parse_err:
                            self._send_error(400, f"Unable to parse CSV content: {str(parse_err)}")
                            return

            if df is None or df.empty:
                self._send_error(400, "Provided CSV dataset is empty.")
                return

            # Strip whitespace from headers
            df.columns = [str(c).strip() for c in df.columns]

            # Resolve columns using fuzzy & alias mapping
            col_map = resolve_columns(df.columns)
            df.rename(columns=col_map, inplace=True)

            has_target = 'Potability' in df.columns
            detected_features = [c for c in df.columns if c in CANONICAL_FEATURES]

            # If fewer than 2 standard features detected, attempt to treat all numeric columns as features
            if len(detected_features) < 2:
                numeric_candidates = []
                for c in df.columns:
                    if c != 'Potability':
                        converted = pd.to_numeric(df[c], errors='coerce')
                        if converted.notna().sum() > 0.5 * len(df):
                            numeric_candidates.append(c)
                if len(numeric_candidates) >= 2:
                    detected_features = numeric_candidates

            if len(detected_features) < 1:
                self._send_error(
                    400,
                    f"Could not identify water quality parameters in uploaded dataset. "
                    f"Found columns: {', '.join(df.columns)}. "
                    f"Expected parameters like: ph, Hardness, Solids, Sulfate, Chloramines, Turbidity, Conductivity."
                )
                return

            # Ensure canonical feature columns exist (populate missing ones with realistic standards)
            missing_canonicals = []
            for feat in CANONICAL_FEATURES:
                if feat not in df.columns:
                    missing_canonicals.append(feat)
                    df[feat] = DEFAULT_FEATURE_VALUES[feat]

            # Convert all feature columns to numeric
            for col in CANONICAL_FEATURES:
                df[col] = pd.to_numeric(df[col], errors='coerce')

            # Track missing values before cleaning
            missing_before = {col: int(df[col].isna().sum()) for col in CANONICAL_FEATURES}

            # Data Cleaning: Fill missing values with column median (fallback to reference default)
            for col in CANONICAL_FEATURES:
                if df[col].isna().any():
                    col_median = df[col].median()
                    if pd.isna(col_median):
                        col_median = DEFAULT_FEATURE_VALUES.get(col, 0.0)
                    df[col] = df[col].fillna(col_median)

            missing_after = {col: int(df[col].isna().sum()) for col in CANONICAL_FEATURES}

            # Outlier Capping using IQR (1.5 * IQR) on numeric feature columns
            outliers_capped = {}
            for col in CANONICAL_FEATURES:
                q1 = df[col].quantile(0.25)
                q3 = df[col].quantile(0.75)
                iqr = q3 - q1
                if iqr > 0:
                    lower_bound = q1 - 1.5 * iqr
                    upper_bound = q3 + 1.5 * iqr
                    is_outlier = (df[col] < lower_bound) | (df[col] > upper_bound)
                    outliers_capped[col] = int(is_outlier.sum())
                    df[col] = df[col].clip(lower=lower_bound, upper=upper_bound)
                else:
                    outliers_capped[col] = 0

            # Target Handling
            if has_target:
                df['Potability'] = map_target_series(df['Potability'])
            else:
                # If target is missing, synthesize a preliminary potability indicator based on standard EPA/WHO limits
                # (pH 6.5-8.5, Turbidity < 5, Chloramines < 4, etc.)
                is_safe_prelim = (
                    (df['ph'] >= 6.5) & (df['ph'] <= 8.5) &
                    (df['Turbidity'] <= 5.0) &
                    (df['Chloramines'] <= 8.0) &
                    (df['Sulfate'] <= 400.0)
                ).astype(int)
                df['Potability'] = is_safe_prelim

            # Compute Water Quality Index (WQI)
            df['WQI'] = calculate_wqi(df)

            wqi_series = df['WQI']
            wqi_stats = {
                "mean": sanitize_float(wqi_series.mean(), 2),
                "std": sanitize_float(wqi_series.std(), 2),
                "min": sanitize_float(wqi_series.min(), 2),
                "max": sanitize_float(wqi_series.max(), 2)
            }

            # Compute feature statistics per column
            feature_stats = {}
            all_cols = CANONICAL_FEATURES + ['WQI', 'Potability']
            for col in all_cols:
                series = df[col]
                feature_stats[col] = {
                    "mean": sanitize_float(series.mean(), 4),
                    "std": sanitize_float(series.std(), 4),
                    "min": sanitize_float(series.min(), 4),
                    "max": sanitize_float(series.max(), 4),
                    "median": sanitize_float(series.median(), 4)
                }

            # Prepare records
            raw_head = df.head(5).to_dict(orient='records')
            cleaned_head = [sanitize_record(r) for r in raw_head]

            raw_all = df.to_dict(orient='records')
            cleaned_all = [sanitize_record(r) for r in raw_all]

            summary_note = f"Processed {len(df)} samples across {len(detected_features)} detected parameters."
            if missing_canonicals:
                summary_note += f" Imputed {len(missing_canonicals)} standard reference features ({', '.join(missing_canonicals)})."
            if not has_target:
                summary_note += " (Unlabeled dataset: Target Potability generated from standard WHO/EPA screening rules)."

            response_payload = {
                "status": "success",
                "columns": list(df.columns),
                "shape": [int(df.shape[0]), int(df.shape[1])],
                "head": cleaned_head,
                "missing_before": missing_before,
                "missing_after": missing_after,
                "outliers_capped": outliers_capped,
                "wqi_stats": wqi_stats,
                "processed_data": cleaned_all,
                "feature_stats": feature_stats,
                "has_target": has_target,
                "detected_features": detected_features,
                "column_mapping": col_map,
                "dataset_summary": summary_note
            }

            self._send_json(200, response_payload)

        except Exception as e:
            self._send_error(500, f"Internal preprocessing error: {str(e)}")
