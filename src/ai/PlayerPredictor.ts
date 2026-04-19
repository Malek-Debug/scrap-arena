import { WorldType } from "../core/WorldManager";

/**
 * PlayerPredictor — real-time adaptive tracker.
 *
 * Samples player state every SAMPLE_INTERVAL ms into a circular buffer.
 * Computes:
 *   • predictedPosition(t)  — where player will be in t ms
 *   • avgSpeed              — rolling average speed
 *   • movementEntropy       — how unpredictably the player moves (0=linear, 1=chaotic)
 *   • preferredWorld        — which world the player tends to stay in
 *   • strafePattern         — dominant angular direction (clockwise/CCW dodge tendency)
 *
 * Enemies use predictedPosition() to aim and assign intercept flanks.
 * BossAgent uses movementEntropy to switch between lead-shot and saturation fire.
 */

export interface PlayerSample {
  x: number;
  y: number;
  world: WorldType;
  t: number; // absolute timestamp ms
}

const BUFFER_SIZE = 30;      // ~4.5s at 150ms intervals
const SAMPLE_INTERVAL = 150; // ms between samples

export class PlayerPredictor {
  private _buf: PlayerSample[] = [];
  private _head = 0;
  private _count = 0;
  private _sampleAccum = 0;

  // Derived properties updated each process() call
  avgSpeed = 0;
  movementEntropy = 0;    // 0 = straight line, 1 = pure chaos
  preferredWorld: WorldType = WorldType.FOUNDRY;
  predictedVx = 0;
  predictedVy = 0;
  /** How long player has been in current world (ms) */
  timeInCurrentWorld = 0;

  private _lastWorld: WorldType = WorldType.FOUNDRY;
  private _worldTimer = 0;

  constructor() {
    // Pre-fill buffer placeholders
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this._buf.push({ x: 640, y: 360, world: WorldType.FOUNDRY, t: 0 });
    }
  }

  /**
   * Call every game frame with current player state.
   * @param deltaMs frame delta
   */
  update(
    deltaMs: number,
    playerX: number,
    playerY: number,
    playerWorld: WorldType,
  ): void {
    this._sampleAccum += deltaMs;

    // Track time in current world
    if (playerWorld !== this._lastWorld) {
      this._worldTimer = 0;
      this._lastWorld = playerWorld;
    } else {
      this._worldTimer += deltaMs;
    }
    this.timeInCurrentWorld = this._worldTimer;

    if (this._sampleAccum >= SAMPLE_INTERVAL) {
      this._sampleAccum -= SAMPLE_INTERVAL;
      this._addSample({ x: playerX, y: playerY, world: playerWorld, t: performance.now() });
      this._recompute();
    }
  }

  /**
   * Returns the predicted player position t milliseconds from now.
   * Uses linear extrapolation with entropy-based uncertainty reduction.
   */
  predictedPosition(t: number): { x: number; y: number } {
    const scale = Math.max(0, 1 - this.movementEntropy * 0.6); // reduce confidence when chaotic
    return {
      x: this._latest().x + this.predictedVx * (t / 1000) * scale,
      y: this._latest().y + this.predictedVy * (t / 1000) * scale,
    };
  }

  /** Current player position (latest sample) */
  currentPosition(): { x: number; y: number } {
    return { x: this._latest().x, y: this._latest().y };
  }

  private _latest(): PlayerSample {
    const idx = (this._head - 1 + BUFFER_SIZE) % BUFFER_SIZE;
    return this._buf[idx];
  }

  private _addSample(s: PlayerSample): void {
    this._buf[this._head] = s;
    this._head = (this._head + 1) % BUFFER_SIZE;
    this._count = Math.min(this._count + 1, BUFFER_SIZE);
  }

  /** Number of motion samples collected (up to BUFFER_SIZE=30). */
  get sampleCount(): number { return this._count; }

  private _recompute(): void {
    if (this._count < 3) return;

    const n = this._count;
    // Gather last N samples in order
    const samples: PlayerSample[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (this._head - 1 - i + BUFFER_SIZE * 2) % BUFFER_SIZE;
      samples.unshift(this._buf[idx]);
    }

    // --- Average velocity (smoothed over last 5 samples) ---
    const window = Math.min(5, n - 1);
    let vxSum = 0, vySum = 0;
    for (let i = n - window; i < n; i++) {
      const dt = (samples[i].t - samples[i - 1].t) / 1000 || SAMPLE_INTERVAL / 1000;
      vxSum += (samples[i].x - samples[i - 1].x) / dt;
      vySum += (samples[i].y - samples[i - 1].y) / dt;
    }
    this.predictedVx = vxSum / window;
    this.predictedVy = vySum / window;
    this.avgSpeed = Math.sqrt(this.predictedVx ** 2 + this.predictedVy ** 2);

    // --- Movement entropy: variance of direction changes ---
    let angleVariance = 0;
    const angles: number[] = [];
    for (let i = 1; i < n; i++) {
      const dx = samples[i].x - samples[i - 1].x;
      const dy = samples[i].y - samples[i - 1].y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        angles.push(Math.atan2(dy, dx));
      }
    }
    if (angles.length > 2) {
      const dAngles: number[] = [];
      for (let i = 1; i < angles.length; i++) {
        let da = angles[i] - angles[i - 1];
        // Wrap to [-PI, PI]
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        dAngles.push(Math.abs(da));
      }
      const meanDA = dAngles.reduce((s, v) => s + v, 0) / dAngles.length;
      angleVariance = meanDA / Math.PI; // normalise 0-1
    }
    // Smooth entropy update (EMA α=0.2)
    this.movementEntropy += (angleVariance - this.movementEntropy) * 0.2;

    // --- Preferred world ---
    let foundryTime = 0, circuitTime = 0;
    for (const s of samples) {
      if (s.world === WorldType.FOUNDRY) foundryTime++;
      else circuitTime++;
    }
    this.preferredWorld = foundryTime >= circuitTime ? WorldType.FOUNDRY : WorldType.CIRCUIT;
  }

  /** Reset on game restart */
  reset(): void {
    this._head = 0;
    this._count = 0;
    this._sampleAccum = 0;
    this.avgSpeed = 0;
    this.movementEntropy = 0;
    this.predictedVx = 0;
    this.predictedVy = 0;
    this._worldTimer = 0;
    this.timeInCurrentWorld = 0;
  }
}
