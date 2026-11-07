import { NextRequest, NextResponse } from 'next/server';

// Canonical columns and extensive alias mappings covering EPA, WHO, Kaggle, USGS, and municipal datasets
const COLUMN_ALIASES: Record<string, string[]> = {
  ph: [
    'ph', 'ph_value', 'ph_level', 'water_ph', 'ph_water', 'phval',
    'potential_hydrogen', 'ph_in_water', 'ph_units', 'ph_std_units',
    'field_ph', 'lab_ph', 'ph_measurement', 'potential_of_hydrogen'
  ],
  Hardness: [
    'hardness', 'total_hardness', 'hardness_mg_l', 'hardness_ppm',
    'water_hardness', 'calcium_hardness', 'ca_hardness', 'mg_hardness',
    'hardness_mg_caco3_l', 'ca_mg_hardness', 'caco3', 'th', 'total_hardness_ppm'
  ],
  Solids: [
    'solids', 'tds', 'total_dissolved_solids', 'solids_ppm', 'solids_mg_l',
    'dissolved_solids', 'total_solids', 'filter_residue', 'ts', 'tds_mg_l',
    'total_dissolved_solids_mg_l', 'tss', 'suspended_solids', 'total_suspended_solids'
  ],
  Chloramines: [
    'chloramines', 'chloramine', 'total_chloramines', 'chloramines_ppm',
    'chloramines_mg_l', 'chlorine', 'free_chlorine', 'residual_chlorine',
    'chlorine_residual', 'total_chlorine', 'cl2', 'chlorine_mg_l', 'free_residual_chlorine'
  ],
  Sulfate: [
    'sulfate', 'sulphate', 'sulfates', 'sulphates', 'so4', 'sulfate_mg_l',
    'so4_mg_l', 'sulphate_mg_l', 'so4_2', 'sulfate_ppm', 'sulphate_ppm'
  ],
  Conductivity: [
    'conductivity', 'electrical_conductivity', 'ec', 'cond', 'cond_us_cm',
    'sp_cond', 'conductance', 'specific_conductance', 'ec_us_cm', 'conductivity_us_cm',
    'electric_conductivity', 'conductance_us_cm'
  ],
  Organic_carbon: [
    'organic_carbon', 'toc', 'total_organic_carbon', 'organic_carbon_ppm',
    'organic_carbon_mg_l', 'doc', 'dissolved_organic_carbon', 'toc_mg_l',
    'total_organic_carbon_mg_l', 'organic_matter'
  ],
  Trihalomethanes: [
    'trihalomethanes', 'thm', 'total_trihalomethanes', 'trihalomethanes_ug_l',
    'tthm', 'trihalomethane', 'thms', 'total_thm', 'tthms_ug_l', 'thm_ug_l'
  ],
  Turbidity: [
    'turbidity', 'turb', 'turbidity_ntu', 'turbidity_ftu', 'clarity',
    'turbidity_jtu', 'nephelometric_turbidity', 'ntu', 'water_clarity', 'turbidity_units'
  ],
  Potability: [
    'potability', 'potable', 'is_potable', 'safe', 'is_safe', 'target',
    'class', 'label', 'quality', 'status', 'drinkable', 'water_quality',
    'is_safe_for_drinking', 'result', 'drinking_water_potability', 'verdict',
    'category', 'outcome', 'evaluation', 'y', 'potability_status', 'safety_tier'
  ],
};

const CANONICAL_FEATURES = [
  'ph', 'Hardness', 'Solids', 'Chloramines', 'Sulfate',
  'Conductivity', 'Organic_carbon', 'Trihalomethanes', 'Turbidity'
];

// Baseline reference standards for water parameters (WHO / EPA guidelines)
const DEFAULT_FEATURE_VALUES: Record<string, number> = {
  ph: 7.08,
  Hardness: 196.37,
  Solids: 22014.09,
  Chloramines: 7.12,
  Sulfate: 333.78,
  Conductivity: 426.21,
  Organic_carbon: 14.28,
  Trihalomethanes: 66.40,
  Turbidity: 3.97,
};

function normalizeColName(name: string): string {
  // Strip BOM, non-alphanumeric, and lowercase
  return name.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Robust CSV Line Parser supporting:
 * - Empty fields (e.g. ",204.89", "6.63,,592.88", or trailing commas)
 * - Quoted values containing commas or escaped quotes
 * - Custom delimiters (comma, semicolon, tab, pipe)
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      if (inQuotes && i + 1 < line.length && line[i + 1] === char) {
        current += char;
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses raw CSV text into normalized headers and row records
 */
function parseCSV(text: string): { headers: string[]; rows: Record<string, any>[] } {
  // Clean BOM and carriage returns
  const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = cleanText.split('\n');

  // Filter out empty lines or comment lines
  const lines = rawLines.filter(l => {
    const trimmed = l.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('//');
  });

  if (lines.length === 0) return { headers: [], rows: [] };

  // Auto-detect delimiter from the first 5 lines
  const sample = lines.slice(0, Math.min(5, lines.length)).join('\n');
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const pipeCount = (sample.match(/\|/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount && semiCount > pipeCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount && tabCount > pipeCount) delimiter = '\t';
  else if (pipeCount > commaCount && pipeCount > semiCount && pipeCount > tabCount) delimiter = '|';

  const rawHeaders = parseCSVLine(lines[0], delimiter).map(h =>
    h.replace(/^["']|["']$/g, '').trim()
  );

  // Filter out completely empty trailing headers if line ended with an unquoted comma
  const validHeadersCount = rawHeaders.length;

  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    // Ignore lines that have no values
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const row: Record<string, any> = {};
    for (let j = 0; j < validHeadersCount; j++) {
      const header = rawHeaders[j];
      if (!header) continue;
      const val = values[j] !== undefined ? values[j].replace(/^["']|["']$/g, '').trim() : '';
      row[header] = val;
    }
    rows.push(row);
  }

  return { headers: rawHeaders.filter(h => h.length > 0), rows };
}

function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeStats(arr: number[]): { mean: number; std: number; min: number; max: number; median: number } {
  if (arr.length === 0) return { mean: 0, std: 0, min: 0, max: 0, median: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const median = computeMedian(arr);
  const sum = arr.reduce((acc, v) => acc + v, 0);
  const mean = sum / arr.length;
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
  const std = Math.sqrt(variance);
  return {
    mean: Number(mean.toFixed(4)),
    std: Number(std.toFixed(4)),
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    median: Number(median.toFixed(4)),
  };
}

/**
 * Calculates Water Quality Index (WQI) based on standard physicochemical parameters
 */
function calculateWQI(row: Record<string, number>): number {
  const ph = row.ph ?? 7.0;
  const turb = row.Turbidity ?? 4.0;
  const chlor = row.Chloramines ?? 7.0;
  const solids = row.Solids ?? 20000.0;
  const sulf = row.Sulfate ?? 330.0;
  const thm = row.Trihalomethanes ?? 66.0;
  const cond = row.Conductivity ?? 420.0;
  const oc = row.Organic_carbon ?? 14.0;

  const phComp = Math.max(0, 1 - Math.abs(ph - 7) / 7) * 15.0;
  const turbComp = Math.max(0, 1 - turb / 10.0) * 20.0;
  const chlorComp = Math.max(0, 1 - chlor / 10.0) * 20.0;
  const solidsComp = Math.max(0, 1 - solids / 50000.0) * 15.0;
  const sulfComp = Math.max(0, 1 - sulf / 500.0) * 10.0;
  const thmComp = Math.max(0, 1 - thm / 100.0) * 10.0;
  const condComp = Math.min(1.0, cond / 800.0) * 5.0;
  const ocComp = Math.max(0, 1 - oc / 25.0) * 5.0;

  const rawWQI = phComp + turbComp + chlorComp + solidsComp + sulfComp + thmComp + condComp + ocComp;
  return Number(Math.max(0, Math.min(100, rawWQI)).toFixed(2));
}

/**
 * Safely parses any cell value to a float:
 * Supports empty strings, null, NaN, European commas (e.g. "7,45"), scientific notation
 */
function parseSafeFloat(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return isNaN(val) ? NaN : val;
  if (typeof val !== 'string') return NaN;

  let s = val.trim();
  if (s === '' || s === '-' || s === 'na' || s === 'n/a' || s === 'null' || s === 'none' || s === '?') {
    return NaN;
  }
  // If string contains comma as decimal separator (e.g. "7,45" and no dot)
  if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  // Strip non-numeric units (e.g. "mg/L", "ppm", "NTU", "uS/cm")
  s = s.replace(/[^0-9.\-eE+]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? NaN : parsed;
}

export async function POST(req: NextRequest) {
  try {
    let csvText = '';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.csv_text) {
        csvText = body.csv_text;
      } else if (body.csv_data) {
        csvText = body.csv_data;
      } else if (body.csv_base64) {
        try {
          csvText = Buffer.from(body.csv_base64, 'base64').toString('utf-8');
        } catch {
          csvText = body.csv_base64;
        }
      }
    } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      csvText = await req.text();
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        csvText = await file.text();
      }
    }

    if (!csvText || csvText.trim().length === 0) {
      return NextResponse.json(
        { status: 'error', error: 'No CSV data received or content is empty.' },
        { status: 400 }
      );
    }

    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) {
      return NextResponse.json(
        { status: 'error', error: 'CSV file contains no valid rows.' },
        { status: 400 }
      );
    }

    // Build alias lookup table
    const normAliasMap: Record<string, string> = {};
    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      normAliasMap[normalizeColName(canonical)] = canonical;
      for (const a of aliases) {
        normAliasMap[normalizeColName(a)] = canonical;
      }
    }

    // Resolve column mapping
    const colMap: Record<string, string> = {};
    const usedCanonicals = new Set<string>();

    // Pass 1: Exact normalized match
    for (const header of headers) {
      const normH = normalizeColName(header);
      if (!normH) continue;
      if (normAliasMap[normH] && !usedCanonicals.has(normAliasMap[normH])) {
        colMap[header] = normAliasMap[normH];
        usedCanonicals.add(normAliasMap[normH]);
      }
    }

    // Pass 2: Prefix / token matching for remaining headers
    for (const header of headers) {
      if (colMap[header]) continue;
      const normH = normalizeColName(header);
      if (!normH || normH.length < 2) continue;

      for (const [normA, canonical] of Object.entries(normAliasMap)) {
        if (normA.length < 3) continue; // skip short aliases for fuzzy matching
        if (!usedCanonicals.has(canonical) && (normH.includes(normA) || normA.includes(normH))) {
          colMap[header] = canonical;
          usedCanonicals.add(canonical);
          break;
        }
      }
    }

    // Identify target column (Potability)
    const targetHeader = Object.keys(colMap).find(k => colMap[k] === 'Potability');
    const hasTarget = !!targetHeader;

    // Track missing values before imputation
    const missingBefore: Record<string, number> = {};
    for (const f of CANONICAL_FEATURES) {
      missingBefore[f] = 0;
    }

    // Parse each row into canonical features + target
    const parsedData: Record<string, number>[] = [];

    for (const r of rows) {
      const item: Record<string, number> = {};

      for (const f of CANONICAL_FEATURES) {
        const origHeader = Object.keys(colMap).find(k => colMap[k] === f);
        if (origHeader && r[origHeader] !== undefined && r[origHeader] !== '') {
          const val = parseSafeFloat(r[origHeader]);
          if (isNaN(val)) {
            missingBefore[f]++;
            item[f] = NaN;
          } else {
            item[f] = val;
          }
        } else {
          missingBefore[f]++;
          item[f] = NaN;
        }
      }

      // Potability target mapping
      if (hasTarget && targetHeader) {
        const rawTarget = r[targetHeader];
        if (typeof rawTarget === 'string') {
          const s = rawTarget.trim().toLowerCase();
          const isPotable = [
            '1', 'true', 'yes', 'safe', 'potable', 'good', 'pass', 'clean', 'drinkable', 'high'
          ].includes(s) || (parseSafeFloat(s) >= 0.5);
          item.Potability = isPotable ? 1 : 0;
        } else if (typeof rawTarget === 'number') {
          item.Potability = rawTarget >= 0.5 ? 1 : 0;
        } else {
          item.Potability = 0;
        }
      } else {
        item.Potability = NaN;
      }

      parsedData.push(item);
    }

    // Missing value imputation: column median or baseline reference
    const medians: Record<string, number> = {};
    for (const f of CANONICAL_FEATURES) {
      const validVals = parsedData.map(d => d[f]).filter(v => !isNaN(v));
      medians[f] = validVals.length > 0 ? computeMedian(validVals) : DEFAULT_FEATURE_VALUES[f];
    }

    const missingAfter: Record<string, number> = {};
    for (const f of CANONICAL_FEATURES) {
      missingAfter[f] = 0;
    }

    for (const d of parsedData) {
      for (const f of CANONICAL_FEATURES) {
        if (isNaN(d[f])) {
          d[f] = medians[f];
        }
      }
      if (isNaN(d.Potability)) {
        // Synthesize screening classification for unlabeled datasets using EPA/WHO thresholds
        const isSafe = (
          d.ph >= 6.5 && d.ph <= 8.5 &&
          d.Turbidity <= 5.0 &&
          d.Chloramines <= 8.0 &&
          d.Sulfate <= 400.0 &&
          d.Trihalomethanes <= 80.0
        );
        d.Potability = isSafe ? 1 : 0;
      }
    }

    // Outlier capping using IQR (1.5 * IQR)
    const outliersCapped: Record<string, number> = {};
    for (const f of CANONICAL_FEATURES) {
      const vals = parsedData.map(d => d[f]).sort((a, b) => a - b);
      const q1 = vals[Math.floor(vals.length * 0.25)];
      const q3 = vals[Math.floor(vals.length * 0.75)];
      const iqr = q3 - q1;
      let capped = 0;

      if (iqr > 0) {
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        for (const d of parsedData) {
          if (d[f] < lower) {
            d[f] = lower;
            capped++;
          } else if (d[f] > upper) {
            d[f] = upper;
            capped++;
          }
          d[f] = Number(d[f].toFixed(4));
        }
      }
      outliersCapped[f] = capped;
    }

    // Compute Water Quality Index (WQI)
    const wqiValues: number[] = [];
    for (const d of parsedData) {
      d.WQI = calculateWQI(d);
      wqiValues.push(d.WQI);
    }

    const wqiStats = computeStats(wqiValues);

    // Compute feature statistics for dashboard charts
    const featureStats: Record<string, any> = {};
    for (const f of [...CANONICAL_FEATURES, 'WQI', 'Potability']) {
      const fVals = parsedData.map(d => d[f]);
      featureStats[f] = computeStats(fVals);
    }

    const detectedFeatures = Object.values(colMap).filter(v => CANONICAL_FEATURES.includes(v));

    let summaryNote = `Successfully parsed ${parsedData.length} samples with ${detectedFeatures.length} mapped water parameters.`;
    if (!hasTarget) {
      summaryNote += ' (Dataset is unlabeled: Potability target synthesized using WHO/EPA drinking water standards).';
    }

    return NextResponse.json({
      status: 'success',
      columns: [...CANONICAL_FEATURES, 'WQI', 'Potability'],
      shape: [parsedData.length, CANONICAL_FEATURES.length + 2],
      head: parsedData.slice(0, 5),
      missing_before: missingBefore,
      missing_after: missingAfter,
      outliers_capped: outliersCapped,
      wqi_stats: wqiStats,
      processed_data: parsedData,
      feature_stats: featureStats,
      has_target: hasTarget,
      detected_features: detectedFeatures,
      column_mapping: colMap,
      dataset_summary: summaryNote,
    });
  } catch (err: any) {
    console.error('Preprocessing error:', err);
    return NextResponse.json(
      { status: 'error', error: `Data Preprocessing failed: ${err.message}` },
      { status: 500 }
    );
  }
}
