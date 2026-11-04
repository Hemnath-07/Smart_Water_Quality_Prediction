/**
 * Smart Water Quality – Ambient Audio Engine
 * Synthesizes calming, flowing ambient music using the Web Audio API.
 * No external audio files required — everything is generated procedurally.
 */

type OscillatorType = 'sine' | 'sawtooth' | 'triangle' | 'square';

interface OscLayer {
  osc: OscillatorNode;
  gain: GainNode;
  freq: number;
}

class WaterAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private layers: OscLayer[] = [];
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private lfoNodes: OscillatorNode[] = [];
  private isPlaying = false;
  private isMuted = false;
  private _timeouts: number[] = [];

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * seconds;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private buildLayer(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    type: OscillatorType,
    gainVal: number,
    lfoFreq: number,
    lfoDepth: number
  ): OscLayer {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    lfo.type = 'sine';
    lfo.frequency.value = lfoFreq;
    lfoGain.gain.value = lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = gainVal;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    lfo.start();
    this.lfoNodes.push(lfo);
    return { osc, gain, freq };
  }

  async play(): Promise<void> {
    if (this.isPlaying) return;
    const ctx = await this.ensureContext();
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 0.55;
    this.masterGain.connect(ctx.destination);

    // Simple reverb via convolver
    const reverb = ctx.createConvolver();
    const reverbBuffer = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = reverbBuffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      }
    }
    reverb.buffer = reverbBuffer;

    const dry = ctx.createGain(); dry.gain.value = 0.65; dry.connect(this.masterGain);
    const wet = ctx.createGain(); wet.gain.value = 0.35; wet.connect(reverb); reverb.connect(this.masterGain);
    const blend = ctx.createGain(); blend.gain.value = 1; blend.connect(dry); blend.connect(wet);

    // Pentatonic Dm pad layers
    const rootFreqs = [146.83, 174.61, 220.0, 261.63, 293.66];
    rootFreqs.forEach((f, i) => {
      this.layers.push(this.buildLayer(ctx, blend, f, 'sine', Math.max(0.03, 0.12 - i * 0.015), 0.05 + i * 0.02, 0.4 + i * 0.1));
    });

    // Sub-bass
    this.layers.push(this.buildLayer(ctx, blend, 73.41, 'triangle', 0.08, 0.03, 0.5));

    // Pink noise water texture
    const noiseBuf = this.createPinkNoiseBuffer(ctx, 5);
    this.noiseNode = ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuf;
    this.noiseNode.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 700;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0.035;
    this.noiseNode.connect(noiseFilter);
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(blend);
    this.noiseNode.start();

    // Chord evolution
    const chords = [
      [146.83, 174.61, 220.0],
      [164.81, 196.00, 246.94],
      [196.00, 233.08, 293.66],
      [174.61, 220.00, 261.63],
    ];
    let chordIdx = 0;
    const advance = () => {
      if (!this.isPlaying) return;
      chordIdx = (chordIdx + 1) % chords.length;
      const now = ctx.currentTime;
      this.layers.slice(0, 3).forEach((layer, i) => {
        layer.osc.frequency.setTargetAtTime(chords[chordIdx][i], now, 4);
      });
      this._timeouts.push(window.setTimeout(advance, 12000 + Math.random() * 6000));
    };
    this._timeouts.push(window.setTimeout(advance, 12000));

    this.isPlaying = true;
  }

  stop(): void {
    this.isPlaying = false;
    try {
      this.layers.forEach(l => { try { l.osc.stop(); } catch (_) {} l.gain.disconnect(); });
      this.lfoNodes.forEach(l => { try { l.stop(); } catch (_) {} });
      try { this.noiseNode?.stop(); } catch (_) {}
      this.masterGain?.disconnect();
    } catch (_) {}
    this.layers = [];
    this.lfoNodes = [];
    this.noiseNode = null;
    this.masterGain = null;
    this._timeouts.forEach(id => window.clearTimeout(id));
    this._timeouts = [];
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, now, 0.3);
    }
  }

  getMuted(): boolean { return this.isMuted; }
  getPlaying(): boolean { return this.isPlaying; }

  async fadeIn(durationMs: number): Promise<void> {
    if (!this.isPlaying) await this.play();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(0.55, this.ctx.currentTime + durationMs / 1000);
    }
  }
}

let engineInstance: WaterAudioEngine | null = null;

export function getAudioEngine(): WaterAudioEngine {
  if (typeof window === 'undefined') throw new Error('AudioEngine: browser only');
  if (!engineInstance) engineInstance = new WaterAudioEngine();
  return engineInstance;
}

export type { WaterAudioEngine };
