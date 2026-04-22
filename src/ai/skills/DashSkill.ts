import Phaser from "phaser";
import { BaseSkill } from "./BaseSkill";
import { Juice } from "../../rendering/Juice";

/**
 * DashSkill — "Servo Burst": pneumatic-piston dash with afterimage trail,
 * steam venting, and ground sparks. Mechanical/MACHINES theme.
 *
 * Exposes `isInvulnerable` for the duration of the burst (default 180ms) so
 * the controller can grant i-frames during the dash.
 */
export class DashSkill extends BaseSkill {
  readonly name = "Servo Burst";
  readonly cooldownMs: number;
  private readonly force: number;
  private readonly trailCount: number;
  private readonly invulnDurationMs: number;
  private _invulnUntil = 0;

  constructor(force = 600, cooldownMs = 1200, trailCount = 4, invulnDurationMs = 180) {
    super(1);
    this.force = force;
    this.cooldownMs = cooldownMs;
    this.trailCount = trailCount;
    this.invulnDurationMs = invulnDurationMs;
    // Mild thermal load — chained dashes overheat the servos.
    this.heatPerUse = 0.45;
    this.heatCoolPerSec = 0.55;
  }

  /** True for `invulnDurationMs` after the most recent dash. */
  get isInvulnerable(): boolean {
    return performance.now() < this._invulnUntil;
  }

  protected onUse(...args: unknown[]): void {
    const [sprite, angle, scene] = args as [
      Phaser.Physics.Arcade.Sprite,
      number,
      Phaser.Scene,
    ];

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(
      Math.cos(angle) * this.force,
      Math.sin(angle) * this.force,
    );

    this._invulnUntil = performance.now() + this.invulnDurationMs;

    // ── Mechanical afterimage trail ────────────────────────────────────
    for (let i = 0; i < this.trailCount; i++) {
      const delay = i * 30;
      scene.time.delayedCall(delay, () => {
        if (!sprite.scene) return;
        const ghost = scene.add.image(sprite.x, sprite.y, sprite.texture.key);
        ghost
          .setAlpha(0.6 - i * 0.12)
          .setTint(0x66ddff)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(sprite.scaleX, sprite.scaleY)
          .setDepth(sprite.depth - 1);
        scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 180,
          onComplete: () => ghost.destroy(),
        });
      });
    }

    // ── Steam vent puff (perpendicular, both sides of motion) ──────────
    const px = sprite.x;
    const py = sprite.y;
    const perp = angle + Math.PI / 2;
    for (const side of [-1, 1]) {
      const sx = px + Math.cos(perp) * 6 * side;
      const sy = py + Math.sin(perp) * 6 * side;
      const puff = scene.add.circle(sx, sy, 6, 0xddeeff, 0.55)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(sprite.depth - 2);
      scene.tweens.add({
        targets: puff,
        x: sx + Math.cos(perp) * 22 * side,
        y: sy + Math.sin(perp) * 22 * side - 6,
        scale: 2.4, alpha: 0,
        duration: 320, ease: "Quad.easeOut",
        onComplete: () => puff.destroy(),
      });
    }

    // ── Forward spark fan from boot servos ─────────────────────────────
    for (let i = 0; i < 6; i++) {
      const sa = angle + Math.PI + (Math.random() - 0.5) * 1.1;
      const spd = 90 + Math.random() * 80;
      const spark = scene.add.rectangle(px, py + 2, 3, 1.2, 0xfff0a0, 1)
        .setRotation(sa).setDepth(sprite.depth - 1).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: spark,
        x: px + Math.cos(sa) * spd * 0.25,
        y: py + Math.sin(sa) * spd * 0.25 + 6,
        scaleX: 0.2, alpha: 0,
        duration: 260, ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }

    Juice.screenShake(scene, 0.004, 90);
  }
}
