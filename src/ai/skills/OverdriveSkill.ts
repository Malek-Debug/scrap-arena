import Phaser from "phaser";
import { BaseSkill } from "./BaseSkill";
import { SystemsBus } from "../../core/SystemsBus";

export interface OverdriveBuffs {
  /** Damage multiplier while active (e.g. 1.5 = +50%). */
  damageMult: number;
  /** Fire-rate multiplier while active (e.g. 0.55 = ~80% faster). */
  fireRateMult: number;
  /** Speed multiplier while active. */
  speedMult: number;
}

/**
 * OverdriveSkill — temporarily redlines the user's machine for a burst of
 * damage / fire-rate / speed at the cost of a forced cooldown afterwards.
 *
 * Active state exposed via `active`, `bonus`, and `progress` — callers
 * (PlayerController, EnemyAgent, BossAgent) can multiply their numbers.
 *
 * Emits on SystemsBus:
 *   "overdrive:start"  (ownerId, x, y, durationMs, bonus)
 *   "overdrive:end"    (ownerId)
 */
export class OverdriveSkill extends BaseSkill {
  readonly name = "Overdrive";
  readonly cooldownMs: number;
  readonly durationMs: number;
  readonly bonus: OverdriveBuffs;

  private _expiresAt = 0;
  private readonly ownerId: number;

  constructor(
    ownerId: number,
    durationMs = 4000,
    cooldownMs = 12000,
    bonus: OverdriveBuffs = { damageMult: 1.6, fireRateMult: 0.55, speedMult: 1.25 },
  ) {
    super(1);
    this.ownerId = ownerId;
    this.durationMs = durationMs;
    this.cooldownMs = cooldownMs;
    this.bonus = bonus;
  }

  /** Is overdrive currently active? */
  get active(): boolean {
    return performance.now() < this._expiresAt;
  }

  /** 0..1 — how much of the burst remains. */
  get progress(): number {
    if (!this.active) return 0;
    return (this._expiresAt - performance.now()) / this.durationMs;
  }

  /** Returns the bonus to apply, or identity if not active. */
  currentBonus(): OverdriveBuffs {
    return this.active ? this.bonus : { damageMult: 1, fireRateMult: 1, speedMult: 1 };
  }

  protected onUse(...args: unknown[]): void {
    const [scene, x, y, sprite] = args as [
      Phaser.Scene,
      number,
      number,
      Phaser.GameObjects.Sprite | undefined,
    ];

    this._expiresAt = performance.now() + this.durationMs;

    if (scene) {
      // Heat halo around owner
      const halo = scene.add.circle(x, y, 38, 0xff8800, 0.35)
        .setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: halo, scale: 1.4, alpha: 0,
        duration: this.durationMs, ease: "Quad.easeIn",
        onComplete: () => halo.destroy(),
      });

      // Pulsing ring
      const ring = scene.add.circle(x, y, 24, 0, 0)
        .setStrokeStyle(2, 0xffaa22, 1)
        .setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: ring, scale: 2.0, alpha: 0,
        duration: 360, repeat: Math.max(0, Math.floor(this.durationMs / 360) - 1),
        onComplete: () => ring.destroy(),
      });

      // Tint owner sprite warm during burst
      if (sprite) {
        const prevTint = sprite.tintTopLeft;
        sprite.setTint(0xffd07a);
        scene.time.delayedCall(this.durationMs, () => {
          if (sprite.scene) sprite.setTint(prevTint || 0xffffff);
        });
      }

      scene.cameras.main.shake(120, 0.006);
    }

    SystemsBus.instance.emit(
      "overdrive:start", this.ownerId, x, y, this.durationMs, this.bonus,
    );

    // Schedule end event off the bus
    setTimeout(() => {
      SystemsBus.instance.emit("overdrive:end", this.ownerId);
    }, this.durationMs);
  }
}
