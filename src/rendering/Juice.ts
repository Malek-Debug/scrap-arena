import Phaser from "phaser";

/**
 * Static juice effects — call from anywhere, no instantiation.
 * All methods are idempotent and safe to stack.
 */
export class Juice {
  private static slowMoTween: Phaser.Tweens.Tween | null = null;

  /** Shake the main camera with configurable intensity and duration */
  static screenShake(scene: Phaser.Scene, intensity = 0.005, duration = 150): void {
    scene.cameras.main.shake(duration, intensity);
  }

  /**
   * Ramp time scale down and back up.
   * @param scene - Active scene
   * @param timeScale - Target time scale (0.1 = 10% speed)
   * @param duration - Total effect duration in real ms
   */
  static slowMo(scene: Phaser.Scene, timeScale = 0.2, duration = 400): void {
    if (this.slowMoTween?.isPlaying()) {
      this.slowMoTween.stop();
    }

    scene.time.timeScale = timeScale;
    scene.physics.world.timeScale = 1 / timeScale;

    this.slowMoTween = scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: "Quad.easeIn",
      onUpdate: (tween) => {
        const progress01 = tween.getValue() as number;
        const scale = Phaser.Math.Linear(timeScale, 1, progress01);
        scene.time.timeScale = scale;
        scene.physics.world.timeScale = 1 / scale;
      },
      onComplete: () => {
        scene.time.timeScale = 1;
        scene.physics.world.timeScale = 1;
        this.slowMoTween = null;
      },
    });
  }

  /**
   * Freeze the game for `frames` frames then resume — classic hit stop feel.
   * Uses Phaser's time scale rather than pausing the scene to preserve animations.
   */
  static hitStop(scene: Phaser.Scene, durationMs = 80): void {
    scene.time.timeScale = 0;
    scene.physics.world.timeScale = Infinity; // effectively pauses physics

    scene.time.addEvent({
      delay: durationMs,
      callback: () => {
        scene.time.timeScale = 1;
        scene.physics.world.timeScale = 1;
      },
      callbackScope: scene,
      loop: false,
    });
  }

  /**
   * Flash a sprite white (or any tint) briefly.
   * Great combined with hitStop for impact feedback.
   */
  static flashSprite(sprite: Phaser.GameObjects.Sprite, tint = 0xffffff, duration = 60): void {
    sprite.setTintFill(tint);
    sprite.scene.time.delayedCall(duration, () => sprite.clearTint());
  }

  /**
   * Punch-scale: briefly scale up then snap back.
   * Useful for pickups, damage numbers, UI elements.
   */
  static punchScale(
    target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    scale = 1.3,
    duration = 100,
  ): void {
    const scene = (target as unknown as { scene: Phaser.Scene }).scene;
    scene.tweens.add({
      targets: target,
      scaleX: scale,
      scaleY: scale,
      duration: duration * 0.4,
      ease: "Back.easeOut",
      yoyo: true,
      onComplete: () => {
        (target as unknown as Phaser.GameObjects.Components.Transform).setScale(1);
      },
    });
  }
}
