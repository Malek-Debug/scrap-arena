import { WorldType } from "../core/WorldManager";

/**
 * DimensionBreach — gives certain enemies the ability to temporarily
 * phase-shift into the player's world, making neither dimension safe.
 *
 * Lifecycle:
 *   IDLE       → enemy is ghost (wrong world), accumulating breach energy
 *   CHARGING   → visible charge-up (2s), enemy glows, can't be damaged
 *   ACTIVE     → fully materialized in player's world for BREACH_DURATION ms
 *   COOLDOWN   → short cooldown before next breach attempt
 *
 * Usage:
 *   class GuardAgent extends BaseAgent {
 *     readonly breach = new DimensionBreach(WorldType.CIRCUIT);
 *     ...
 *     tick(delta) {
 *       const playerWorld = ...; // from MainScene
 *       this.breach.update(delta, this.world, playerWorld);
 *       if (this.breach.isActive) { ... act in player world ... }
 *     }
 *   }
 *
 * MainScene checks:
 *   agent.breach.isActive  → override ghost state, set alpha=1
 *   agent.breach.isCharging → show charge VFX (aura ring)
 */

const IDLE_THRESHOLD  = 6000;  // ms in ghost state before attempting breach
const CHARGE_DURATION = 1800;  // ms of charge-up visual
const BREACH_DURATION = 4000;  // ms fully active in player's world
const COOLDOWN_DURATION = 8000; // ms before another breach attempt

export type BreachState = "idle" | "charging" | "active" | "cooldown";

export class DimensionBreach {
  state: BreachState = "idle";
  private _timer = 0;
  /** Progress 0→1 during charge phase */
  chargeProgress = 0;
  /** Remaining active time 0→1 (1 = just breached, 0 = expiring) */
  activeProgress = 1;

  constructor(
    /** The world this enemy normally belongs to */
    readonly homeWorld: WorldType,
  ) {}

  /**
   * @param deltaMs  frame delta
   * @param myWorld  this enemy's assigned world
   * @param playerWorld  current world the player is in
   * @returns true if state changed to 'active' this frame (triggers VFX)
   */
  update(deltaMs: number, myWorld: WorldType, playerWorld: WorldType): boolean {
    const isGhost = myWorld !== playerWorld; // enemy is in wrong world

    switch (this.state) {
      case "idle":
        if (isGhost) {
          this._timer += deltaMs;
          if (this._timer >= IDLE_THRESHOLD) {
            this._timer = 0;
            this.state = "charging";
            this.chargeProgress = 0;
          }
        } else {
          // Player came to us — reset idle timer
          this._timer = Math.max(0, this._timer - deltaMs * 2);
        }
        break;

      case "charging":
        this._timer += deltaMs;
        this.chargeProgress = Math.min(1, this._timer / CHARGE_DURATION);
        if (this._timer >= CHARGE_DURATION) {
          this._timer = 0;
          this.state = "active";
          this.activeProgress = 1;
          return true; // signal breach activation
        }
        break;

      case "active":
        this._timer += deltaMs;
        this.activeProgress = Math.max(0, 1 - this._timer / BREACH_DURATION);
        if (this._timer >= BREACH_DURATION) {
          this._timer = 0;
          this.state = "cooldown";
        }
        break;

      case "cooldown":
        this._timer += deltaMs;
        if (this._timer >= COOLDOWN_DURATION) {
          this._timer = 0;
          this.state = "idle";
        }
        break;
    }

    return false;
  }

  /** True when the enemy has phased into the player's world */
  get isActive(): boolean { return this.state === "active"; }
  /** True during charge-up (show VFX but enemy still untouchable) */
  get isCharging(): boolean { return this.state === "charging"; }
  /** True when ghost-mode counting toward breach */
  get isBuildingUp(): boolean { return this.state === "idle" && this._timer > IDLE_THRESHOLD * 0.4; }

  reset(): void {
    this.state = "idle";
    this._timer = 0;
    this.chargeProgress = 0;
    this.activeProgress = 1;
  }
}
