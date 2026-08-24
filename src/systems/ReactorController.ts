import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import type { GameContext } from "./GameContext";
import { AudioManager } from "../audio";
import { Juice } from "../rendering";
import { ParticleVFX } from "../rendering/ParticleVFX";
import { UI_FONT } from "../rendering/UITheme";
import type { HUDManager } from "./HUDManager";
import type { StoryController } from "./StoryController";

export interface ReactorControllerDeps {
  hudManager: HUDManager;
  storyController: StoryController;
  onDestroyed: () => void;
  onDeathCause: (cause: "reactor") => void;
  onReactorThreshold?: (threshold: number) => void;
}

export class ReactorController {
  private ctx: GameContext;
  private deps: ReactorControllerDeps;

  private _hp: number;
  private _maxHp: number;
  private _dmgCooldown = 0;
  private _attackBannerCooldown = 0;
  private _warn50Shown = false;
  private _warn25Shown = false;
  private _repairFxCooldown = 0;
  private _critVignette: Phaser.GameObjects.Rectangle | null = null;
  private _destroyed = false;

  constructor(ctx: GameContext, maxHp: number, deps: ReactorControllerDeps) {
    this.ctx = ctx;
    this.deps = deps;
    this._maxHp = maxHp;
    this._hp = maxHp;
  }

  get hp(): number { return this._hp; }
  get maxHp(): number { return this._maxHp; }

  repair(amount: number): number {
    const prev = this._hp;
    this._hp = Math.min(this._maxHp, this._hp + amount);
    const healed = this._hp - prev;
    if (healed > 0) {
      this._repairFxCooldown = Math.max(this._repairFxCooldown, 600);
    }
    if (this._warn25Shown && this._hp > this._maxHp * 0.25) this._warn25Shown = false;
    if (this._warn50Shown && this._hp > this._maxHp * 0.5) this._warn50Shown = false;
    // Update audio emotional state so heartbeat calms when HP rises above thresholds
    if (healed > 0) AudioManager.instance.setReactorState(this._hp / this._maxHp);
    if (healed > 0 && this._hp >= this._maxHp * 0.65) {
      this.deps.hudManager.showReactorStateFlash('repaired');
    }
    return healed;
  }

  reset(): void {
    this._hp = this._maxHp;
    this._dmgCooldown = 0;
    this._attackBannerCooldown = 0;
    this._warn50Shown = false;
    this._warn25Shown = false;
    this._repairFxCooldown = 0;
    this._destroyed = false;
    this._critVignette?.destroy();
    this._critVignette = null;
    // Reset reactor audio to stable — stops heartbeat, restores ambient
    AudioManager.instance.setReactorState(1.0);
  }

  update(deltaMs: number): void {
    const ctx = this.ctx;
    if (ctx.gameOver || this._destroyed) return;
    const reactDefPos = ctx.mapObstacles?.reactorMachinePos;
    if (!reactDefPos) return;

    // ── Repair feedback (debounced so rapid heals fire once) ────────────────
    if (this._repairFxCooldown > 0) {
      this._repairFxCooldown -= deltaMs;
      if (this._repairFxCooldown <= 0) {
        this._repairFxCooldown = 0;
        AudioManager.instance.reactorRepair();
        this.deps.hudManager.showRepairFeedback();
        this._spawnRepairParticles(reactDefPos.x, reactDefPos.y);
      }
    }

    this._dmgCooldown = Math.max(0, this._dmgCooldown - deltaMs);
    if (this._dmgCooldown <= 0) {
      const DAMAGE_R2 = 58 * 58;
      let anyInRange = false;
      for (const agent of ctx.allAgents) {
        if (agent.isDead) continue;
        const dx = agent.posX - reactDefPos.x;
        const dy = agent.posY - reactDefPos.y;
        if (dx * dx + dy * dy < DAMAGE_R2) { anyInRange = true; break; }
      }
      if (anyInRange) {
        const prevHp = this._hp;
        this._hp = Math.max(0, this._hp - 15);
        this._dmgCooldown = 500;

        const hpRatio = this._hp / this._maxHp;
        // Drive the reactor emotional audio state machine
        AudioManager.instance.setReactorState(hpRatio);

        // Scale shake with remaining HP — more desperate as health drops
        const shakeAmt = hpRatio < 0.25 ? 0.016 : hpRatio < 0.5 ? 0.011 : 0.007;
        const shakeDur = hpRatio < 0.25 ? 200 : hpRatio < 0.5 ? 160 : 140;
        this.deps.hudManager.flashReactorBar();
        AudioManager.instance.reactorAlarm();
        Juice.screenShake(ctx.scene, shakeAmt, shakeDur);
        this._spawnDamageParticles(reactDefPos.x, reactDefPos.y, hpRatio);

        this._attackBannerCooldown -= deltaMs;
        if (this._attackBannerCooldown <= 0) {
          this._attackBannerCooldown = hpRatio < 0.25 ? 2500 : 4000;
          const bannerColor = hpRatio < 0.25 ? "#ff2200" : hpRatio < 0.5 ? "#ff6600" : "#ff8800";
          const bannerMsg = hpRatio < 0.25 ? "! REACTOR CRITICAL - DEFEND!" : "! REACTOR UNDER ATTACK";
          const banner = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 68, bannerMsg, {
            fontFamily: UI_FONT, fontSize: "16px", color: bannerColor, fontStyle: "bold",
            stroke: "#000000", strokeThickness: 3,
            shadow: { offsetX: 0, offsetY: 0, color: bannerColor, blur: 10, fill: true },
          }).setOrigin(0.5, 1).setDepth(105).setScrollFactor(0).setAlpha(0).setScale(0.7);
          ctx.scene.tweens.add({
            targets: banner, alpha: 1, scaleX: 1, scaleY: 1,
            duration: 140, ease: "Back.easeOut",
            onComplete: () => {
              ctx.scene.tweens.add({
                targets: banner, alpha: 0, duration: 350, delay: 1400,
                onComplete: () => banner.destroy(),
              });
            },
          });
        }

        // Threshold warnings — one-time shocks fired on the exact frame HP crosses
        if (!this._warn50Shown && prevHp > this._maxHp * 0.5 && this._hp <= this._maxHp * 0.5) {
          this._warn50Shown = true;
          this._playThresholdShock(0.5, reactDefPos.x, reactDefPos.y);
          this.deps.storyController.showStoryHint("WARNING: REACTOR AT 50% - ELIMINATE ATTACKERS!", 4500, "high");
        }
        if (!this._warn25Shown && prevHp > this._maxHp * 0.25 && this._hp <= this._maxHp * 0.25) {
          this._warn25Shown = true;
          this._playThresholdShock(0.25, reactDefPos.x, reactDefPos.y);
          this.deps.storyController.showStoryHint("CRITICAL: REACTOR AT 25%! STATION WILL BE LOST!", 5500, "high");
        }

        if (this._hp <= 0) {
          this._playDestructionSequence(reactDefPos.x, reactDefPos.y);
        }
      }
    }

    // ── Critical red vignette (persists while HP < 25%) ─────────────────────
    const hpRatio = this._hp / this._maxHp;
    if (hpRatio < 0.25 && !ctx.gameOver) {
      if (!this._critVignette) {
        this._critVignette = ctx.scene.add
          .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0)
          .setScrollFactor(0).setDepth(149);
      }
      const pulse = Math.sin(performance.now() * 0.003) * 0.5 + 0.5;
      this._critVignette.setAlpha(0.06 + pulse * 0.08);
    } else if (this._critVignette) {
      this._critVignette.destroy();
      this._critVignette = null;
    }

    // ── Reactor world-space damage overlay ──────────────────────────────────
    const overlay = ctx.mapObstacles.reactorDamageOverlay;
    if (overlay) {
      overlay.clear();
      if (hpRatio < 1) {
        const dmgRatio = 1 - hpRatio;
        overlay.fillStyle(0xff2200, dmgRatio * 0.55);
        overlay.fillCircle(reactDefPos.x, reactDefPos.y, 60);
        if (hpRatio < 0.5) {
          const pulse = Math.sin(performance.now() * 0.006) * 0.5 + 0.5;
          const strokeW = hpRatio < 0.25 ? 4 : 3;
          overlay.lineStyle(strokeW, hpRatio < 0.25 ? 0xff0000 : 0xff4400, 0.4 + pulse * 0.5);
          overlay.strokeCircle(reactDefPos.x, reactDefPos.y, 65 + pulse * 8);
          if (hpRatio < 0.25) {
            overlay.lineStyle(2, 0xff6600, 0.25 + pulse * 0.25);
            overlay.strokeCircle(reactDefPos.x, reactDefPos.y, 80 + pulse * 14);
          }
        }
      }
    }
  }

  // ── Private presentation helpers ────────────────────────────────────────────

  /** Sparks flying off the reactor on each hit — scale and count by severity. */
  private _spawnDamageParticles(rx: number, ry: number, hpRatio: number): void {
    const color = hpRatio < 0.25 ? 0xff0000 : hpRatio < 0.5 ? 0xff4400 : 0xff8800;
    const scale = hpRatio < 0.25 ? 1.4 : hpRatio < 0.5 ? 1.1 : 0.85;
    ParticleVFX.reactorCorruption(this.ctx.scene, rx, ry);
    ParticleVFX.explosion(this.ctx.scene, rx, ry, color, scale);
  }

  /** Green sparkle particles + expanding ring on successful repair. */
  private _spawnRepairParticles(rx: number, ry: number): void {
    const scene = this.ctx.scene;
    ParticleVFX.healBurst(scene, rx, ry);
    // Expanding ring — cheap circle kept for distinct ring shape on repair
    const ring = scene.add.circle(rx, ry, 18, 0x44ff88, 0.5)
      .setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: ring, scaleX: 3.5, scaleY: 3.5, alpha: 0,
      duration: 400, ease: "Expo.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  /** One-time shock at 50%/25% HP threshold crossings. */
  private _playThresholdShock(threshold: number, rx: number, ry: number): void {
    const scene = this.ctx.scene;
    const is25 = threshold <= 0.25;
    const color = is25 ? 0xff0000 : 0xff6600;

    AudioManager.instance.reactorCritical();
    this.deps.onReactorThreshold?.(threshold);
    const stateLabel = is25 ? 'critical' : 'damaged';
    this.deps.hudManager.showReactorStateFlash(stateLabel);
    Juice.screenShake(scene, is25 ? 0.030 : 0.018, is25 ? 500 : 350);
    Juice.slowMo(scene, is25 ? 0.25 : 0.45, is25 ? 600 : 400);
    this.deps.hudManager.flashReactorCritical();

    // Staggered rings from world-space reactor position
    const rings = is25 ? 3 : 2;
    for (let i = 0; i < rings; i++) {
      scene.time.delayedCall(i * 90, () => {
        const ring = scene.add.circle(rx, ry, 10 + i * 6, color, 0.6 - i * 0.1)
          .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
        ring.setStrokeStyle(2, color, 0.9);
        scene.tweens.add({
          targets: ring, scaleX: 6 + i, scaleY: 6 + i, alpha: 0,
          duration: 550 + i * 100, ease: "Expo.easeOut",
          onComplete: () => ring.destroy(),
        });
      });
    }

    // Screen-space flash — reduced to leave budget for simultaneous boss/streak flashes
    const flash = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, is25 ? 0.24 : 0.14)
      .setScrollFactor(0).setDepth(148);
    scene.tweens.add({
      targets: flash, alpha: 0,
      duration: is25 ? 350 : 220, ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });

    // Threshold text label — y = GAME_HEIGHT/2 - 60 (below boss-phase slot at -115, above centre)
    const warningLabel = scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60,
      is25 ? "! REACTOR CRITICAL !" : "-- REACTOR 50% --",
      {
        fontFamily: "monospace",
        fontSize: is25 ? "28px" : "22px",
        color: is25 ? "#ff2200" : "#ff8800",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: is25 ? 6 : 4,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(122).setScale(0.5).setAlpha(0);
    scene.tweens.add({
      targets: warningLabel, scaleX: 1, scaleY: 1, alpha: 1,
      duration: 200, ease: "Back.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: warningLabel, alpha: 0, y: warningLabel.y - 40,
          duration: is25 ? 1600 : 1200, delay: 400, ease: "Power2",
          onComplete: () => warningLabel.destroy(),
        });
      },
    });
  }

  /** 4-wave explosion sequence before triggering game-over. Fires once. */
  private _playDestructionSequence(rx: number, ry: number): void {
    if (this._destroyed) return;
    this._destroyed = true;
    // Clear the pulsing crit vignette so the destruction flash renders cleanly
    this._critVignette?.destroy();
    this._critVignette = null;
    const scene = this.ctx.scene;

    AudioManager.instance.reactorCritical();
    Juice.screenShake(scene, 0.055, 800);
    Juice.slowMo(scene, 0.05, 1200);

    const waveColors = [0xffffff, 0xff4400, 0xff0000, 0xff00aa];
    for (let w = 0; w < 4; w++) {
      scene.time.delayedCall(w * 120, () => {
        AudioManager.instance.reactorAlarm();
        const col = waveColors[w];
        const ring = scene.add.circle(rx, ry, 12 + w * 8, col, 0.7 - w * 0.1)
          .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
        ring.setStrokeStyle(3, col, 0.9);
        scene.tweens.add({
          targets: ring, scaleX: 8 + w * 2, scaleY: 8 + w * 2, alpha: 0,
          duration: 600 + w * 120, ease: "Expo.easeOut",
          onComplete: () => ring.destroy(),
        });
        const sparkCount = 8 + w * 4;
        for (let i = 0; i < sparkCount; i++) {
          const angle = (i / sparkCount) * Math.PI * 2 + w * 0.5;
          const dist = Phaser.Math.Between(30 + w * 15, 80 + w * 20);
          const spark = scene.add.circle(rx, ry, 2 + w * 0.5, col, 1)
            .setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
          scene.tweens.add({
            targets: spark,
            x: rx + Math.cos(angle) * dist, y: ry + Math.sin(angle) * dist,
            alpha: 0, scaleX: 0.2, scaleY: 0.2,
            duration: 600 + Math.random() * 300, ease: "Quad.easeOut",
            onComplete: () => spark.destroy(),
          });
        }
      });
    }

    // Full-screen red flash
    const flash = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.55)
      .setScrollFactor(0).setDepth(148);
    scene.tweens.add({
      targets: flash, alpha: 0,
      duration: 700, ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });

    // Trigger game-over after the sequence peaks
    scene.time.delayedCall(480, () => {
      this.deps.onDeathCause("reactor");
      this.deps.onDestroyed();
    });
  }
}
