import Phaser from "phaser";

/**
 * VFXPool — pre-allocated object pool for common visual effects.
 *
 * Replaces per-frame `scene.add.circle()` / `scene.add.text()` calls with
 * rent-from-pool → tween → return-to-pool, eliminating GC pressure from
 * muzzle flashes, score popups, death rings, and shockwaves.
 */
export class VFXPool {
  private readonly scene: Phaser.Scene;
  private readonly circles: Phaser.GameObjects.Arc[] = [];
  private readonly texts: Phaser.GameObjects.Text[] = [];

  private static readonly CIRCLE_SLOTS = 80;
  private static readonly TEXT_SLOTS   = 32;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    for (let i = 0; i < VFXPool.CIRCLE_SLOTS; i++) {
      const c = scene.add
        .circle(0, 0, 10, 0xffffff, 0)
        .setDepth(60)
        .setActive(false)
        .setVisible(false);
      this.circles.push(c);
    }

    for (let i = 0; i < VFXPool.TEXT_SLOTS; i++) {
      const t = scene.add
        .text(0, 0, "", {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setActive(false)
        .setVisible(false);
      this.texts.push(t);
    }
  }

  // ── Acquisition helpers ────────────────────────────────────────────────────

  private _getCircle(): Phaser.GameObjects.Arc | null {
    for (const c of this.circles) {
      if (!c.active) return c;
    }
    return null;
  }

  private _getText(): Phaser.GameObjects.Text | null {
    for (const t of this.texts) {
      if (!t.active) return t;
    }
    return null;
  }

  private _freeCircle(c: Phaser.GameObjects.Arc): void {
    this.scene.tweens.killTweensOf(c);
    c.setActive(false).setVisible(false).setScale(1, 1).setAlpha(1);
    c.setStrokeStyle(0);
    c.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private _freeText(t: Phaser.GameObjects.Text): void {
    this.scene.tweens.killTweensOf(t);
    t.setActive(false).setVisible(false).setScale(1, 1).setAlpha(1);
    t.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Directional muzzle-flash glow at barrel position. */
  muzzleFlash(x: number, y: number, color: number): void {
    const c = this._getCircle();
    if (!c) return;
    c.setPosition(x, y).setRadius(20)
      .setFillStyle(color, 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1, 1).setAlpha(1)
      .setActive(true).setVisible(true);
    this.scene.tweens.add({
      targets: c,
      alpha: 0, scaleX: 2, scaleY: 2,
      duration: 80,
      onComplete: () => this._freeCircle(c),
    });
  }

  /** Three-ring death explosion at kill position. */
  deathRing(x: number, y: number, color: number): void {
    // White-hot core flash
    const core = this._getCircle();
    if (core) {
      core.setPosition(x, y).setRadius(6).setFillStyle(0xffffff, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1, 1).setAlpha(1)
        .setActive(true).setVisible(true).setDepth(62);
      this.scene.tweens.add({
        targets: core, alpha: 0, scaleX: 4, scaleY: 4,
        duration: 120, onComplete: () => this._freeCircle(core),
      });
    }

    // Colored burst ring
    const burst = this._getCircle();
    if (burst) {
      burst.setPosition(x, y).setRadius(10).setFillStyle(color, 0.8)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1, 1).setAlpha(1)
        .setActive(true).setVisible(true).setDepth(55);
      this.scene.tweens.add({
        targets: burst, alpha: 0, scaleX: 4, scaleY: 4,
        duration: 350, ease: "Quad.easeOut",
        onComplete: () => this._freeCircle(burst),
      });
    }

    // Shockwave outline ring
    const shock = this._getCircle();
    if (shock) {
      shock.setPosition(x, y).setRadius(5).setFillStyle(0, 0)
        .setStrokeStyle(2, color, 0.7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1, 1).setAlpha(1)
        .setActive(true).setVisible(true).setDepth(55);
      this.scene.tweens.add({
        targets: shock, scaleX: 8, scaleY: 8, alpha: 0,
        duration: 400, ease: "Quad.easeOut",
        onComplete: () => this._freeCircle(shock),
      });
    }
  }

  /** Score popup floating text (+value). */
  scorePop(x: number, y: number, value: number, color: string): void {
    const t = this._getText();
    if (!t) return;
    t.setPosition(x, y - 10)
      .setText(`+${value}`)
      .setColor(color)
      .setFontSize("14px")
      .setScale(1, 1).setAlpha(1)
      .setActive(true).setVisible(true).setDepth(55);
    this.scene.tweens.add({
      targets: t, y: y - 50, alpha: 0,
      duration: 700, ease: "Power2",
      onComplete: () => this._freeText(t),
    });
  }

  /** Floating combo multiplier text. */
  comboText(x: number, y: number, label: string): void {
    const t = this._getText();
    if (!t) return;
    t.setPosition(x + 15, y - 15)
      .setText(label)
      .setColor("#ffcc00")
      .setFontSize("16px")
      .setScale(1, 1).setAlpha(1)
      .setActive(true).setVisible(true).setDepth(51);
    this.scene.tweens.add({
      targets: t, y: y - 40, alpha: 0,
      duration: 500, onComplete: () => this._freeText(t),
    });
  }

  /** General floating text (hit numbers, status labels, etc). */
  floatText(x: number, y: number, text: string, color: string, depth = 55): void {
    const t = this._getText();
    if (!t) return;
    t.setPosition(x, y)
      .setText(text)
      .setColor(color)
      .setFontSize("14px")
      .setScale(1, 1).setAlpha(1)
      .setActive(true).setVisible(true).setDepth(depth);
    this.scene.tweens.add({
      targets: t, y: y - 36, alpha: 0,
      duration: 900, onComplete: () => this._freeText(t),
    });
  }

  /** Dimension breach shockwave ring. */
  breachRing(x: number, y: number): void {
    const c = this._getCircle();
    if (!c) return;
    c.setPosition(x, y).setRadius(8).setFillStyle(0, 0)
      .setStrokeStyle(3, 0xff00ff, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1, 1).setAlpha(1)
      .setActive(true).setVisible(true).setDepth(57);
    this.scene.tweens.add({
      targets: c, scaleX: 6, scaleY: 6, alpha: 0,
      duration: 600, ease: "Quad.easeOut",
      onComplete: () => this._freeCircle(c),
    });
  }

  /** Generic expanding glow circle (for hits, pickups, etc). */
  glowBurst(x: number, y: number, color: number, startRadius = 20, expandScale = 2, duration = 300, depth = 51): void {
    const c = this._getCircle();
    if (!c) return;
    c.setPosition(x, y).setRadius(startRadius)
      .setFillStyle(color, 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1, 1).setAlpha(1)
      .setActive(true).setVisible(true).setDepth(depth);
    this.scene.tweens.add({
      targets: c, alpha: 0, scaleX: expandScale, scaleY: expandScale,
      duration,
      onComplete: () => this._freeCircle(c),
    });
  }

  /** Clean up — call when scene shuts down. */
  destroy(): void {
    for (const c of this.circles) c.destroy();
    for (const t of this.texts) t.destroy();
    this.circles.length = 0;
    this.texts.length = 0;
  }
}
