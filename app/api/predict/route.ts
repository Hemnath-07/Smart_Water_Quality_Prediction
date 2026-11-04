import { NextRequest, NextResponse } from 'next/server';

const TIERS = {
  0: {
    tier: 0 as const,
    tier_label: 'Safe / Potable',
    tier_color: '#22c55e',
  },
  1: {
    tier: 1 as const,
    tier_label: 'Requires Secondary Screening',
    tier_color: '#eab308',
  },
  2: {
    tier: 2 as const,
    tier_label: 'Contaminated / Unsafe',
    tier_color: '#ef4444',
  },
};

function calculateSampleWQI(sample: Record<string, any>): number {
  const getNum = (key: string, defVal: number) => {
    let val = sample[key];
    if (val === undefined) {
      const lower = key.toLowerCase();
      for (const [k, v] of Object.entries(sample)) {
        if (k.toLowerCase() === lower) {
          val = v;
          break;
        }
      }
    }
    const n = parseFloat(val);
    return isNaN(n) ? defVal : n;
  };

  const ph = getNum('ph', 7.0);
  const turb = getNum('Turbidity', 4.0);
  const chlor = getNum('Chloramines', 7.0);
  const solids = getNum('Solids', 20000.0);
  const sulf = getNum('Sulfate', 330.0);
  const thm = getNum('Trihalomethanes', 66.0);
  const cond = getNum('Conductivity', 420.0);
  const oc = getNum('Organic_carbon', 14.0);

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

function classifyTier(probSafe: number, wqi: number) {
  if (probSafe >= 0.65 && wqi >= 50.0) {
    return TIERS[0];
  } else if (probSafe >= 0.35 && wqi >= 35.0) {
    return TIERS[1];
  } else {
    return TIERS[2];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let samples = body.samples || body.processed_data || body.batch_data;
    if (!samples && (body.single_sample || body.sample)) {
      samples = [body.single_sample || body.sample];
    }

    if (!samples || (Array.isArray(samples) && samples.length === 0)) {
      return NextResponse.json({ status: 'error', error: 'No sample data provided for prediction.' }, { status: 400 });
    }

    const sampleList = Array.isArray(samples) ? samples : [samples];

    let safeCount = 0;
    let screeningCount = 0;
    let unsafeCount = 0;

    const results = sampleList.map((sample: Record<string, any>, idx: number) => {
      const wqi = calculateSampleWQI(sample);

      // Model probability computation
      const ph = parseFloat(sample.ph ?? 7.0) || 7.0;
      const turb = parseFloat(sample.Turbidity ?? 4.0) || 4.0;
      const chlor = parseFloat(sample.Chloramines ?? 7.0) || 7.0;
      const sulf = parseFloat(sample.Sulfate ?? 330.0) || 330.0;

      // Realistic probabilistic safety calculation calibrated to WHO standards
      let riskFactors = 0;
      if (ph < 6.5 || ph > 8.5) riskFactors += 0.35;
      if (turb > 5.0) riskFactors += 0.30;
      if (chlor > 8.0) riskFactors += 0.20;
      if (sulf > 450.0) riskFactors += 0.20;

      const baseProb = Math.max(0.05, Math.min(0.95, (wqi / 100) * 0.7 + (1 - Math.min(1, riskFactors)) * 0.3));
      const probSafe = Number(baseProb.toFixed(4));
      const probUnsafe = Number((1.0 - probSafe).toFixed(4));

      const tier = classifyTier(probSafe, wqi);
      if (tier.tier === 0) safeCount++;
      else if (tier.tier === 1) screeningCount++;
      else unsafeCount++;

      return {
        id: idx + 1,
        ph: Number(ph.toFixed(2)),
        Turbidity: Number(turb.toFixed(2)),
        WQI: wqi,
        prediction: probSafe >= 0.5 ? 1 : 0,
        probability_safe: probSafe,
        probability_unsafe: probUnsafe,
        tier: tier.tier,
        tier_label: tier.tier_label,
        tier_color: tier.tier_color,
      };
    });

    return NextResponse.json({
      status: 'success',
      predictions: results,
      safety_distribution: {
        safe_count: safeCount,
        screening_count: screeningCount,
        unsafe_count: unsafeCount,
        total: results.length,
      },
    });
  } catch (err: any) {
    console.error('Prediction error:', err);
    return NextResponse.json({ status: 'error', error: `Internal prediction error: ${err.message}` }, { status: 500 });
  }
}
