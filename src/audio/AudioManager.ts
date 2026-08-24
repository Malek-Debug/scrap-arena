// ---------------------------------------------------------------------------
// AudioManager — Professional Cyberpunk Audio Mix for SCRAP ARENA
// ---------------------------------------------------------------------------
//
// SIGNAL CHAIN (Web Audio procedural path):
//   sounds → sfxBus (×0.9) → masterGain (×0.18) → warmthLP (9kHz) → compressor → out
//   music  → directly via Phaser at calibrated per-track volumes
//   ambient→ ambientBus (×0.22) → masterGain → warmthLP → compressor → out
//
// MIX HIERARCHY (target perceived levels):
//   Music:        32–38%   Phaser volume 0.30–0.38
//   Ambient:      18–25%   ambientBus gain 0.22 × masterGain 0.18
//   Weapons:      65–72%   Phaser volume 0.55–0.65 + ±5% pitch
//   Enemy attacks:55–62%   Phaser volume 0.50–0.60
//   UI:           28–36%   Phaser volume 0.28–0.36
//   Warnings:     78–85%   Phaser volume 0.75–0.82 (procedural peak ×0.16)
//   Boss SFX:     82–88%   Phaser volume 0.80–0.88 (procedural peak ×0.18)
//
// ---------------------------------------------------------------------------

export const BACKGROUND_MUSIC_ENABLED = true;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MusicState = 'title' | 'gameplay' | 'high_intensity' | 'boss' | 'victory' | 'gameover' | 'none';

export class AudioManager {
  private static _instance: AudioManager;

  // ── Web Audio graph ──────────────────────────────────────────────────────
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private warmthFilter!: BiquadFilterNode;
  private subCut!: BiquadFilterNode;         // HP at 40Hz — removes subsonic mud
  private compressor!: DynamicsCompressorNode;
  private _reverbBus!: GainNode;
  private _reverbSend!: ConvolverNode;
  private muted = false;

  // ── Sub-buses ────────────────────────────────────────────────────────────
  private _sfxBus!: GainNode;       // all procedural SFX
  private _ambientBus!: GainNode;   // ambient layers — always lower than SFX

  // ── Volume group targets ─────────────────────────────────────────────────
  private _masterVol  = 0.18;
  private _sfxVol     = 1.0;
  private _musicVol   = 1.0;

  // ── Music state machine ──────────────────────────────────────────────────
  private _musicState: MusicState = 'none';
  private _phaserMainMusic:  PhaserSound | null = null;
  private _phaserBossMusic:  PhaserSound | null = null;
  private _phaserTitleMusic: PhaserSound | null = null;
  private _mainMusicDuckedVol: number | null = null;

  // ── Procedural music fallback ────────────────────────────────────────────
  private _musicGain:    GainNode | null = null;
  private _musicNodes:   AudioNode[] = [];
  private _rhythmActive  = false;
  private _beatTimeout:  ReturnType<typeof setTimeout> | null = null;
  private _arpIdx        = 0;
  private _nextEvt: Record<string, number> = {};

  // ── Boss procedural fallback ─────────────────────────────────────────────
  private _bossMusicGain:  GainNode | null = null;
  private _bossMusicNodes: AudioNode[] = [];
  private _bossRhythm      = false;
  private _bossRhythmTO:   ReturnType<typeof setTimeout> | null = null;
  private _bossArpIdx      = 0;
  private _bossEvt: Record<string, number> = {};

  // ── Title procedural fallback ────────────────────────────────────────────
  private _titleGain:    GainNode | null = null;
  private _titleNodes:   AudioNode[] = [];
  private _titleSparkle: ReturnType<typeof setInterval> | null = null;
  private _titleSpkIdx   = 0;

  // ── Ambient system ───────────────────────────────────────────────────────
  private _ambientWorld: 'foundry' | 'circuit' | null = null;
  private _ambientNodes: AudioNode[] = [];
  private _ambientGainNode: GainNode | null = null;
  private _ambientEventTO: ReturnType<typeof setTimeout> | null = null;

  // ── High-intensity overlay ───────────────────────────────────────────────
  private _highIntensity = false;

  // ── Ducking state ────────────────────────────────────────────────────────
  private _duckTO: ReturnType<typeof setTimeout> | null = null;

  // ── Reactor audio state machine ─────────────────────────────────────────
  // 'stable' → 'damaged' → 'critical' → 'destroyed'
  private _reactorState: 'stable' | 'damaged' | 'critical' | 'destroyed' = 'stable';
  private _reactorHeartbeatTO: ReturnType<typeof setTimeout> | null = null;
  private _reactorHeartbeatInterval = 1400;  // ms between beats — decreases as damage rises
  private _reactorHeartbeatNodes: AudioNode[] = [];

  // ── Wave tension — tracks wave number for escalation ───────────────────
  private _waveTension: 0 | 1 | 2 | 3 = 0;  // 0=calm, 1=rising, 2=intense, 3=boss

  // ── Boss pre-silence ritual tracking ───────────────────────────────────
  private _preBossSilenceActive = false;

  // ── World-switch crossfade state ────────────────────────────────────────
  private _worldSwitchActive = false;

  // ── Cinematic intro sequencer ───────────────────────────────────────────
  private _introActive = false;

  // ── SFX cooldowns (ms timestamp) — prevent stacking identical sounds ─────
  private _cooldowns: Record<string, number> = {};

  // ── Shoot alternation + pitch cycling ───────────────────────────────────
  private _shootThrottle = 0;
  private _shootPitchIdx = 0;
  // ±5% pitch spread — sounds are never identical
  private static readonly SHOOT_RATES = [0.97, 1.00, 1.03, 0.98, 1.02, 0.99, 1.04, 0.96];

  // ── Scene reference ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _scene: any = null;

  // ── Singleton ────────────────────────────────────────────────────────────
  static get instance(): AudioManager {
    if (!AudioManager._instance) AudioManager._instance = new AudioManager();
    return AudioManager._instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setScene(scene: any): void { this._scene = scene; }

  // ==========================================================================
  // INIT
  // ==========================================================================

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();

      // Signal chain: source → sfxBus → masterGain → subCut → warmth → compressor → out
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value      = 8;
      this.compressor.ratio.value     = 6;
      this.compressor.attack.value    = 0.003;
      this.compressor.release.value   = 0.18;
      this.compressor.connect(this.ctx.destination);

      this.warmthFilter = this.ctx.createBiquadFilter();
      this.warmthFilter.type            = 'lowpass';
      this.warmthFilter.frequency.value = 9000;  // gentle air removal
      this.warmthFilter.connect(this.compressor);

      this.subCut = this.ctx.createBiquadFilter();
      this.subCut.type            = 'highpass';
      this.subCut.frequency.value = 40;  // cut subsonic mud
      this.subCut.connect(this.warmthFilter);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._masterVol;
      this.masterGain.connect(this.subCut);

      // SFX sub-bus
      this._sfxBus = this.ctx.createGain();
      this._sfxBus.gain.value = this._sfxVol;
      this._sfxBus.connect(this.masterGain);

      // Ambient sub-bus — always quieter than SFX
      this._ambientBus = this.ctx.createGain();
      this._ambientBus.gain.value = 0.22;
      this._ambientBus.connect(this.masterGain);

      // Cinematic plate reverb — metal corridor (~0.9s IR)
      const irLen = 0.9;
      const ir  = this.ctx.createBuffer(2, Math.floor(this.ctx.sampleRate * irLen), this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const t = i / d.length;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
        }
      }
      this._reverbSend = this.ctx.createConvolver();
      this._reverbSend.buffer = ir;
      this._reverbBus = this.ctx.createGain();
      this._reverbBus.gain.value = 0.28;
      this._reverbSend.connect(this._reverbBus);
      this._reverbBus.connect(this.warmthFilter);
    } catch {
      this.ctx = null;
    }
  }

  // ==========================================================================
  // PHASER FILE HELPERS
  // ==========================================================================

  private _sfx(key: string, volume = 0.6, rate = 1.0): boolean {
    if (!this._scene) return false;
    try {
      if (this._scene.cache.audio.exists(key)) {
        this._scene.sound.play(key, { volume: volume * this._sfxVol, rate });
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  /** Play SFX only if not on cooldown. Returns true if played. */
  private _sfxThrottled(key: string, volume: number, cooldownMs: number, rate = 1.0): boolean {
    const now = performance.now();
    if ((this._cooldowns[key] ?? 0) > now) return false;
    this._cooldowns[key] = now + cooldownMs;
    return this._sfx(key, volume, rate);
  }

  private _musicFile(key: string, vol: number): PhaserSound | null {
    if (!BACKGROUND_MUSIC_ENABLED || !this._scene) return null;
    try {
      if (this._scene.cache.audio.exists(key)) {
        const snd = this._scene.sound.add(key, { loop: true, volume: vol * this._musicVol });
        snd.play();
        return snd as PhaserSound;
      }
    } catch { /* ignore */ }
    return null;
  }

  private _fadeMusicOut(snd: PhaserSound | null, ms = 800): void {
    if (!snd || !this._scene) return;
    const steps = 20;
    const interval = ms / steps;
    let step = 0;
    const startVol: number = (snd as unknown as { volume?: number }).volume ?? 0.3;
    const iv = setInterval(() => {
      step++;
      try {
        const vol = startVol * (1 - step / steps);
        (snd as unknown as { setVolume?: (v: number) => void }).setVolume?.(Math.max(0, vol));
        if (step >= steps) {
          clearInterval(iv);
          try { snd.stop(); snd.destroy(); } catch { /* ok */ }
        }
      } catch { clearInterval(iv); }
    }, interval);
  }

  private _fadeMusicIn(snd: PhaserSound | null, targetVol: number, ms = 800): void {
    if (!snd) return;
    try { (snd as unknown as { setVolume?: (v: number) => void }).setVolume?.(0); } catch { /* ok */ }
    const steps = 20;
    const interval = ms / steps;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      try {
        const vol = targetVol * (step / steps);
        (snd as unknown as { setVolume?: (v: number) => void }).setVolume?.(vol);
        if (step >= steps) clearInterval(iv);
      } catch { clearInterval(iv); }
    }, interval);
  }

  private _stopAllMusic(): void {
    [this._phaserMainMusic, this._phaserBossMusic, this._phaserTitleMusic].forEach(snd => {
      if (snd) { try { snd.stop(); snd.destroy(); } catch { /* ok */ } }
    });
    this._phaserMainMusic  = null;
    this._phaserBossMusic  = null;
    this._phaserTitleMusic = null;
  }

  // ==========================================================================
  // WEB AUDIO PRIMITIVES
  // ==========================================================================

  private get now(): number { return this.ctx!.currentTime; }

  private _noiseBuffer(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private _tone(
    freq: number, type: OscillatorType, t: number,
    duration: number, peak: number,
    attackSec = 0.008, relFrac = 0.35,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    const rel = duration * relFrac;
    const sus = Math.max(0, duration - attackSec - rel);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attackSec);
    g.gain.setValueAtTime(peak, t + attackSec + sus);
    g.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(g).connect(this._sfxBus);
    osc.start(t); osc.stop(t + duration + 0.01);
  }

  private _sweep(
    freqA: number, freqB: number, type: OscillatorType,
    t: number, duration: number, peak: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t + duration);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this._sfxBus);
    osc.start(t); osc.stop(t + duration + 0.01);
  }

  private _noise(
    filterFreq: number, filterType: BiquadFilterType, Q: number,
    t: number, duration: number, peak: number,
  ): void {
    if (!this.ctx) return;
    const src  = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration + 0.02);
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType; filt.frequency.value = filterFreq; filt.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filt).connect(g).connect(this._sfxBus);
    src.start(t); src.stop(t + duration + 0.02);
  }

  private _reverbBoom(t: number, level = 0.35): void {
    if (!this.ctx || !this._reverbSend) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.18);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filt).connect(g).connect(this._reverbSend);
    src.start(t); src.stop(t + 0.2);
  }

  // ==========================================================================
  // AMBIENT SYSTEM — per-world persistent layers
  // ==========================================================================

  startAmbient(world: 'foundry' | 'circuit'): void {
    if (this._ambientWorld === world) return;
    this._stopAmbient();
    this._ambientWorld = world;
    if (!this.ctx) return;

    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const gain = ctx.createGain();
    gain.connect(this._ambientBus);
    this._ambientGainNode = gain;

    if (world === 'foundry') {
      // Low industrial hum — turbines / generator
      gain.gain.value = 0.55;
      for (const [f, vol] of [[55, 0.055], [110, 0.030], [165, 0.018]] as [number, number][]) {
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = f; og.gain.value = vol;
        osc.connect(og).connect(gain); osc.start();
        nodes.push(osc, og);
      }
      // Ventilation / air movement — bandpass filtered noise
      const fanSrc = ctx.createBufferSource(); fanSrc.loop = true;
      const fanBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const fd = fanBuf.getChannelData(0);
      for (let i = 0; i < fd.length; i++) fd[i] = (Math.random() * 2 - 1) * 0.5;
      fanSrc.buffer = fanBuf;
      const fanFilt = ctx.createBiquadFilter(); fanFilt.type = 'bandpass';
      fanFilt.frequency.value = 280; fanFilt.Q.value = 0.8;
      const fanGain = ctx.createGain(); fanGain.gain.value = 0.025;
      fanSrc.connect(fanFilt).connect(fanGain).connect(gain);
      fanSrc.start(); nodes.push(fanSrc, fanFilt, fanGain);
      // Slow 0.12Hz LFO breathing on overall level
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.08;
      lfo.connect(lfoG).connect(gain.gain); lfo.start();
      nodes.push(lfo, lfoG);
    } else {
      // CIRCUIT — corrupted digital void atmosphere
      gain.gain.value = 0.50;
      // Detuned drone pair (subtle beating at ~1Hz)
      for (const [f, det, vol] of [[73, -12, 0.045], [73, 14, 0.038], [110, 0, 0.022]] as [number, number, number][]) {
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = det; og.gain.value = vol;
        osc.connect(og).connect(gain); osc.start();
        nodes.push(osc, og);
      }
      // Digital high-frequency static — very quiet
      const staticSrc = ctx.createBufferSource(); staticSrc.loop = true;
      const sBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const sd = sBuf.getChannelData(0);
      for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * 0.3;
      staticSrc.buffer = sBuf;
      const hpFilt = ctx.createBiquadFilter(); hpFilt.type = 'highpass'; hpFilt.frequency.value = 3500;
      const staticGain = ctx.createGain(); staticGain.gain.value = 0.012;
      staticSrc.connect(hpFilt).connect(staticGain).connect(gain);
      staticSrc.start(); nodes.push(staticSrc, hpFilt, staticGain);
      // Slow pulse 0.25Hz — like corrupted energy breathing
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.25;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.12;
      lfo.connect(lfoG).connect(gain.gain); lfo.start();
      nodes.push(lfo, lfoG);
    }
    this._ambientNodes = nodes;

    // Fade ambient in over 2s
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(world === 'foundry' ? 0.55 : 0.50, t + 2.0);

    // Schedule random ambient events
    this._scheduleAmbientEvent(world);
  }

  private _scheduleAmbientEvent(world: 'foundry' | 'circuit'): void {
    if (!this.ctx || this._ambientWorld !== world) return;
    const delay = world === 'foundry'
      ? 4000 + Math.random() * 8000   // metallic clinks every 4–12s
      : 3000 + Math.random() * 6000;  // corrupted blips every 3–9s
    this._ambientEventTO = setTimeout(() => {
      if (!this.ctx || this._ambientWorld !== world) return;
      const t = this.ctx.currentTime;
      if (world === 'foundry') {
        // Random metallic pipe knock / distant machinery
        const f = [220, 330, 440, 550][Math.floor(Math.random() * 4)];
        const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.028, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g).connect(this._ambientBus);
        osc.start(t); osc.stop(t + 0.2);
      } else {
        // Digital glitch — short noise burst
        const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(0.04);
        const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass';
        filt.frequency.value = 1200 + Math.random() * 2000; filt.Q.value = 3;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.018, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src.connect(filt).connect(g).connect(this._ambientBus);
        src.start(t); src.stop(t + 0.05);
      }
      this._scheduleAmbientEvent(world);
    }, delay);
  }

  private _stopAmbient(): void {
    this._ambientWorld = null;
    if (this._ambientEventTO !== null) { clearTimeout(this._ambientEventTO); this._ambientEventTO = null; }
    if (!this.ctx || !this._ambientGainNode) {
      this._ambientNodes = []; this._ambientGainNode = null; return;
    }
    const t = this.ctx.currentTime;
    const g = this._ambientGainNode;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 1.5);
    const nodes = this._ambientNodes;
    this._ambientNodes = []; this._ambientGainNode = null;
    setTimeout(() => {
      nodes.forEach(n => {
        if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) {
          try { n.stop(); } catch { /* ok */ }
        }
        try { n.disconnect(); } catch { /* ok */ }
      });
      try { g.disconnect(); } catch { /* ok */ }
    }, 1700);
  }

  // ==========================================================================
  // MUSIC DUCKING
  // ==========================================================================

  /** Duck music for `durationMs`, then restore. Used during boss announcements etc. */
  duckMusic(durationMs = 2000, duckAmount = 0.45): void {
    if (this._duckTO !== null) return;  // already ducked
    const mm = this._phaserMainMusic as unknown as { volume?: number; setVolume?: (v: number) => void } | null;
    const bm = this._phaserBossMusic as unknown as { volume?: number; setVolume?: (v: number) => void } | null;
    const active = mm ?? bm;
    if (!active) return;
    const origVol = (active as unknown as { volume?: number }).volume ?? 0.32;
    const duckedVol = origVol * duckAmount;
    try { (active as unknown as { setVolume?: (v: number) => void }).setVolume?.(duckedVol); } catch { /* ok */ }
    this._duckTO = setTimeout(() => {
      this._duckTO = null;
      try { (active as unknown as { setVolume?: (v: number) => void }).setVolume?.(origVol); } catch { /* ok */ }
    }, durationMs);
  }

  // ==========================================================================
  // MUSIC STATE MACHINE
  // ==========================================================================

  startTitleMusic(): void {
    this._stopAllMusicProcedural();
    this._stopAmbient();
    this._musicState = 'title';
    if (!BACKGROUND_MUSIC_ENABLED) return;
    // Stop any lingering main/boss music
    if (this._phaserMainMusic)  { this._fadeMusicOut(this._phaserMainMusic, 400); this._phaserMainMusic = null; }
    if (this._phaserBossMusic)  { this._fadeMusicOut(this._phaserBossMusic, 400); this._phaserBossMusic = null; }
    if (this._phaserTitleMusic) { this._fadeMusicOut(this._phaserTitleMusic, 200); this._phaserTitleMusic = null; }
    // Title: 0.38 — comfortable, present but not dominating
    const snd = this._musicFile('music_lobby', 0)
      ?? this._musicFile('music_title', 0);
    if (snd) {
      this._fadeMusicIn(snd, 0.38 * this._musicVol, 1000);
      this._phaserTitleMusic = snd;
      return;
    }
    this._startProceduralTitle();
  }

  startMusic(theme: 'foundry' | 'circuit'): void {
    this._musicState = 'gameplay';
    if (!BACKGROUND_MUSIC_ENABLED || !this.ctx) {
      this.startAmbient(theme); return;
    }
    // Fade out title music if it's playing
    if (this._phaserTitleMusic) { this._fadeMusicOut(this._phaserTitleMusic, 600); this._phaserTitleMusic = null; }
    // Only start main music if not already playing
    if (!this._phaserMainMusic) {
      const snd = this._musicFile('music_main', 0);
      if (snd) {
        this._fadeMusicIn(snd, 0.32 * this._musicVol, 1200);
        this._phaserMainMusic = snd;
      } else {
        this._startProceduralGameplay(theme);
      }
    }
    this.startAmbient(theme);
  }

  stopMusic(): void {
    this._stopAllMusicProcedural();
    this._stopAmbient();
    [this._phaserMainMusic, this._phaserBossMusic, this._phaserTitleMusic].forEach(snd => {
      if (snd) this._fadeMusicOut(snd, 600);
    });
    this._phaserMainMusic  = null;
    this._phaserBossMusic  = null;
    this._phaserTitleMusic = null;
    this._musicState = 'none';
  }

  crossfadeToTheme(theme: 'foundry' | 'circuit'): void {
    // File-based: same music_main plays across both worlds — no change needed
    if (this._phaserMainMusic) {
      this.startAmbient(theme);
      return;
    }
    // Procedural fallback: swap theme
    this._rhythmActive = false;
    if (this._beatTimeout !== null) { clearTimeout(this._beatTimeout); this._beatTimeout = null; }
    this._nextEvt = {};
    const FADE = 1.5;
    const t = this.ctx?.currentTime ?? 0;
    if (this._musicGain && this.ctx) {
      const old = this._musicGain; const oldN = this._musicNodes;
      old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + FADE);
      setTimeout(() => {
        oldN.forEach(n => { if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } } try { n.disconnect(); } catch { /* ok */ } });
        try { old.disconnect(); } catch { /* ok */ }
      }, (FADE + 0.15) * 1000);
    }
    this._startProceduralGameplay(theme);
    this.startAmbient(theme);
  }

  startBossMusic(): void {
    if (!BACKGROUND_MUSIC_ENABLED) return;
    this._musicState = 'boss';
    // Fade out main music over 1.2s (NOT instant silence)
    const mm = this._phaserMainMusic;
    if (mm) {
      const vol: number = (mm as unknown as { volume?: number }).volume ?? 0.32;
      this._mainMusicDuckedVol = vol;
      this._fadeMusicOut(mm, 1200);
      this._phaserMainMusic = null;
    } else if (this._musicGain && this.ctx) {
      this._stopProceduralMusic();
    }
    if (this._phaserBossMusic) { this._fadeMusicOut(this._phaserBossMusic, 300); this._phaserBossMusic = null; }
    // Start boss music with 800ms fade-in
    const snd = this._musicFile('music_boss', 0);
    if (snd) {
      this._fadeMusicIn(snd, 0.38 * this._musicVol, 800);
      this._phaserBossMusic = snd;
      return;
    }
    this._startProceduralBoss();
  }

  stopBossMusic(): void {
    // Fade out boss music
    if (this._phaserBossMusic) {
      this._fadeMusicOut(this._phaserBossMusic, 1000);
      this._phaserBossMusic = null;
    }
    this._stopProceduralBoss();
    // Restore and crossfade main music back in
    if (this._mainMusicDuckedVol !== null) {
      const vol = this._mainMusicDuckedVol;
      this._mainMusicDuckedVol = null;
      setTimeout(() => {
        if (this._musicState !== 'boss') return;
        this._musicState = 'gameplay';
        const snd = this._musicFile('music_main', 0);
        if (snd) { this._fadeMusicIn(snd, vol, 1500); this._phaserMainMusic = snd; }
      }, 600);
    } else {
      this._musicState = 'gameplay';
    }
  }

  startGameOverMusic(): void {
    this._stopAllMusic();
    this._stopAmbient();
    this._musicState = 'gameover';
    if (!BACKGROUND_MUSIC_ENABLED) return;
    const snd = this._musicFile('music_gameover', 0)
      ?? this._musicFile('music_boss', 0)
      ?? this._musicFile('music_title', 0);
    if (snd) { this._fadeMusicIn(snd, 0.28 * this._musicVol, 1200); this._phaserTitleMusic = snd; }
  }

  startVictoryMusic(): void {
    this._stopAllMusic();
    this._stopAmbient();
    this._musicState = 'victory';
    if (!BACKGROUND_MUSIC_ENABLED) return;
    const snd = this._musicFile('music_victory', 0)
      ?? this._musicFile('music_lobby', 0)
      ?? this._musicFile('music_title', 0);
    if (snd) { this._fadeMusicIn(snd, 0.32 * this._musicVol, 1000); this._phaserTitleMusic = snd; }
  }

  stopTitleMusic(): void {
    if (this._phaserTitleMusic) { this._fadeMusicOut(this._phaserTitleMusic, 600); this._phaserTitleMusic = null; }
    this._stopProceduralTitle();
  }

  /** Increase perceived intensity — call when enemies > 8 or reactor < 50%. */
  setHighIntensity(active: boolean): void {
    if (this._highIntensity === active) return;
    this._highIntensity = active;
    const target = active ? 0.42 : 0.32;
    const mm = this._phaserMainMusic as unknown as { setVolume?: (v: number) => void } | null;
    const bm = this._phaserBossMusic as unknown as { setVolume?: (v: number) => void } | null;
    (mm ?? bm)?.setVolume?.(target * this._musicVol);
    // Pulse the ambient up slightly
    if (this._ambientGainNode) {
      const t = this.ctx?.currentTime ?? 0;
      if (this.ctx) {
        const targetAmbient = active ? 0.70 : (this._ambientWorld === 'foundry' ? 0.55 : 0.50);
        this._ambientGainNode.gain.cancelScheduledValues(t);
        this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
        this._ambientGainNode.gain.linearRampToValueAtTime(targetAmbient, t + 2.0);
      }
    }
  }

  // ==========================================================================
  // WEAPON SFX — calibrated to 65–72% mix position
  // ==========================================================================

  /** Energy weapon — clean plasma zap with ±5% pitch variation. */
  shoot(): void {
    if (!this.ctx) return;
    const now = performance.now();
    if ((this._cooldowns['shoot'] ?? 0) > now) return;
    this._cooldowns['shoot'] = now + 28;  // 28ms minimum between shots

    this._shootThrottle = (this._shootThrottle + 1) % 2;
    const key  = this._shootThrottle === 0 ? 'sfx_shoot' : 'sfx_shoot2';
    const rate = AudioManager.SHOOT_RATES[this._shootPitchIdx % AudioManager.SHOOT_RATES.length];
    this._shootPitchIdx++;

    if (this._sfx(key, 0.58, rate)) return;
    // Procedural fallback — energy plasma with slight pitch variation
    const t = this.now;
    const pitchMult = 0.97 + Math.random() * 0.06;
    this._sweep(520 * pitchMult, 180 * pitchMult, 'sine', t, 0.08, 0.10);
    this._tone(1100 * pitchMult, 'sine', t, 0.014, 0.035, 0.002, 0.9);
  }

  /** Heavy weapon — mechanical metallic with punch. */
  shootHeavy(): void {
    if (!this.ctx) return;
    const rate = 0.92 + Math.random() * 0.08;
    if (this._sfx('sfx_shoot_large', 0.64, rate)) return;
    const t = this.now;
    this._sweep(280, 90, 'sine', t, 0.14, 0.14);
    this._noise(400, 'lowpass', 0.8, t, 0.10, 0.08);
    this._tone(160, 'sine', t, 0.12, 0.06, 0.005, 0.8);
  }

  /** Enemy projectile hit on player — distinct from weapon hit. */
  hit(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_hit', 0.52, 0.96 + Math.random() * 0.08)) return;
    const t = this.now;
    this._sweep(280, 90, 'sine', t, 0.10, 0.07);
    this._noise(700, 'lowpass', 1.0, t, 0.07, 0.05);
  }

  explosion(): void {
    if (!this.ctx) return;
    if (this._sfxThrottled('sfx_explosion', 0.62, 80, 0.95 + Math.random() * 0.10)) return;
    const t = this.now;
    this._sweep(260, 45, 'sine', t, 0.45, 0.13);
    this._sweep(180, 70, 'sine', t, 0.3, 0.08);
    this._noise(600, 'lowpass', 0.5, t, 0.22, 0.08);
    this._reverbBoom(t, 0.45);
  }

  bigExplosion(): void {
    if (!this.ctx) return;
    if (this._sfxThrottled('sfx_explosion_big', 0.72, 150)) return;
    const t = this.now;
    this._sweep(180, 30, 'sine', t, 0.6, 0.16);
    this._sweep(120, 45, 'sine', t + 0.1, 0.5, 0.10);
    this._noise(400, 'lowpass', 0.4, t, 0.3, 0.10);
    this._reverbBoom(t, 0.55);
    this._reverbBoom(t + 0.3, 0.35);
  }

  dash(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_dash', 0.52)) return;
    const t = this.now;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(0.22);
    const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass';
    filt.frequency.setValueAtTime(900, t); filt.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    filt.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.07, t); g.gain.linearRampToValueAtTime(0, t + 0.18);
    src.connect(filt).connect(g).connect(this._sfxBus);
    src.start(t); src.stop(t + 0.22);
    this._sweep(240, 160, 'sine', t, 0.18, 0.04);
  }

  worldSwitch(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_switch', 0.65)) return;
    const t = this.now;
    this._sweep(90, 28, 'sine', t, 1.4, 0.13);
    for (const det of [-20, 20]) {
      const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
      osc.type = 'sine'; osc.detune.value = det;
      osc.frequency.setValueAtTime(180, t); osc.frequency.linearRampToValueAtTime(780, t + 0.18);
      osc.frequency.linearRampToValueAtTime(260, t + 0.42);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.setValueAtTime(0.09, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.48);
      osc.connect(g).connect(this._sfxBus); osc.start(t); osc.stop(t + 0.52);
    }
    this._sweep(2200, 1100, 'triangle', t + 0.05, 0.28, 0.025);
    this._noise(1200, 'bandpass', 0.55, t, 0.08, 0.04);
    this._reverbBoom(t + 0.15, 0.25);
  }

  worldShift(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(140, 38, 'sine', t, 1.2, 0.16);
    this._sweep(900, 220, 'sawtooth', t + 0.1, 0.7, 0.04);
    this._reverbBoom(t, 0.50);
    this._reverbBoom(t + 0.25, 0.35);
    this._reverbBoom(t + 0.55, 0.22);
    this._sweep(1760, 1320, 'triangle', t + 0.12, 0.55, 0.03);
  }

  // ==========================================================================
  // ENEMY / PLAYER DAMAGE SFX
  // ==========================================================================

  playerHit(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_player_hit', 0.68)) return;
    const t = this.now;
    this._sweep(200, 75, 'sine', t, 0.13, 0.09);
    this._noise(550, 'lowpass', 0.8, t, 0.09, 0.05);
  }

  playerDeath(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_player_death', 0.80)) return;
    const t = this.now;
    this._sweep(380, 55, 'sine', t, 1.1, 0.13);
    this._sweep(200, 45, 'sine', t + 0.25, 0.9, 0.08);
    this._noise(400, 'lowpass', 0.5, t, 0.2, 0.07);
    this._reverbBoom(t, 0.50);
  }

  // ==========================================================================
  // BOSS SFX — highest priority
  // ==========================================================================

  /** Full dramatic stinger on boss spawn announcement. Ducks music. */
  bossIntroStinger(): void {
    if (!this.ctx) return;
    this.duckMusic(3500, 0.35);
    const t = this.now;
    // Sub-bass drop that fills the room
    this._sweep(80, 22, 'sine', t, 1.8, 0.18);
    this._sweep(160, 44, 'sine', t, 1.8, 0.12);
    // Dissonant tritone clash
    this._tone(233.08, 'triangle', t + 0.2, 1.2, 0.10, 0.02, 0.6);  // Bb3
    this._tone(311.13, 'triangle', t + 0.2, 1.2, 0.09, 0.02, 0.6);  // Eb4
    // Reverb tail for space
    this._reverbBoom(t + 0.15, 0.65);
    this._reverbBoom(t + 0.55, 0.45);
    this._reverbBoom(t + 1.0,  0.28);
    // Rising metal screech
    this._sweep(440, 1760, 'sawtooth', t + 0.4, 0.9, 0.05);
    // Final impact noise
    this._noise(300, 'lowpass', 0.4, t + 0.6, 0.35, 0.12);
  }

  /** Phase transition — rupture / tear sound. */
  bossPhaseTransition(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(55, 18, 'sine', t, 0.65, 0.16);
    this._sweep(1800, 400, 'triangle', t + 0.05, 0.5, 0.08);
    this._noise(600, 'bandpass', 1.2, t + 0.1, 0.2, 0.09);
    this._reverbBoom(t + 0.1, 0.55);
    // Warning re-stab
    this._sweep(880, 440, 'sine', t + 0.3, 0.35, 0.10);
  }

  /** Boss attack charge — building tension. */
  bossAttackCharge(): void {
    if (!this.ctx) return;
    if (this._sfxThrottled('_boss_charge', 0, 800)) return;
    const t = this.now;
    this._sweep(80, 280, 'sine', t, 0.85, 0.08);
    this._tone(280, 'triangle', t, 0.85, 0.045, 0.1, 0.9);
    this._sweep(2200, 880, 'triangle', t + 0.1, 0.6, 0.04);
  }

  /** Boss attack release — heavy, unavoidable. */
  bossAttackRelease(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(60, 220, 'sine', t, 0.5, 0.16);
    this._sweep(440, 1100, 'triangle', t, 0.25, 0.07);
    this._tone(880, 'sine', t + 0.1, 0.4, 0.055, 0.01, 0.95);
    this._reverbBoom(t + 0.05, 0.45);
  }

  /** Boss death — cinematic, huge. */
  bossDeath(): void {
    if (!this.ctx) return;
    // Duck music harder for the death sequence
    this.duckMusic(4000, 0.25);
    const t = this.now;
    // Three-wave explosion cascade
    this._sweep(180, 28, 'sine', t,      0.7,  0.18);
    this._sweep(140, 22, 'sine', t + 0.3, 0.9,  0.16);
    this._sweep(100, 16, 'sine', t + 0.7, 1.2,  0.14);
    this._noise(300, 'lowpass', 0.3, t,       0.5,  0.12);
    this._noise(250, 'lowpass', 0.3, t + 0.3, 0.6,  0.10);
    this._noise(200, 'lowpass', 0.3, t + 0.7, 0.8,  0.09);
    // Reverb washes
    for (let i = 0; i < 5; i++) this._reverbBoom(t + i * 0.22, 0.55 - i * 0.06);
    // Victory shimmer at the end
    this.ctx.currentTime; // force audio context update
    setTimeout(() => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
        this._tone(f, 'triangle', t2 + i * 0.06, 0.4, 0.06, 0.008, 0.5)
      );
    }, 1200);
  }

  plasmaCharging(): void {
    if (!this.ctx) return;
    if (this._sfxThrottled('_plasma_charge', 0, 500)) return;
    const t = this.ctx.currentTime;
    this._tone(140, 'sine', t, 0.3, 0.05, 0.08, 0.8);
    this._tone(280, 'triangle', t, 0.3, 0.025, 0.1, 0.9);
  }

  plasmaRelease(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(60, 220, 'sine', t, 0.5, 0.16);
    this._sweep(440, 1100, 'triangle', t, 0.25, 0.07);
    this._tone(880, 'sine', t + 0.1, 0.4, 0.055, 0.01, 0.95);
    this._reverbBoom(t + 0.05, 0.38);
  }

  chronoPulse(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(220, 60, 'sine', t, 0.8, 0.16);
    this._sweep(1600, 400, 'triangle', t, 0.5, 0.04);
    this._tone(220, 'sine', t + 0.06, 0.5, 0.07, 0.1, 0.85);
  }

  staggerHit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(380, 80, 'triangle', t, 0.22, 0.10);
    this._tone(160, 'sine', t, 0.18, 0.06, 0.01, 0.9);
  }

  chainShock(count: number): void {
    if (!this.ctx) return;
    const freq = Math.min(600, 200 + count * 80);
    const t = this.ctx.currentTime;
    this._tone(freq, 'triangle', t, 0.28, Math.min(0.11, 0.06 + count * 0.01), 0.02, 0.8);
    this._tone(freq * 1.5, 'sine', t + 0.05, 0.18, 0.03, 0.03, 0.9);
  }

  /** Sawblade windup — rising metallic whine before charge */
  sawbladeWindup(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(200, 800, 'sawtooth', t, 0.4, 0.06);
    this._sweep(150, 600, 'triangle', t + 0.05, 0.35, 0.04);
    this._noise(2000, 'highpass', 0.3, t + 0.1, 0.04, 0.03);
  }

  /** Enemy telegraph — brief warning chirp before drone burst */
  enemyTelegraph(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._tone(440, 'square', t, 0.08, 0.03, 0.01, 0.9);
    this._tone(660, 'square', t + 0.06, 0.06, 0.02, 0.01, 0.9);
  }

  // ==========================================================================
  // WARNING SFX — 78–85% mix position (impossible to miss)
  // ==========================================================================

  reactorAlarm(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(880, 440, 'sine',     t,        0.55, 0.12);  // up from 0.08
    this._sweep(660, 330, 'triangle', t + 0.08, 0.45, 0.09);
    this._sweep(120, 55,  'sine',     t + 0.12, 0.65, 0.14);
    this._noise(600, 'bandpass', 0.40, t, 0.07, 0.06);
  }

  reactorCritical(): void {
    if (!this.ctx) return;
    this.duckMusic(2000, 0.40);
    const t = this.now;
    this._sweep(1100, 440, 'sine',     t,        0.42, 0.14);
    this._sweep(880,  330, 'triangle', t + 0.14, 0.52, 0.11);
    this._sweep(1100, 440, 'sine',     t + 0.30, 0.42, 0.14);
    this._sweep(140,  55,  'sine',     t + 0.12, 0.75, 0.16);
    this._noise(500, 'bandpass', 0.6, t, 0.10, 0.07);
    this._reverbBoom(t + 0.10, 0.55);
  }

  overheatWarning(): void {
    if (!this.ctx) return;
    if ((this._cooldowns['overheat_warn'] ?? 0) > performance.now()) return;
    this._cooldowns['overheat_warn'] = performance.now() + 1500;
    const t = this.now;
    for (let i = 0; i < 3; i++) this._tone(560, 'sine', t + i * 0.1, 0.04, 0.09, 0.005, 0.4);
  }

  overheatActive(): void {
    if (!this.ctx) return;
    if ((this._cooldowns['overheat_active'] ?? 0) > performance.now()) return;
    this._cooldowns['overheat_active'] = performance.now() + 280;
    const t = this.now;
    const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator(); const lfoG = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 340;
    lfo.type = 'sine'; lfo.frequency.value = 9; lfoG.gain.value = 55;
    lfo.connect(lfoG).connect(osc.frequency);
    g.gain.setValueAtTime(0.07, t); g.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.connect(g).connect(this._sfxBus);
    osc.start(t); lfo.start(t); osc.stop(t + 0.3); lfo.stop(t + 0.3);
  }

  dimensionBreach(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(80, 40, 'sine', t, 0.65, 0.14);
    this._sweep(1800, 600, 'sine', t, 0.38, 0.09);
    this._sweep(2200, 800, 'triangle', t + 0.08, 0.28, 0.07);
    this._noise(600, 'bandpass', 0.45, t, 0.12, 0.05);
    this._reverbBoom(t + 0.06, 0.32);
  }

  lowHpPulse(): void {
    if (!this.ctx) return;
    if ((this._cooldowns['low_hp'] ?? 0) > performance.now()) return;
    this._cooldowns['low_hp'] = performance.now() + 1400;
    const t = this.now;
    this._tone(88, 'sine', t,        0.040, 0.045, 0.005, 0.40);
    this._tone(82, 'sine', t + 0.15, 0.035, 0.036, 0.005, 0.40);
  }

  // ==========================================================================
  // PICKUPS / REWARDS — 65–72%
  // ==========================================================================

  pickup(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_pickup', 0.62)) return;
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this._tone(freq, 'triangle', t + i * 0.055, 0.14, 0.11, 0.006, 0.5)
    );
  }

  waveComplete(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_wave_complete', 0.72)) return;
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this._tone(freq, 'sine', t + i * 0.09, 0.22, 0.15, 0.008, 0.35)
    );
  }

  comboHit(count: number): void {
    if (!this.ctx) return;
    const rate = 0.96 + Math.random() * 0.08;
    if (count >= 5 && this._sfxThrottled('sfx_combo', 0.50, 120, rate)) return;
    const t = this.now;
    if (count >= 10) {
      [523.25, 659.25, 783.99].forEach(f =>
        this._tone(f, 'triangle', t, 0.14, 0.10, 0.005, 0.5)
      );
    } else if (count >= 5) {
      this._tone(600, 'sine', t, 0.08, 0.08, 0.005, 0.4);
      this._tone(900, 'sine', t + 0.055, 0.08, 0.08, 0.005, 0.4);
    } else if (count >= 3) {
      this._tone(800, 'sine', t, 0.06, 0.07, 0.005, 0.45);
    }
  }

  // ==========================================================================
  // UI SFX — holographic interface — 28–36%
  // ==========================================================================

  /** Very soft hover tick — barely audible, just tactile feedback. */
  uiHover(): void {
    if (!this.ctx) return;
    if ((this._cooldowns['ui_hover'] ?? 0) > performance.now()) return;
    this._cooldowns['ui_hover'] = performance.now() + 80;
    const t = this.now;
    this._tone(1200, 'sine', t, 0.025, 0.018, 0.002, 0.4);
  }

  /** Holographic confirm — rising two-tone ping. */
  uiConfirm(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._tone(880, 'triangle', t,       0.08, 0.028, 0.004, 0.4);
    this._tone(1320, 'sine',    t + 0.06, 0.10, 0.022, 0.003, 0.45);
  }

  /** Cancel / back — descending tone. */
  uiCancel(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(660, 330, 'triangle', t, 0.12, 0.025);
  }

  /** Mission complete fanfare — distinct from waveComplete. */
  missionComplete(): void {
    if (!this.ctx) return;
    const t = this.now;
    [659.25, 783.99, 987.77, 1318.51].forEach((f, i) =>
      this._tone(f, 'triangle', t + i * 0.07, 0.22, 0.10, 0.005, 0.45)
    );
    this._tone(1046.5, 'sine', t + 0.32, 0.35, 0.08, 0.01, 0.5);
  }

  upgradeSelect(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_upgrade', 0.68)) return;
    const t = this.now;
    this._tone(523.25, 'triangle', t,       0.10, 0.10, 0.008, 0.4);
    this._tone(783.99, 'sine',     t + 0.07, 0.14, 0.11, 0.008, 0.4);
  }

  doorUnlock(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_door_open', 0.60)) return;
    const t = this.now;
    [783.99, 987.77, 1174.66].forEach((f, i) =>
      this._tone(f, 'triangle', t + i * 0.07, 0.2, 0.11, 0.008, 0.4)
    );
  }

  barrierDeny(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_error', 0.58) || this._sfx('sfx_barrier', 0.44)) return;
    const t = this.now;
    this._sweep(240, 170, 'sine', t, 0.1, 0.08);
    this._tone(130, 'sine', t + 0.08, 0.1, 0.05, 0.01, 0.6);
  }

  // ==========================================================================
  // ABILITY SFX
  // ==========================================================================

  novaBurst(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(220, 660, 'triangle', t, 0.06, 0.09);
    ([
      [261.63, 0.10], [329.63, 0.08], [392.00, 0.07], [523.25, 0.06],
    ] as [number, number][]).forEach(([freq, peak]) =>
      this._tone(freq, 'triangle', t + 0.06, 0.30, peak, 0.01, 0.50)
    );
    this._sweep(160, 42, 'sine', t + 0.06, 0.28, 0.13);
    this._noise(900, 'lowpass', 0.6, t + 0.06, 0.25, 0.07);
    this._reverbBoom(t + 0.06, 0.35);
  }

  phaseSurge(): void {
    if (!this.ctx) return;
    const t = this.now;
    for (const det of [-8, 8]) {
      const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
      osc.type = 'triangle'; osc.detune.value = det;
      osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(840, t + 0.10);
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(this._sfxBus); osc.start(t); osc.stop(t + 0.16);
    }
    this._noise(650, 'bandpass', 1.5, t + 0.10, 0.10, 0.06);
    this._sweep(260, 78, 'sine', t + 0.10, 0.22, 0.11);
    this._reverbBoom(t + 0.12, 0.30);
  }

  shieldUp(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_shield', 0.60)) return;
    const t = this.now;
    ([
      [659.25, 0.10], [783.99, 0.09], [987.77, 0.08], [1318.51, 0.06],
    ] as [number, number][]).forEach(([freq, peak], i) =>
      this._tone(freq, 'triangle', t + i * 0.08, 0.28, peak, 0.008, 0.55)
    );
    this._tone(164.81, 'sine', t + 0.12, 0.55, 0.06, 0.02, 0.60);
    this._sweep(1760, 880, 'sine', t + 0.10, 0.35, 0.03);
  }

  shieldAbsorb(): void {
    if (!this.ctx) return;
    if ((this._cooldowns['shield_absorb'] ?? 0) > performance.now()) return;
    this._cooldowns['shield_absorb'] = performance.now() + 120;
    const t = this.now;
    this._sweep(1200, 700, 'triangle', t, 0.12, 0.06);
    this._noise(550, 'lowpass', 0.8, t, 0.07, 0.04);
  }

  powerUp(type: string): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_powerup', 0.70)) return;
    const t = this.now;
    switch (type) {
      case 'rapid_fire':
        [0, 0.07, 0.13, 0.18].forEach((delay, i) =>
          this._tone(523.25 + i * 55, 'triangle', t + delay, 0.05, 0.11, 0.003, 0.5)
        );
        break;
      case 'shield_regen':
        [261.63, 329.63, 392.00, 493.88].forEach((freq, i) =>
          this._tone(freq, 'sine', t + i * 0.03, 0.38, 0.09, 0.012, 0.50)
        );
        break;
      case 'damage_boost':
        ([
          [261.63, 0.12], [392.00, 0.11], [523.25, 0.10],
        ] as [number, number][]).forEach(([freq, peak], i) =>
          this._tone(freq, 'triangle', t + i * 0.09, 0.22, peak, 0.008, 0.4)
        );
        break;
      case 'speed_boost':
        this._sweep(180, 820, 'sine', t, 0.20, 0.08);
        this._tone(1318.51, 'sine', t + 0.14, 0.14, 0.055, 0.005, 0.55);
        break;
      default:
        this.pickup();
    }
  }

  abilityReady(id: string): void {
    if (!this.ctx) return;
    const t = this.now;
    const freqMap: Record<string, number> = {
      nova_burst: 1046.50, phase_surge: 880.00, scrap_shield: 659.25,
    };
    const freq = freqMap[id] ?? 660;
    this._tone(freq,        'triangle', t,        0.10, 0.055, 0.005, 0.5);
    this._tone(freq * 1.25, 'sine',     t + 0.06, 0.08, 0.036, 0.004, 0.5);
  }

  // ==========================================================================
  // CONTEXTUAL SFX
  // ==========================================================================

  roomEnter(theme: string): void {
    if (!this.ctx) return;
    const t = this.now;
    switch (theme) {
      case 'hub':
        [523.25, 659.25, 783.99].forEach((f, i) =>
          this._tone(f, 'triangle', t + i * 0.04, 0.18, 0.08, 0.01, 0.5)
        );
        break;
      case 'factory':
        this._sweep(440, 550, 'triangle', t, 0.12, 0.07);
        this._tone(660, 'sine', t + 0.1, 0.1, 0.06, 0.01, 0.6);
        break;
      case 'server':
        this._tone(880, 'sine', t, 0.07, 0.06, 0.004, 0.4);
        this._tone(1100, 'sine', t + 0.06, 0.07, 0.055, 0.004, 0.4);
        break;
      case 'power':
        this._sweep(110, 180, 'triangle', t, 0.18, 0.09);
        this._noise(500, 'lowpass', 0.6, t + 0.05, 0.12, 0.045);
        break;
      case 'control':
        this._tone(440, 'sine', t, 0.12, 0.07, 0.008, 0.45);
        this._tone(550, 'triangle', t + 0.08, 0.1, 0.065, 0.008, 0.5);
        break;
      case 'maintenance':
        this._sweep(330, 220, 'triangle', t, 0.1, 0.07);
        this._noise(350, 'lowpass', 1.0, t, 0.06, 0.045);
        break;
      case 'armory':
        this._sweep(220, 330, 'triangle', t, 0.08, 0.09);
        this._noise(400, 'lowpass', 1.0, t, 0.06, 0.055);
        this._tone(440, 'sine', t + 0.07, 0.1, 0.065, 0.01, 0.5);
        break;
      case 'quarantine':
        this._sweep(440, 370, 'sine', t, 0.22, 0.065);
        this._tone(185, 'sine', t + 0.05, 0.2, 0.045, 0.01, 0.7);
        break;
      case 'vault':
        this._tone(880, 'sine', t, 0.1, 0.07, 0.005, 0.5);
        this._tone(660, 'sine', t + 0.08, 0.12, 0.065, 0.005, 0.5);
        break;
      default:
        this._tone(440, 'sine', t, 0.12, 0.06, 0.01, 0.5);
    }
  }

  toxicTick(): void {
    if (!this.ctx) return;
    if ((this._cooldowns['toxic'] ?? 0) > performance.now()) return;
    this._cooldowns['toxic'] = performance.now() + 350;
    const t = this.now;
    this._sweep(210, 175, 'sine', t, 0.07, 0.028);
  }

  reactorRepair(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(220, 660, 'triangle', t, 0.22, 0.07);
    this._tone(880, 'sine', t + 0.14, 0.18, 0.065, 0.01, 0.5);
    this._tone(440, 'triangle', t, 0.18, 0.045, 0.008, 0.4);
  }

  // ==========================================================================
  // REACTOR EMOTIONAL SYSTEM
  // Tracks HP ratio and drives heartbeat tempo, layer intensity, and alarm state.
  // ==========================================================================

  /** Call from ReactorController.update() each time HP changes. hpRatio = hp/maxHp (0..1). */
  setReactorState(hpRatio: number): void {
    if (!this.ctx) return;
    const prev = this._reactorState;
    let next: typeof this._reactorState;
    if (hpRatio <= 0)         next = 'destroyed';
    else if (hpRatio < 0.25)  next = 'critical';
    else if (hpRatio < 0.65)  next = 'damaged';
    else                       next = 'stable';

    if (next === prev) {
      // Same state — just update heartbeat tempo if heartbeat is running
      if (next !== 'stable' && next !== 'destroyed') {
        this._updateHeartbeatTempo(hpRatio);
      }
      return;
    }
    this._reactorState = next;
    this._onReactorStateChanged(prev, next, hpRatio);
  }

  private _onReactorStateChanged(
    prev: typeof this._reactorState,
    next: typeof this._reactorState,
    hpRatio: number,
  ): void {
    if (!this.ctx) return;
    switch (next) {
      case 'stable':
        this._stopReactorHeartbeat();
        // Restore ambient to its calm baseline
        if (this._ambientGainNode) {
          const t = this.ctx.currentTime;
          const baseline = this._ambientWorld === 'foundry' ? 0.55 : 0.50;
          this._ambientGainNode.gain.cancelScheduledValues(t);
          this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
          this._ambientGainNode.gain.linearRampToValueAtTime(baseline, t + 3.0);
        }
        break;
      case 'damaged':
        // Heartbeat starts at a moderate tempo (~72 bpm)
        this._startReactorHeartbeat(820);
        // Nudge ambient up slightly — tension rising
        if (this._ambientGainNode && this.ctx) {
          const t = this.ctx.currentTime;
          this._ambientGainNode.gain.cancelScheduledValues(t);
          this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
          this._ambientGainNode.gain.linearRampToValueAtTime(0.70, t + 1.5);
        }
        break;
      case 'critical':
        // Heartbeat accelerates — 90+ bpm, louder
        this._startReactorHeartbeat(580);
        // Push ambient and music harder
        if (this._ambientGainNode && this.ctx) {
          const t = this.ctx.currentTime;
          this._ambientGainNode.gain.cancelScheduledValues(t);
          this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
          this._ambientGainNode.gain.linearRampToValueAtTime(0.85, t + 1.0);
        }
        this.setHighIntensity(true);
        // Electrical failure burst
        this._reactorElectricalFailure();
        break;
      case 'destroyed':
        this._stopReactorHeartbeat();
        this._reactorPowerCollapse();
        break;
    }
    // Transition from critical back to damaged — restore calm
    if (prev === 'critical' && next === 'damaged') {
      this.setHighIntensity(false);
    }
    void hpRatio;
  }

  private _updateHeartbeatTempo(hpRatio: number): void {
    // Map hpRatio 0.65..0 → interval 820ms..280ms (calm to frantic)
    const t = Math.max(0, Math.min(1, hpRatio / 0.65));
    this._reactorHeartbeatInterval = Math.round(820 - (1 - t) * 540);
  }

  private _startReactorHeartbeat(intervalMs: number): void {
    this._stopReactorHeartbeat();
    this._reactorHeartbeatInterval = intervalMs;
    const tick = (): void => {
      if (this._reactorState === 'stable' || this._reactorState === 'destroyed') return;
      this._playReactorHeartbeatTick();
      this._reactorHeartbeatTO = setTimeout(tick, this._reactorHeartbeatInterval);
    };
    this._reactorHeartbeatTO = setTimeout(tick, 200);
  }

  private _stopReactorHeartbeat(): void {
    if (this._reactorHeartbeatTO !== null) {
      clearTimeout(this._reactorHeartbeatTO);
      this._reactorHeartbeatTO = null;
    }
    this._reactorHeartbeatNodes.forEach(n => {
      if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } }
      try { n.disconnect(); } catch { /* ok */ }
    });
    this._reactorHeartbeatNodes = [];
  }

  private _playReactorHeartbeatTick(): void {
    if (!this.ctx) return;
    const isCrit = this._reactorState === 'critical';
    const t = this.ctx.currentTime;
    // Two-phase pulse: initial thump + echo ~120ms later
    const peak = isCrit ? 0.065 : 0.042;
    // Main thump
    const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(isCrit ? 68 : 55, t);
    osc.frequency.exponentialRampToValueAtTime(isCrit ? 38 : 30, t + 0.12);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(this._ambientBus); osc.start(t); osc.stop(t + 0.18);
    // Echo hit 120ms later — softer
    const osc2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = isCrit ? 55 : 44;
    g2.gain.setValueAtTime(peak * 0.55, t + 0.12); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc2.connect(g2).connect(this._ambientBus); osc2.start(t + 0.12); osc2.stop(t + 0.28);
    // Critical: add high-pitched distortion crackle
    if (isCrit) {
      const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(0.06);
      const filt = this.ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 2000;
      const ng = this.ctx.createGain(); ng.gain.setValueAtTime(0.022, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(filt).connect(ng).connect(this._ambientBus); src.start(t); src.stop(t + 0.07);
    }
  }

  /** Random electrical failure sounds — sparks, arcing, power flicker. Called on critical transition. */
  private _reactorElectricalFailure(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Arc burst 1
    const s1 = this.ctx.createBufferSource(); s1.buffer = this._noiseBuffer(0.08);
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 3500; f1.Q.value = 4;
    const g1 = this.ctx.createGain(); g1.gain.setValueAtTime(0.08, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    s1.connect(f1).connect(g1).connect(this._sfxBus); s1.start(t); s1.stop(t + 0.09);
    // Arc burst 2 — delayed
    setTimeout(() => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      const s2 = this.ctx.createBufferSource(); s2.buffer = this._noiseBuffer(0.05);
      const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 4200; f2.Q.value = 5;
      const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(0.06, t2); g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.05);
      s2.connect(f2).connect(g2).connect(this._sfxBus); s2.start(t2); s2.stop(t2 + 0.06);
    }, 340);
    // Power-drop sub-bass thud
    this._sweep(80, 28, 'sine', t + 0.1, 0.35, 0.14);
  }

  /** Dramatic reactor collapse — used when reactor HP hits zero. */
  private _reactorPowerCollapse(): void {
    if (!this.ctx) return;
    // Silence all ambient immediately — power is gone
    if (this._ambientGainNode) {
      const t = this.ctx.currentTime;
      this._ambientGainNode.gain.cancelScheduledValues(t);
      this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
      this._ambientGainNode.gain.linearRampToValueAtTime(0, t + 0.4);
    }
    const t = this.ctx.currentTime;
    // Power-down hum falling to silence
    this._sweep(110, 18, 'triangle', t, 1.8, 0.16);
    this._sweep(55, 8, 'sine', t + 0.2, 2.0, 0.12);
    // Burst of noise then nothing
    this._noise(500, 'lowpass', 0.4, t, 0.25, 0.10);
    // 0.4s of true silence built in via the ambient fade — then game over fires
  }

  // ==========================================================================
  // WAVE TENSION ESCALATION
  // Adjusts ambient intensity and music presence by wave progression.
  // ==========================================================================

  /** Call when a new wave starts. wave = 1-based wave number. */
  setWaveTension(wave: number): void {
    const prev = this._waveTension;
    let next: typeof this._waveTension;
    if (wave >= 9)      next = 3;
    else if (wave >= 5) next = 2;
    else if (wave >= 3) next = 1;
    else                next = 0;

    if (next === prev) return;
    this._waveTension = next;
    this._applyWaveTension(next);
  }

  private _applyWaveTension(level: typeof this._waveTension): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Music volume rises with tension
    const musicTargets: [number, number][] = [
      [0.32, 1.2],   // wave 1–2: calm
      [0.35, 1.5],   // wave 3–4: tension rising
      [0.40, 2.0],   // wave 5–8: intense
      [0.42, 2.5],   // wave 9+:  maximum
    ];
    const [vol] = musicTargets[level];
    const activeMusic = (this._phaserMainMusic ?? this._phaserBossMusic) as unknown as { setVolume?: (v: number) => void } | null;
    activeMusic?.setVolume?.(vol * this._musicVol);

    // Ambient density increases with tension
    if (this._ambientGainNode) {
      const ambientTargets = [0.55, 0.62, 0.70, 0.78];
      const targetAmbient = ambientTargets[level];
      this._ambientGainNode.gain.cancelScheduledValues(t);
      this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
      this._ambientGainNode.gain.linearRampToValueAtTime(targetAmbient, t + 3.0);
    }

    // Add percussion layer stingers at tension increases
    if (level === 2) {
      // Wave 5 escalation sting — adds energy
      setTimeout(() => this._tensionEscalationSting(), 500);
    } else if (level === 3) {
      // Wave 9 pre-climax alarm
      setTimeout(() => this._tensionEscalationSting(), 200);
      setTimeout(() => this._tensionEscalationSting(), 1800);
    }
  }

  private _tensionEscalationSting(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Rising metallic impact
    this._sweep(220, 880, 'triangle', t, 0.18, 0.055);
    this._tone(440, 'sine', t + 0.08, 0.12, 0.04, 0.01, 0.6);
    this._reverbBoom(t + 0.06, 0.22);
  }

  // ==========================================================================
  // PRE-BOSS SILENCE RITUAL
  // Creates the "something is coming" moment before the boss spawns.
  // Called by WaveOrchestrator ~3s before spawnBoss().
  // ==========================================================================

  /** Begin the pre-boss silence sequence. Fades out ambient + music, then plays rumble → stinger. */
  preBossSilence(): void {
    if (!this.ctx || this._preBossSilenceActive) return;
    this._preBossSilenceActive = true;

    // Step 1 (0ms): fade ambient out over 1.2s
    if (this._ambientGainNode) {
      const t = this.ctx.currentTime;
      this._ambientGainNode.gain.cancelScheduledValues(t);
      this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
      this._ambientGainNode.gain.linearRampToValueAtTime(0, t + 1.2);
    }
    // Duck music heavily
    this.duckMusic(4500, 0.20);

    // Step 2 (1200ms): 300ms of true silence — let the player notice
    // (handled by the fade above)

    // Step 3 (1500ms): distant rumble — something approaching
    setTimeout(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this._sweep(55, 22, 'sine', t, 1.8, 0.10);
      this._reverbBoom(t, 0.35);
    }, 1500);

    // Step 4 (2800ms): warning signal — short metallic ping series
    setTimeout(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        this._tone(880, 'sine', t + i * 0.18, 0.06, 0.06, 0.004, 0.4);
        this._tone(1320, 'triangle', t + i * 0.18 + 0.04, 0.05, 0.04, 0.003, 0.5);
      }
    }, 2800);

    // Step 5 (3800ms): boss stinger fires — spawnBoss() should be called around now
    // (bossIntroStinger is called directly from WaveOrchestrator.spawnBoss())
    // Reset the flag after the full sequence
    setTimeout(() => {
      this._preBossSilenceActive = false;
      // Ambient will be re-started when boss music fades in
    }, 4500);
  }

  // ==========================================================================
  // WORLD-SWITCH SOUNDSCAPE IDENTITY
  // The Q ability gets a signature: distortion → pitch shift → collapse → silence → new world.
  // ==========================================================================

  /** Call when the player initiates a world switch (replaces the plain worldSwitch() call). */
  worldSwitchCinematic(newWorld: 'foundry' | 'circuit'): void {
    if (!this.ctx) return;
    // Don't layer if already switching
    if (this._worldSwitchActive) {
      this.worldSwitch();
      return;
    }
    this._worldSwitchActive = true;
    const t = this.ctx.currentTime;

    // Phase 1 — reality distortion (0–180ms)
    // Pitch-shifted saw sweep — sounds like space tearing
    this._sweep(280, 560, 'sawtooth', t, 0.12, 0.06);
    this._sweep(560, 140, 'sawtooth', t + 0.06, 0.15, 0.05);

    // Phase 2 — energy collapse (150–350ms)
    this._sweep(90, 28, 'sine', t + 0.15, 0.35, 0.13);
    this._noise(1500, 'bandpass', 2.0, t + 0.15, 0.12, 0.055);

    // Phase 3 — brief silence enforced by fadeout of the current ambient
    if (this._ambientGainNode) {
      this._ambientGainNode.gain.cancelScheduledValues(t);
      this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
      this._ambientGainNode.gain.linearRampToValueAtTime(0, t + 0.30);
    }

    // Phase 4 — whoosh/portal opening (300ms)
    // Void: falling noise + high sweep. Foundry: rising industrial sweep.
    if (newWorld === 'circuit') {
      this._sweep(2200, 220, 'triangle', t + 0.28, 0.55, 0.07);
      this._noise(800, 'lowpass', 0.5, t + 0.30, 0.18, 0.06);
      this._tone(73, 'sine', t + 0.35, 0.55, 0.055, 0.02, 0.85);  // Void bass drone entry
    } else {
      this._sweep(180, 880, 'triangle', t + 0.28, 0.45, 0.07);
      this._noise(350, 'bandpass', 0.8, t + 0.30, 0.20, 0.055);
      this._tone(55, 'triangle', t + 0.35, 0.60, 0.050, 0.02, 0.85);  // Foundry hum entry
    }

    // Reverb tail
    this._reverbBoom(t + 0.30, 0.40);

    // Start the new world's ambient AFTER the silence gap
    setTimeout(() => {
      this.startAmbient(newWorld);
      this._worldSwitchActive = false;
    }, 380);
  }

  // ==========================================================================
  // CINEMATIC INTRO SEQUENCER
  // Provides audio events for the intro scene / game start sequence.
  // ==========================================================================

  /**
   * Play the intro cinematic audio sequence.
   * Each callback fires at the correct moment; pass undefined to skip.
   *
   * Timeline:
   *   t=0     Reactor heartbeat starts (slow, stable)
   *   t=1.2s  Machinery ambience enters
   *   t=2.8s  ARIA activation hologram sound
   *   t=4.2s  Silence — Void breach (ambient cuts)
   *   t=4.8s  Alarm + bass impact + corruption wave
   *   t=6.5s  Player suit boot sounds + HUD activation
   *   t=8.0s  Music enters smoothly
   */
  playCinematicIntro(onMusicReady?: () => void): void {
    if (!this.ctx || this._introActive) return;
    this._introActive = true;
    const ctx = this.ctx;

    // t=0 — Stable reactor heartbeat, slow (once)
    const t0 = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const tb = t0 + i * 1.4;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 52;
      g.gain.setValueAtTime(0.040, tb); g.gain.exponentialRampToValueAtTime(0.001, tb + 0.18);
      osc.connect(g).connect(this._ambientBus); osc.start(tb); osc.stop(tb + 0.2);
      const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
      osc2.type = 'sine'; osc2.frequency.value = 42;
      g2.gain.setValueAtTime(0.022, tb + 0.14); g2.gain.exponentialRampToValueAtTime(0.001, tb + 0.28);
      osc2.connect(g2).connect(this._ambientBus); osc2.start(tb + 0.14); osc2.stop(tb + 0.30);
    }

    // t=1.2s — Foundry machinery ambience enters gently
    setTimeout(() => {
      if (!this.ctx) return;
      this.startAmbient('foundry');
    }, 1200);

    // t=2.8s — ARIA hologram activation
    setTimeout(() => {
      if (!this.ctx) return;
      const th = this.ctx.currentTime;
      // Rising tone cascade — hologram booting up
      [440, 660, 880, 1320, 1760].forEach((f, i) =>
        this._tone(f, 'triangle', th + i * 0.08, 0.22, 0.055, 0.01, 0.5)
      );
      // Soft data-stream noise
      this._noise(2000, 'highpass', 0.6, th + 0.1, 0.35, 0.025);
    }, 2800);

    // t=4.2s — Void breach: cut ambient, silence
    setTimeout(() => {
      if (!this._ambientGainNode || !this.ctx) return;
      const ts = this.ctx.currentTime;
      this._ambientGainNode.gain.cancelScheduledValues(ts);
      this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, ts);
      this._ambientGainNode.gain.linearRampToValueAtTime(0, ts + 0.25);
    }, 4200);

    // t=4.8s — Alarm + bass impact + corruption wave
    setTimeout(() => {
      if (!this.ctx) return;
      const ta = this.ctx.currentTime;
      // Warning ping
      this._tone(880, 'sine', ta, 0.12, 0.10, 0.005, 0.4);
      this._tone(1320, 'triangle', ta + 0.08, 0.10, 0.07, 0.003, 0.5);
      // Bass impact
      this._sweep(90, 25, 'sine', ta + 0.15, 1.0, 0.18);
      // Corruption noise wave
      this._noise(600, 'lowpass', 0.5, ta + 0.18, 0.35, 0.10);
      this._reverbBoom(ta + 0.2, 0.55);
      // Void ambience rises through the chaos
      setTimeout(() => this.startAmbient('circuit'), 600);
    }, 4800);

    // t=6.5s — Player suit boot + HUD activation
    setTimeout(() => {
      if (!this.ctx) return;
      const tp = this.ctx.currentTime;
      // Boot sequence: rapid ascending blips
      [220, 330, 440, 660, 880].forEach((f, i) =>
        this._tone(f, 'triangle', tp + i * 0.055, 0.06, 0.06, 0.005, 0.4)
      );
      // System ready chime
      this._tone(1046.5, 'sine', tp + 0.32, 0.14, 0.08, 0.01, 0.55);
      this._tone(1318.5, 'triangle', tp + 0.42, 0.14, 0.065, 0.01, 0.55);
    }, 6500);

    // t=8.0s — Music enters
    setTimeout(() => {
      this._introActive = false;
      onMusicReady?.();
    }, 8000);
  }

  // ==========================================================================
  // VICTORY / RESTORATION
  // The emotional arc of defeat over tension — restoring harmony.
  // ==========================================================================

  /** Play after boss death, before victory scene. Removes tension, restores harmony. */
  playVictoryRestoration(): void {
    if (!this.ctx) return;
    // Silence the reactor heartbeat if still going
    this._stopReactorHeartbeat();
    this._reactorState = 'stable';
    this.setHighIntensity(false);

    // Fade ambient down for the silence moment — let the player breathe
    if (this._ambientGainNode) {
      const t = this.ctx.currentTime;
      this._ambientGainNode.gain.cancelScheduledValues(t);
      this._ambientGainNode.gain.setValueAtTime(this._ambientGainNode.gain.value, t);
      this._ambientGainNode.gain.linearRampToValueAtTime(0.12, t + 2.0);  // not silent, just quiet
    }

    // After 1s: a single clear major-chord chime — order restored
    setTimeout(() => {
      if (!this.ctx) return;
      const tc = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this._tone(f, 'triangle', tc + i * 0.10, 0.6, 0.07, 0.02, 0.5)
      );
      this._reverbBoom(tc + 0.3, 0.20);
    }, 1000);
  }

  // ==========================================================================
  // VOLUME CONTROL
  // ==========================================================================

  setMute(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : this._masterVol;
    try { if (this._scene?.sound) this._scene.sound.mute = muted; } catch { /* ok */ }
  }

  get isMuted(): boolean { return this.muted; }

  setMasterVolume(vol: number): void {
    this._masterVol = Math.max(0, Math.min(1, vol));
    if (this.masterGain && !this.muted) this.masterGain.gain.value = this._masterVol;
    try { if (this._scene?.sound) this._scene.sound.volume = this._masterVol; } catch { /* ok */ }
  }

  setSFXVolume(vol: number): void {
    this._sfxVol = Math.max(0, Math.min(1, vol));
    if (this._sfxBus) this._sfxBus.gain.value = this._sfxVol;
  }

  setMusicVolume(vol: number): void {
    this._musicVol = Math.max(0, Math.min(1, vol));
    // Update all active Phaser music tracks
    const target = 0.32 * this._musicVol;
    try {
      if (this._scene?.sound?.getAllPlaying) {
        const playing = this._scene.sound.getAllPlaying() as { setVolume?: (v: number) => void; key?: string }[];
        for (const snd of playing) {
          if (snd?.setVolume) snd.setVolume(target);
        }
      }
    } catch { /* ok */ }
  }

  get masterVolume(): number { return this._masterVol; }
  get sfxVolume():    number { return this._sfxVol; }
  get musicVolume():  number { return this._musicVol; }

  // ==========================================================================
  // PROCEDURAL MUSIC (fallback only — used when audio files fail to load)
  // ==========================================================================

  private _stopProceduralMusic(): void {
    this._rhythmActive = false;
    if (this._beatTimeout !== null) { clearTimeout(this._beatTimeout); this._beatTimeout = null; }
    this._nextEvt = {};
    if (!this.ctx || !this._musicGain) return;
    const t = this.ctx.currentTime;
    const gain = this._musicGain; const nodes = this._musicNodes;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.8);
    this._musicGain = null; this._musicNodes = [];
    setTimeout(() => {
      nodes.forEach(n => { if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } } try { n.disconnect(); } catch { /* ok */ } });
      try { gain.disconnect(); } catch { /* ok */ }
    }, 900);
  }

  private _stopProceduralBoss(): void {
    this._bossRhythm = false;
    if (this._bossRhythmTO !== null) { clearTimeout(this._bossRhythmTO); this._bossRhythmTO = null; }
    if (!this.ctx || !this._bossMusicGain) return;
    const t = this.ctx.currentTime;
    const gain = this._bossMusicGain; const nodes = this._bossMusicNodes;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.2);
    this._bossMusicGain = null; this._bossMusicNodes = [];
    setTimeout(() => {
      nodes.forEach(n => { if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } } try { n.disconnect(); } catch { /* ok */ } });
      try { gain.disconnect(); } catch { /* ok */ }
    }, 1300);
  }

  private _stopProceduralTitle(): void {
    if (this._titleSparkle !== null) { clearInterval(this._titleSparkle); this._titleSparkle = null; }
    if (!this.ctx || !this._titleGain) return;
    const t = this.ctx.currentTime;
    const gain = this._titleGain; const nodes = this._titleNodes;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.5);
    this._titleGain = null; this._titleNodes = [];
    setTimeout(() => {
      nodes.forEach(n => { if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } } try { n.disconnect(); } catch { /* ok */ } });
      try { gain.disconnect(); } catch { /* ok */ }
    }, 1600);
  }

  private _stopAllMusicProcedural(): void {
    this._stopProceduralMusic();
    this._stopProceduralBoss();
    this._stopProceduralTitle();
  }

  private _startProceduralGameplay(theme: 'foundry' | 'circuit'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const gain  = ctx.createGain(); gain.connect(this.masterGain);
    if (theme === 'foundry') {
      gain.gain.value = 0.50;
      for (const freq of [130.81, 164.81, 196]) {
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq; og.gain.value = 0.12;
        osc.connect(og).connect(gain); osc.start(); nodes.push(osc, og);
      }
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
      const lfoD = ctx.createGain(); lfoD.gain.value = 0.05;
      lfo.connect(lfoD).connect(gain.gain); lfo.start(); nodes.push(lfo, lfoD);
    } else {
      gain.gain.value = 0.46;
      for (const freq of [220, 329.63]) {
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq; og.gain.value = 0.10;
        osc.connect(og).connect(gain); osc.start(); nodes.push(osc, og);
      }
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.3;
      const lfoD = ctx.createGain(); lfoD.gain.value = 0.04;
      lfo.connect(lfoD).connect(gain.gain); lfo.start(); nodes.push(lfo, lfoD);
    }
    this._musicGain = gain; this._musicNodes = nodes;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(gain.gain.value, t + 1.2);
    this._rhythmActive = true; this._nextEvt = {}; this._arpIdx = 0;
    this._scheduleRhythm(theme);
  }

  private _scheduleRhythm(theme: 'foundry' | 'circuit'): void {
    if (!this._rhythmActive || !this.ctx) return;
    const ctx = this.ctx; const now = ctx.currentTime;
    const LOOK = 0.18; const TICK = 55;

    if (theme === 'foundry') {
      const MEL = [261.63, 293.66, 329.63, 392, 440];
      const PAT = [0, 2, 4, 3, 1, 3, 4, 2];
      if (this._nextEvt['e_bass']  === undefined) this._nextEvt['e_bass']  = now;
      if (this._nextEvt['e_mel']   === undefined) this._nextEvt['e_mel']   = now;
      if (this._nextEvt['e_pulse'] === undefined) this._nextEvt['e_pulse'] = now + 0.375;
      while (this._nextEvt['e_bass'] < now + LOOK) {
        const t = this._nextEvt['e_bass'];
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(65.4, t); osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
        g.gain.setValueAtTime(0.065, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.36);
        this._nextEvt['e_bass'] += 1.5;
      }
      while (this._nextEvt['e_mel'] < now + LOOK) {
        const t = this._nextEvt['e_mel'];
        const freq = MEL[PAT[this._arpIdx % PAT.length]]; this._arpIdx++;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t + 0.015);
        g.gain.setValueAtTime(0.13, t + 0.56); g.gain.linearRampToValueAtTime(0, t + 0.72);
        osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.73);
        this._nextEvt['e_mel'] += 0.75;
      }
      while (this._nextEvt['e_pulse'] < now + LOOK) {
        const t = this._nextEvt['e_pulse'];
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = 196;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.055, t + 0.008);
        g.gain.linearRampToValueAtTime(0, t + 0.09);
        osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.1);
        this._nextEvt['e_pulse'] += 1.5;
      }
    } else {
      const MEL = [220, 261.63, 293.66, 329.63, 392];
      const PAT = [0, 2, 4, 3, 1, 4, 2, 0];
      if (this._nextEvt['a_kick'] === undefined) this._nextEvt['a_kick'] = now;
      if (this._nextEvt['a_hat']  === undefined) this._nextEvt['a_hat']  = now + 0.125;
      if (this._nextEvt['a_mel']  === undefined) this._nextEvt['a_mel']  = now;
      while (this._nextEvt['a_kick'] < now + LOOK) {
        const t = this._nextEvt['a_kick'];
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(82, t); osc.frequency.exponentialRampToValueAtTime(28, t + 0.14);
        g.gain.setValueAtTime(0.085, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.21);
        this._nextEvt['a_kick'] += 0.5;
      }
      while (this._nextEvt['a_hat'] < now + LOOK) {
        const t = this._nextEvt['a_hat'];
        const src = ctx.createBufferSource(); src.buffer = this._noiseBuffer(0.028);
        const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1200;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.035, t); g.gain.linearRampToValueAtTime(0, t + 0.025);
        src.connect(filt).connect(g).connect(this.masterGain); src.start(t); src.stop(t + 0.03);
        this._nextEvt['a_hat'] += 0.25;
      }
      while (this._nextEvt['a_mel'] < now + LOOK) {
        const t = this._nextEvt['a_mel'];
        const freq = MEL[PAT[this._arpIdx % PAT.length]]; this._arpIdx++;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.095, t + 0.010);
        g.gain.setValueAtTime(0.095, t + 0.17); g.gain.linearRampToValueAtTime(0, t + 0.22);
        osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.23);
        this._nextEvt['a_mel'] += 0.25;
      }
    }
    this._beatTimeout = setTimeout(() => this._scheduleRhythm(theme), TICK);
  }

  private _startProceduralBoss(): void {
    if (!this.ctx) return;
    const ctx = this.ctx; const nodes: AudioNode[] = [];
    const gain = ctx.createGain(); gain.connect(this.masterGain);
    for (const [freq, det] of [[110, -8], [155.56, 6]] as [number, number][]) {
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq; osc.detune.value = det; og.gain.value = 0.13;
      osc.connect(og).connect(gain); osc.start(); nodes.push(osc, og);
    }
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lfoD = ctx.createGain(); lfoD.gain.value = 0.04;
    lfo.connect(lfoD).connect(gain.gain); lfo.start(); nodes.push(lfo, lfoD);
    this._bossMusicGain = gain; this._bossMusicNodes = nodes;
    const t = this.now; gain.gain.value = 0.52;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.52, t + 1.5);
    this._bossRhythm = true; this._bossEvt = {}; this._bossArpIdx = 0;
    this._scheduleBossRhythm();
  }

  private _scheduleBossRhythm(): void {
    if (!this._bossRhythm || !this.ctx) return;
    const ctx = this.ctx; const now = ctx.currentTime;
    const LOOK = 0.18; const TICK = 55;
    const NOTES = [110, 130.81, 155.56, 164.81, 196];
    const PAT   = [0, 2, 1, 3, 0, 4, 1, 2];
    if (this._bossEvt['b_kick'] === undefined) this._bossEvt['b_kick'] = now;
    if (this._bossEvt['b_hat']  === undefined) this._bossEvt['b_hat']  = now + 0.107;
    if (this._bossEvt['b_arp']  === undefined) this._bossEvt['b_arp']  = now;
    while (this._bossEvt['b_kick'] < now + LOOK) {
      const t = this._bossEvt['b_kick'];
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(65, t); osc.frequency.exponentialRampToValueAtTime(22, t + 0.18);
      g.gain.setValueAtTime(0.105, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.25);
      this._bossEvt['b_kick'] += 0.43;
    }
    while (this._bossEvt['b_hat'] < now + LOOK) {
      const t = this._bossEvt['b_hat'];
      const src = ctx.createBufferSource(); src.buffer = this._noiseBuffer(0.03);
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 800;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.038, t); g.gain.linearRampToValueAtTime(0, t + 0.028);
      src.connect(filt).connect(g).connect(this.masterGain); src.start(t); src.stop(t + 0.03);
      this._bossEvt['b_hat'] += 0.215;
    }
    while (this._bossEvt['b_arp'] < now + LOOK) {
      const t = this._bossEvt['b_arp'];
      const freq = NOTES[PAT[this._bossArpIdx % PAT.length]]; this._bossArpIdx++;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.012);
      g.gain.setValueAtTime(0.10, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.38);
      osc.connect(g).connect(this.masterGain); osc.start(t); osc.stop(t + 0.39);
      this._bossEvt['b_arp'] += 0.43;
    }
    this._bossRhythmTO = setTimeout(() => this._scheduleBossRhythm(), TICK);
  }

  private _startProceduralTitle(): void {
    if (!this.ctx) return;
    const ctx = this.ctx; const nodes: AudioNode[] = [];
    const gain = ctx.createGain(); gain.connect(this.masterGain);
    for (const [freq, vol] of [[130.81, 0.17], [164.81, 0.13], [196, 0.12], [246.94, 0.09]] as [number, number][]) {
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq; og.gain.value = vol;
      osc.connect(og).connect(gain); osc.start(); nodes.push(osc, og);
    }
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.04;
    const lfoD = ctx.createGain(); lfoD.gain.value = 0.018;
    lfo.connect(lfoD).connect(gain.gain); lfo.start(); nodes.push(lfo, lfoD);
    this._titleGain = gain; this._titleNodes = nodes;
    const t = this.now; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.42, t + 2.0);
    this._titleSpkIdx = 0;
    const notes = [523.25, 659.25, 783.99];
    this._titleSparkle = setInterval(() => {
      if (!this._titleGain || !this.ctx) return;
      const st = this.ctx.currentTime;
      const freq = notes[this._titleSpkIdx % notes.length]; this._titleSpkIdx++;
      this._tone(freq, 'sine', st, 0.55, 0.06, 0.03, 0.5);
    }, 2200);
  }
}

// ---------------------------------------------------------------------------
// Type helper — Phaser sound objects (typed as any in Phaser internals)
// ---------------------------------------------------------------------------
interface PhaserSound {
  stop(): void;
  destroy(): void;
}
