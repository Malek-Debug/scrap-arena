export class ComboSystem {
  combo = 0;
  maxCombo = 0;
  multiplier = 1;
  score = 0;
  private comboTimer = 0;
  private static readonly COMBO_WINDOW = 2500; // ms to maintain combo
  private static readonly COMBO_THRESHOLDS = [
    { combo: 3, label: "TRIPLE KILL", color: "#ffaa00" },
    { combo: 5, label: "RAMPAGE!", color: "#ff6600" },
    { combo: 10, label: "UNSTOPPABLE!", color: "#ff0044" },
    { combo: 15, label: "MACHINE BREAKER!", color: "#ff00ff" },
    { combo: 20, label: "GODLIKE!", color: "#00ffff" },
    { combo: 30, label: "BEYOND MACHINE!", color: "#ffffff" },
  ];

  onKill(): { multiplier: number; milestone: { label: string; color: string } | null } {
    this.combo++;
    this.comboTimer = ComboSystem.COMBO_WINDOW;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // Multiplier: 1x base, +0.25x per kill in combo, capped at 5x
    this.multiplier = Math.min(1 + (this.combo - 1) * 0.25, 5);

    // Add score: base 100 * multiplier
    const points = Math.floor(100 * this.multiplier);
    this.score += points;

    // Check milestone
    const milestone = ComboSystem.COMBO_THRESHOLDS.find(t => t.combo === this.combo) ?? null;

    return { multiplier: this.multiplier, milestone };
  }

  update(deltaMs: number): void {
    if (this.combo > 0) {
      this.comboTimer -= deltaMs;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.multiplier = 1;
        this.comboTimer = 0;
      }
    }
  }

  // How close combo is to expiring (0-1, 1 = full time remaining)
  get comboTimeRatio(): number {
    return this.combo > 0 ? Math.max(0, this.comboTimer / ComboSystem.COMBO_WINDOW) : 0;
  }

  reset(): void {
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.score = 0;
    this.comboTimer = 0;
  }
}
