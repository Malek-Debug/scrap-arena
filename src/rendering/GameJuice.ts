import Phaser from "phaser";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: number;
  alpha: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/**
 * GameJuice — per-frame visual polish effects (muzzle flashes, spawn rings,
 * dash trails, ambient particles). Instantiated once per scene.
 */
export class GameJuice {
  private scene: Phaser.Scene;
  private ambientParticles: AmbientParticle[] = [];
  private ambientGfx!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ── Call each frame ──────────────────────────────────────────────────────
  update(deltaMs: number): void {
    this.updateAmbient(deltaMs);
  }

  // ── Muzzle flash ─────────────────────────────────────────────────────────
  muzzleFlash(x: number, y: number, color: number): void {
    const flash = this.scene.add
      .circle(x, y, 6, color, 1)
      .setDepth(51)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: flash,
      scaleX: 2.5,
      scaleY: 2.5,
      alpha: 0,
      duration: 100,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });
  }

  // ── Spawn effect ─────────────────────────────────────────────────────────
  spawnEffect(x: number, y: number, color: number): void {
    // Expanding ring
    const ring = this.scene.add
      .circle(x, y, 4, color, 0.6)
      .setDepth(49)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: ring,
      scaleX: 7.5, // 4 * 7.5 = 30 effective radius
      scaleY: 7.5,
      alpha: 0,
      duration: 400,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });

    // 6 converging particles
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const dist = 30;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;

      const dot = this.scene.add
        .circle(px, py, 2, color, 0.8)
        .setDepth(49)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.scene.tweens.add({
        targets: dot,
        x,
        y,
        alpha: 0,
        duration: 400,
        ease: "Quad.easeIn",
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ── Dash trail ───────────────────────────────────────────────────────────
  dashTrail(x: number, y: number): void {
    const trail = this.scene.add
      .circle(x, y, 8, 0x00ff88, 0.4)
      .setDepth(50)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 200,
      ease: "Linear",
      onComplete: () => trail.destroy(),
    });
  }

  // ── Ambient particles ────────────────────────────────────────────────────
  initAmbient(): void {
    this.ambientGfx = this.scene.add.graphics().setDepth(4);

    const count = Phaser.Math.Between(20, 30);
    for (let i = 0; i < count; i++) {
      this.ambientParticles.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: Math.random() * 5000,
        maxLife: 3000 + Math.random() * 4000,
        radius: 1 + Math.random(),
        color: Phaser.Math.RND.pick([0xff8844, 0xffaa44, 0xff6622, 0xffcc66]),
        alpha: 0.15 + Math.random() * 0.1,
      });
    }
  }

  private updateAmbient(deltaMs: number): void {
    if (!this.ambientGfx || this.ambientParticles.length === 0) return;

    const dt = deltaMs / 1000;
    this.ambientGfx.clear();

    for (const p of this.ambientParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += deltaMs;

      // Wrap at edges
      if (p.x < 0) p.x += GAME_WIDTH;
      else if (p.x > GAME_WIDTH) p.x -= GAME_WIDTH;
      if (p.y < 0) p.y += GAME_HEIGHT;
      else if (p.y > GAME_HEIGHT) p.y -= GAME_HEIGHT;

      // Reset when life expires
      if (p.life > p.maxLife) {
        p.life = 0;
        p.x = Math.random() * GAME_WIDTH;
        p.y = Math.random() * GAME_HEIGHT;
      }

      // Pulse alpha slightly
      const pulse = Math.sin((p.life / p.maxLife) * Math.PI);
      const a = p.alpha * pulse;

      this.ambientGfx.fillStyle(p.color, a);
      this.ambientGfx.fillCircle(p.x, p.y, p.radius);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  destroy(): void {
    this.ambientGfx?.destroy();
    this.ambientParticles = [];
  }
}
