import { NextRequest, NextResponse } from 'next/server';

// Canonical columns and their extensive alias mappings
const COLUMN_ALIASES: Record<string, string[]> = {
  ph: [
    'ph', 'ph_value', 'ph_level', 'water_ph', 'ph_water', 'phval',
    'potential_hydrogen', 'ph_in_water', 'ph_units', 'ph_std_units'
  ],
  Hardness: [
    'hardness', 'total_hardness', 'hardness_mg_l', 'hardness_ppm',
    'water_hardness', 'calcium_hardness', 'ca_hardness', 'mg_hardness',
    'hardness_mg_caco3_l', 'ca_mg_hardness'
  ],
  Solids: [
    'solids', 'tds', 'total_dissolved_solids', 'solids_ppm', 'solids_mg_l',
    'dissolved_solids', 'total_solids', 'filter_residue', 'ts'
  ],
  Chloramines: [
    'chloramines', 'chloramine', 'total_chloramines', 'chloramines_ppm',
    'chloramines_mg_l', 'chlorine', 'free_chlorine', 'residual_chlorine',
    'chlorine_residual'
  ],
  Sulfate: [
    'sulfate', 'sulphate', 'sulfates', 'sulphates', 'so4', 'sulfate_mg_l',
    'so4_mg_l', 'sulphate_mg_l'
  ],
  Conductivity: [
    'conductivity', 'electrical_conductivity', 'ec', 'cond', 'cond_us_cm',
    'sp_cond', 'conductance', 'specific_conductance', 'ec_us_cm'
  ],
  Organic_carbon: [
    'organic_carbon', 'toc', 'total_organic_carbon', 'organic_carbon_ppm',
    'organic_carbon_mg_l', 'doc', 'dissolved_organic_carbon'
  ],
  Trihalomethanes: [
    'trihalomethanes', 'thm', 'total_trihalomethanes', 'trihalomethanes_ug_l',
    'tthm', 'trihalomethane', 'thms'
  ],
  Turbidity: [
    'turbidity', 'turb', 'turbidity_ntu', 'turbidity_ftu', 'clarity',
    'turbidity_jtu', 'nephelometric_turbidity'
  ],
  Potability: [
    'potability', 'potable', 'is_potable', 'safe', 'is_safe', 'target',
    'class', 'label', 'quality', 'status', 'drinkable', 'water_quality',
    'is_safe_for_drinking', 'result', 'drinking_water_potability'
  ],
};

const CANONICAL_FEATURES = [
  'ph', 'Hardness', 'Solids', 'Chloramines', 'Sulfate',
  'Conductivity', 'Organic_carbon', 'Trihalomethanes', 'Turbidity'
];

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
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
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

function parseCSV(text: string): { headers: string[]; rows: Record<string, any>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  const rawHeaders = parseCSVLine(lines[0], delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    if (values.length < 2) continue;
    const row: Record<string, any> = {};
    for (let j = 0; j < rawHeaders.length; j++) {
      const header = rawHeaders[j];
      const val = values[j] !== undefined ? values[j].replace(/^["']|["']$/g, '').trim() : '';
      row[header] = val;
    }
    rows.push(row);
  }

  return { headers: rawHeaders, rows };
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

export async function POST(req: NextRequest) {
  try {
    let csvText = '';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.csv_text) {
        csvText = body.csv_text;
      } else if (body.csv_base64) {
        csvText = Buffer.from(body.csv_base64, 'base64').toString('utf-8');
      } else if (body.csv_data) {
        const raw = body.csv_data;
        if (typeof raw === 'string') {
          // Check if base64 encoded
          if (!raw.includes('\n') && !raw.includes(',') && raw.length % 4 === 0) {
            try {
              const decoded = Buffer.from(raw, 'base64').toString('utf-8');
              if (decoded.includes(',') || decoded.includes('\n')) {
                csvText = decoded;
              } else {
                csvText = raw;
              }
            } catch {
              csvText = raw;
            }
          } else {
            csvText = raw;
          }
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
      return NextResponse.json({ status: 'error', error: 'No CSV data received or content is empty.' }, { status: 400 });
    }

    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ status: 'error', error: 'CSV file contains no valid rows.' }, { status: 400 });
    }

    // Resolve column aliases
    const colMap: Record<string, string> = {};
    const usedCanonicals = new Set<string>();

    const normAliasMap: Record<string, string> = {};
    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      normAliasMap[normalizeColName(canonical)] = canonical;
      for (const a of aliases) {
        normAliasMap[normalizeColName(a)] = canonical;
      }
    }

    for (const header of headers) {
      const normH = normalizeColName(header);
      if (normAliasMap[normH] && !usedCanonicals.has(normAliasMap[normH])) {
        colMap[header] = normAliasMap[normH];
        usedCanonicals.add(normAliasMap[normH]);
        continue;
      }
      // Substring matching
      for (const [normA, canonical] of Object.entries(normAliasMap)) {
        if ((normH.includes(normA) || normA.includes(normH)) && !usedCanonicals.has(canonical)) {
          colMap[header] = canonical;
          usedCanonicals.add(canonical);
          break;
        }
      }
    }

    // Check if target is present
    const targetHeader = Object.keys(colMap).find(k => colMap[k] === 'Potability');
    const hasTarget = !!targetHeader;

    // Track missing values before cleaning
    const missingBefore: Record<string, number> = {};
    for (const f of CANONICAL_FEATURES) {
      missingBefore[f] = 0;
    }

    // Parse numeric columns
    const parsedData: Record<string, number>[] = [];

    for (const r of rows) {
      const item: Record<string, number> = {};
      for (const f of CANONICAL_FEATURES) {
        const origHeader = Object.keys(colMap).find(k => colMap[k] === f);
        if (origHeader && r[origHeader] !== undefined && r[origHeader] !== '') {
          const val = parseFloat(r[origHeader]);
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

      // Potability target
      if (hasTarget && targetHeader) {
        const rawTarget = r[targetHeader];
        if (typeof rawTarget === 'string') {
          const s = rawTarget.trim().toLowerCase();
          item.Potability = ['1', 'true', 'yes', 'safe', 'potable', 'good'].includes(s) || parseFloat(s) >= 0.5 ? 1 : 0;
        } else {
          item.Potability = Number(rawTarget) >= 0.5 ? 1 : 0;
        }
      } else {
        item.Potability = NaN;
      }

      parsedData.push(item);
    }

    // Missing value imputation: column median
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
        // Synthesize preliminary screening potability if unlabeled
        const isSafe = (d.ph >= 6.5 && d.ph <= 8.5 && d.Turbidity <= 5.0 && d.Chloramines <= 8.0 && d.Sulfate <= 400.0);
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

    // Compute WQI for all records
    const wqiValues: number[] = [];
    for (const d of parsedData) {
      d.WQI = calculateWQI(d);
      wqiValues.push(d.WQI);
    }

    const wqiStats = computeStats(wqiValues);

    // Compute feature statistics
    const featureStats: Record<string, any> = {};
    for (const f of [...CANONICAL_FEATURES, 'WQI', 'Potability']) {
      const fVals = parsedData.map(d => d[f]);
      featureStats[f] = computeStats(fVals);
    }

    const detectedFeatures = Object.values(colMap).filter(v => CANONICAL_FEATURES.includes(v));

    let summaryNote = `Processed ${parsedData.length} samples across ${detectedFeatures.length} mapped parameters.`;
    if (!hasTarget) {
      summaryNote += ' (Unlabeled dataset: Target Potability generated from standard WHO/EPA screening rules).';
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
    return NextResponse.json({ status: 'error', error: `Internal preprocessing error: ${err.message}` }, { status: 500 });
  }
}
