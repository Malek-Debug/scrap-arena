import Phaser from "phaser";

/**
 * ParticleVFX — Phaser particle-based replacements for tween'd circle VFX.
 *
 * Textures are baked once into the Phaser texture cache using Canvas API —
 * no external downloads needed. Call `bakeTextures(scene)` from
 * MainScene.create() before any VFX fires.
 *
 * All methods are static and safe to call from anywhere that has a scene ref.
 */
export class ParticleVFX {
  private static _baked = false;

  // ── Texture baking ──────────────────────────────────────────────────────────

  /** Bake all VFX textures into the Phaser cache. Call once per game session. */
  static bakeTextures(scene: Phaser.Scene): void {
    if (this._baked) return;
    this._bakeSpark(scene);
    this._bakeDust(scene);
    this._bakeGlow(scene);
    this._bakeStreak(scene);
    this._baked = true;
  }

  private static _bakeSpark(scene: Phaser.Scene): void {
    if (scene.textures.exists("vfx_spark")) return;
    const t = scene.textures.createCanvas("vfx_spark", 4, 4) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createRadialGradient(2, 2, 0, 2, 2, 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 4);
    t.refresh();
  }

  private static _bakeDust(scene: Phaser.Scene): void {
    if (scene.textures.exists("vfx_dust")) return;
    const t = scene.textures.createCanvas("vfx_dust", 12, 12) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createRadialGradient(6, 6, 0, 6, 6, 6);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.55, "rgba(255,255,255,0.3)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 12, 12);
    t.refresh();
  }

  private static _bakeGlow(scene: Phaser.Scene): void {
    if (scene.textures.exists("vfx_glow")) return;
    const t = scene.textures.createCanvas("vfx_glow", 24, 24) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 24, 24);
    t.refresh();
  }

  private static _bakeStreak(scene: Phaser.Scene): void {
    if (scene.textures.exists("vfx_streak")) return;
    const t = scene.textures.createCanvas("vfx_streak", 16, 3) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.4, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 3);
    t.refresh();
  }

  // ── VFX Methods ─────────────────────────────────────────────────────────────

  /** Debris scatter explosion — replaces the tween'd burst circle on enemy death. */
  static explosion(scene: Phaser.Scene, x: number, y: number, color: number, scale = 1.0): void {
    if (!scene.textures.exists("vfx_spark")) return;
    const count = Math.max(4, Math.round(10 * scale));
    const spd   = 140 * Math.max(0.3, scale);
    const emit = scene.add.particles(x, y, "vfx_spark", {
      lifespan:  { min: 180, max: 380 },
      speed:     { min: spd * 0.35, max: spd },
      scale:     { start: 1.4, end: 0 },
      alpha:     { start: 1, end: 0 },
      tint:      color,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(52);
    emit.explode(count);
    scene.time.delayedCall(560, () => { if (emit?.active) emit.destroy(); });
  }

  /** Directional spark streaks — replaces tween'd spark circles on hit impacts. */
  static hitSparks(scene: Phaser.Scene, x: number, y: number, color: number, count = 4): void {
    if (!scene.textures.exists("vfx_streak")) return;
    const emit = scene.add.particles(x, y, "vfx_streak", {
      lifespan:  { min: 90, max: 200 },
      speed:     { min: 80, max: 240 },
      scale:     { start: 0.9, end: 0 },
      alpha:     { start: 1, end: 0 },
      tint:      color,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      rotate:    { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(52);
    emit.explode(count);
    scene.time.delayedCall(380, () => { if (emit?.active) emit.destroy(); });
  }

  /** Forward-cone muzzle flash — replaces inline add.circle on player shoot. */
  static muzzleFlash(scene: Phaser.Scene, x: number, y: number, angle: number): void {
    if (!scene.textures.exists("vfx_glow") || !scene.textures.exists("vfx_streak")) return;
    const deg = (angle * 180) / Math.PI;
    const glow = scene.add.particles(x, y, "vfx_glow", {
      lifespan:  80,
      speed:     0,
      scale:     { start: 1.5, end: 0.2 },
      alpha:     { start: 0.9, end: 0 },
      tint:      0xffff88,
      blendMode: Phaser.BlendModes.ADD,
      emitting:  false,
    }).setDepth(53);
    glow.explode(1);
    const streaks = scene.add.particles(x, y, "vfx_streak", {
      lifespan:  { min: 75, max: 130 },
      speed:     { min: 80, max: 200 },
      scale:     { start: 0.9, end: 0 },
      alpha:     { start: 1, end: 0 },
      tint:      0xffcc44,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: deg - 22, max: deg + 22 },
      rotate:    { min: deg - 15, max: deg + 15 },
      emitting:  false,
    }).setDepth(53);
    streaks.explode(3);
    scene.time.delayedCall(280, () => {
      if (glow?.active) glow.destroy();
      if (streaks?.active) streaks.destroy();
    });
  }

  /** Afterimage dust trail — replaces add.circle in dashTrail. */
  static dashTrail(scene: Phaser.Scene, x: number, y: number): void {
    if (!scene.textures.exists("vfx_dust")) return;
    const emit = scene.add.particles(x, y, "vfx_dust", {
      lifespan:  { min: 100, max: 210 },
      speed:     { min: 8, max: 32 },
      scale:     { start: 1.1, end: 0 },
      alpha:     { start: 0.55, end: 0 },
      tint:      0x00ff88,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(50);
    emit.explode(3);
    scene.time.delayedCall(380, () => { if (emit?.active) emit.destroy(); });
  }

  /** Cyan crystalline shard burst on shield absorb. */
  static shieldImpact(scene: Phaser.Scene, x: number, y: number): void {
    if (!scene.textures.exists("vfx_spark")) return;
    const emit = scene.add.particles(x, y, "vfx_spark", {
      lifespan:  { min: 140, max: 280 },
      speed:     { min: 55, max: 160 },
      scale:     { start: 1.3, end: 0 },
      alpha:     { start: 1, end: 0 },
      tint:      0x44ffcc,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(54);
    emit.explode(8);
    scene.time.delayedCall(480, () => { if (emit?.active) emit.destroy(); });
  }

  /** Green rising motes for on-kill HP regen. */
  static healBurst(scene: Phaser.Scene, x: number, y: number): void {
    if (!scene.textures.exists("vfx_dust")) return;
    const emit = scene.add.particles(x, y, "vfx_dust", {
      lifespan:  { min: 260, max: 520 },
      speed:     { min: 15, max: 50 },
      gravityY:  -32,
      scale:     { start: 0.9, end: 0 },
      alpha:     { start: 0.85, end: 0 },
      tint:      0x00ff88,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 195, max: 345 },
      emitting:  false,
    }).setDepth(53);
    emit.explode(5);
    scene.time.delayedCall(700, () => { if (emit?.active) emit.destroy(); });
  }

  /** Orange/amber sparks for reactor hits and corruption. */
  static reactorCorruption(scene: Phaser.Scene, x: number, y: number): void {
    if (!scene.textures.exists("vfx_spark")) return;
    const emit = scene.add.particles(x, y, "vfx_spark", {
      lifespan:  { min: 340, max: 680 },
      speed:     { min: 28, max: 80 },
      gravityY:  -18,
      scale:     { start: 1.4, end: 0 },
      alpha:     { start: 0.9, end: 0 },
      tint:      0xff8800,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(54);
    emit.explode(8);
    scene.time.delayedCall(900, () => { if (emit?.active) emit.destroy(); });
  }

  /** Purple/cyan dimensional rift particles for world switch. */
  static worldSwitch(scene: Phaser.Scene, x: number, y: number): void {
    if (!scene.textures.exists("vfx_glow")) return;
    const emit = scene.add.particles(x, y, "vfx_glow", {
      lifespan:  { min: 240, max: 480 },
      speed:     { min: 35, max: 115 },
      scale:     { start: 1.4, end: 0 },
      alpha:     { start: 0.9, end: 0 },
      tint:      0xcc44ff,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(56);
    emit.explode(12);
    scene.time.delayedCall(680, () => { if (emit?.active) emit.destroy(); });
  }

  /** Converging scatter on enemy spawn — augments the ring+dot spawnEffect. */
  static spawnEffect(scene: Phaser.Scene, x: number, y: number, color: number): void {
    if (!scene.textures.exists("vfx_spark")) return;
    const emit = scene.add.particles(x, y, "vfx_spark", {
      lifespan:  { min: 160, max: 320 },
      speed:     { min: 22, max: 70 },
      scale:     { start: 1.0, end: 0 },
      alpha:     { start: 0.9, end: 0 },
      tint:      color,
      blendMode: Phaser.BlendModes.ADD,
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(49);
    emit.explode(8);
    scene.time.delayedCall(520, () => { if (emit?.active) emit.destroy(); });
  }
}
