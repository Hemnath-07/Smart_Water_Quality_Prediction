/**
 * Smart Water Quality – Anime Sea Waves Falling Intro Audio Engine
 * Procedurally synthesizes the sound of ocean waves swelling, falling, and crashing
 * using the browser's native Web Audio API.
 *
 * IMPORTANT:
 * - This audio engine runs ONLY during the intro screen.
 * - ZERO background audio is played during dashboard/app usage.
 * - Seamlessly unlocks on initial page entrance and on the first interaction.
 * - Fully stops and releases audio nodes when the intro is dismissed.
 */

class OceanWaveAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isWavePlaying = false;
  private isMuted = false;
  private timerIds: number[] = [];
  private noiseSources: AudioBufferSourceNode[] = [];
  private lfoNodes: OscillatorNode[] = [];
  private unlockListenersAttached = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.attachGlobalUnlockListeners();
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {}
    }
    return this.ctx;
  }

  /**
   * Attaches window listeners so that the very first user gesture anywhere
   * (moving the pointer, touching the screen, clicking, or pressing a key)
   * immediately awakens the AudioContext if blocked by browser autoplay policy.
   */
  private attachGlobalUnlockListeners(): void {
    if (this.unlockListenersAttached || typeof window === 'undefined') return;
    this.unlockListenersAttached = true;

    const events = ['pointerdown', 'pointermove', 'click', 'touchstart', 'touchend', 'keydown'];

    const handleUnlock = async () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (_) {}
      }
      if (!this.isWavePlaying && typeof document !== 'undefined' && document.querySelector('.splash-overlay')) {
        await this.startWaveIntroSound();
      }
      if (this.ctx && this.ctx.state === 'running') {
        events.forEach(evt => {
          window.removeEventListener(evt, handleUnlock);
          document.removeEventListener(evt, handleUnlock);
        });
        this.unlockListenersAttached = false;
      }
    };

    events.forEach(evt => {
      window.addEventListener(evt, handleUnlock, { once: false, passive: true });
      document.addEventListener(evt, handleUnlock, { once: false, passive: true });
    });
  }

  /**
   * Generates a 6-second stereo pink/ocean noise buffer.
   * Pink noise rolls off at -3dB/octave, creating the natural warm mass of ocean water.
   */
  private createOceanNoiseBuffer(ctx: AudioContext, seconds = 6): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * seconds;
    const buffer = ctx.createBuffer(2, frameCount, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < frameCount; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.14;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  /**
   * Starts the sea waves falling sound ONLY for the intro.
   */
  async startWaveIntroSound(): Promise<void> {
    try {
      const ctx = await this.ensureContext();

      // If already playing and audio context is running, nothing more needed
      if (this.isWavePlaying && ctx.state === 'running') {
        return;
      }

      // If already initialized but suspended by browser autoplay policy, resume it
      if (this.isWavePlaying && ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (_) {}
        return;
      }

      // Master output node
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      this.masterGain.gain.exponentialRampToValueAtTime(this.isMuted ? 0.0001 : 0.6, ctx.currentTime + 1.2);
      this.masterGain.connect(ctx.destination);

      // Listen for browser autoplay permission changes
      ctx.onstatechange = () => {
        if (ctx.state === 'running' && this.masterGain) {
          const now = ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value || 0.001, now);
          this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0.0001 : 0.6, now + 0.8);
        }
      };

      // Create stereo ocean noise source
      const noiseBuffer = this.createOceanNoiseBuffer(ctx, 6);
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      this.noiseSources.push(noiseSource);

      // Filter 1: Low-frequency ocean body / swell (sub & undertow)
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.setValueAtTime(160, ctx.currentTime);
      lowFilter.Q.setValueAtTime(1.8, ctx.currentTime);

      const lowGain = ctx.createGain();
      lowGain.gain.setValueAtTime(0.35, ctx.currentTime);

      // Filter 2: Mid-frequency wave crash & surging water
      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'bandpass';
      midFilter.frequency.setValueAtTime(450, ctx.currentTime);
      midFilter.Q.setValueAtTime(2.2, ctx.currentTime);

      const midGain = ctx.createGain();
      midGain.gain.setValueAtTime(0.4, ctx.currentTime);

      // Filter 3: High-frequency foam spray and falling droplets
      const sprayFilter = ctx.createBiquadFilter();
      sprayFilter.type = 'highpass';
      sprayFilter.frequency.setValueAtTime(1800, ctx.currentTime);
      sprayFilter.Q.setValueAtTime(0.8, ctx.currentTime);

      const sprayGain = ctx.createGain();
      sprayGain.gain.setValueAtTime(0.08, ctx.currentTime);

      // Connect noise through all 3 spectral bands
      noiseSource.connect(lowFilter);
      lowFilter.connect(lowGain);
      lowGain.connect(this.masterGain);

      noiseSource.connect(midFilter);
      midFilter.connect(midGain);
      midGain.connect(this.masterGain);

      noiseSource.connect(sprayFilter);
      sprayFilter.connect(sprayGain);
      sprayGain.connect(this.masterGain);

      // Rhythmic Wave Cycle modulation:
      // Simulates waves building up, pitching over and falling/crashing, then receding foam
      const waveCycleDuration = 6.5; // seconds per wave

      const scheduleWaveSwell = () => {
        if (!this.isWavePlaying || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;

        // Stage 1: Build-up / swell rising (0 -> 2.6s)
        lowFilter.frequency.cancelScheduledValues(now);
        lowFilter.frequency.setValueAtTime(140, now);
        lowFilter.frequency.exponentialRampToValueAtTime(380, now + 2.4);

        midFilter.frequency.cancelScheduledValues(now);
        midFilter.frequency.setValueAtTime(320, now);
        midFilter.frequency.exponentialRampToValueAtTime(1100, now + 2.5);

        lowGain.gain.cancelScheduledValues(now);
        lowGain.gain.setValueAtTime(0.18, now);
        lowGain.gain.linearRampToValueAtTime(0.5, now + 2.4);

        midGain.gain.cancelScheduledValues(now);
        midGain.gain.setValueAtTime(0.1, now);
        midGain.gain.linearRampToValueAtTime(0.45, now + 2.5);

        // Stage 2: Wave crest falls and crashes down! (2.5s -> 3.8s)
        sprayGain.gain.cancelScheduledValues(now);
        sprayGain.gain.setValueAtTime(0.02, now);
        sprayGain.gain.setValueAtTime(0.02, now + 2.3);
        sprayGain.gain.linearRampToValueAtTime(0.24, now + 2.7); // Falling water spray burst
        sprayGain.gain.exponentialRampToValueAtTime(0.03, now + 4.2); // Receding foam sizzle

        // Stage 3: Foam wash & water receding into the sea (3.8s -> 6.5s)
        midFilter.frequency.exponentialRampToValueAtTime(260, now + 5.8);
        lowFilter.frequency.exponentialRampToValueAtTime(120, now + 6.0);
        lowGain.gain.linearRampToValueAtTime(0.15, now + 6.0);
        midGain.gain.linearRampToValueAtTime(0.08, now + 6.0);

        // Schedule next wave
        const tid = window.setTimeout(scheduleWaveSwell, (waveCycleDuration - 0.2) * 1000);
        this.timerIds.push(tid);
      };

      // Add gentle sub-harmonic resonance oscillator (ocean body depth)
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(54, ctx.currentTime);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.04, ctx.currentTime);
      subOsc.connect(subGain);
      subGain.connect(this.masterGain);
      subOsc.start();
      this.lfoNodes.push(subOsc);

      noiseSource.start();
      this.isWavePlaying = true;
      scheduleWaveSwell();
    } catch (err) {
      console.warn('Web Audio Wave Synth error (intro only):', err);
    }
  }

  /**
   * Smoothly stops all ocean wave audio.
   * Invoked immediately when the intro is dismissed.
   */
  stopWaveIntroSound(fadeDurationMs = 800): void {
    this.isWavePlaying = false;

    this.timerIds.forEach(id => window.clearTimeout(id));
    this.timerIds = [];

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const fadeSec = Math.max(0.1, fadeDurationMs / 1000);
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
      } catch (_) {}

      setTimeout(() => {
        try {
          this.noiseSources.forEach(s => {
            try { s.stop(); s.disconnect(); } catch (_) {}
          });
          this.lfoNodes.forEach(o => {
            try { o.stop(); o.disconnect(); } catch (_) {}
          });
          this.masterGain?.disconnect();
        } catch (_) {}
        this.noiseSources = [];
        this.lfoNodes = [];
        this.masterGain = null;
      }, fadeDurationMs + 50);
    }
  }

  /**
   * Resumes suspended context immediately or starts playback.
   */
  async resumeAndPlay(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {}
    }
    if (!this.isWavePlaying) {
      await this.startWaveIntroSound();
    }
  }

  /**
   * Toggle mute for intro sound.
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx && this.isWavePlaying) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(muted ? 0.0001 : 0.6, now, 0.2);
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  isPlaying(): boolean {
    return this.isWavePlaying;
  }
}

let waveEngineInstance: OceanWaveAudioEngine | null = null;

export function getOceanWaveAudioEngine(): OceanWaveAudioEngine {
  if (typeof window === 'undefined') {
    throw new Error('OceanWaveAudioEngine is browser only');
  }
  if (!waveEngineInstance) {
    waveEngineInstance = new OceanWaveAudioEngine();
  }
  return waveEngineInstance;
}

export type { OceanWaveAudioEngine };
