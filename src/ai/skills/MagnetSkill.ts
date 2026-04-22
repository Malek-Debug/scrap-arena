import Phaser from "phaser";
import { BaseSkill } from "./BaseSkill";
import { SystemsBus } from "../../core/SystemsBus";

/**
 * MagnetSkill — Scrap-Magnet pulse. Briefly extends pickup magnetism range
 * around the owner, yanking nearby drops in hard.
 *
 * Listeners (e.g. WaveManager / pickup system) can subscribe to:
 *   "magnet:active"  (ownerId, x, y, radius, durationMs)
 *   "magnet:expired" (ownerId)
 *
 * Pure event-driven so it composes cleanly with existing pickup code.
 */
export class MagnetSkill extends BaseSkill {
  readonly name = "Scrap Magnet";
  readonly cooldownMs: number;
  readonly durationMs: number;
  readonly radius: number;
  private readonly ownerId: number;
  private _expiresAt = 0;

  constructor(ownerId: number, cooldownMs = 8000, durationMs = 3500, radius = 320) {
    super(1);
    this.ownerId = ownerId;
    this.cooldownMs = cooldownMs;
    this.durationMs = durationMs;
    this.radius = radius;
  }

  get active(): boolean {
    return performance.now() < this._expiresAt;
  }

  protected onUse(...args: unknown[]): void {
    const [scene, x, y] = args as [Phaser.Scene, number, number];
    this._expiresAt = performance.now() + this.durationMs;

    if (scene) {
      // Inward-collapsing magnetic ring (suggests pulling things in)
      const ring = scene.add.circle(x, y, this.radius, 0, 0)
        .setStrokeStyle(2, 0xaa66ff, 0.85)
        .setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: ring, scale: 0.05, alpha: 0,
        duration: 520, ease: "Quad.easeIn",
        onComplete: () => ring.destroy(),
      });

      // Field lines: 6 dots arc inward
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const dot = scene.add.circle(
          x + Math.cos(a) * this.radius,
          y + Math.sin(a) * this.radius,
          3, 0xcc99ff, 1,
        ).setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
          targets: dot, x, y, scale: 0.2, alpha: 0,
          duration: 460, ease: "Quad.easeIn",
          onComplete: () => dot.destroy(),
        });
      }
    }

    SystemsBus.instance.emit("magnet:active", this.ownerId, x, y, this.radius, this.durationMs);
    setTimeout(() => SystemsBus.instance.emit("magnet:expired", this.ownerId), this.durationMs);
  }
}
