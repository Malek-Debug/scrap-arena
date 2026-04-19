import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";

const enum GlitchType {
  ColorInversion,
  ScreenTear,
  DimensionShift,
  ArenaTwist,
  TimeFracture,
  VoidPulse,
  StaticNoise,
}

const GLITCH_COUNT = 7;

export class GlitchEvents {
  private scene: Phaser.Scene;
  private timer = 0;
  private nextGlitchIn: number;
  private isRotating = false;
  private isDimensionShifting = false;
  private pendingCleanups: Phaser.Time.TimerEvent[] = [];
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.nextGlitchIn = Phaser.Math.Between(4000, 8000);
  }

  // ── Public API ──────────────────────────────────────────────

  update(deltaMs: number, intensity: number): void {
    if (this.destroyed) return;

    this.timer += deltaMs;

    const interval =
      intensity > 0.8
        ? Phaser.Math.Between(2000, 4000)
        : intensity > 0.5
          ? Phaser.Math.Between(3000, 6000)
          : intensity > 0.2
            ? Phaser.Math.Between(5000, 9000)
            : this.nextGlitchIn;

    if (this.timer >= interval) {
      this.timer = 0;
      this.nextGlitchIn = Phaser.Math.Between(4000, 8000);
      this.triggerRandom();

      if (intensity > 0.6 && Math.random() < 0.5) {
        this.safeDelay(Phaser.Math.Between(200, 600), () => this.triggerRandom());
      }
    }
  }

  triggerRandom(): void {
    if (this.destroyed) return;
    const type = Phaser.Math.Between(0, GLITCH_COUNT - 1) as GlitchType;
    this.executeGlitch(type);
  }

  triggerOnKillStreak(killCount: number): void {
    if (this.destroyed) return;

    if (killCount >= 6) {
      this.colorInversionFlash();
      this.screenTear();
      this.dimensionShift();
      this.arenaTwist();
      this.timeFracture();
      this.voidPulse();
      this.staticNoiseBurst();
    } else if (killCount >= 4) {
      this.timeFracture();
      this.colorInversionFlash();
    } else if (killCount >= 2) {
      this.screenTear();
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const event of this.pendingCleanups) {
      event.remove(false);
    }
    this.pendingCleanups.length = 0;
  }

  // ── Internal ────────────────────────────────────────────────

  private executeGlitch(type: GlitchType): void {
    switch (type) {
      case GlitchType.ColorInversion:
        this.colorInversionFlash();
        break;
      case GlitchType.ScreenTear:
        this.screenTear();
        break;
      case GlitchType.DimensionShift:
        this.dimensionShift();
        break;
      case GlitchType.ArenaTwist:
        this.arenaTwist();
        break;
      case GlitchType.TimeFracture:
        this.timeFracture();
        break;
      case GlitchType.VoidPulse:
        this.voidPulse();
        break;
      case GlitchType.StaticNoise:
        this.staticNoiseBurst();
        break;
    }
  }

  // ── 1. Color Inversion Flash ────────────────────────────────

  private colorInversionFlash(): void {
    const cam = this.scene.cameras.main;

    // Try WebGL post-FX pipeline first
    if (cam.postFX) {
      try {
        const fx = cam.postFX.addColorMatrix();
        fx.negative();
        this.safeDelay(150, () =>
          cam.postFX.remove(fx as unknown as Phaser.FX.Controller),
        );
        return;
      } catch {
        // Fall through to canvas fallback
      }
    }

    // Fallback: white ADD-blended rectangle flash
    const flash = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.5)
      .setScrollFactor(0)
      .setDepth(9999)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.safeDelay(150, () => flash.destroy());
  }

  // ── 2. Screen Tear ──────────────────────────────────────────

  private screenTear(): void {
    const stripCount = Phaser.Math.Between(3, 6);
    const strips: Phaser.GameObjects.Rectangle[] = [];
    const colors = [0x3300ff, 0x00ff66, 0xff0066];

    for (let i = 0; i < stripCount; i++) {
      const h = Phaser.Math.Between(6, 30);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const offsetX = Phaser.Math.Between(-25, 25);
      const alpha = Phaser.Math.FloatBetween(0.5, 0.8);

      const strip = this.scene.add
        .rectangle(GAME_WIDTH / 2 + offsetX, y, GAME_WIDTH, h, colors[i % 2], alpha)
        .setScrollFactor(0)
        .setDepth(9998);

      strips.push(strip);
    }

    const duration = Phaser.Math.Between(100, 200);
    this.safeDelay(duration, () => {
      for (const s of strips) s.destroy();
    });
  }

  // ── 3. Dimension Shift ──────────────────────────────────────

  private dimensionShift(): void {
    if (this.isDimensionShifting) return;
    this.isDimensionShifting = true;

    const overlay = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x6b0080, 0)
      .setScrollFactor(0)
      .setDepth(9997);

    const duration = Phaser.Math.Between(2000, 3000);

    // Fade in
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0.25,
      duration: 400,
      ease: "Quad.easeIn",
    });

    // Fade out and destroy
    this.safeDelay(duration, () => {
      this.scene.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: 400,
        ease: "Quad.easeOut",
        onComplete: () => {
          overlay.destroy();
          this.isDimensionShifting = false;
        },
      });
    });
  }

  // ── 4. Arena Twist ──────────────────────────────────────────

  private arenaTwist(): void {
    if (this.isRotating) return;
    this.isRotating = true;

    const cam = this.scene.cameras.main;
    const angle = Phaser.Math.FloatBetween(5, 10) * (Math.random() < 0.5 ? -1 : 1);
    const radians = Phaser.Math.DegToRad(angle);

    // Rotate to target
    this.scene.tweens.add({
      targets: cam,
      rotation: radians,
      duration: 300,
      ease: "Quad.easeOut",
      onComplete: () => {
        // Rotate back with elastic ease
        this.scene.tweens.add({
          targets: cam,
          rotation: 0,
          duration: 500,
          ease: "Back.easeOut",
          onComplete: () => {
            cam.setRotation(0);
            this.isRotating = false;
          },
        });
      },
    });
  }

  // ── 5. Time Fracture ────────────────────────────────────────

  private timeFracture(): void {
    const scene = this.scene;

    // Cyan ring visual
    const gfx = scene.add.graphics().setScrollFactor(0).setDepth(9999);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    scene.tweens.addCounter({
      from: 0,
      to: 800,
      duration: 600,
      ease: "Quad.easeOut",
      onUpdate: (tween) => {
        const r = tween.getValue() as number;
        const alpha = Phaser.Math.Linear(0.6, 0, r / 800);
        gfx.clear();
        gfx.lineStyle(3, 0x00ffff, alpha);
        gfx.strokeCircle(cx, cy, r);
      },
      onComplete: () => gfx.destroy(),
    });

    // Slow-mo phase
    scene.time.timeScale = 0.3;
    if (scene.physics?.world) {
      scene.physics.world.timeScale = 1 / 0.3;
    }

    this.safeDelay(200, () => {
      // Speed-up phase
      scene.time.timeScale = 1.5;
      if (scene.physics?.world) {
        scene.physics.world.timeScale = 1 / 1.5;
      }

      this.safeDelay(100, () => {
        // Restore normal
        scene.time.timeScale = 1;
        if (scene.physics?.world) {
          scene.physics.world.timeScale = 1;
        }
      });
    });
  }

  // ── 6. Void Pulse ───────────────────────────────────────────

  private voidPulse(): void {
    const gfx = this.scene.add.graphics().setScrollFactor(0).setDepth(9996);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.scene.tweens.addCounter({
      from: 0,
      to: 800,
      duration: 600,
      ease: "Quad.easeOut",
      onUpdate: (tween) => {
        const r = tween.getValue() as number;
        const alpha = Phaser.Math.Linear(0.5, 0, r / 800);
        gfx.clear();
        gfx.lineStyle(60, 0x220044, alpha);
        gfx.strokeCircle(cx, cy, r);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  // ── 7. Static Noise Burst ───────────────────────────────────

  private staticNoiseBurst(): void {
    const count = Phaser.Math.Between(50, 80);
    const particles: Phaser.GameObjects.Rectangle[] = [];
    const glitchColors = [0x00ff88, 0xaa44ff, 0x00ccff, 0xff0066, 0xffffff];

    for (let i = 0; i < count; i++) {
      const w = Phaser.Math.Between(3, 12);
      const h = Phaser.Math.Between(2, 10);
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const color = Math.random() < 0.4
        ? glitchColors[Math.floor(Math.random() * glitchColors.length)]
        : Phaser.Display.Color.GetColor(
            Phaser.Math.Between(40, 220),
            Phaser.Math.Between(40, 220),
            Phaser.Math.Between(40, 220),
          );
      const alpha = Phaser.Math.FloatBetween(0.4, 0.8);

      const rect = this.scene.add
        .rectangle(x, y, w, h, color, alpha)
        .setScrollFactor(0)
        .setDepth(9999);

      particles.push(rect);
    }

    this.safeDelay(80, () => {
      for (const p of particles) p.destroy();
    });
  }

  // ── Helpers ─────────────────────────────────────────────────

  private safeDelay(ms: number, callback: () => void): void {
    if (this.destroyed) return;
    const event = this.scene.time.delayedCall(ms, () => {
      const idx = this.pendingCleanups.indexOf(event);
      if (idx !== -1) this.pendingCleanups.splice(idx, 1);
      if (!this.destroyed) callback();
    });
    this.pendingCleanups.push(event);
  }
}
