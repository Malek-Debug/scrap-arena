import Phaser from "phaser";
import { BaseSkill } from "./BaseSkill";
import { Juice } from "../../rendering/Juice";

/**
 * DashSkill — burst movement in aim direction with afterimage trail.
 * Applies velocity impulse directly to the arcade body.
 */
export class DashSkill extends BaseSkill {
  readonly name = "Dash";
  readonly cooldownMs: number;
  private readonly force: number;
  private readonly trailCount: number;

  constructor(force = 600, cooldownMs = 1200, trailCount = 4) {
    super(1);
    this.force = force;
    this.cooldownMs = cooldownMs;
    this.trailCount = trailCount;
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

    for (let i = 0; i < this.trailCount; i++) {
      const delay = i * 30;
      scene.time.delayedCall(delay, () => {
        const ghost = scene.add.image(sprite.x, sprite.y, sprite.texture.key);
        ghost
          .setAlpha(0.6 - i * 0.12)
          .setTint(0x88ccff)
          .setScale(sprite.scaleX, sprite.scaleY);
        scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 180,
          onComplete: () => ghost.destroy(),
        });
      });
    }

    Juice.screenShake(scene, 0.003, 80);
  }
}
