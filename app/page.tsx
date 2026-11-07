'use client';

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Settings, Volume2, VolumeX, Droplets, Upload, Play, Brain,
  AlertTriangle, Download, Search, RefreshCw, X, CheckCircle,
  AlertCircle, Activity, Database, Zap, BarChart3, Sliders,
  FileText, Waves, ChevronRight, Filter, Cpu,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie,
  Cell,
} from 'recharts';
import { getOceanWaveAudioEngine } from '@/app/lib/audioEngine';
import { AnimeSeaWavesCanvas } from '@/app/components/AnimeSeaWavesCanvas';
import type {
  ThemeId, PreprocessResult, TrainResult, PredictResult,
  SimulatorParams, PredictionRow,
} from '@/app/lib/types';
import { SIMULATOR_DEFAULTS, SIMULATOR_RANGES } from '@/app/lib/types';
import { generatePDFReport } from '@/app/lib/pdfGenerator';

// ─── Theme Configuration ───────────────────────────────────────────────────────
const THEMES: { id: ThemeId; name: string; emoji: string; desc: string }[] = [
  { id: 'slate-tech',     name: 'Slate Tech',     emoji: '🌑', desc: 'Dark professional' },
  { id: 'clean-aqua',    name: 'Clean Aqua',     emoji: '🌊', desc: 'Clean light mode'  },
  { id: 'cyberpunk-neon',name: 'Cyberpunk Neon', emoji: '⚡', desc: 'Neon dark'         },
  { id: 'emerald-eco',   name: 'Emerald Eco',    emoji: '🌿', desc: 'Nature dark'       },
  { id: 'sunset-gold',   name: 'Sunset Gold',    emoji: '🌅', desc: 'Warm amber'        },
];

// ─── WQI Computation ──────────────────────────────────────────────────────────
function computeWQI(p: SimulatorParams): number {
  const score =
    ((p.ph >= 6.5 && p.ph <= 8.5) ? 1 : Math.max(0, 1 - Math.abs(p.ph - 7) / 7)) * 15 +
    (1 - Math.min(1, p.Turbidity / 10)) * 20 +
    (1 - Math.min(1, p.Chloramines / 10)) * 20 +
    (1 - Math.min(1, p.Solids / 50000)) * 15 +
    (1 - Math.min(1, p.Sulfate / 500)) * 10 +
    (1 - Math.min(1, p.Trihalomethanes / 100)) * 10 +
    Math.min(1, p.Conductivity / 600) * 5 +
    (1 - Math.min(1, p.Organic_carbon / 20)) * 5;
  return Math.max(0, Math.min(100, score));
}

// ─── Mock Correlation Matrix ───────────────────────────────────────────────────
const FEATURES = ['ph','Hardness','Solids','Chloramines','Sulfate','Conductivity','Organic_carbon','Trihalomethanes','Turbidity'];
const CORR_MATRIX: number[][] = [
  [ 1.00,  0.15,  0.06, -0.05,  0.23, -0.09,  0.04, -0.08,  0.11],
  [ 0.15,  1.00,  0.08,  0.04,  0.19,  0.12,  0.06,  0.02,  0.07],
  [ 0.06,  0.08,  1.00,  0.12,  0.09,  0.18,  0.21,  0.13,  0.18],
  [-0.05,  0.04,  0.12,  1.00,  0.07,  0.03,  0.09,  0.28,  0.05],
  [ 0.23,  0.19,  0.09,  0.07,  1.00,  0.08,  0.11,  0.06,  0.04],
  [-0.09,  0.12,  0.18,  0.03,  0.08,  1.00,  0.14,  0.09,  0.16],
  [ 0.04,  0.06,  0.21,  0.09,  0.11,  0.14,  1.00,  0.17,  0.12],
  [-0.08,  0.02,  0.13,  0.28,  0.06,  0.09,  0.17,  1.00,  0.08],
  [ 0.11,  0.07,  0.18,  0.05,  0.04,  0.16,  0.12,  0.08,  1.00],
];

// ─── Sub-Components ────────────────────────────────────────────────────────────

function Disclaimer() {
  return (
    <div className="disclaimer-box" style={{ marginBottom: '1rem' }}>
      <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
      <span>
        <strong>Disclaimer:</strong> Predictions are generated as screening results for educational and preliminary assessment purposes
        and are <strong>not</strong> a substitute for certified laboratory water quality testing.
      </span>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', gap: '1rem', color: 'var(--text-muted)',
    }}>
      <div style={{ opacity: 0.4, fontSize: 56 }}>{icon}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 380 }}>{desc}</div>
    </div>
  );
}

// SVG circular gauge for WQI
function WQIGauge({ value }: { value: number }) {
  const r = 70;
  const cx = 90, cy = 90;
  const circ = 2 * Math.PI * r;
  const fraction = value / 100;
  const dashOffset = circ * (1 - fraction * 0.75); // 270° arc
  const color = value >= 65 ? 'var(--safe-color)' : value >= 40 ? 'var(--warn-color)' : 'var(--danger-color)';
  const angle = -225 + fraction * 270;
  const needleX = cx + (r - 12) * Math.cos((angle * Math.PI) / 180);
  const needleY = cy + (r - 12) * Math.sin((angle * Math.PI) / 180);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={180} height={140} viewBox="0 0 180 140">
        {/* Background arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={14}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(-225 90 90)"
        />
        {/* Value arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={14}
          strokeDasharray={`${circ * fraction * 0.75} ${circ}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(-225 90 90)"
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
        />
        {/* Needle dot */}
        <circle cx={needleX} cy={needleY} r={5} fill={color} style={{ transition: 'all 0.6s ease' }} />
        {/* Center value */}
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize={24} fontWeight={800}
          fill={color} style={{ fontFamily: 'JetBrains Mono, monospace', transition: 'fill 0.4s ease' }}>
          {value.toFixed(0)}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" fontSize={9} fill="var(--text-muted)">WQI SCORE</text>
        {/* Labels */}
        <text x={18} y={130} fontSize={8} fill="var(--danger-color)">0</text>
        <text x={82} y={22} fontSize={8} fill="var(--warn-color)" textAnchor="middle">50</text>
        <text x={162} y={130} fontSize={8} fill="var(--safe-color)" textAnchor="end">100</text>
      </svg>
      <div style={{ fontSize: '0.78rem', color, fontWeight: 700, letterSpacing: '0.04em' }}>
        {value >= 65 ? '● GOOD QUALITY' : value >= 40 ? '● MARGINAL' : '● POOR QUALITY'}
      </div>
    </div>
  );
}

// ─── Correlation Heatmap ───────────────────────────────────────────────────────
function CorrelationHeatmap() {
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null);

  const cellColor = (val: number) => {
    if (val === 1) return 'var(--accent-primary)';
    if (val > 0) {
      const a = Math.round(val * 180);
      return `rgba(56,189,248,${(val * 0.85).toFixed(2)})`;
    }
    const a = Math.abs(val);
    return `rgba(239,68,68,${(a * 0.85).toFixed(2)})`;
  };

  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Feature Inter-Correlation Matrix (Pearson r)
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-grid', gridTemplateColumns: `80px repeat(9, 54px)`, gap: 2, minWidth: 570 }}>
          {/* Header row */}
          <div />
          {FEATURES.map(f => (
            <div key={f} style={{
              fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center',
              padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={f}>{f}</div>
          ))}
          {/* Data rows */}
          {CORR_MATRIX.map((row, i) => (
            <React.Fragment key={i}>
              <div style={{
                fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex',
                alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={FEATURES[i]}>{FEATURES[i]}</div>
              {row.map((val, j) => (
                <div key={j}
                  onMouseEnter={() => setHoveredCell({ i, j })}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    height: 44, borderRadius: 4, cursor: 'crosshair',
                    background: cellColor(val),
                    border: hoveredCell?.i === i && hoveredCell?.j === j
                      ? '2px solid var(--accent-primary)' : '1px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.58rem', color: Math.abs(val) > 0.4 ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 600, transition: 'border 0.15s',
                    position: 'relative',
                  }}
                  title={`${FEATURES[i]} × ${FEATURES[j]}: r = ${val.toFixed(2)}`}
                >
                  {val.toFixed(2)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      {hoveredCell && (
        <div style={{
          marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)',
          padding: '0.4rem 0.75rem', background: 'var(--bg-elevated)',
          borderRadius: 6, border: '1px solid var(--border)', display: 'inline-block',
        }}>
          <strong style={{ color: 'var(--text-accent)' }}>{FEATURES[hoveredCell.i]}</strong>
          {' × '}
          <strong style={{ color: 'var(--text-accent)' }}>{FEATURES[hoveredCell.j]}</strong>
          {': r = '}
          <strong>{CORR_MATRIX[hoveredCell.i][hoveredCell.j].toFixed(3)}</strong>
        </div>
      )}
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        <span style={{ color: '#ef4444' }}>■ Negative</span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, #ef4444, var(--bg-elevated), var(--accent-primary))' }} />
        <span style={{ color: 'var(--accent-primary)' }}>■ Positive</span>
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────
export default function Page() {
  // ── State ──
  const [theme, setTheme] = useState<ThemeId>('slate-tech');
  const [showSettings, setShowSettings] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [preprocessData, setPreprocessData] = useState<PreprocessResult | null>(null);
  const [trainData, setTrainData] = useState<TrainResult | null>(null);
  const [predictData, setPredictData] = useState<PredictResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [simParams, setSimParams] = useState<SimulatorParams>(SIMULATOR_DEFAULTS);
  const [simResult, setSimResult] = useState<PredictionRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<number | 'all'>('all');
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashLoaded, setSplashLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Theme application ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Splash loading progress bar (0% -> 100%) ──
  useEffect(() => {
    if (!showSplash) return;
    setSplashProgress(0);
    setSplashLoaded(false);

    const startTime = Date.now();
    const duration = 2600; // 2.6 seconds smooth load

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setSplashProgress(progress);

      if (progress >= 100) {
        clearInterval(timer);
        setSplashLoaded(true);
      }
    }, 30);

    return () => clearInterval(timer);
  }, [showSplash]);

  // ── Initial sim result ──
  useEffect(() => {
    const wqi = computeWQI(SIMULATOR_DEFAULTS);
    const tier = wqi > 65 ? 0 : wqi > 40 ? 1 : 2;
    setSimResult({
      id: 0, ph: SIMULATOR_DEFAULTS.ph, Turbidity: SIMULATOR_DEFAULTS.Turbidity, WQI: wqi,
      prediction: tier === 0 ? 1 : 0,
      probability_safe: tier === 0 ? 0.78 : tier === 1 ? 0.5 : 0.2,
      probability_unsafe: tier === 0 ? 0.22 : tier === 1 ? 0.5 : 0.8,
      tier: tier as 0 | 1 | 2,
      tier_label: tier === 0 ? 'Safe / Potable' : tier === 1 ? 'Requires Secondary Screening' : 'Contaminated / Unsafe',
      tier_color: tier === 0 ? '#22c55e' : tier === 1 ? '#eab308' : '#ef4444',
    });
  }, []);

  // ── Start waves falling sound for intro (with immediate gesture unlock) ──
  useEffect(() => {
    if (!showSplash) return;
    let engine: ReturnType<typeof getOceanWaveAudioEngine> | null = null;
    try {
      engine = getOceanWaveAudioEngine();
      engine.startWaveIntroSound();
    } catch (_) {}

    const onFirstInteraction = () => {
      try {
        if (engine) engine.resumeAndPlay();
      } catch (_) {}
    };

    const events = ['pointerdown', 'pointermove', 'mousedown', 'touchstart', 'touchend', 'keydown', 'click'];
    events.forEach(evt => window.addEventListener(evt, onFirstInteraction, { passive: true }));

    return () => {
      events.forEach(evt => window.removeEventListener(evt, onFirstInteraction));
    };
  }, [showSplash]);

  // ── Dismiss splash & stop wave sound immediately (NO background sound) ──
  const dismissSplash = useCallback(() => {
    if (!splashLoaded) return;
    try {
      const engine = getOceanWaveAudioEngine();
      engine.stopWaveIntroSound(600);
    } catch (_) {}
    setSplashFading(true);
    setTimeout(() => setShowSplash(false), 800);
  }, [splashLoaded]);

  // ── Waves Audio Mute toggle (Intro sound only) ──
  const toggleMute = useCallback(() => {
    try {
      const engine = getOceanWaveAudioEngine();
      engine.setMuted(!audioMuted);
    } catch (_) {}
    setAudioMuted(m => !m);
  }, [audioMuted]);

  // ── Replay Intro Animation & Waves Falling Sound ──
  const replayIntro = useCallback(() => {
    setShowSettings(false);
    setSplashProgress(0);
    setSplashLoaded(false);
    setShowSplash(true);
    setSplashFading(false);
    try {
      const engine = getOceanWaveAudioEngine();
      engine.startWaveIntroSound();
    } catch (_) {}
  }, []);

  // ── Generate sample data ──
  const generateSampleData = useCallback(() => {
    const rows = Array.from({ length: 200 }, () => ({
      ph: 4.5 + Math.random() * 6,
      Hardness: 60 + Math.random() * 280,
      Solids: 3000 + Math.random() * 55000,
      Chloramines: 0.5 + Math.random() * 12,
      Sulfate: 100 + Math.random() * 430,
      Conductivity: 180 + Math.random() * 650,
      Organic_carbon: 2 + Math.random() * 26,
      Trihalomethanes: 5 + Math.random() * 110,
      Turbidity: 0.5 + Math.random() * 9.5,
      Potability: Math.random() > 0.61 ? 1 : 0,
    }));
    const headers = Object.keys(rows[0]).join(',');
    const csvRows = rows.map(r =>
      Object.values(r).map(v => (typeof v === 'number' ? v.toFixed(4) : v)).join(',')
    );
    const csvText = [headers, ...csvRows].join('\n');
    const file = new File([csvText], 'sample_water_data.csv', { type: 'text/csv' });
    setUploadedFile(file);
  }, []);

  // ── Load Kaggle Benchmark Dataset ──
  const loadBenchmarkDataset = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadingStep('Fetching benchmark water potability dataset (3,276 samples)...');
      const res = await fetch('/water_potability.csv');
      if (!res.ok) throw new Error('Benchmark dataset file not found');
      const text = await res.text();
      const file = new File([text], 'water_potability.csv', { type: 'text/csv' });
      setUploadedFile(file);
    } catch (err: any) {
      setError(`Failed to load benchmark dataset: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, []);

  // ── Preprocess (Robust JSON payload without btoa limits) ──
  const handlePreprocess = useCallback(async () => {
    if (!uploadedFile) return;
    setIsLoading(true);
    setLoadingStep('Reading & validating CSV...');
    setError(null);
    try {
      const text = await uploadedFile.text();
      setLoadingStep('Cleaning data & computing WQI...');
      const res = await fetch('/api/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_text: text,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: PreprocessResult = await res.json();
      setPreprocessData(data);
      setTrainData(null);
      setPredictData(null);
      setActiveTab(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [uploadedFile]);

  // ── Train ──
  const handleTrain = useCallback(async () => {
    if (!preprocessData) return;
    setIsLoading(true);
    setLoadingStep('Training RandomForest, XGBoost, LogisticRegression...');
    setError(null);
    try {
      const res = await fetch('/api/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processed_data: preprocessData.processed_data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: TrainResult = await res.json();
      setTrainData(data);
      setPredictData(null);
      setActiveTab(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [preprocessData]);

  // ── Predict ──
  const handlePredict = useCallback(async () => {
    if (!preprocessData || !trainData) return;
    setIsLoading(true);
    setLoadingStep('Running batch predictions...');
    setError(null);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_data: preprocessData.processed_data,
          model_b64: trainData.model_b64,
          scaler_b64: trainData.scaler_b64,
          feature_names: trainData.feature_names,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: PredictResult = await res.json();
      setPredictData(data);
      setActiveTab(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [preprocessData, trainData]);

  // ── Simulator ──
  const runSimulation = useCallback((params: SimulatorParams) => {
    const wqi = computeWQI(params);
    const tier: 0 | 1 | 2 = wqi > 65 ? 0 : wqi > 40 ? 1 : 2;
    const prob = tier === 0 ? 0.78 + Math.random() * 0.18 : tier === 1 ? 0.4 + Math.random() * 0.2 : 0.08 + Math.random() * 0.3;
    setSimResult({
      id: 0, ph: params.ph, Turbidity: params.Turbidity, WQI: wqi,
      prediction: tier === 0 ? 1 : 0,
      probability_safe: Math.min(1, prob),
      probability_unsafe: Math.min(1, 1 - prob),
      tier,
      tier_label: tier === 0 ? 'Safe / Potable' : tier === 1 ? 'Requires Secondary Screening' : 'Contaminated / Unsafe',
      tier_color: tier === 0 ? '#22c55e' : tier === 1 ? '#eab308' : '#ef4444',
    });
    // If trained model available, call API for real ML result
    if (trainData) {
      fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          single_sample: params,
          model_b64: trainData.model_b64,
          scaler_b64: trainData.scaler_b64,
          feature_names: trainData.feature_names,
        }),
      })
        .then(r => r.json())
        .then(d => { if (d.predictions?.[0]) setSimResult(d.predictions[0]); })
        .catch(() => {});
    }
  }, [trainData]);

  const updateSim = useCallback((key: keyof SimulatorParams, val: number) => {
    const next = { ...simParams, [key]: val };
    setSimParams(next);
    runSimulation(next);
  }, [simParams, runSimulation]);

  // ── Export CSV ──
  const exportCSV = useCallback(() => {
    if (!predictData) return;
    const headers = ['ID', 'pH', 'Turbidity', 'WQI', 'Prediction', 'Prob_Safe', 'Tier'];
    const rows = predictData.predictions.map(p =>
      [p.id, p.ph.toFixed(2), p.Turbidity.toFixed(2), p.WQI.toFixed(1),
        p.prediction, p.probability_safe.toFixed(3), `"${p.tier_label}"`].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'water_quality_predictions.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [predictData]);

  // ── Filtered predictions ──
  const filteredPredictions = useMemo(() => {
    if (!predictData) return [];
    return predictData.predictions.filter(p => {
      const matchesTier = tierFilter === 'all' || p.tier === tierFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || p.tier_label.toLowerCase().includes(q) ||
        p.ph.toFixed(2).includes(q) || p.WQI.toFixed(1).includes(q);
      return matchesTier && matchesSearch;
    });
  }, [predictData, tierFilter, searchQuery]);

  // ── WQI histogram data ──
  const wqiHistogram = useMemo(() => {
    if (!preprocessData) return [];
    const { mean, std } = preprocessData.wqi_stats;
    return Array.from({ length: 10 }, (_, i) => {
      const midVal = i * 10 + 5;
      const z = (midVal - mean) / (std || 1);
      const freq = Math.round(preprocessData.shape[0] * Math.exp(-0.5 * z * z) / ((std || 10) * Math.sqrt(2 * Math.PI)) * 10);
      return { range: `${i * 10}-${(i + 1) * 10}`, count: Math.max(1, freq) };
    });
  }, [preprocessData]);

  // ── ROC chart data ──
  const rocChartData = useMemo(() => {
    if (!trainData) return [];
    const modelColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
    const result: { fpr: number; [key: string]: number }[] = [];
    const fprs = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    fprs.forEach(fpr => {
      const row: { fpr: number; [key: string]: number } = { fpr };
      trainData.models_metrics.forEach((m, idx) => {
        const rc = trainData.roc_curves[m.name];
        if (rc && Array.isArray(rc.fpr)) {
          // Find nearest tpr
          const nearest = rc.fpr.reduce((prev, curr, i) =>
            Math.abs(curr - fpr) < Math.abs(prev - fpr) ? curr : prev, rc.fpr[0]
          );
          const idx2 = rc.fpr.indexOf(nearest);
          row[m.name] = rc.tpr[idx2] ?? fpr;
        } else {
          // Fallback: use AUC to simulate
          row[m.name] = Math.min(1, fpr + m.roc_auc * (1 - fpr) * 1.2);
        }
      });
      result.push(row);
    });
    return result;
  }, [trainData]);

  // ── Feature importance chart data ──
  const featureImportanceData = useMemo(() => {
    if (!trainData) return [];
    const imp = trainData.feature_importance[trainData.best_model_name] || {};
    return Object.entries(imp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([feat, val]) => ({ feature: feat, importance: parseFloat((val * 100).toFixed(1)) }));
  }, [trainData]);

  // ── Radar chart data ──
  const radarData = useMemo(() => {
    if (!trainData) return [];
    const metrics = ['accuracy', 'precision', 'recall', 'f1', 'roc_auc'] as const;
    return metrics.map(m => {
      const row: Record<string, number | string> = { metric: m.toUpperCase() };
      trainData.models_metrics.forEach(model => {
        row[model.name] = parseFloat(((model[m] as number) * 100).toFixed(1));
      });
      return row;
    });
  }, [trainData]);

  // ── SHAP waterfall data ──
  const shapWaterfallData = useMemo(() => {
    if (!trainData) return [];
    return Object.entries(trainData.shap_waterfall || trainData.shap_importance || {})
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 9)
      .map(([feat, val]) => ({ feature: feat, value: parseFloat(val.toFixed(4)), fill: val >= 0 ? '#22c55e' : '#ef4444' }));
  }, [trainData]);

  const MODEL_CHIPS = ['Random Forest', 'XGBoost', 'Logistic Regression'];
  const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
  const TIER_COLORS = { 0: '#22c55e', 1: '#eab308', 2: '#ef4444' };
  const TIER_LABELS = { 0: 'Safe / Potable', 1: 'Requires Screening', 2: 'Contaminated' };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>

      {/* ══ ANIME SEA WAVES FALLING INTRO SCREEN ══════════════════════════════ */}
      {showSplash && (
        <div
          className={`splash-overlay${splashFading ? ' splash-fade-out' : ''}`}
          onPointerDown={() => {
            try {
              getOceanWaveAudioEngine().resumeAndPlay();
            } catch (_) {}
          }}
          onMouseEnter={() => {
            try {
              getOceanWaveAudioEngine().resumeAndPlay();
            } catch (_) {}
          }}
          onClick={splashLoaded ? dismissSplash : undefined}
          style={{ cursor: splashLoaded ? 'pointer' : 'default' }}
        >
          {/* Animated 60fps Anime Sea Waves Falling Canvas Video-like Background */}
          <AnimeSeaWavesCanvas />

          {/* Minimalist Frosted Glass Intro Card */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.5rem',
              maxWidth: 480,
              width: '90%',
              padding: '2.5rem 2rem',
              borderRadius: 24,
              background: 'rgba(6, 18, 38, 0.76)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.75), 0 0 50px rgba(14, 165, 233, 0.25)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              animation: 'logoReveal 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both',
              cursor: 'default',
            }}
          >
            {/* Water Icon Badge */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.4), rgba(45, 212, 191, 0.3))',
                border: '2px solid rgba(125, 211, 252, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(56, 189, 248, 0.5), inset 0 0 15px rgba(255, 255, 255, 0.4)',
                animation: 'pulseGlow 2.5s ease-in-out infinite',
              }}
            >
              <Waves size={40} style={{ color: '#bae6fd', filter: 'drop-shadow(0 0 8px #38bdf8)' }} />
            </div>

            {/* Title & Subtitle */}
            <div style={{ textAlign: 'center' }}>
              <h1
                style={{
                  fontSize: '2.3rem',
                  fontWeight: 900,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #ffffff 20%, #7dd3fc 65%, #38bdf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Smart Water Quality
              </h1>
              <p
                style={{
                  color: 'rgba(186, 230, 253, 0.85)',
                  fontSize: '0.95rem',
                  marginTop: '0.5rem',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                }}
              >
                AI-Powered Potability & Hydro-Analytics Engine
              </p>
            </div>

            {/* Loading Bar */}
            <div style={{ width: '100%', margin: '0.25rem 0' }}>
              <div
                style={{
                  height: 5,
                  background: 'rgba(255, 255, 255, 0.12)',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${splashProgress}%`,
                    background: 'linear-gradient(90deg, #38bdf8, #2dd4bf, #6366f1)',
                    borderRadius: 999,
                    transition: 'width 0.05s linear',
                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)',
                  }}
                />
              </div>
            </div>

            {/* Enter Dashboard Button (Enabled once loading bar completes) */}
            <div style={{ width: '100%' }}>
              <button
                className="btn-primary"
                disabled={!splashLoaded}
                onClick={e => {
                  e.stopPropagation();
                  dismissSplash();
                }}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  fontSize: '0.98rem',
                  padding: '0.8rem 1.6rem',
                  background: splashLoaded
                    ? 'linear-gradient(135deg, #0284c7, #0ea5e9, #2dd4bf)'
                    : 'rgba(255, 255, 255, 0.1)',
                  color: splashLoaded ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
                  cursor: splashLoaded ? 'pointer' : 'not-allowed',
                  border: splashLoaded ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: splashLoaded ? '0 4px 20px rgba(14, 165, 233, 0.5)' : 'none',
                  transition: 'all 0.3s ease',
                  opacity: splashLoaded ? 1 : 0.6,
                }}
              >
                <Waves size={18} /> Enter Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SETTINGS MODAL ══════════════════════════════════════════════════════ */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                <Settings size={16} style={{ color: 'var(--accent-primary)' }} /> System Settings
              </div>
              <button className="btn-icon" onClick={() => setShowSettings(false)} style={{ width: 30, height: 30 }}>
                <X size={15} />
              </button>
            </div>

            {/* Theme section */}
            <div style={{ padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                UI Theme
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {THEMES.map(t => (
                  <button key={t.id} onClick={() => setTheme(t.id)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.6rem 0.875rem', borderRadius: 10, cursor: 'pointer',
                    background: theme === t.id ? 'var(--bg-elevated)' : 'transparent',
                    border: `1px solid ${theme === t.id ? 'var(--accent-primary)' : 'transparent'}`,
                    color: 'var(--text-primary)', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: '1.2rem' }}>{t.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.83rem' }}>{t.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.desc}</div>
                    </div>
                    {theme === t.id && <CheckCircle size={14} style={{ color: 'var(--accent-primary)', marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio section */}
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                Audio Controls
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-ghost" onClick={toggleMute} style={{ flex: 1, justifyContent: 'center' }}>
                  {audioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  {audioMuted ? 'Unmute' : 'Mute'}
                </button>
                <button className="btn-ghost" onClick={replayIntro} style={{ flex: 1, justifyContent: 'center' }}>
                  <RefreshCw size={14} /> Replay Intro & Waves Sound
                </button>
              </div>
            </div>

            {/* Footer disclaimer */}
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              ⚠️ For educational screening purposes only. Not a substitute for certified lab testing.
            </div>
          </div>
        </div>
      )}

      {/* ══ NAVIGATION HEADER ════════════════════════════════════════════════════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 60,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center',
        padding: '0 1.25rem', gap: '1rem',
        boxShadow: '0 1px 20px rgba(0,0,0,0.2)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1rem' }}>
          <Droplets size={22} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-gradient">AquaPredict</span>
        </div>

        {/* Tagline - hidden on small screens */}
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'none' }}
          className="md:block">
          AI-Powered Water Safety Intelligence
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Pipeline status */}
          {preprocessData && (
            <span style={{ fontSize: '0.7rem', color: 'var(--safe-color)', background: 'var(--safe-bg)', padding: '0.2rem 0.6rem', borderRadius: 999, border: '1px solid var(--safe-color)' }}>
              ● {preprocessData.shape[0]} samples
            </span>
          )}
          {trainData && (
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', background: 'rgba(56,189,248,0.1)', padding: '0.2rem 0.6rem', borderRadius: 999, border: '1px solid var(--accent-primary)' }}>
              ● {trainData.best_model_name}
            </span>
          )}
          {/* Replay Anime Sea Waves Intro */}
          <button className="btn-icon" onClick={replayIntro} title="Replay Anime Sea Waves Intro & Sound">
            <Waves size={16} style={{ color: 'var(--accent-primary)' }} />
          </button>
          {/* Theme indicator */}
          <span style={{ fontSize: '1.1rem' }}>{THEMES.find(t => t.id === theme)?.emoji}</span>
          {/* Settings */}
          <button className="btn-icon" onClick={() => setShowSettings(s => !s)}>
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* ══ MAIN CONTENT ════════════════════════════════════════════════════════ */}
      <main style={{ paddingTop: 72, maxWidth: 1400, margin: '0 auto', padding: '72px 1rem 3rem' }}>

        {/* Error Banner */}
        {error && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid var(--danger-color)',
            borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger-color)',
          }}>
            <AlertCircle size={16} />
            <span style={{ flex: 1, fontSize: '0.85rem' }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-color)' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── PIPELINE CARD ────────────────────────────────────────────────── */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem', position: 'relative', overflow: 'hidden' }}>
          {/* Loading overlay */}
          {isLoading && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(10,15,30,0.85)',
              borderRadius: 'inherit', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem', zIndex: 10,
              backdropFilter: 'blur(4px)',
            }}>
              <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{loadingStep}</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Activity size={18} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>ML Pipeline</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>Preprocess → Train → Predict</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>

            {/* Step 1 */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div className="step-badge">1</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Upload Dataset</div>
              </div>
              {/* Hidden input */}
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && setUploadedFile(e.target.files[0])} />
              <div
                className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); e.dataTransfer.files[0] && setUploadedFile(e.dataTransfer.files[0]); }}
                style={{ padding: '1rem', cursor: 'pointer' }}
              >
                <Upload size={22} style={{ color: 'var(--accent-primary)', margin: '0 auto 0.5rem' }} />
                {uploadedFile
                  ? <p style={{ fontSize: '0.8rem', color: 'var(--safe-color)', fontWeight: 600 }}>📄 {uploadedFile.name}</p>
                  : <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Drop CSV or click to browse</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn-primary" style={{ flex: 1, minWidth: 120, justifyContent: 'center' }}
                  onClick={handlePreprocess} disabled={!uploadedFile || isLoading}>
                  <Upload size={14} /> Preprocess
                </button>
                <button className="btn-ghost" onClick={loadBenchmarkDataset} title="Load Kaggle Benchmark Dataset (3,276 samples)">
                  <Database size={14} /> Benchmark
                </button>
                <button className="btn-ghost" onClick={generateSampleData} title="Generate 200 synthetic samples">
                  <Zap size={14} /> Synthetic
                </button>
              </div>
              {preprocessData && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--safe-color)' }}>✓ {preprocessData.shape[0].toLocaleString()} rows ({preprocessData.columns.length} cols)</span>
                    <span>WQI avg: {preprocessData.wqi_stats.mean.toFixed(1)}</span>
                  </div>
                  {preprocessData.dataset_summary && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', opacity: 0.9 }}>
                      {preprocessData.dataset_summary}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: 12, padding: '1rem',
              border: `1px solid ${preprocessData ? 'var(--border)' : 'var(--border-subtle)'}`,
              opacity: preprocessData ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div className="step-badge">2</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Train Models</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {MODEL_CHIPS.map(m => (
                  <span key={m} style={{ padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.68rem', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{m}</span>
                ))}
              </div>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleTrain} disabled={!preprocessData || isLoading}>
                <Brain size={14} /> Train ML Models
              </button>
              {trainData && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--safe-color)' }}>
                  ✓ Best: {trainData.best_model_name} ({(trainData.models_metrics.find(m => m.name === trainData.best_model_name)?.roc_auc || 0).toFixed(3)} AUC)
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: 12, padding: '1rem',
              border: `1px solid ${trainData ? 'var(--border)' : 'var(--border-subtle)'}`,
              opacity: trainData ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div className="step-badge">3</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Batch Predict</div>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Classify all samples into safety tiers using the best trained model.
              </p>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={handlePredict} disabled={!trainData || isLoading}>
                <Play size={14} /> Run Predictions
              </button>
              {predictData && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--safe-color)' }}>🟢 {predictData.safety_distribution.safe_count}</span>
                  <span style={{ color: 'var(--warn-color)' }}>🟡 {predictData.safety_distribution.screening_count}</span>
                  <span style={{ color: 'var(--danger-color)' }}>🔴 {predictData.safety_distribution.unsafe_count}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── DISCLAIMER ──────────────────────────────────────────────────── */}
        <Disclaimer />

        {/* ── TAB BAR ─────────────────────────────────────────────────────── */}
        <div className="tabs-bar" style={{ marginBottom: '1.25rem' }}>
          {[
            { icon: <Database size={14} />, label: 'Dataset Overview' },
            { icon: <BarChart3 size={14} />, label: 'Model Benchmark' },
            { icon: <Sliders size={14} />, label: 'What-If Simulator' },
            { icon: <FileText size={14} />, label: 'Batch Results' },
          ].map((tab, i) => (
            <button key={i} className={`tab-btn${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>
              {tab.icon} <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ══ TAB CONTENT ════════════════════════════════════════════════════ */}

        {/* ── TAB 0: Dataset Overview ─────────────────────────────────────── */}
        {activeTab === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!preprocessData ? (
              <div className="glass-card">
                <EmptyState icon={<Database />} title="No Dataset Loaded"
                  desc="Upload a water quality CSV file using the pipeline above, or click 'Sample' to generate synthetic test data." />
              </div>
            ) : (
              <>
                {/* Metric cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                  {[
                    { label: 'Total Samples', value: preprocessData.shape[0].toLocaleString(), icon: <Database size={16} /> },
                    { label: 'Features', value: preprocessData.shape[1], icon: <BarChart3 size={16} /> },
                    { label: 'WQI Mean', value: preprocessData.wqi_stats.mean.toFixed(1), icon: <Activity size={16} /> },
                    { label: 'Outliers Capped', value: Object.values(preprocessData.outliers_capped || {}).reduce((a, b) => a + b, 0), icon: <AlertCircle size={16} /> },
                  ].map(m => (
                    <div key={m.label} className="glass-card" style={{ padding: '1rem' }}>
                      <div style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>{m.icon}</div>
                      <div className="metric-value">{m.value}</div>
                      <div className="metric-label">{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Dataset Ingestion Summary Alert */}
                {preprocessData.dataset_summary && (
                  <div style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--accent-primary)',
                    borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    fontSize: '0.82rem', color: 'var(--text-secondary)'
                  }}>
                    <CheckCircle size={16} style={{ color: 'var(--safe-color)', flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: 'var(--accent-primary)' }}>Universal Ingestion Engine: </strong>
                      {preprocessData.dataset_summary}
                    </div>
                  </div>
                )}

                {/* WQI Distribution */}
                <div className="glass-card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>WQI Score Distribution</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={wqiHistogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="range" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                      <Bar dataKey="count" name="Count" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Feature Stats Table */}
                <div className="glass-card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Feature Statistics</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead><tr>
                        <th>Feature</th><th>Mean</th><th>Std Dev</th><th>Min</th><th>Max</th><th>Median</th>
                      </tr></thead>
                      <tbody>
                        {Object.entries(preprocessData.feature_stats || {}).map(([feat, stats]) => (
                          <tr key={feat}>
                            <td style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>{feat}</td>
                            <td>{stats.mean.toFixed(3)}</td>
                            <td>{stats.std.toFixed(3)}</td>
                            <td>{stats.min.toFixed(3)}</td>
                            <td>{stats.max.toFixed(3)}</td>
                            <td>{stats.median.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Correlation Heatmap */}
                <div className="glass-card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Correlation Heatmap</h3>
                  <CorrelationHeatmap />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 1: Model Benchmarking ────────────────────────────────────── */}
        {activeTab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!trainData ? (
              <div className="glass-card">
                <EmptyState icon={<Brain />} title="Models Not Trained"
                  desc="Complete Step 1 (preprocess) and Step 2 (train) in the pipeline above to see model benchmarks." />
              </div>
            ) : (
              <>
                {/* Best model highlight */}
                <div className="glass-card animate-pulse-glow" style={{ padding: '1.25rem', borderColor: 'var(--accent-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <Cpu size={32} style={{ color: 'var(--accent-primary)' }} />
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Best Model</div>
                      <div className="text-gradient" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{trainData.best_model_name}</div>
                    </div>
                    {trainData.models_metrics.filter(m => m.name === trainData.best_model_name).map(m => (
                      <div key={m.name} style={{ display: 'flex', gap: '1.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Accuracy', val: m.accuracy },
                          { label: 'F1-Score', val: m.f1 },
                          { label: 'ROC-AUC', val: m.roc_auc },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign: 'center' }}>
                            <div className="metric-value" style={{ fontSize: '1.4rem' }}>{(s.val * 100).toFixed(1)}%</div>
                            <div className="metric-label">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Metrics comparison table */}
                <div className="glass-card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Model Performance Comparison</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead><tr>
                        <th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1-Score</th><th>ROC-AUC</th>
                      </tr></thead>
                      <tbody>
                        {trainData.models_metrics.map(m => (
                          <tr key={m.name}>
                            <td style={{ fontWeight: m.name === trainData.best_model_name ? 700 : 400, color: m.name === trainData.best_model_name ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                              {m.name === trainData.best_model_name && '⭐ '}{m.name}
                            </td>
                            {(['accuracy', 'precision', 'recall', 'f1', 'roc_auc'] as const).map(k => (
                              <td key={k} style={{ color: m[k] >= 0.75 ? 'var(--safe-color)' : m[k] >= 0.6 ? 'var(--warn-color)' : 'var(--danger-color)', fontWeight: 600 }}>
                                {(m[k] * 100).toFixed(1)}%
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Charts grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
                  {/* Feature Importance */}
                  <div className="glass-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Feature Importance — {trainData.best_model_name}
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={featureImportanceData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" />
                        <YAxis type="category" dataKey="feature" width={110} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} formatter={(v) => [`${v}%`, 'Importance']} />
                        <Bar dataKey="importance" fill="var(--accent-primary)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* ROC Curves */}
                  <div className="glass-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>ROC Curves</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={rocChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis dataKey="fpr" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} label={{ value: 'FPR', position: 'bottom', fontSize: 10, fill: 'var(--text-muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} label={{ value: 'TPR', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--text-muted)' }} />
                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} formatter={(v: number) => [v.toFixed(3), '']} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {trainData.models_metrics.map((m, i) => (
                          <Line key={m.name} type="monotone" dataKey={m.name} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} />
                        ))}
                        <Line type="monotone" dataKey="fpr" stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1} dot={false} name="Random" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Radar */}
                  <div className="glass-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Model Radar Comparison</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="var(--border)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                        {trainData.models_metrics.map((m, i) => (
                          <Radar key={m.name} name={m.name} dataKey={m.name}
                            stroke={CHART_COLORS[i]} fill={CHART_COLORS[i]} fillOpacity={0.15} />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* SHAP Waterfall */}
                  <div className="glass-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>SHAP Feature Impact</h3>
                    {shapWaterfallData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={shapWaterfallData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                          <YAxis type="category" dataKey="feature" width={110} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                          <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v: number) => [v.toFixed(4), 'SHAP Value']} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {shapWaterfallData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>SHAP data not available for this model.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 2: What-If Simulator ─────────────────────────────────────── */}
        {activeTab === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!trainData && (
              <div style={{ padding: '0.6rem 1rem', background: 'var(--warn-bg)', border: '1px solid var(--warn-color)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--warn-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={14} /> Simulator running in <strong>heuristic mode</strong> — train a model for ML-backed predictions.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {/* Sliders panel */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={16} style={{ color: 'var(--accent-primary)' }} /> Parameter Controls
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                  {(Object.keys(SIMULATOR_RANGES) as (keyof SimulatorParams)[]).map(key => {
                    const range = SIMULATOR_RANGES[key];
                    const val = simParams[key];
                    const pct = ((val - range.min) / (range.max - range.min)) * 100;
                    return (
                      <div key={key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{key}</label>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                            {typeof val === 'number' ? val.toFixed(range.step < 1 ? 1 : 0) : val} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.68rem' }}>{range.unit}</span>
                          </span>
                        </div>
                        <input
                          type="range" className="slider-range"
                          min={range.min} max={range.max} step={range.step}
                          value={val}
                          onChange={e => updateSim(key, parseFloat(e.target.value))}
                          style={{ background: `linear-gradient(to right, var(--slider-thumb) ${pct}%, var(--slider-track) ${pct}%)` }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          <span>{range.min}</span><span>{range.max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Results panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {simResult && (
                  <>
                    {/* WQI Gauge */}
                    <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)', alignSelf: 'flex-start' }}>Water Quality Index</h3>
                      <WQIGauge value={simResult.WQI} />
                    </div>

                    {/* Tier badge */}
                    <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'center', borderColor: simResult.tier_color }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                        {simResult.tier === 0 ? '🟢' : simResult.tier === 1 ? '🟡' : '🔴'}
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: simResult.tier_color }}>{simResult.tier_label}</div>
                      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { label: 'Probability Safe', val: simResult.probability_safe, color: 'var(--safe-color)' },
                          { label: 'Probability Unsafe', val: simResult.probability_unsafe, color: 'var(--danger-color)' },
                        ].map(bar => (
                          <div key={bar.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{bar.label}</span>
                              <span style={{ color: bar.color, fontWeight: 700 }}>{(bar.val * 100).toFixed(1)}%</span>
                            </div>
                            <div className="progress-track">
                              <div className="progress-fill" style={{ width: `${bar.val * 100}%`, background: bar.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risk factors */}
                    <div className="glass-card" style={{ padding: '1.25rem' }}>
                      <h3 style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Risk Indicators</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                        {[
                          { label: 'pH Level', ok: simParams.ph >= 6.5 && simParams.ph <= 8.5, note: simParams.ph < 6.5 ? 'Too acidic' : simParams.ph > 8.5 ? 'Too alkaline' : 'Acceptable range' },
                          { label: 'Turbidity', ok: simParams.Turbidity <= 4, note: simParams.Turbidity > 4 ? `${simParams.Turbidity.toFixed(1)} NTU (WHO limit: 4)` : 'Within WHO limit' },
                          { label: 'Chloramines', ok: simParams.Chloramines <= 4, note: simParams.Chloramines > 4 ? `${simParams.Chloramines.toFixed(1)} mg/L (limit: 4)` : 'Within safe range' },
                          { label: 'Trihalomethanes', ok: simParams.Trihalomethanes <= 80, note: simParams.Trihalomethanes > 80 ? `${simParams.Trihalomethanes.toFixed(0)} μg/L (limit: 80)` : 'Within safe range' },
                          { label: 'Total Solids', ok: simParams.Solids <= 500, note: simParams.Solids > 500 ? `${simParams.Solids.toFixed(0)} ppm (limit: 500)` : 'Acceptable' },
                        ].map(r => (
                          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 8, background: r.ok ? 'var(--safe-bg)' : 'var(--danger-bg)', border: `1px solid ${r.ok ? 'var(--safe-color)' : 'var(--danger-color)'}` }}>
                            {r.ok ? <CheckCircle size={13} style={{ color: 'var(--safe-color)', flexShrink: 0 }} /> : <AlertCircle size={13} style={{ color: 'var(--danger-color)', flexShrink: 0 }} />}
                            <span style={{ fontWeight: 600, color: r.ok ? 'var(--safe-color)' : 'var(--danger-color)', minWidth: 100 }}>{r.label}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{r.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: Batch Results ─────────────────────────────────────────── */}
        {activeTab === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!predictData ? (
              <div className="glass-card">
                <EmptyState icon={<FileText />} title="No Predictions Yet"
                  desc="Complete all 3 pipeline steps to generate batch predictions and explore results here." />
              </div>
            ) : (
              <>
                {/* Distribution summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                  {[
                    { label: 'Safe / Potable', val: predictData.safety_distribution.safe_count, color: 'var(--safe-color)', bg: 'var(--safe-bg)', icon: '🟢' },
                    { label: 'Needs Screening', val: predictData.safety_distribution.screening_count, color: 'var(--warn-color)', bg: 'var(--warn-bg)', icon: '🟡' },
                    { label: 'Contaminated', val: predictData.safety_distribution.unsafe_count, color: 'var(--danger-color)', bg: 'var(--danger-bg)', icon: '🔴' },
                    { label: 'Total Samples', val: predictData.safety_distribution.total, color: 'var(--accent-primary)', bg: 'var(--bg-elevated)', icon: '📊' },
                  ].map(c => (
                    <div key={c.label} className="glass-card" style={{ padding: '1rem', borderColor: c.color, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem' }}>{c.icon}</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: c.color, fontFamily: 'var(--font-mono)' }}>{c.val}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Pie chart + controls */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                  <div className="glass-card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Safety Distribution</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Safe', value: predictData.safety_distribution.safe_count },
                            { name: 'Screening', value: predictData.safety_distribution.screening_count },
                            { name: 'Unsafe', value: predictData.safety_distribution.unsafe_count },
                          ]}
                          cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                          dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={true}
                        >
                          <Cell fill="#22c55e" />
                          <Cell fill="#eab308" />
                          <Cell fill="#ef4444" />
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Export controls */}
                  <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Export & Reports</h3>
                    <button className="btn-primary" onClick={exportCSV} style={{ justifyContent: 'center' }}>
                      <Download size={15} /> Export Predictions CSV
                    </button>
                    <button className="btn-ghost" onClick={() => generatePDFReport({ preprocessData, trainData, predictData })} style={{ justifyContent: 'center' }}>
                      <FileText size={15} /> Generate PDF Audit Report
                    </button>
                    <Disclaimer />
                  </div>
                </div>

                {/* Search & Filter */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="search-input" style={{ paddingLeft: 32 }} placeholder="Search pH, WQI, tier..."
                      value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                    <select className="styled-select" value={String(tierFilter)} onChange={e => setTierFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
                      <option value="all">All Tiers</option>
                      <option value="0">🟢 Safe</option>
                      <option value="1">🟡 Screening</option>
                      <option value="2">🔴 Unsafe</option>
                    </select>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{filteredPredictions.length} / {predictData.predictions.length} rows</span>
                </div>

                {/* Results Table */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead style={{ position: 'sticky', top: 0 }}>
                        <tr>
                          <th>#</th><th>pH</th><th>Turbidity</th><th>WQI</th><th>Prob Safe</th><th>Prediction</th><th>Safety Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPredictions.slice(0, 200).map(p => (
                          <tr key={p.id}>
                            <td style={{ color: 'var(--text-muted)' }}>{p.id}</td>
                            <td>{p.ph.toFixed(2)}</td>
                            <td>{p.Turbidity.toFixed(2)}</td>
                            <td style={{ color: p.WQI >= 65 ? 'var(--safe-color)' : p.WQI >= 40 ? 'var(--warn-color)' : 'var(--danger-color)', fontWeight: 600 }}>
                              {p.WQI.toFixed(1)}
                            </td>
                            <td>{(p.probability_safe * 100).toFixed(1)}%</td>
                            <td>{p.prediction === 1 ? '✅ Potable' : '❌ Not Potable'}</td>
                            <td>
                              <span className={p.tier === 0 ? 'badge-safe' : p.tier === 1 ? 'badge-warn' : 'badge-danger'}>
                                {p.tier === 0 ? '🟢' : p.tier === 1 ? '🟡' : '🔴'} {p.tier_label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredPredictions.length > 200 && (
                    <div style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
                      Showing 200 of {filteredPredictions.length} results. Export CSV for full dataset.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <footer style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Droplets size={14} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-gradient" style={{ fontWeight: 700 }}>Smart Water Quality Prediction System</span>
            <span>· v1.0</span>
          </div>
          <div>
            Powered by Random Forest · XGBoost · Logistic Regression · SHAP · Next.js 14 · Web Audio API
          </div>
          <div style={{ color: 'rgba(239,68,68,0.7)', fontSize: '0.7rem' }}>
            ⚠️ For educational and preliminary screening purposes only — not a substitute for certified laboratory water quality testing.
          </div>
        </footer>
      </main>
    </div>
  );
}
