import Phaser from "phaser";

const MAX_ACTIVE_GROUPS = 20;

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

  spawnDeathEffect(x: number, y: number, intensity: number): void {
    // Evict oldest groups if at capacity
    while (this.activeGroups.length >= MAX_ACTIVE_GROUPS) {
      this.destroyGroup(this.activeGroups.shift()!);
    }

    const group: EffectGroup = {
      objects: [],
      tweens: [],
      createdAt: Date.now(),
      done: false,
    };

    this.implosionRing(x, y, group);
    this.inwardParticleRush(x, y, group);
    this.realityCrackLines(x, y, group);
    this.dimensionalFlash(x, y, group);
    this.afterimageEcho(x, y, group);
    this.screenDistortionPulse(intensity);

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
  /*  Effect helpers                                                     */
  /* ------------------------------------------------------------------ */

  private implosionRing(x: number, y: number, group: EffectGroup): void {
    const gfx = this.scene.add.graphics().setDepth(100);
    group.objects.push(gfx);

    const tween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 400,
      ease: "Quad.easeOut",
      onUpdate: (tw) => {
        const p = tw.getValue() as number;
        const radius = Phaser.Math.Linear(5, 80, p);
        const lineWidth = Phaser.Math.Linear(4, 1, p);
        const alpha = 1 - p;

        const r = Phaser.Math.Linear(0xff, 0xcc, p);
        const g = Phaser.Math.Linear(0xff, 0x44, p);
        const b = Phaser.Math.Linear(0xff, 0xff, p);
        const color = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

        gfx.clear();
        gfx.lineStyle(lineWidth, color, alpha);
        gfx.strokeCircle(x, y, radius);
      },
      onComplete: () => {
        gfx.clear();
      },
    });
    group.tweens.push(tween);
  }

  private inwardParticleRush(x: number, y: number, group: EffectGroup): void {
    const count = Phaser.Math.Between(10, 16);
    const colors = [0xff4400, 0xcc44ff, 0x00ff88, 0x00ccff];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = Phaser.Math.Between(50, 80);
      const startX = x + Math.cos(angle) * dist;
      const startY = y + Math.sin(angle) * dist;
      const size = Phaser.Math.Between(2, 5);
      const color = Phaser.Utils.Array.GetRandom(colors);

      const dot = this.scene.add.circle(startX, startY, size, color).setAlpha(0.9).setDepth(101);
      group.objects.push(dot);

      const tween = this.scene.tweens.add({
        targets: dot,
        x,
        y,
        alpha: 0,
        scale: 0.2,
        duration: 300,
        ease: "Quad.easeIn",
      });
      group.tweens.push(tween);
    }
  }

  private realityCrackLines(x: number, y: number, group: EffectGroup): void {
    const lineCount = Phaser.Math.Between(3, 4);

    for (let i = 0; i < lineCount; i++) {
      const gfx = this.scene.add.graphics().setDepth(102).setAlpha(0.8);
      group.objects.push(gfx);

      const baseAngle = (Math.PI * 2 * i) / lineCount + Phaser.Math.FloatBetween(-0.3, 0.3);
      const segCount = Phaser.Math.Between(2, 3);
      const totalLength = Phaser.Math.Between(30, 60);
      const segLength = totalLength / segCount;

      gfx.lineStyle(2, 0xffffff, 1);
      gfx.beginPath();
      gfx.moveTo(x, y);

      let cx = x;
      let cy = y;
      for (let s = 0; s < segCount; s++) {
        const jitter = Phaser.Math.FloatBetween(-0.5, 0.5);
        const a = baseAngle + jitter;
        cx += Math.cos(a) * segLength;
        cy += Math.sin(a) * segLength;
        gfx.lineTo(cx, cy);
      }
      gfx.strokePath();

      const tween = this.scene.tweens.add({
        targets: gfx,
        alpha: 0,
        duration: 1500,
        ease: "Power2",
      });
      group.tweens.push(tween);
    }
  }

  private dimensionalFlash(x: number, y: number, group: EffectGroup): void {
    const color = Math.random() < 0.5 ? 0x00ff88 : 0xcc44ff;
    const flash = this.scene.add.circle(x, y, 30, color).setAlpha(0.9).setDepth(103);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    group.objects.push(flash);

    const tween = this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 150,
      ease: "Power1",
    });
    group.tweens.push(tween);
  }

  private afterimageEcho(x: number, y: number, group: EffectGroup): void {
    const echo = this.scene.add
      .rectangle(x, y, 20, 20, 0x8800ff)
      .setAlpha(0.4)
      .setDepth(99);
    group.objects.push(echo);

    const tween = this.scene.tweens.add({
      targets: echo,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 800,
      ease: "Quad.easeOut",
    });
    group.tweens.push(tween);
  }

  private screenDistortionPulse(intensity: number): void {
    if (intensity > 0.2) {
      this.scene.cameras.main.shake(120, intensity * 0.012);
    }

    if (intensity > 0.5) {
      const cam = this.scene.cameras.main;
      this.scene.tweens.add({
        targets: cam,
        zoom: 1.03,
        duration: 100,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }
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
