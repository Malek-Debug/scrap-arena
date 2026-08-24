import Phaser from "phaser";

const MAX_ACTIVE_GROUPS = 8;

interface EffectGroup {
  objects: Phaser.GameObjects.GameObject[];
  tweens: Phaser.Tweens.Tween[];
  createdAt: number;
  done: boolean;
}

export class DeathFX {
  private scene: Phaser.Scene;
  private activeGroups: EffectGroup[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawnDeathEffect(x: number, y: number, _intensity: number): void {
    while (this.activeGroups.length >= MAX_ACTIVE_GROUPS) {
      this.destroyGroup(this.activeGroups.shift()!);
    }

    const group: EffectGroup = {
      objects: [],
      tweens: [],
      createdAt: Date.now(),
      done: false,
    };

    // Lightweight death: single flash + expanding ring (2 objects instead of ~22)
    const color = Math.random() < 0.5 ? 0x00ff88 : 0xcc44ff;
    const flash = this.scene.add.circle(x, y, 12, 0xffffff, 0.8)
      .setDepth(100).setBlendMode(Phaser.BlendModes.ADD);
    group.objects.push(flash);
    group.tweens.push(this.scene.tweens.add({
      targets: flash, alpha: 0, scale: 2.5, duration: 120,
      ease: "Power2",
    }));

    const ring = this.scene.add.circle(x, y, 8, color, 0)
      .setStrokeStyle(2, color, 0.7).setDepth(100).setBlendMode(Phaser.BlendModes.ADD);
    group.objects.push(ring);
    group.tweens.push(this.scene.tweens.add({
      targets: ring, scaleX: 4, scaleY: 4, alpha: 0, duration: 300,
      ease: "Quad.easeOut",
    }));

    this.activeGroups.push(group);
  }

  update(_deltaMs: number): void {
    for (let i = this.activeGroups.length - 1; i >= 0; i--) {
      const g = this.activeGroups[i];
      if (g.tweens.length > 0 && g.tweens.every((t) => !t.isPlaying())) {
        this.destroyGroup(g);
        this.activeGroups.splice(i, 1);
      }
    }
  }

  destroy(): void {
    for (const g of this.activeGroups) {
      this.destroyGroup(g);
    }
    this.activeGroups.length = 0;
  }



  /* ------------------------------------------------------------------ */
  /*  Internal cleanup                                                   */
  /* ------------------------------------------------------------------ */

  private destroyGroup(group: EffectGroup): void {
    for (const tw of group.tweens) {
      if (tw.isPlaying()) tw.stop();
    }
    for (const obj of group.objects) {
      obj.destroy();
    }
    group.tweens.length = 0;
    group.objects.length = 0;
    group.done = true;
  }
}
