/**
 * Abstract skill base — attach to any agent.
 * Manages cooldown, charges, heat (machine-theme overheat), level (upgrades),
 * and execution lifecycle.
 *
 * Heat model:
 *   Each tryUse() adds `heatPerUse`. Heat decays at `heatCoolPerSec` per second.
 *   When heat reaches 1.0 the skill enters "overheated" state and refuses to
 *   fire until heat drops below 0.4 (hysteresis prevents stutter).
 */
export abstract class BaseSkill {
  abstract readonly name: string;
  abstract readonly cooldownMs: number;

  private _lastUsed = -Infinity;
  private _charges: number;
  readonly maxCharges: number;

  // ── Machine-theme heat / overdrive ─────────────────────────────────────
  /** 0..1 — current thermal load. */
  protected _heat = 0;
  /** Heat added per successful tryUse (0 disables). */
  heatPerUse = 0;
  /** Heat dissipated per real-time second. */
  heatCoolPerSec = 0.6;
  /** True while skill is locked out by overheat. */
  protected _overheated = false;
  private _lastTickMs = -Infinity;

  // ── Upgrade level (1..N) — agents/players can scale damage & cooldown ─
  level = 1;

  constructor(maxCharges = 1) {
    this.maxCharges = maxCharges;
    this._charges = maxCharges;
  }

  get canUse(): boolean {
    return this._charges > 0 && !this._overheated;
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cooldownMs - (performance.now() - this._lastUsed));
  }

  get normalizedCooldown(): number {
    return 1 - this.cooldownRemaining / this.cooldownMs;
  }

  get heat(): number { return this._heat; }
  get overheated(): boolean { return this._overheated; }
  get normalizedCharges(): number { return this._charges / this.maxCharges; }

  /** Attempt to use. Returns true if consumed a charge. */
  tryUse(...args: unknown[]): boolean {
    if (!this.canUse) return false;
    this._charges--;
    this._lastUsed = performance.now();
    if (this.heatPerUse > 0) {
      this._heat = Math.min(1, this._heat + this.heatPerUse);
      if (this._heat >= 1) this._overheated = true;
    }
    this.onUse(...args);
    return true;
  }

  /** Called each AI tick to recharge & dissipate heat. */
  tick(nowMs: number = performance.now()): void {
    if (this._charges < this.maxCharges) {
      if (nowMs - this._lastUsed >= this.cooldownMs) {
        this._charges++;
        this._lastUsed = nowMs;
      }
    }

    // Cool down heat (frame-rate independent)
    if (this._lastTickMs > 0) {
      const dt = Math.min(0.25, (nowMs - this._lastTickMs) / 1000);
      if (this._heat > 0) {
        this._heat = Math.max(0, this._heat - this.heatCoolPerSec * dt);
        if (this._overheated && this._heat < 0.4) this._overheated = false;
      }
    }
    this._lastTickMs = nowMs;

    this.onTick(nowMs);
  }

  protected abstract onUse(...args: unknown[]): void;
  protected onTick(_nowMs: number): void {}

  reset(): void {
    this._lastUsed = -Infinity;
    this._charges = this.maxCharges;
    this._heat = 0;
    this._overheated = false;
  }
}

