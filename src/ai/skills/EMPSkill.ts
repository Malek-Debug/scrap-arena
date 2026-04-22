import Phaser from "phaser";
import { BaseSkill } from "./BaseSkill";
import { ShootSkill } from "./ShootSkill";
import { SystemsBus } from "../../core/SystemsBus";

/**
 * EMPSkill — Electromagnetic Pulse. Pure MACHINES theme.
 *
 * On activation:
 *   • Expands a high-voltage ring.
 *   • Recycles all enemy projectiles inside `radius` (their circuits fry).
 *   • Emits "emp:detonate" on SystemsBus with (x, y, radius, durationMs)
 *     so MainScene can stun enemies / disable turrets.
 *
 * Has thermal load — chained EMPs overheat the capacitor bank.
 */
export class EMPSkill extends BaseSkill {
  readonly name = "EMP Burst";
  readonly cooldownMs: number;
  readonly radius: number;
  readonly stunDurationMs: number;

  constructor(cooldownMs = 6000, radius = 240, stunDurationMs = 1400) {
    super(1);
    this.cooldownMs = cooldownMs;
    this.radius = radius;
    this.stunDurationMs = stunDurationMs;
    this.heatPerUse = 0.65;
    this.heatCoolPerSec = 0.25;
  }

  protected onUse(...args: unknown[]): void {
    const [scene, x, y] = args as [Phaser.Scene, number, number];
    if (!scene) return;

    // ── Fry hostile projectiles in radius ────────────────────────────
    const r2 = this.radius * this.radius;
    const active = ShootSkill.activeProjectiles;
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      if (p.ownerId === -1) continue; // skip player bullets
      const dx = p.sprite.x - x;
      const dy = p.sprite.y - y;
      if (dx * dx + dy * dy <= r2) {
        ShootSkill.recycleProjectile(p);
      }
    }

    // ── Visuals: triple expanding ring + lightning crackle ───────────
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.circle(x, y, 16, 0x00ffff, 0)
        .setStrokeStyle(3 - i * 0.6, 0x66ddff, 0.9 - i * 0.2)
        .setDepth(58).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: ring,
        scale: this.radius / 16,
        alpha: 0,
        duration: 480 + i * 120,
        ease: "Quad.easeOut",
        delay: i * 60,
        onComplete: () => ring.destroy(),
      });
    }

    // Core flash
    const core = scene.add.circle(x, y, 24, 0xffffff, 0.9)
      .setDepth(59).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: core, scale: 3.2, alpha: 0, duration: 180,
      onComplete: () => core.destroy(),
    });

    // Lightning arcs
    const gfx = scene.add.graphics().setDepth(57).setBlendMode(Phaser.BlendModes.ADD);
    gfx.lineStyle(2, 0x99eeff, 0.9);
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2;
      let lx = x, ly = y;
      gfx.beginPath();
      gfx.moveTo(lx, ly);
      const segs = 6;
      const segLen = this.radius / segs;
      for (let s = 1; s <= segs; s++) {
        const jitter = (Math.random() - 0.5) * 26;
        lx = x + Math.cos(a) * segLen * s + Math.cos(a + Math.PI / 2) * jitter;
        ly = y + Math.sin(a) * segLen * s + Math.sin(a + Math.PI / 2) * jitter;
        gfx.lineTo(lx, ly);
      }
      gfx.strokePath();
    }
    scene.tweens.add({
      targets: gfx, alpha: 0, duration: 260,
      onComplete: () => gfx.destroy(),
    });

    scene.cameras.main.shake(180, 0.012);

    SystemsBus.instance.emit("emp:detonate", x, y, this.radius, this.stunDurationMs);
  }
}
