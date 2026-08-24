import Phaser from "phaser";

/**
 * WeaponVFX — Canvas-baked textures + static helpers for weapon identity VFX.
 *
 * Three weapon categories map to tier ranges:
 *   ENERGY  (tiers 1–2) : cyan/plasma/holographic — fast, sharp
 *   HEAVY   (tier 3)    : amber/industrial/mechanical — big, punchy
 *   VOID    (tiers 4–5) : red/corrupted/unstable — dark, volatile
 *
 * Call bakeTextures(scene) once from MainScene.create() after ParticleVFX.bakeTextures().
 * All effect methods are static and reuse the existing ParticleVFX textures (vfx_spark,
 * vfx_glow, vfx_streak) — no duplicate particle textures are created.
 */
export class WeaponVFX {
  private static _baked = false;

  // ─── Category helpers ─────────────────────────────────────────────────────

  /** Map weapon damage → category string. Mirrors WeaponVisual.calcTier logic. */
  static category(damage: number): "energy" | "heavy" | "void" {
    if (damage >= 28) return "void";
    if (damage >= 18) return "heavy";
    return "energy";
  }

  /** Returns the accent tint for a category (used to tint shared vfx_spark/glow textures). */
  static tint(cat: "energy" | "heavy" | "void"): number {
    if (cat === "void")   return 0xff2244;
    if (cat === "heavy")  return 0xffaa22;
    return 0x22ffff;
  }

  // ─── Texture baking ───────────────────────────────────────────────────────

  static bakeTextures(scene: Phaser.Scene): void {
    if (this._baked) return;
    this._bakeMuzzleEnergy(scene);
    this._bakeMuzzleHeavy(scene);
    this._bakeMuzzleVoid(scene);
    this._bakeTrailEnergy(scene);
    this._bakeTrailHeavy(scene);
    this._bakeTrailVoid(scene);
    this._baked = true;
  }

  // ── Muzzle flash textures — directional cone shape ───────────────────────

  private static _bakeMuzzleEnergy(scene: Phaser.Scene): void {
    const key = "wvfx_muzzle_energy";
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 32, 16) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createRadialGradient(4, 8, 0, 4, 8, 28);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(100,255,255,0.9)");
    g.addColorStop(0.7, "rgba(0,220,255,0.3)");
    g.addColorStop(1, "rgba(0,180,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(2, 8);
    c.lineTo(30, 2);
    c.lineTo(30, 14);
    c.closePath();
    c.fill();
    t.refresh();
  }

  private static _bakeMuzzleHeavy(scene: Phaser.Scene): void {
    const key = "wvfx_muzzle_heavy";
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 40, 24) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createRadialGradient(5, 12, 0, 5, 12, 36);
    g.addColorStop(0, "rgba(255,255,200,1)");
    g.addColorStop(0.2, "rgba(255,180,0,0.95)");
    g.addColorStop(0.6, "rgba(255,100,0,0.4)");
    g.addColorStop(1, "rgba(200,50,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(3, 12);
    c.lineTo(38, 3);
    c.lineTo(38, 21);
    c.closePath();
    c.fill();
    // Ember sparks — bright dots
    c.fillStyle = "rgba(255,220,80,0.85)";
    for (let i = 0; i < 6; i++) {
      const bx = 10 + i * 5 + (i % 2) * 2;
      const by = 12 + (i % 3 - 1) * 5;
      c.fillRect(bx, by, 2, 2);
    }
    t.refresh();
  }

  private static _bakeMuzzleVoid(scene: Phaser.Scene): void {
    const key = "wvfx_muzzle_void";
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 40, 20) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    // Dark plasma — crimson core, black fringe
    const g = c.createRadialGradient(5, 10, 0, 5, 10, 36);
    g.addColorStop(0, "rgba(255,200,255,1)");
    g.addColorStop(0.15, "rgba(255,50,80,0.9)");
    g.addColorStop(0.5, "rgba(160,0,60,0.5)");
    g.addColorStop(0.85, "rgba(40,0,20,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(3, 10);
    c.lineTo(38, 1);
    c.lineTo(38, 19);
    c.closePath();
    c.fill();
    // Corruption pixel scatter
    c.fillStyle = "rgba(255,0,80,0.7)";
    for (let i = 0; i < 5; i++) {
      c.fillRect(8 + i * 6, 10 + (i % 2 === 0 ? -4 : 3), 2, 2);
    }
    t.refresh();
  }

  // ── Trail segment textures — elongated glowing streaks ───────────────────

  private static _bakeTrailEnergy(scene: Phaser.Scene): void {
    const key = "wvfx_trail_energy";
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 16, 4) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(0,230,255,0.7)");
    g.addColorStop(1, "rgba(0,180,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 1, 16, 2);
    t.refresh();
  }

  private static _bakeTrailHeavy(scene: Phaser.Scene): void {
    const key = "wvfx_trail_heavy";
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 20, 6) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createLinearGradient(0, 0, 20, 0);
    g.addColorStop(0, "rgba(255,255,200,1)");
    g.addColorStop(0.35, "rgba(255,150,0,0.8)");
    g.addColorStop(1, "rgba(200,80,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 2, 20, 2);
    // ember glow overlay
    const g2 = c.createLinearGradient(0, 0, 20, 0);
    g2.addColorStop(0, "rgba(255,200,100,0.4)");
    g2.addColorStop(1, "rgba(255,100,0,0)");
    c.fillStyle = g2;
    c.fillRect(0, 0, 20, 6);
    t.refresh();
  }

  private static _bakeTrailVoid(scene: Phaser.Scene): void {
    const key = "wvfx_trail_void";
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 18, 5) as Phaser.Textures.CanvasTexture;
    const c = t.getContext();
    const g = c.createLinearGradient(0, 0, 18, 0);
    g.addColorStop(0, "rgba(255,180,255,1)");
    g.addColorStop(0.3, "rgba(220,0,80,0.8)");
    g.addColorStop(0.7, "rgba(80,0,40,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 1, 18, 3);
    t.refresh();
  }

  // ─── Effect methods ───────────────────────────────────────────────────────

  /**
   * Muzzle flash at weapon tip. angle = aim direction in radians.
   * Uses category-specific texture rotated to face the aim direction.
   */
  static muzzleFlash(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    cat: "energy" | "heavy" | "void",
  ): void {
    const key = `wvfx_muzzle_${cat}`;
    if (!scene.textures.exists(key)) return;
    const fw = cat === "energy" ? 32 : 40;
    const fh = cat === "energy" ? 16 : (cat === "heavy" ? 24 : 20);
    const img = scene.add.image(
      x + Math.cos(angle) * (fw * 0.4),
      y + Math.sin(angle) * (fh * 0.4),
      key,
    )
      .setRotation(angle)
      .setDepth(55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.95);
    scene.tweens.add({
      targets: img,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.6,
      duration: cat === "heavy" ? 90 : 70,
      ease: "Power2",
      onComplete: () => img.destroy(),
    });
  }

  /**
   * Weapon glow burst on the gun barrel on fire.
   * A small, fast circle bloom in category color.
   */
  static weaponGlow(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cat: "energy" | "heavy" | "void",
  ): void {
    const color = cat === "void" ? 0xff2244 : cat === "heavy" ? 0xff9900 : 0x00eeff;
    const radius = cat === "heavy" ? 14 : 10;
    const bloom = scene.add.circle(x, y, radius, color, 0.55)
      .setDepth(54)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: bloom,
      alpha: 0,
      scaleX: 2.5,
      scaleY: 2.5,
      duration: 120,
      ease: "Power2",
      onComplete: () => bloom.destroy(),
    });
  }

  /**
   * Impact burst at hit location.
   * Spawns a glow flash + color-tinted particle burst using existing vfx_spark texture.
   */
  static impactBurst(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cat: "energy" | "heavy" | "void",
    isCrit = false,
  ): void {
    if (!scene.textures.exists("vfx_spark")) return;
    const color = this.tint(cat);
    const count = isCrit ? 18 : 8;
    const speed = isCrit ? 160 : 90;
    const scale = isCrit ? { min: 0.8, max: 2.0 } : { min: 0.4, max: 1.2 };

    const em = scene.add.particles(x, y, "vfx_spark", {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: isCrit ? 350 : 220,
      scale,
      tint: color,
      blendMode: Phaser.BlendModes.ADD,
      quantity: count,
    });
    em.setDepth(56);
    em.explode(count);
    scene.time.delayedCall(500, () => { if (em.scene) em.destroy(); });

    // Flash circle
    const flashR = isCrit ? 22 : 12;
    const flash = scene.add.circle(x, y, flashR, color, isCrit ? 0.7 : 0.5)
      .setDepth(57)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: isCrit ? 3.5 : 2.5,
      scaleY: isCrit ? 3.5 : 2.5,
      duration: isCrit ? 250 : 150,
      ease: "Power2",
      onComplete: () => flash.destroy(),
    });
  }

  /**
   * Critical hit burst — larger, with a ring shockwave.
   */
  static critBurst(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cat: "energy" | "heavy" | "void",
  ): void {
    this.impactBurst(scene, x, y, cat, true);
    // Shockwave ring
    const color = this.tint(cat);
    const ring = scene.add.circle(x, y, 6, color, 0)
      .setDepth(57)
      .setStrokeStyle(3, color, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: ring,
      scaleX: 5,
      scaleY: 5,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Overheat steam — rising grey particles from gun position.
   * Uses vfx_dust texture. Plays once per overheat trigger.
   */
  static overheatSmoke(scene: Phaser.Scene, x: number, y: number): void {
    if (!scene.textures.exists("vfx_dust")) return;
    const em = scene.add.particles(x, y, "vfx_dust", {
      speed: { min: 20, max: 55 },
      angle: { min: 240, max: 300 },
      lifespan: { min: 600, max: 1200 },
      scale: { start: 0.6, end: 2.0 },
      alpha: { start: 0.5, end: 0 },
      tint: [0xaaaaaa, 0xcccccc, 0x888888],
      frequency: 40,
      quantity: 1,
    });
    em.setDepth(58);
    scene.time.delayedCall(1800, () => {
      em.stop();
      scene.time.delayedCall(1400, () => { if (em.scene) em.destroy(); });
    });
  }

  /**
   * Heat shimmer — subtle visual distortion around the barrel at 75%+ heat.
   * Creates a small pulsing glow that fades in. Call once when entering hot zone;
   * the tween handles the pulsing. Returns the glow object for external cleanup.
   */
  static heatGlow(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Arc {
    const g = scene.add.circle(x, y, 18, 0xff6600, 0.0)
      .setDepth(53)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: g,
      alpha: { from: 0.12, to: 0.32 },
      scaleX: { from: 0.9, to: 1.2 },
      scaleY: { from: 0.9, to: 1.2 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return g;
  }
}
