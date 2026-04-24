// ---------------------------------------------------------------------------
// AudioManager — Soft Procedural Web Audio for SCRAP ARENA
// ---------------------------------------------------------------------------
// Design philosophy: "Puzzle · Adventure · Action"
//   • All sounds use gentle sine / triangle waveforms — no raw sawtooth or square
//   • Noise filtered hard below 1.2 kHz — eliminates harsh hiss
//   • Global DynamicsCompressor prevents any clip or sudden spike
//   • masterGain = 0.12 (was 0.30) — comfortable listening level
//
// Public API is 100% backward-compatible with the previous version.
// New helpers: roomEnter, doorUnlock, upgradeSelect, toxicTick, barrierDeny
// ---------------------------------------------------------------------------

export class AudioManager {
  private static _instance: AudioManager;

  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private warmthFilter!: BiquadFilterNode;       // LP 10 kHz — trims harshness
  private compressor!: DynamicsCompressorNode;   // safety limiter
  // Cinematic reverb send — gives explosions / boss hits a real space
  private _reverbBus!: GainNode;
  private _reverbSend!: ConvolverNode;
  private muted = false;

  // ── Gameplay music state ─────────────────────────────────────────────────
  private _musicGain: GainNode | null = null;
  private _musicNodes: AudioNode[] = [];
  private _rhythmRunning = false;
  private _beatTimeout: ReturnType<typeof setTimeout> | null = null;
  private _arpIdx = 0;
  private _nextEventTimes: Record<string, number> = {};

  // ── Boss music state ─────────────────────────────────────────────────────
  private _bossMusicGain: GainNode | null = null;
  private _bossMusicNodes: AudioNode[] = [];
  private _bossRhythmRunning = false;
  private _bossRhythmTimeout: ReturnType<typeof setTimeout> | null = null;
  private _bossArpIdx = 0;
  private _bossNextTimes: Record<string, number> = {};

  // ── Title music state ────────────────────────────────────────────────────
  private _titleMusicGain: GainNode | null = null;
  private _titleMusicNodes: AudioNode[] = [];
  private _titleSparkleInterval: ReturnType<typeof setInterval> | null = null;
  private _titleSparkleIdx = 0;

  // ── Phaser scene integration ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _scene: any = null;   // Phaser.Scene — typed as any to avoid import
  private _phaserMainMusic: { stop(): void; destroy(): void } | null = null;
  private _phaserBossMusic2: { stop(): void; destroy(): void } | null = null;
  private _phaserTitleMusic2: { stop(): void; destroy(): void } | null = null;
  private _mainMusicDuckedFromVol: number | null = null;
  private _shootThrottle = 0;

  // ── Singleton ────────────────────────────────────────────────────────────
  static get instance(): AudioManager {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager();
    }
    return AudioManager._instance;
  }

  /**
   * Called from MainScene.create() so AudioManager can delegate sound
   * playback to Phaser's sound manager for file-based audio.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setScene(scene: any): void {
    this._scene = scene;
  }

  /** Play a loaded audio key via Phaser. Returns true if played. */
  private _sfx(key: string, volume = 0.8): boolean {
    if (!this._scene) return false;
    try {
      if (this._scene.cache.audio.exists(key)) {
        this._scene.sound.play(key, { volume });
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  /** Start a looping music file via Phaser. Returns the sound object. */
  private _musicFile(key: string, volume = 0.25): { stop(): void; destroy(): void } | null {
    if (!this._scene) return null;
    try {
      if (this._scene.cache.audio.exists(key)) {
        const snd = this._scene.sound.add(key, { loop: true, volume });
        snd.play();
        return snd as { stop(): void; destroy(): void };
      }
    } catch { /* ignore */ }
    return null;
  }

  /** Stop and destroy a Phaser music sound object. */
  private _stopMusicFile(snd: { stop(): void; destroy(): void } | null): void {
    if (!snd) return;
    try { snd.stop(); snd.destroy(); } catch { /* ignore */ }
  }

  /** Stop every active music layer, regardless of which scene started it. */
  private _stopAllMusicFiles(): void {
    this._stopMusicFile(this._phaserMainMusic);
    this._stopMusicFile(this._phaserBossMusic2);
    this._stopMusicFile(this._phaserTitleMusic2);
    this._phaserMainMusic = null;
    this._phaserBossMusic2 = null;
    this._phaserTitleMusic2 = null;
  }

  /** Call once on first user gesture to unlock Web Audio. */
  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();

      // Signal chain: sounds → masterGain → warmthFilter → compressor → output
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value      = 12;
      this.compressor.ratio.value     = 4;
      this.compressor.attack.value    = 0.005;
      this.compressor.release.value   = 0.25;
      this.compressor.connect(this.ctx.destination);

      this.warmthFilter = this.ctx.createBiquadFilter();
      this.warmthFilter.type            = 'lowpass';
      this.warmthFilter.frequency.value = 10000;   // gently rolls off harsh highs
      this.warmthFilter.connect(this.compressor);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.12;           // 60% quieter than before
      this.masterGain.connect(this.warmthFilter);

      // ── Cinematic plate reverb (industrial hangar) ────────────────────
      // A short procedurally-generated impulse response gives big SFX a
      // sense of physical SPACE without bloating the bundle with a wav.
      const irLen = 0.9; // sec — feels like a metal corridor
      const ir = this.ctx.createBuffer(2, Math.floor(this.ctx.sampleRate * irLen), this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          // Exponentially-decayed white noise = cheap convincing reverb tail
          const t = i / data.length;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
        }
      }
      this._reverbSend = this.ctx.createConvolver();
      this._reverbSend.buffer = ir;
      this._reverbBus = this.ctx.createGain();
      this._reverbBus.gain.value = 0.35;
      this._reverbSend.connect(this._reverbBus);
      this._reverbBus.connect(this.warmthFilter);
    } catch {
      this.ctx = null;
    }
  }

  /** Routes a node through the cinematic reverb send (in addition to dry). */
  // @ts-ignore — reserved for future per-SFX wet sends
  private _sendToReverb(node: AudioNode, amount = 0.5): void {
    if (!this.ctx || !this._reverbSend) return;
    const send = this.ctx.createGain();
    send.gain.value = amount;
    node.connect(send);
    send.connect(this._reverbSend);
  }

  /**
   * Cinematic "world bends" stinger. Big sub-bass drop + filtered noise
   * sweep + reverb wash. Fires when the station reconfigures itself.
   */
  worldShift(): void {
    if (!this.ctx) return;
    const t = this.now;
    // Sub drop
    this._sweep(140, 38, 'sine', t, 1.2, 0.18);
    // Metal stress sweep
    this._sweep(900, 220, 'sawtooth', t + 0.1, 0.7, 0.05);
    // Wet noise wash through reverb
    this._reverbBoom(t, 0.6);
    this._reverbBoom(t + 0.25, 0.4);
    this._reverbBoom(t + 0.55, 0.25);
    // Bell shimmer overtone
    this._sweep(1760, 1320, 'triangle', t + 0.12, 0.55, 0.04);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private get now(): number { return this.ctx!.currentTime; }

  /** Short white-noise buffer. */
  private noiseBuffer(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * Schedule a single soft tone.
   * @param type      'sine' or 'triangle' — never sawtooth/square directly
   * @param attackMs  rise time in seconds (default 8 ms)
   * @param relFrac   fraction of duration used for release (default 0.35)
   */
  private _tone(
    freq: number,
    type: OscillatorType,
    t: number,
    duration: number,
    peak: number,
    attackSec = 0.008,
    relFrac   = 0.35,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type            = type;
    osc.frequency.value = freq;
    const rel     = duration * relFrac;
    const sustain = Math.max(0, duration - attackSec - rel);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attackSec);
    g.gain.setValueAtTime(peak, t + attackSec + sustain);
    g.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  /**
   * Frequency sweep using exponential ramp — smooth, not jarring.
   * peakGain decays to near-zero by end of duration.
   */
  private _sweep(
    freqA: number,
    freqB: number,
    type: OscillatorType,
    t: number,
    duration: number,
    peak: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(freqB, t + duration);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  /**
   * Filtered noise burst.
   * filterFreq MUST stay ≤ 1500 Hz for a soft result.
   */
  private _noise(
    filterFreq: number,
    filterType: BiquadFilterType,
    Q: number,
    t: number,
    duration: number,
    peak: number,
  ): void {
    if (!this.ctx) return;
    const src  = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(duration + 0.02);
    const filt = this.ctx.createBiquadFilter();
    filt.type            = filterType;
    filt.frequency.value = filterFreq;
    filt.Q.value         = Q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filt).connect(g).connect(this.masterGain);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  // ==========================================================================
  // SOUND EFFECTS
  // ==========================================================================

  /** Clean sci-fi zap — uses real laser SFX when loaded. */
  shoot(): void {
    if (!this.ctx) return;
    this._shootThrottle = (this._shootThrottle + 1) % 2;
    const key = this._shootThrottle === 0 ? 'sfx_shoot' : 'sfx_shoot2';
    if (this._sfx(key, 0.45)) return;
    const t = this.now;
    this._sweep(520, 180, 'sine', t, 0.08, 0.12);
    this._tone(1100, 'sine', t, 0.014, 0.04, 0.002, 0.9);
  }

  /** Soft metallic impact — uses real impact SFX when loaded. */
  hit(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_hit', 0.6)) return;
    const t = this.now;
    this._sweep(280, 90, 'sine', t, 0.1, 0.08);
    this._noise(700, 'lowpass', 1.0, t, 0.07, 0.06);
  }

  /** Deep explosion — uses real explosion SFX when loaded. */
  explosion(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_explosion', 0.7)) return;
    const t = this.now;
    this._sweep(260, 45, 'sine', t, 0.45, 0.13);
    this._sweep(180, 70, 'sine', t, 0.3, 0.08);
    this._noise(650, 'lowpass', 0.5, t, 0.22, 0.09);
    // Wet tail through reverb bus — gives boom a real sense of place
    this._reverbBoom(t, 0.55);
  }

  /** Adds a short wet noise burst into the reverb bus for cinematic weight. */
  private _reverbBoom(t: number, level = 0.4): void {
    if (!this.ctx || !this._reverbSend) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.18);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filt).connect(g).connect(this._reverbSend);
    src.start(t); src.stop(t + 0.2);
  }

  /** Thruster dash — uses real thruster SFX when loaded. */
  dash(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_dash', 0.5)) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.22);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(900, t);
    filt.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    filt.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.linearRampToValueAtTime(0, t + 0.18);
    src.connect(filt).connect(g).connect(this.masterGain);
    src.start(t); src.stop(t + 0.22);
    this._sweep(240, 160, 'sine', t, 0.18, 0.05); // body tone
  }

  /** Magical portal shimmer — uses switch SFX when loaded. */
  worldSwitch(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_switch', 0.7)) return;
    const t = this.now;
    // Deep mechanical clunk — heavy sub-bass drop
    this._sweep(90, 28, 'sine', t, 1.4, 0.15);
    // Dual detuned oscillators sweeping up (dimension rip feel)
    for (const det of [-20, 20]) {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type         = 'sine';
      osc.detune.value = det;
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.linearRampToValueAtTime(780, t + 0.18);
      osc.frequency.linearRampToValueAtTime(260, t + 0.42);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.10, t + 0.02);
      g.gain.setValueAtTime(0.10, t + 0.32);
      g.gain.linearRampToValueAtTime(0, t + 0.48);
      osc.connect(g).connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.52);
    }
    // High metallic shimmer
    this._sweep(2200, 1100, 'triangle', t + 0.05, 0.28, 0.03);
    this._sweep(1320, 880,  'sine',     t + 0.10, 0.30, 0.04);
    // Noise burst (machinery engaging)
    this._noise(1200, 'bandpass', 0.55, t, 0.08, 0.05);
    // Send to reverb for spatial feel
    this._reverbBoom(t + 0.15, 0.30);
  }

  /**
   * Reactor damage alarm — two-tone industrial siren clang.
   * Call once per reactor hit (debounced by caller).
   */
  reactorAlarm(): void {
    if (!this.ctx) return;
    const t = this.now;
    // Alarm sweep down: high urgency
    this._sweep(880, 440, 'sine',     t,        0.55, 0.08);
    this._sweep(660, 330, 'triangle', t + 0.08, 0.45, 0.06);
    // Low metallic clank
    this._sweep(120, 55, 'sine', t + 0.12, 0.65, 0.10);
    // Noise crack
    this._noise(600, 'bandpass', 0.40, t, 0.07, 0.04);
  }

  /** Coin/item pickup — uses real confirmation SFX when loaded. */
  pickup(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_pickup', 0.8)) return;
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this._tone(freq, 'triangle', t + i * 0.055, 0.14, 0.13, 0.006, 0.5),
    );
  }

  /** Player takes damage — uses real impact SFX when loaded. */
  playerHit(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_player_hit', 0.75)) return;
    const t = this.now;
    this._sweep(200, 75, 'sine', t, 0.13, 0.10);
    this._noise(550, 'lowpass', 0.8, t, 0.09, 0.06);
  }

  /** Player death — uses real explosion SFX when loaded. */
  playerDeath(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_player_death', 0.85)) return;
    const t = this.now;
    this._sweep(380, 55, 'sine', t, 1.1, 0.13);
    this._sweep(200, 45, 'sine', t + 0.25, 0.9, 0.08);
    this._noise(400, 'lowpass', 0.5, t, 0.2, 0.07);
  }

  /** Wave clear — uses real jingle SFX when loaded. */
  waveComplete(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_wave_complete', 0.8)) return;
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this._tone(freq, 'sine', t + i * 0.09, 0.22, 0.17, 0.008, 0.35),
    );
  }

  /** Escalating pleasant pings on combo milestones. */
  comboHit(count: number): void {
    if (!this.ctx) return;
    const t = this.now;
    if (count >= 10) {
      [523.25, 659.25, 783.99].forEach(f =>
        this._tone(f, 'triangle', t, 0.14, 0.12, 0.005, 0.5),
      );
    } else if (count >= 5) {
      this._tone(600, 'sine', t, 0.08, 0.10, 0.005, 0.4);
      this._tone(900, 'sine', t + 0.055, 0.08, 0.10, 0.005, 0.4);
    } else if (count >= 3) {
      this._tone(800, 'sine', t, 0.06, 0.09, 0.005, 0.45);
    }
  }

  /** Soft warning triple-beep. */
  overheatWarning(): void {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      this._tone(560, 'sine', t + i * 0.1, 0.04, 0.10, 0.005, 0.4);
    }
  }

  /** Gentle warble using LFO on oscillator frequency — never sawtooth. */
  overheatActive(): void {
    if (!this.ctx) return;
    const t = this.now;
    const osc  = this.ctx.createOscillator();
    const g    = this.ctx.createGain();
    const lfo  = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = 340;
    lfo.type            = 'sine';
    lfo.frequency.value = 9;
    lfoG.gain.value     = 55;
    lfo.connect(lfoG).connect(osc.frequency);
    g.gain.setValueAtTime(0.08, t);
    g.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.connect(g).connect(this.masterGain);
    osc.start(t); lfo.start(t);
    osc.stop(t + 0.3); lfo.stop(t + 0.3);
  }

  // ==========================================================================
  // NEW CONTEXTUAL SFX
  // ==========================================================================

  /**
   * Distinctive room-entry sting per theme.
   * Call this when the player camera transitions to a new room.
   */
  roomEnter(theme: string): void {
    if (!this.ctx) return;
    const t = this.now;
    switch (theme) {
      case 'hub':
        // Warm welcome: C major triad arpeggio
        [523.25, 659.25, 783.99].forEach((f, i) =>
          this._tone(f, 'triangle', t + i * 0.04, 0.18, 0.09, 0.01, 0.5),
        );
        break;
      case 'factory':
        // Organic rise — bio lab curiosity
        this._sweep(440, 550, 'triangle', t, 0.12, 0.08);
        this._tone(660, 'sine', t + 0.1, 0.1, 0.07, 0.01, 0.6);
        break;
      case 'server':
        // Digital blip pair — data handshake
        this._tone(880, 'sine', t, 0.07, 0.07, 0.004, 0.4);
        this._tone(1100, 'sine', t + 0.06, 0.07, 0.06, 0.004, 0.4);
        break;
      case 'power':
        // Electric pulse — reactor hum
        this._sweep(110, 180, 'triangle', t, 0.18, 0.10);
        this._noise(500, 'lowpass', 0.6, t + 0.05, 0.12, 0.05);
        break;
      case 'control':
        // Confident mid tones — command authority
        this._tone(440, 'sine', t, 0.12, 0.08, 0.008, 0.45);
        this._tone(550, 'triangle', t + 0.08, 0.1, 0.07, 0.008, 0.5);
        break;
      case 'maintenance':
        // Clunk + settle — industrial supply
        this._sweep(330, 220, 'triangle', t, 0.1, 0.08);
        this._noise(350, 'lowpass', 1.0, t, 0.06, 0.05);
        break;
      case 'armory':
        // Alert charge — combat readiness
        this._sweep(220, 330, 'triangle', t, 0.08, 0.10);
        this._noise(400, 'lowpass', 1.0, t, 0.06, 0.06);
        this._tone(440, 'sine', t + 0.07, 0.1, 0.07, 0.01, 0.5);
        break;
      case 'quarantine':
        // Unsettling minor 3rd descent — hazard warning
        this._sweep(440, 370, 'sine', t, 0.22, 0.07);
        this._tone(185, 'sine', t + 0.05, 0.2, 0.05, 0.01, 0.7);
        break;
      case 'vault':
        // High security double-ping
        this._tone(880, 'sine', t, 0.1, 0.08, 0.005, 0.5);
        this._tone(660, 'sine', t + 0.08, 0.12, 0.07, 0.005, 0.5);
        break;
      default:
        this._tone(440, 'sine', t, 0.12, 0.07, 0.01, 0.5);
    }
  }

  /** Triumphant unlock jingle — uses door SFX when loaded. */
  doorUnlock(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_door_open', 0.7)) return;
    const t = this.now;
    [783.99, 987.77, 1174.66].forEach((f, i) =>
      this._tone(f, 'triangle', t + i * 0.07, 0.2, 0.13, 0.008, 0.4),
    );
  }

  /** Upgrade selected — uses real maximize SFX when loaded. */
  upgradeSelect(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_upgrade', 0.8)) return;
    const t = this.now;
    this._tone(523.25, 'triangle', t, 0.10, 0.11, 0.008, 0.4);
    this._tone(783.99, 'sine', t + 0.07, 0.14, 0.12, 0.008, 0.4);
  }

  /** Very quiet toxic tick for quarantine damage-per-second. */
  toxicTick(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(210, 175, 'sine', t, 0.07, 0.032);
  }

  /** Barrier rejected — uses real error SFX when loaded. */
  barrierDeny(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_error', 0.7) || this._sfx('sfx_barrier', 0.5)) return;
    const t = this.now;
    this._sweep(240, 170, 'sine', t, 0.1, 0.09);
    this._tone(130, 'sine', t + 0.08, 0.1, 0.06, 0.01, 0.6);
  }

  // ==========================================================================
  // PLAYER ABILITY SFX
  // ==========================================================================

  /**
   * Nova Burst (E key) — 12 cyan bullets in a radial ring.
   * Quick energy charge → major-chord detonation → sub-bass boom.
   */
  novaBurst(): void {
    if (!this.ctx) return;
    const t = this.now;
    // Charge transient: rapid triangle rise 220→660 Hz
    this._sweep(220, 660, 'triangle', t, 0.06, 0.10);
    // Ring detonation: C4 + E4 + G4 + C5 chord simultaneously
    ([
      [261.63, 0.11],
      [329.63, 0.09],
      [392.00, 0.08],
      [523.25, 0.07],
    ] as [number, number][]).forEach(([freq, peak]) =>
      this._tone(freq, 'triangle', t + 0.06, 0.30, peak, 0.01, 0.50),
    );
    // Sub boom for physical weight
    this._sweep(160, 42, 'sine', t + 0.06, 0.28, 0.14);
    // Wide air-burst noise (soft, filtered low)
    this._noise(900, 'lowpass', 0.6, t + 0.06, 0.25, 0.08);
  }

  /**
   * Phase Surge (R key) — 8 focused purple bolts.
   * Twin detuned energy ramps create phasing → resonant crack → deep punch.
   */
  phaseSurge(): void {
    if (!this.ctx) return;
    const t = this.now;
    // Twin detuned triangle sweeps — phasing / warping sensation
    for (const det of [-8, 8]) {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'triangle';
      osc.detune.value = det;
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(840, t + 0.10);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.16);
    }
    // Resonant crack at release
    this._noise(650, 'bandpass', 1.5, t + 0.10, 0.10, 0.07);
    // Deep resonant punch
    this._sweep(260, 78, 'sine', t + 0.10, 0.22, 0.12);
  }

  /** Shield activated — uses real forceField SFX when loaded. */
  shieldUp(): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_shield', 0.7)) return;
    const t = this.now;
    // Ascending crystalline arpeggio: E5 → G5 → B5 → E6
    ([
      [659.25, 0.11],
      [783.99, 0.10],
      [987.77, 0.09],
      [1318.51, 0.07],
    ] as [number, number][]).forEach(([freq, peak], i) =>
      this._tone(freq, 'triangle', t + i * 0.08, 0.28, peak, 0.008, 0.55),
    );
    // Sustaining sine pad — "shield is active"
    this._tone(164.81, 'sine', t + 0.12, 0.55, 0.07, 0.02, 0.60);
    // High shimmer tail
    this._sweep(1760, 880, 'sine', t + 0.10, 0.35, 0.04);
  }

  /**
   * Shield absorbs a hit — crystalline deflection ping.
   * Higher and softer than playerHit so it clearly signals protection.
   */
  shieldAbsorb(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._sweep(1200, 700, 'triangle', t, 0.12, 0.07);
    this._noise(550, 'lowpass', 0.8, t, 0.07, 0.05);
  }

  /** Power-up activated — uses real SFX when loaded. */
  powerUp(type: string): void {
    if (!this.ctx) return;
    if (this._sfx('sfx_powerup', 0.8)) return;
    const t = this.now;
    switch (type) {
      case 'rapid_fire':
        // Accelerating C5 staccato tones — spin-up feel
        [0, 0.07, 0.13, 0.18].forEach((delay, i) =>
          this._tone(523.25 + i * 55, 'triangle', t + delay, 0.05, 0.12, 0.003, 0.5),
        );
        break;
      case 'shield_regen':
        // Warm Cmaj7 healing chord: C4 + E4 + G4 + B4
        [261.63, 329.63, 392.00, 493.88].forEach((freq, i) =>
          this._tone(freq, 'sine', t + i * 0.03, 0.38, 0.10, 0.012, 0.50),
        );
        break;
      case 'damage_boost':
        // Powerful ascending perfect fifth: C4 → G4 → C5
        ([
          [261.63, 0.13],
          [392.00, 0.12],
          [523.25, 0.11],
        ] as [number, number][]).forEach(([freq, peak], i) =>
          this._tone(freq, 'triangle', t + i * 0.09, 0.22, peak, 0.008, 0.4),
        );
        break;
      case 'speed_boost':
        // Upward zoom sweep + high sparkle
        this._sweep(180, 820, 'sine', t, 0.20, 0.09);
        this._tone(1318.51, 'sine', t + 0.14, 0.14, 0.06, 0.005, 0.55);
        break;
      default:
        this.pickup();
    }
  }

  /**
   * Low-HP heartbeat — two soft sine pulses mimicking a lub-dub rhythm.
   * Call from the game loop every ~1 500 ms when playerHp < 25% maxHp.
   * Gain is intentionally minimal so it adds tension without distracting.
   */
  lowHpPulse(): void {
    if (!this.ctx) return;
    const t = this.now;
    this._tone(88, 'sine', t,        0.040, 0.05, 0.005, 0.40); // lub
    this._tone(82, 'sine', t + 0.15, 0.035, 0.04, 0.005, 0.40); // dub
  }

  /**
   * Ability cooldown complete — small, soft chime unique per ability.
   *   nova_burst   → C6  (1046 Hz)
   *   phase_surge  → A5  (880 Hz)
   *   scrap_shield → E5  (659 Hz)
   */
  abilityReady(id: string): void {
    if (!this.ctx) return;
    const t = this.now;
    const freqMap: Record<string, number> = {
      nova_burst:   1046.50,
      phase_surge:   880.00,
      scrap_shield:  659.25,
    };
    const freq = freqMap[id] ?? 660;
    this._tone(freq,        'triangle', t,        0.10, 0.06, 0.005, 0.5);
    this._tone(freq * 1.25, 'sine',     t + 0.06, 0.08, 0.04, 0.004, 0.5);
  }

  // ==========================================================================
  // BACKGROUND MUSIC — GAMEPLAY
  // ==========================================================================

  /**
   * Builds the continuous ambient pad layer.
   *
   * 'foundry' → EXPLORATION / ADVENTURE mood
   *   Key: C major — warm, peaceful, inviting
   *   Pad: triangle C3 + E3 + G3, gentle gain-breathing LFO
   *
   * 'circuit' → ACTION / COMBAT mood
   *   Key: A minor — focused, driven
   *   Pad: triangle A3 + E4, subtle tremolo LFO
   */
  private _buildTheme(theme: 'foundry' | 'circuit'): { gain: GainNode; nodes: AudioNode[] } {
    const ctx   = this.ctx!;
    const nodes: AudioNode[] = [];
    const gain  = ctx.createGain();
    gain.connect(this.masterGain);

    if (theme === 'foundry') {
      gain.gain.value = 0.55;   // effective = 0.55 × masterGain 0.12 = 0.066
      for (const freq of [130.81, 164.81, 196]) {   // C3, E3, G3
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq; og.gain.value = 0.13;
        osc.connect(og).connect(gain); osc.start(); nodes.push(osc, og);
      }
      // Gentle breathing LFO 0.08 Hz — like a slow exhale
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
      const lfoD = ctx.createGain(); lfoD.gain.value = 0.05;
      lfo.connect(lfoD).connect(gain.gain); lfo.start();
      nodes.push(lfo, lfoD);
    } else {
      gain.gain.value = 0.50;   // effective = 0.060
      for (const freq of [220, 329.63]) {   // A3, E4
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq; og.gain.value = 0.11;
        osc.connect(og).connect(gain); osc.start(); nodes.push(osc, og);
      }
      // Faster tremolo 0.3 Hz — energy, pulse
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.3;
      const lfoD = ctx.createGain(); lfoD.gain.value = 0.04;
      lfo.connect(lfoD).connect(gain.gain); lfo.start();
      nodes.push(lfo, lfoD);
    }
    return { gain, nodes };
  }

  private _scheduleRhythm(theme: 'foundry' | 'circuit'): void {
    if (!this._rhythmRunning || !this.ctx) return;
    const ctx       = this.ctx;
    const LOOKAHEAD = 0.18;
    const TICK_MS   = 55;
    const now       = ctx.currentTime;

    // ── EXPLORATION (80 BPM = 0.75 s / beat) ────────────────────────────────
    if (theme === 'foundry') {
      // C major pentatonic: C4, D4, E4, G4, A4
      const MEL   = [261.63, 293.66, 329.63, 392, 440];
      const PAT   = [0, 2, 4, 3, 1, 3, 4, 2];   // peaceful ascending/descending

      if (this._nextEventTimes['e_bass']  === undefined) this._nextEventTimes['e_bass']  = now;
      if (this._nextEventTimes['e_mel']   === undefined) this._nextEventTimes['e_mel']   = now;
      if (this._nextEventTimes['e_pulse'] === undefined) this._nextEventTimes['e_pulse'] = now + 0.375;

      // Sub-bass pulse: C2 (65.4 Hz) sine — every 1.5 s (2 beats)
      while (this._nextEventTimes['e_bass'] < now + LOOKAHEAD) {
        const t = this._nextEventTimes['e_bass'];
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(65.4, t);
        osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
        g.gain.setValueAtTime(0.07, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(g).connect(this.masterGain);
        osc.start(t); osc.stop(t + 0.36);
        this._nextEventTimes['e_bass'] += 1.5;
      }

      // Melodic arpeggio: sine, every 0.75 s, long legato feel
      while (this._nextEventTimes['e_mel'] < now + LOOKAHEAD) {
        const t    = this._nextEventTimes['e_mel'];
        const freq = MEL[PAT[this._arpIdx % PAT.length]];
        this._arpIdx++;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.14, t + 0.015);
        g.gain.setValueAtTime(0.14, t + 0.56);
        g.gain.linearRampToValueAtTime(0, t + 0.72);
        osc.connect(g).connect(this.masterGain);
        osc.start(t); osc.stop(t + 0.73);
        this._nextEventTimes['e_mel'] += 0.75;
      }

      // Soft mid accent: triangle G3, every 1.5 s (off-beat)
      while (this._nextEventTimes['e_pulse'] < now + LOOKAHEAD) {
        const t = this._nextEventTimes['e_pulse'];
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = 196;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.008);
        g.gain.linearRampToValueAtTime(0, t + 0.09);
        osc.connect(g).connect(this.masterGain);
        osc.start(t); osc.stop(t + 0.1);
        this._nextEventTimes['e_pulse'] += 1.5;
      }

    // ── ACTION (120 BPM = 0.5 s / beat) ─────────────────────────────────────
    } else {
      // A minor pentatonic: A3, C4, D4, E4, G4
      const MEL = [220, 261.63, 293.66, 329.63, 392];
      const PAT = [0, 2, 4, 3, 1, 4, 2, 0];

      if (this._nextEventTimes['a_kick'] === undefined) this._nextEventTimes['a_kick'] = now;
      if (this._nextEventTimes['a_hat']  === undefined) this._nextEventTimes['a_hat']  = now + 0.125;
      if (this._nextEventTimes['a_mel']  === undefined) this._nextEventTimes['a_mel']  = now;

      // Kick: sine 82→28 Hz, every beat — warm and punchy, not boomy
      while (this._nextEventTimes['a_kick'] < now + LOOKAHEAD) {
        const t = this._nextEventTimes['a_kick'];
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(82, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.14);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(g).connect(this.masterGain);
        osc.start(t); osc.stop(t + 0.21);
        this._nextEventTimes['a_kick'] += 0.5;
      }

      // Hi-hat: noise LOWPASS 1200 Hz (NOT 8000 Hz bandpass Q=15 — that was brutal)
      while (this._nextEventTimes['a_hat'] < now + LOOKAHEAD) {
        const t   = this._nextEventTimes['a_hat'];
        const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(0.028);
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.04, t);
        g.gain.linearRampToValueAtTime(0, t + 0.025);
        src.connect(filt).connect(g).connect(this.masterGain);
        src.start(t); src.stop(t + 0.03);
        this._nextEventTimes['a_hat'] += 0.25;
      }

      // Melodic arp: triangle, every 0.25 s (16th notes at 120 BPM)
      while (this._nextEventTimes['a_mel'] < now + LOOKAHEAD) {
        const t    = this._nextEventTimes['a_mel'];
        const freq = MEL[PAT[this._arpIdx % PAT.length]];
        this._arpIdx++;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.10, t + 0.010);
        g.gain.setValueAtTime(0.10, t + 0.17);
        g.gain.linearRampToValueAtTime(0, t + 0.22);
        osc.connect(g).connect(this.masterGain);
        osc.start(t); osc.stop(t + 0.23);
        this._nextEventTimes['a_mel'] += 0.25;
      }
    }

    this._beatTimeout = setTimeout(() => this._scheduleRhythm(theme), TICK_MS);
  }

  startMusic(theme: 'foundry' | 'circuit'): void {
    if (!this.ctx) return;
    this._stopAllMusicFiles();
    if (this._musicGain) this.stopMusic();
    // Try file-based music first (rich NES loop)
    const fileMusic = this._musicFile('music_main', 0.22);
    if (fileMusic) {
      this._phaserMainMusic = fileMusic;
      return;
    }
    // Fallback to procedural
    const { gain, nodes } = this._buildTheme(theme);
    this._musicGain  = gain;
    this._musicNodes = nodes;
    const target = gain.gain.value;
    const t      = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(target, t + 1.2);
    this._rhythmRunning = true;
    this._nextEventTimes = {};
    this._arpIdx = 0;
    this._scheduleRhythm(theme);
  }

  stopMusic(): void {
    // Stop every file-based music layer so scene transitions cannot leak audio.
    this._stopAllMusicFiles();
    // Stop procedural music
    if (!this.ctx || !this._musicGain) return;
    this._rhythmRunning = false;
    if (this._beatTimeout !== null) { clearTimeout(this._beatTimeout); this._beatTimeout = null; }
    this._nextEventTimes = {};
    const t = this.ctx.currentTime;
    const gain = this._musicGain; const nodes = this._musicNodes;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.8);
    this._musicGain = null; this._musicNodes = [];
    setTimeout(() => {
      nodes.forEach(n => {
        if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } }
        try { n.disconnect(); } catch { /* ok */ }
      });
      try { gain.disconnect(); } catch { /* ok */ }
    }, 900);
  }

  crossfadeToTheme(theme: 'foundry' | 'circuit'): void {
    if (!this.ctx) return;
    // Both worlds (FOUNDRY + CIRCUIT) share the same gameplay music_main track.
    // When file-based main music is already playing, do nothing — uninterrupted
    // continuity across the world-switch is the intended design.
    if (this._phaserMainMusic) return;
    // Procedural fallback path: actually swap the theme.
    this._rhythmRunning = false;
    if (this._beatTimeout !== null) { clearTimeout(this._beatTimeout); this._beatTimeout = null; }
    this._nextEventTimes = {};
    const FADE = 1.5;
    const t    = this.ctx.currentTime;
    if (this._musicGain) {
      const old = this._musicGain; const oldNodes = this._musicNodes;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + FADE);
      setTimeout(() => {
        oldNodes.forEach(n => {
          if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } }
          try { n.disconnect(); } catch { /* ok */ }
        });
        try { old.disconnect(); } catch { /* ok */ }
      }, (FADE + 0.15) * 1000);
    }
    const { gain, nodes } = this._buildTheme(theme);
    this._musicGain  = gain;
    this._musicNodes = nodes;
    const target = gain.gain.value;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(target, t + FADE);
    this._rhythmRunning = true;
    this._arpIdx = 0;
    this._scheduleRhythm(theme);
  }

  // ==========================================================================
  // BOSS MUSIC — Ominous but controlled
  // ==========================================================================

  private _scheduleBossRhythm(): void {
    if (!this._bossRhythmRunning || !this.ctx) return;
    const ctx       = this.ctx;
    const LOOKAHEAD = 0.18;
    const TICK_MS   = 55;
    const now       = ctx.currentTime;

    // 140 BPM = 0.43 s/beat   |   A Phrygian feel
    // Notes: A2, C3, Eb3, E3, G3
    const NOTES = [110, 130.81, 155.56, 164.81, 196];
    const PAT   = [0, 2, 1, 3, 0, 4, 1, 2];

    if (this._bossNextTimes['b_kick'] === undefined) this._bossNextTimes['b_kick'] = now;
    if (this._bossNextTimes['b_hat']  === undefined) this._bossNextTimes['b_hat']  = now + 0.107;
    if (this._bossNextTimes['b_arp']  === undefined) this._bossNextTimes['b_arp']  = now;

    // Deep kick: sine 65→22 Hz — heavy but not over-loud
    while (this._bossNextTimes['b_kick'] < now + LOOKAHEAD) {
      const t = this._bossNextTimes['b_kick'];
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(65, t);
      osc.frequency.exponentialRampToValueAtTime(22, t + 0.18);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g).connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.25);
      this._bossNextTimes['b_kick'] += 0.43;
    }

    // Dark hat: noise lowpass 800 Hz (soft, dark thud — not piercing)
    while (this._bossNextTimes['b_hat'] < now + LOOKAHEAD) {
      const t   = this._bossNextTimes['b_hat'];
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(0.03);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.04, t);
      g.gain.linearRampToValueAtTime(0, t + 0.028);
      src.connect(filt).connect(g).connect(this.masterGain);
      src.start(t); src.stop(t + 0.03);
      this._bossNextTimes['b_hat'] += 0.215;
    }

    // Dark arp: triangle (soft odd harmonics — more ominous than sine, less harsh than sawtooth)
    while (this._bossNextTimes['b_arp'] < now + LOOKAHEAD) {
      const t    = this._bossNextTimes['b_arp'];
      const freq = NOTES[PAT[this._bossArpIdx % PAT.length]];
      this._bossArpIdx++;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.012);
      g.gain.setValueAtTime(0.11, t + 0.32);
      g.gain.linearRampToValueAtTime(0, t + 0.38);
      osc.connect(g).connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.39);
      this._bossNextTimes['b_arp'] += 0.43;
    }

    this._bossRhythmTimeout = setTimeout(() => this._scheduleBossRhythm(), TICK_MS);
  }

  startBossMusic(): void {
    if (!this.ctx) return;
    if (this._phaserTitleMusic2) {
      this._stopMusicFile(this._phaserTitleMusic2);
      this._phaserTitleMusic2 = null;
    }
    // Duck the main world track (music_main) instead of stopping it, so
    // it can resume seamlessly after the boss is defeated.
    const mm = this._phaserMainMusic as unknown as { volume?: number; setVolume?: (v: number) => void } | null;
    if (mm) {
      this._mainMusicDuckedFromVol = typeof mm.volume === 'number' ? mm.volume : 0.22;
      try { mm.setVolume?.(0); } catch { /* ignore */ }
    } else {
      // No file music; fall back to stopping procedural main loop entirely.
      this.stopMusic();
    }
    // Try file-based boss music first
    if (this._phaserBossMusic2) { this._stopMusicFile(this._phaserBossMusic2); this._phaserBossMusic2 = null; }
    const fileMusic = this._musicFile('music_boss', 0.28);
    if (fileMusic) {
      this._phaserBossMusic2 = fileMusic;
      // Also run the procedural drone underneath for ambience (at lower vol)
    }
    const ctx   = this.ctx;
    const nodes: AudioNode[] = [];
    const gain  = ctx.createGain();
    gain.connect(this.masterGain);

    // Ominous drone: triangle A2 + Eb3 slightly detuned
    for (const [freq, det] of [[110, -8], [155.56, 6]] as [number, number][]) {
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq; osc.detune.value = det;
      og.gain.value = 0.14;
      osc.connect(og).connect(gain); osc.start();
      nodes.push(osc, og);
    }

    // Ominous gain-swell LFO 0.06 Hz (slow, like a heartbeat)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lfoD = ctx.createGain(); lfoD.gain.value = 0.04;
    lfo.connect(lfoD).connect(gain.gain); lfo.start();
    nodes.push(lfo, lfoD);

    this._bossMusicGain  = gain;
    this._bossMusicNodes = nodes;

    const t = this.now;
    gain.gain.value = 0.55;   // effective = 0.55 × 0.12 = 0.066 (was 1.0 × 0.3 = 0.30!)
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 1.5);

    this._bossRhythmRunning = true;
    this._bossNextTimes = {};
    this._bossArpIdx    = 0;
    this._scheduleBossRhythm();
  }

  startGameOverMusic(): void {
    // Dedicated game-over routing (falls back gracefully if a key is missing).
    this.stopMusic();
    const over = this._musicFile('music_gameover', 0.26)
      ?? this._musicFile('music_boss', 0.22)
      ?? this._musicFile('music_title', 0.34);
    if (over) this._phaserTitleMusic2 = over;
  }

  startVictoryMusic(): void {
    // Dedicated victory routing (falls back to lobby/title ambience).
    this.stopMusic();
    const vic = this._musicFile('music_victory', 0.34)
      ?? this._musicFile('music_lobby', 0.34)
      ?? this._musicFile('music_title', 0.34);
    if (vic) this._phaserTitleMusic2 = vic;
  }

  stopBossMusic(): void {
    // Stop file-based boss music
    if (this._phaserBossMusic2) {
      this._stopMusicFile(this._phaserBossMusic2);
      this._phaserBossMusic2 = null;
    }
    // Restore the ducked main music if we have it
    const mm = this._phaserMainMusic as unknown as { setVolume?: (v: number) => void } | null;
    if (mm && this._mainMusicDuckedFromVol !== null) {
      try { mm.setVolume?.(this._mainMusicDuckedFromVol); } catch { /* ignore */ }
      this._mainMusicDuckedFromVol = null;
    }
    if (!this.ctx || !this._bossMusicGain) return;
    this._bossRhythmRunning = false;
    if (this._bossRhythmTimeout !== null) { clearTimeout(this._bossRhythmTimeout); this._bossRhythmTimeout = null; }
    const t = this.now;
    const gain = this._bossMusicGain; const nodes = this._bossMusicNodes;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.2);
    this._bossMusicGain  = null;
    this._bossMusicNodes = [];
    setTimeout(() => {
      nodes.forEach(n => {
        if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } }
        try { n.disconnect(); } catch { /* ok */ }
      });
      try { gain.disconnect(); } catch { /* ok */ }
    }, 1300);
  }

  // ==========================================================================
  // TITLE MUSIC — Dreamy, atmospheric
  // ==========================================================================

  startTitleMusic(): void {
    if (this._phaserMainMusic) {
      this._stopMusicFile(this._phaserMainMusic);
      this._phaserMainMusic = null;
    }
    if (this._phaserBossMusic2) {
      this._stopMusicFile(this._phaserBossMusic2);
      this._phaserBossMusic2 = null;
    }
    // ── File-based title music via Phaser (handles its own audio unlock) ──
    if (this._phaserTitleMusic2) { this._stopMusicFile(this._phaserTitleMusic2); this._phaserTitleMusic2 = null; }
    const fileMusic = this._musicFile('music_lobby', 0.50)
      ?? this._musicFile('music_title', 0.55);
    if (fileMusic) {
      this._phaserTitleMusic2 = fileMusic;
    }

    // ── Procedural oscillator pad (requires Web Audio context) ──
    if (!this.ctx) return;
    if (this._titleMusicGain) {
      // tear down old oscillators without double-stopping file music
      if (this._titleSparkleInterval !== null) {
        clearInterval(this._titleSparkleInterval);
        this._titleSparkleInterval = null;
      }
      const t0 = this.now;
      const oldGain = this._titleMusicGain; const oldNodes = this._titleMusicNodes;
      oldGain.gain.cancelScheduledValues(t0);
      oldGain.gain.setValueAtTime(oldGain.gain.value, t0);
      oldGain.gain.linearRampToValueAtTime(0, t0 + 0.3);
      this._titleMusicGain = null; this._titleMusicNodes = [];
      setTimeout(() => {
        oldNodes.forEach(n => { if (n instanceof OscillatorNode) { try { n.stop(); } catch { /**/ } } try { n.disconnect(); } catch { /**/ } });
        try { oldGain.disconnect(); } catch { /**/ }
      }, 400);
    }

    const ctx   = this.ctx;
    const nodes: AudioNode[] = [];
    const gain  = ctx.createGain();
    gain.connect(this.masterGain);

    // Dreamy Cmaj7 pad: C3 + E3 + G3 + B3
    for (const [freq, vol] of [[130.81, 0.18], [164.81, 0.14], [196, 0.13], [246.94, 0.10]] as [number, number][]) {
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq; og.gain.value = vol;
      osc.connect(og).connect(gain); osc.start();
      nodes.push(osc, og);
    }

    // Very slow gain breathing: 0.04 Hz (25 s cycle)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.04;
    const lfoD = ctx.createGain(); lfoD.gain.value = 0.018;
    lfo.connect(lfoD).connect(gain.gain); lfo.start();
    nodes.push(lfo, lfoD);

    this._titleMusicGain  = gain;
    this._titleMusicNodes = nodes;

    const t = this.now;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.42, t + 2.0);

    // Gentle high sparkle: pentatonic C5→E5→G5 arpeggio every ~2.2 s
    this._titleSparkleIdx = 0;
    const sparkleNotes = [523.25, 659.25, 783.99];
    this._titleSparkleInterval = setInterval(() => {
      if (!this._titleMusicGain || !this.ctx) return;
      const st = this.ctx.currentTime;
      const freq = sparkleNotes[this._titleSparkleIdx % sparkleNotes.length];
      this._titleSparkleIdx++;
      this._tone(freq, 'sine', st, 0.55, 0.07, 0.03, 0.5);
    }, 2200);
  }

  stopTitleMusic(): void {
    // Stop file-based title music
    if (this._phaserTitleMusic2) {
      this._stopMusicFile(this._phaserTitleMusic2);
      this._phaserTitleMusic2 = null;
    }
    // Always cancel sparkle interval regardless of ctx state
    if (this._titleSparkleInterval !== null) {
      clearInterval(this._titleSparkleInterval);
      this._titleSparkleInterval = null;
    }
    if (!this.ctx || !this._titleMusicGain) return;

    const t = this.now;
    const gain = this._titleMusicGain; const nodes = this._titleMusicNodes;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.5);

    this._titleMusicGain  = null;
    this._titleMusicNodes = [];

    setTimeout(() => {
      nodes.forEach(n => {
        if (n instanceof OscillatorNode) { try { n.stop(); } catch { /* ok */ } }
        try { n.disconnect(); } catch { /* ok */ }
      });
      try { gain.disconnect(); } catch { /* ok */ }
    }, 1600);
  }

  // ==========================================================================
  // VOLUME CONTROL
  // ==========================================================================

  setMute(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.12;
    }
  }

  get isMuted(): boolean { return this.muted; }

  plasmaCharging(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(140, "sine", t, 0.3, 0.05, 0.08, 0.8);
    this._tone(280, "triangle", t, 0.3, 0.025, 0.1, 0.9);
  }

  plasmaRelease(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(60, 220, "sine", t, 0.5, 0.16);
    this._sweep(440, 1100, "triangle", t, 0.25, 0.07);
    this._tone(880, "sine", t + 0.1, 0.4, 0.055, 0.01, 0.95);
  }

  chronoPulse(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(220, 60, "sine", t, 0.8, 0.18);
    this._sweep(1600, 400, "triangle", t, 0.5, 0.045);
    this._tone(220, "sine", t + 0.06, 0.5, 0.08, 0.1, 0.85);
  }

  staggerHit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(380, 80, "triangle", t, 0.22, 0.11);
    this._tone(160, "sine", t, 0.18, 0.06, 0.01, 0.9);
  }

  chainShock(count: number): void {
    if (!this.ctx) return;
    const freq = Math.min(600, 200 + count * 80);
    const t = this.ctx.currentTime;
    this._tone(freq, "triangle", t, 0.28, Math.min(0.12, 0.07 + count * 0.012), 0.02, 0.8);
    this._tone(freq * 1.5, "sine", t + 0.05, 0.18, 0.035, 0.03, 0.9);
  }
}