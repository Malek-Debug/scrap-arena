/**
 * DDASystem — Dynamic Difficulty Adjustment
 *
 * Tracks player performance in 8-second rolling windows and smoothly
 * adjusts output multipliers for enemy HP, speed, and count.
 *
 * Difficulty scale: 0.65 (struggling) → 1.0 (normal) → 1.45 (dominating)
 *
 * Usage:
 *   - Call update(deltaMs) every frame
 *   - Call recordKill() each time player kills an enemy
 *   - Call recordPlayerHp(ratio) periodically (e.g. every frame)
 *   - Read .enemyHpMult / .speedMult / .countMult in WaveManager config
 */
export class DDASystem {
  // Rolling-window metrics
  private killsInWindow = 0;
  private windowElapsed = 0;
  private readonly WINDOW_MS = 8000;

  // HP samples (last 30 readings)
  private hpSamples: number[] = [];
  private readonly HP_SAMPLE_MAX = 30;

  // Output multipliers (start at 1.0, smooth over time)
  enemyHpMult = 1.0;
  speedMult = 1.0;
  countMult = 1.0;

  // For HUD / debug
  difficultyLabel = "NORMAL";
  
  // Tracks if difficulty changed (for visual notification)
  lastChange: { direction: "up" | "down"; label: string } | null = null;

  recordKill(): void {
    this.killsInWindow++;
  }

  recordPlayerHp(ratio: number): void {
    this.hpSamples.push(ratio);
    if (this.hpSamples.length > this.HP_SAMPLE_MAX) {
      this.hpSamples.shift();
    }
  }

  update(deltaMs: number): void {
    this.lastChange = null;
    this.windowElapsed += deltaMs;
    if (this.windowElapsed >= this.WINDOW_MS) {
      this._recalculate();
      this.windowElapsed = 0;
      this.killsInWindow = 0;
    }
  }

  private _recalculate(): void {
    const killRate = this.killsInWindow / (this.WINDOW_MS / 1000); // kills/sec
    const avgHp =
      this.hpSamples.length > 0
        ? this.hpSamples.reduce((a, b) => a + b, 0) / this.hpSamples.length
        : 0.6;

    let target: number;
    let label: string;

    if (killRate >= 3 && avgHp >= 0.65) {
      // Player is dominating — ramp up hard
      target = 1.45;
      label = "INTENSE";
    } else if (killRate >= 2 && avgHp >= 0.45) {
      // Performing well — moderate ramp
      target = 1.2;
      label = "HARD";
    } else if (killRate < 0.5 || avgHp <= 0.2) {
      // Struggling — ease off
      target = 0.65;
      label = "EASY";
    } else if (killRate < 1.0 || avgHp <= 0.35) {
      // Slightly under pressure — soften a bit
      target = 0.85;
      label = "NORMAL";
    } else {
      // Balanced
      target = 1.0;
      label = "NORMAL";
    }

    // Smooth interpolation (lerp 30% toward target each window)
    this.enemyHpMult = lerp(this.enemyHpMult, target, 0.3);
    this.speedMult = lerp(this.speedMult, Math.sqrt(target), 0.3); // speed scales slower
    this.countMult = lerp(this.countMult, 0.6 + target * 0.4, 0.3); // count scales even less
    
    if (label !== this.difficultyLabel) {
      const oldTarget = this.difficultyLabel === "INTENSE" ? 1.45 : this.difficultyLabel === "HARD" ? 1.2 : this.difficultyLabel === "EASY" ? 0.65 : this.difficultyLabel === "NORMAL" ? (this.enemyHpMult < 1 ? 0.85 : 1.0) : 1.0;
      this.lastChange = { direction: target > oldTarget ? "up" : "down", label };
    }
    this.difficultyLabel = label;
  }

  /** Reset to baseline (e.g. on new game) */
  reset(): void {
    this.killsInWindow = 0;
    this.windowElapsed = 0;
    this.hpSamples = [];
    this.enemyHpMult = 1.0;
    this.speedMult = 1.0;
    this.countMult = 1.0;
    this.difficultyLabel = "NORMAL";
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
