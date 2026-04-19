import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";

const VIGNETTE_DEPTH = 90;
const CHROMATIC_DEPTH = 85;
const SCANLINE_DEPTH = 95;
const INTENSITY_DECAY = 0.015;
const KILL_STREAK_WINDOW = 2000;
const KILL_STREAK_THRESHOLD = 3;
const DIMENSION_PERIOD = 10000;

export class FractureFX {
  private scene: Phaser.Scene;

  intensity = 0;

  // Baked once — no per-frame redraw
  private vignetteGfx: Phaser.GameObjects.Graphics;
  private scanlineGfx: Phaser.GameObjects.Graphics;

  private redOverlay: Phaser.GameObjects.Rectangle;
  private blueOverlay: Phaser.GameObjects.Rectangle;

  private dimensionPhase = 0;
  private lastDimensionHalf = false;

  private recentKills: number[] = [];

  private zoomTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // --- Chromatic aberration overlays (depth 85) ---
    this.redOverlay = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0)
      .setScrollFactor(0)
      .setDepth(CHROMATIC_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    this.blueOverlay = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0000ff, 0)
      .setScrollFactor(0)
      .setDepth(CHROMATIC_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    // --- Vignette overlay — baked once (depth 90) ---
    this.vignetteGfx = scene.add.graphics().setScrollFactor(0).setDepth(VIGNETTE_DEPTH);
    this._bakeVignette();

    // --- CRT scanlines — baked once (depth 95) ---
    this.scanlineGfx = scene.add.graphics().setScrollFactor(0).setDepth(SCANLINE_DEPTH);
    this._bakeScanlines();
  }

  update(deltaMs: number): void {
    const deltaSec = deltaMs / 1000;
    const cam = this.scene.cameras.main;
    const time = this.scene.time.now;

    // --- Decay intensity (never below ambient baseline) ---
    const ambient = 0.15;
    this.intensity = Math.max(
      ambient,
      Phaser.Math.Clamp(this.intensity - INTENSITY_DECAY * deltaSec, 0, 1),
    );

    // --- Prune old kills ---
    this.recentKills = this.recentKills.filter((t) => time - t < KILL_STREAK_WINDOW);

    // Vignette and scanlines are baked — no per-frame redraw needed
    // No camera rotation — it makes aiming very difficult

    // --- Chromatic aberration (cheap — just 2 position updates) ---
    if (this.intensity > 0.25) {
      const offset = this.intensity * 6;
      const alpha = this.intensity * 0.08;
      this.redOverlay.setVisible(true).setPosition(GAME_WIDTH / 2 - offset, GAME_HEIGHT / 2).setAlpha(alpha);
      this.blueOverlay.setVisible(true).setPosition(GAME_WIDTH / 2 + offset, GAME_HEIGHT / 2).setAlpha(alpha);
    } else {
      this.redOverlay.setVisible(false);
      this.blueOverlay.setVisible(false);
    }

    // --- Dimension color shift ---
    this.dimensionPhase = (time % DIMENSION_PERIOD) / DIMENSION_PERIOD;
    const inSecondHalf = this.dimensionPhase >= 0.5;
    if (inSecondHalf && !this.lastDimensionHalf) {
      cam.flash(200, 160, 32, 240, false, undefined, this);
    }
    this.lastDimensionHalf = inSecondHalf;
  }

  onKill(x: number, y: number): void {
    this.intensity = Phaser.Math.Clamp(this.intensity + 0.25, 0, 1);
    this.recentKills.push(this.scene.time.now);

    // Zoom punch
    this.applyZoomPunch(1.03, 180);

    // Kill streak flash
    if (this.recentKills.length >= KILL_STREAK_THRESHOLD) {
      this.scene.cameras.main.flash(80, 255, 255, 255);
    }
  }

  onPlayerDamage(): void {
    this.intensity = Phaser.Math.Clamp(this.intensity + 0.1, 0, 1);
  }

  onWaveStart(wave: number): void {
    const cam = this.scene.cameras.main;

    // Subtle green flash
    cam.flash(200, 50, 255, 80);

    // Dramatic zoom out then settle
    if (this.zoomTween) {
      this.zoomTween.stop();
    }
    cam.setZoom(0.96);
    this.zoomTween = this.scene.tweens.add({
      targets: cam,
      zoom: 1.0,
      duration: 800,
      ease: "Sine.easeInOut",
    });
  }

  destroy(): void {
    this.vignetteGfx.destroy();
    this.scanlineGfx.destroy();
    this.redOverlay.destroy();
    this.blueOverlay.destroy();
    if (this.zoomTween) {
      this.zoomTween.stop();
      this.zoomTween = null;
    }
    this.scene.cameras.main.setZoom(1);
  }

  // ---- Private helpers ----

  /** Draw vignette once — subtle corner darkening that never changes */
  private _bakeVignette(): void {
    const gfx = this.vignetteGfx;
    const rings = 6;
    const baseAlpha = 0.25;
    const bandW = GAME_WIDTH / 2 / rings;
    const bandH = GAME_HEIGHT / 2 / rings;

    for (let i = 0; i < rings; i++) {
      const t = (i + 1) / rings;
      const alpha = baseAlpha * t;
      const x = GAME_WIDTH / 2 - (GAME_WIDTH / 2) * t;
      const y = GAME_HEIGHT / 2 - (GAME_HEIGHT / 2) * t;
      const w = GAME_WIDTH * t;
      const h = GAME_HEIGHT * t;

      gfx.fillStyle(0x000000, alpha);
      gfx.fillRect(x, y, w, bandH);
      gfx.fillRect(x, GAME_HEIGHT - y - bandH, w, bandH);
      gfx.fillRect(x, y + bandH, bandW, h - bandH * 2);
      gfx.fillRect(GAME_WIDTH - x - bandW, y + bandH, bandW, h - bandH * 2);
    }
  }

  /** Draw scanlines once — static CRT effect */
  private _bakeScanlines(): void {
    const gfx = this.scanlineGfx;
    gfx.fillStyle(0x000000, 0.10);
    for (let y = 0; y < GAME_HEIGHT; y += 4) {
      gfx.fillRect(0, y, GAME_WIDTH, 1);
    }
  }

  private applyZoomPunch(target: number, durationMs: number): void {
    const cam = this.scene.cameras.main;
    if (this.zoomTween) {
      this.zoomTween.stop();
    }
    cam.setZoom(target);
    this.zoomTween = this.scene.tweens.add({
      targets: cam,
      zoom: 1.0,
      duration: durationMs,
      ease: "Sine.easeOut",
    });
  }
}
