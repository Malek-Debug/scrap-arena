/**
 * Abstract skill base — attach to any agent.
 * Manages cooldown, charges, and execution lifecycle.
 */
export abstract class BaseSkill {
  abstract readonly name: string;
  abstract readonly cooldownMs: number;

  private _lastUsed = -Infinity;
  private _charges: number;
  readonly maxCharges: number;

  constructor(maxCharges = 1) {
    this.maxCharges = maxCharges;
    this._charges = maxCharges;
  }

  get canUse(): boolean {
    return this._charges > 0;
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cooldownMs - (performance.now() - this._lastUsed));
  }

  get normalizedCooldown(): number {
    return 1 - this.cooldownRemaining / this.cooldownMs;
  }

  /** Attempt to use. Returns true if consumed a charge. */
  tryUse(...args: unknown[]): boolean {
    if (!this.canUse) return false;
    this._charges--;
    this._lastUsed = performance.now();
    this.onUse(...args);
    return true;
  }

  /** Called each AI tick to recharge */
  tick(nowMs: number = performance.now()): void {
    if (this._charges < this.maxCharges) {
      if (nowMs - this._lastUsed >= this.cooldownMs) {
        this._charges++;
        this._lastUsed = nowMs;
      }
    }
    this.onTick(nowMs);
  }

  protected abstract onUse(...args: unknown[]): void;
  protected onTick(_nowMs: number): void {}

  reset(): void {
    this._lastUsed = -Infinity;
    this._charges = this.maxCharges;
  }
}

