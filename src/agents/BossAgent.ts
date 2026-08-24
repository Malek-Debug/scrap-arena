import Phaser from "phaser";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { SteeringBehaviors } from "../ai/SteeringBehaviors";
import type { PlayerPredictor } from "../ai/PlayerPredictor";
import { WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from "../core";
import { Juice } from "../rendering";

let _nextBossId = 9000;

/**
 * BossAgent — massive machine boss that appears every 5th wave.
 *
 * Four phases based on HP ratio:
 *   Phase 1 (100-60%): Slow chase + 5-shot spread every 1.5s
 *   Phase 2 (60-30%):  Orbit player + 3 leading shots every 1s
 *   Phase 3 (30-15%):  Tight orbit, rapid fire every 0.4s, screen shake
 *   Phase 4 (<15%):    BERSERK — extreme speed burst, mine drops, rapid fire every 0.25s
 *
 * Does NOT use the utility AI system — direct behavior in tick().
 */
export class BossAgent {
  readonly id: number;
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  sprite: Phaser.Physics.Arcade.Sprite | null = null;

  readonly shootSkill: ShootSkill;

  private readonly playerRef: { x: number; y: number };
  private _scene: Phaser.Scene | null = null;
  private _shootTimer = 0;
  private _shakeTimer = 0;
  private _mineTimer = 0;
  private _missileTimer = 0;
  private _orbitAngle = 0;
  private _prevPhase: 1 | 2 | 3 | 4 = 1;
  private _dimSwitchTimer = 0;

  worldType: "FOUNDRY" | "CIRCUIT" = "FOUNDRY";
  onDimensionSwitch?: (world: "FOUNDRY" | "CIRCUIT") => void;

  /** Injected by MainScene after spawn — enables adaptive lead shots */
  predictor: PlayerPredictor | null = null;

  /** Optional callback fired just before each attack burst — wired to HUD warning by MainScene. */
  onFire?: () => void;

  // Mines stored as scene objects for collision detection
  readonly mines: { x: number; y: number; gfx: Phaser.GameObjects.Arc }[] = [];

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 500,
    speed = 40,
  ) {
    this.id = _nextBossId++;
    this.posX = x;
    this.posY = y;
    this.targetX = x;
    this.targetY = y;
    this.playerRef = playerRef;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this._orbitAngle = Math.random() * Math.PI * 2;

    this.shootSkill = new ShootSkill(this.id, {
      damage: 15,
      speed: 340,
      range: 700,
      tint: 0xff0000,
    }, 400);
  }

  bindScene(scene: Phaser.Scene): void {
    this._scene = scene;
  }

  bindSprite(sprite: Phaser.Physics.Arcade.Sprite): void {
    this.sprite = sprite;
    sprite.setData("agentId", this.id);
    // Entrance: materialize from nothing with a scale punch
    sprite.setScale(0.3).setAlpha(0);
    if (this._scene) {
      this._scene.tweens.add({
        targets: sprite,
        scaleX: 1.5, scaleY: 1.5,
        alpha: 1,
        duration: 700,
        ease: "Back.easeOut",
      });
      // Radial arrival burst at spawn
      this._phaseExplosion(2, 0xff2200, 12, 500);
    }
  }

  getPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  get phase(): 1 | 2 | 3 | 4 {
    const ratio = this.hp / this.maxHp;
    if (ratio > 0.6) return 1;
    if (ratio > 0.3) return 2;
    if (ratio > 0.15) return 3;
    return 4;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  tick(delta: number): void {
    if (this.isDead) return;
    this.shootSkill.tick();

    const dx = this.playerRef.x - this.posX;
    const dy = this.playerRef.y - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const directAngle = Math.atan2(dy, dx);

    const p = this.phase;

    // Phase transition effects
    if (p !== this._prevPhase) {
      this._onPhaseTransition(p);
      this._prevPhase = p;
    }

    // ── Movement ─────────────────────────────────────────
    switch (p) {
      case 1:
        // Slow direct chase
        if (dist > 80) {
          this.targetX = Phaser.Math.Clamp(this.posX + (dx / dist) * this.speed * 2, 20, WORLD_WIDTH - 20);
          this.targetY = Phaser.Math.Clamp(this.posY + (dy / dist) * this.speed * 2, 20, WORLD_HEIGHT - 20);
        }
        break;

      case 2:
      case 3: {
        // Orbital movement around player
        const orbitRadius = p === 2 ? 220 : 160;
        const orbitSpeed = p === 2 ? 0.8 : 1.4;
        this._orbitAngle += orbitSpeed * delta;
        const orbitTarget = SteeringBehaviors.flankTarget(
          this.playerRef.x, this.playerRef.y, this._orbitAngle, orbitRadius,
        );
        this.targetX = orbitTarget.x;
        this.targetY = orbitTarget.y;
        break;
      }

      case 4: {
        // Berserk: rapid direction changes + charge bursts
        const berserkerOrbitSpeed = 2.8;
        this._orbitAngle += berserkerOrbitSpeed * delta;
        // Alternates between orbiting close and charging
        const orbitPct = (Math.sin(this._orbitAngle * 0.5) + 1) * 0.5; // 0–1
        const berserkerRadius = 80 + orbitPct * 200;
        const bt = SteeringBehaviors.flankTarget(
          this.playerRef.x, this.playerRef.y, this._orbitAngle, berserkerRadius,
        );
        this.targetX = bt.x;
        this.targetY = bt.y;
        break;
      }
    }

    // ── Shooting ─────────────────────────────────────────
    const cooldown = p === 4 ? 250 : p === 3 ? 400 : p === 2 ? 1000 : 1500;
    this._shootTimer += delta * 1000;

    if (this._shootTimer >= cooldown && this._scene) {
      this._shootTimer = 0;
      this.onFire?.();

      // Phases 2+: proper ballistic intercept. Uses BULLET SPEED and distance
      // to compute exactly how far to lead, then iterates once to refine the
      // predicted point (2-step fixed-point intercept). This replaces the
      // previous fixed-ms predictor which was either too short or too long
      // depending on how far the player was from the boss.
      let aimAngle = directAngle;
      if (p >= 2) {
        const bulletSpeed = 340; // Matches ShootSkill cfg.speed in the constructor
        const { vx: pVx, vy: pVy } = this._resolvePlayerVelocity();
        aimAngle = this._ballisticAim(this.posX, this.posY, this.playerRef.x, this.playerRef.y, pVx, pVy, bulletSpeed);
      }

      switch (p) {
        case 1:
          // 5-shot spread
          for (let i = -2; i <= 2; i++) {
            this.shootSkill.tryUse(this.posX, this.posY, aimAngle + i * 0.3);
            this.shootSkill.reset();
          }
          break;
        case 2:
          // 3 leading shots
          for (let i = -1; i <= 1; i++) {
            this.shootSkill.tryUse(this.posX, this.posY, aimAngle + i * 0.15);
            this.shootSkill.reset();
          }
          break;
        case 3:
          // Rapid with random jitter
          this.shootSkill.tryUse(this.posX, this.posY, aimAngle + (Math.random() - 0.5) * 0.35);
          this.shootSkill.reset();
          break;
        case 4:
          // Berserk — alternating tight/wide bursts
          if (Math.floor(this._orbitAngle * 10) % 2 === 0) {
            // Wide burst
            for (let i = -1; i <= 1; i++) {
              this.shootSkill.tryUse(this.posX, this.posY, aimAngle + i * 0.5);
              this.shootSkill.reset();
            }
          } else {
            // Rapid single + jitter
            this.shootSkill.tryUse(this.posX, this.posY, aimAngle + (Math.random() - 0.5) * 0.2);
            this.shootSkill.reset();
          }
          break;
      }
    }

    // ── Mine drops (phase 3 + 4) — phase 4 is faster ─────────────────
    if ((p === 3 || p === 4) && this._scene) {
      this._mineTimer += delta * 1000;
      const mineInterval = p === 4 ? 2000 : 3200;
      if (this._mineTimer >= mineInterval) {
        this._mineTimer = 0;
        this._dropMine(this.posX, this.posY);
      }
    }

    // ── Phase 4 homing missile pulse every ~1.6s ──────────────────────
    if (p === 4 && this._scene) {
      this._missileTimer += delta * 1000;
      if (this._missileTimer >= 1600) {
        this._missileTimer = 0;
        this._launchHomingMissile(directAngle);
      }
    }

    // ── Periodic screen shake — via Juice so phase-transition priority survives ─
    if (p >= 3 && this._scene) {
      this._shakeTimer += delta * 1000;
      const shakeInterval = p === 4 ? 1200 : 2000;
      if (this._shakeTimer >= shakeInterval) {
        this._shakeTimer = 0;
        Juice.screenShake(this._scene, p === 4 ? 0.013 : 0.008, 180);
      }
    }

    // ── Boss dimension shift (phase 3+): forces player to switch ──────
    if (p >= 3 && this._scene) {
      this._dimSwitchTimer += delta * 1000;
      const switchInterval = p === 4 ? 5000 : 7000;
      if (this._dimSwitchTimer >= switchInterval) {
        this._dimSwitchTimer = 0;
        this.worldType = this.worldType === "FOUNDRY" ? "CIRCUIT" : "FOUNDRY";
        this.onDimensionSwitch?.(this.worldType);
      }
    }
  }

  updateMovement(deltaMs: number): void {
    if (!this.sprite) return;
    const dx = this.targetX - this.posX;
    const dy = this.targetY - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;

    const p = this.phase;
    let effectiveSpeed: number;
    if (p === 4) effectiveSpeed = this.speed * 4.5;
    else if (p === 3) effectiveSpeed = this.speed * 2.5;
    else if (p === 2) effectiveSpeed = this.speed * 1.6;
    else effectiveSpeed = this.speed;

    const step = effectiveSpeed * (deltaMs / 1000);
    const ratio = Math.min(step / dist, 1);
    this.posX += dx * ratio;
    this.posY += dy * ratio;
    this.sprite.setPosition(this.posX, this.posY);

    // Phase 4: spin the boss sprite
    if (p === 4) {
      this.sprite.rotation += 0.08;
    }
  }

  /** Check if any mine is within radius of player — returns damage dealt */
  checkMineCollision(playerX: number, playerY: number, radius = 28): number {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      const dx = playerX - m.x;
      const dy = playerY - m.y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) {
        m.gfx.destroy();
        this.mines.splice(i, 1);
        return 20;
      }
    }
    return 0;
  }

  /** Clean up all mines on death */
  clearMines(): void {
    for (const m of this.mines) m.gfx.destroy();
    this.mines.length = 0;
  }

  // ── Private helpers ─────────────────────────────────────

  /** Phase 4 — fires a fast leading "missile" (heavy bullet) toward predicted player pos. */
  private _launchHomingMissile(directAngle: number): void {
    if (!this._scene) return;
    // Proper ballistic intercept with the missile's own speed. The old code used
    // predictor.predictedPosition(900) which made the missile over-lead close
    // targets and under-lead distant ones.
    const missileSpeed = 440;
    const { vx: pVx, vy: pVy } = this._resolvePlayerVelocity();
    const aimAngle = this._ballisticAim(this.posX, this.posY, this.playerRef.x, this.playerRef.y, pVx, pVy, missileSpeed, directAngle);
    // Telegraph plume from boss
    const plume = this._scene.add.circle(
      this.posX + Math.cos(aimAngle) * 20,
      this.posY + Math.sin(aimAngle) * 20,
      18, 0xff66aa, 1,
    ).setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
    this._scene.tweens.add({
      targets: plume, scale: 3.5, alpha: 0, duration: 260,
      onComplete: () => plume.destroy(),
    });
    // Heavy slug with bigger tint + bigger range
    ShootSkill.fireImmediate(this.posX, this.posY, aimAngle, {
      damage: 25, range: 900, speed: missileSpeed, tint: 0xff44aa, ownerId: this.id,
    });
    Juice.screenShake(this._scene, 0.007, 140);
  }

  private _dropMine(x: number, y: number): void {
    if (!this._scene) return;

    const gfx = this._scene.add.arc(x, y, 10, 0, 360, false, 0xff0000, 0.9)
      .setDepth(10)
      .setStrokeStyle(2, 0xff6600, 1);

    // Pulse animation
    this._scene.tweens.add({
      targets: gfx,
      scaleX: 1.4, scaleY: 1.4,
      alpha: 0.6,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.mines.push({ x, y, gfx });

    // Auto-expire after 8 seconds
    this._scene.time.delayedCall(8000, () => {
      const idx = this.mines.findIndex(m => m.gfx === gfx);
      if (idx !== -1) {
        gfx.destroy();
        this.mines.splice(idx, 1);
      }
    });
  }

  /**
   * Reusable radial burst: N staggered shockwave rings + outward sparks.
   * All presentation — no gameplay effect.
   */
  private _phaseExplosion(
    rings: number,
    color: number,
    sparks: number,
    baseDuration = 600,
  ): void {
    if (!this._scene) return;
    for (let i = 0; i < rings; i++) {
      const delay = i * 80;
      const startRadius = 12 + i * 8;
      this._scene.time.delayedCall(delay, () => {
        if (!this._scene) return;
        const ring = this._scene.add
          .circle(this.posX, this.posY, startRadius, color, i === 0 ? 0.55 : 0.35)
          .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
        ring.setStrokeStyle(2, color, 0.85);
        this._scene.tweens.add({
          targets: ring,
          scaleX: 7 + i * 1.5, scaleY: 7 + i * 1.5,
          alpha: 0,
          duration: baseDuration + i * 100,
          ease: "Expo.easeOut",
          onComplete: () => ring.destroy(),
        });
      });
    }
    for (let i = 0; i < sparks; i++) {
      const angle = (i / sparks) * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 130);
      const spark = this._scene.add
        .circle(this.posX, this.posY, 2 + Math.random() * 2, color, 1)
        .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
      this._scene.tweens.add({
        targets: spark,
        x: this.posX + Math.cos(angle) * dist,
        y: this.posY + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 600 + Math.random() * 300,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private _onPhaseTransition(newPhase: 1 | 2 | 3 | 4): void {
    if (!this._scene || !this.sprite) return;

    const colors: Record<number, number> = {
      1: 0xff4400,
      2: 0xff0000,
      3: 0xff00ff,
      4: 0xffffff,
    };
    const color = colors[newPhase] ?? 0xffffff;

    // Per-phase escalating config
    const cfg: Record<number, {
      rings: number; sparks: number; shakeAmt: number; shakeDur: number;
      slowScale: number; slowDur: number; labelSize: string; flashDur: number;
    }> = {
      2: { rings: 2, sparks: 10, shakeAmt: 0.020, shakeDur: 350, slowScale: 0.35, slowDur: 500,  labelSize: "22px", flashDur: 0 },
      3: { rings: 3, sparks: 16, shakeAmt: 0.028, shakeDur: 450, slowScale: 0.20, slowDur: 700,  labelSize: "26px", flashDur: 0 },
      4: { rings: 5, sparks: 24, shakeAmt: 0.045, shakeDur: 600, slowScale: 0.08, slowDur: 900,  labelSize: "32px", flashDur: 120 },
    };
    const c = cfg[newPhase];
    if (!c) return; // Phase 1 has no incoming transition

    // ── Sprite flash + scale punch ─────────────────────────────────────────
    this.sprite.setTintFill(color);
    const baseScaleX = this.sprite.scaleX;
    const baseScaleY = this.sprite.scaleY;
    this._scene.tweens.add({
      targets: this.sprite,
      scaleX: baseScaleX * (1 + 0.08 * newPhase),
      scaleY: baseScaleY * (1 + 0.08 * newPhase),
      duration: 90, yoyo: true, ease: "Back.easeOut",
      onComplete: () => { if (this.sprite?.active) this.sprite.clearTint(); },
    });

    // ── Screen flash for phase 4 ──────────────────────────────────────────
    if (c.flashDur > 0) {
      const flash = this._scene.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.38)
        .setScrollFactor(0).setDepth(130);
      this._scene.tweens.add({
        targets: flash, alpha: 0,
        duration: c.flashDur, ease: "Quad.easeOut",
        onComplete: () => flash.destroy(),
      });
    }

    // ── Radial rings + sparks ─────────────────────────────────────────────
    this._phaseExplosion(c.rings, color, c.sparks);

    // ── Shake + slow-mo — route through Juice so priority tracking applies ─
    // Phase transitions are always strong; other calls (per-hit, missiles)
    // won't trample an active phase shake.
    Juice.screenShake(this._scene, c.shakeAmt, c.shakeDur);
    Juice.slowMo(this._scene, c.slowScale, c.slowDur);

    // ── Phase label — escalated styling ──────────────────────────────────
    const labels: Record<number, string> = {
      2: "— PHASE II  ORBITAL —",
      3: "— PHASE III  FRENZY —",
      4: "⚠  BERSERK MODE  ⚠",
    };
    const label = labels[newPhase];
    if (label) {
      const fontFamily = newPhase === 4 ? "monospace" : "monospace";
      const isPhase4 = newPhase === 4;
      const txt = this._scene.add.text(
        GAME_WIDTH / 2, GAME_HEIGHT / 2 - 115,
        label,
        {
          fontFamily,
          fontSize: c.labelSize,
          color: isPhase4 ? "#ff4444" : `#${color.toString(16).padStart(6, "0")}`,
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: isPhase4 ? 6 : 4,
        },
      ).setOrigin(0.5).setScrollFactor(0).setDepth(122).setScale(0.4).setAlpha(0);

      // Scale-in punch, hold, then drift up and fade
      this._scene.tweens.add({
        targets: txt,
        scaleX: isPhase4 ? 1.15 : 1.0,
        scaleY: isPhase4 ? 1.15 : 1.0,
        alpha: 1,
        duration: 180,
        ease: "Back.easeOut",
        onComplete: () => {
          this._scene?.tweens.add({
            targets: txt,
            y: txt.y - 50,
            alpha: 0,
            scaleX: isPhase4 ? 0.9 : 0.85,
            scaleY: isPhase4 ? 0.9 : 0.85,
            duration: isPhase4 ? 1800 : 1400,
            delay: 300,
            ease: "Power2",
            onComplete: () => txt.destroy(),
          });
        },
      });

      // Phase 4: second smaller warning — placed below centre to avoid the collision zone
      if (isPhase4) {
        const sub = this._scene.add.text(
          GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80,
          "ALL SYSTEMS CRITICAL",
          {
            fontFamily: "monospace", fontSize: "14px",
            color: "#ff8844", stroke: "#000000", strokeThickness: 3,
          },
        ).setOrigin(0.5).setScrollFactor(0).setDepth(122).setAlpha(0);
        this._scene.tweens.add({
          targets: sub, alpha: 1, duration: 250, delay: 200,
          onComplete: () => {
            this._scene?.tweens.add({
              targets: sub, alpha: 0, y: sub.y - 30, duration: 1200, delay: 400,
              onComplete: () => sub.destroy(),
            });
          },
        });
      }
    }
  }

  // ── Ballistic intercept helpers ─────────────────────────
  // Pulls the player's velocity from the bound sprite body. Falls back to 0,0
  // for the case where the ref isn't a physics sprite (tests / dev mode).
  private _resolvePlayerVelocity(): { vx: number; vy: number } {
    const body = (this.playerRef as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body | null;
    const vx = body?.velocity.x ?? 0;
    const vy = body?.velocity.y ?? 0;
    return { vx, vy };
  }

  // Two-iteration intercept: first pass leads using distance/speed, second pass
  // re-computes lead time to the already-predicted point. This is a fixed-point
  // iteration that converges fast for the motion speeds in this game and is
  // dramatically more accurate than a constant lookahead.
  private _ballisticAim(
    fromX: number, fromY: number,
    targetX: number, targetY: number,
    targetVx: number, targetVy: number,
    projSpeed: number,
    fallbackAngle?: number,
  ): number {
    if (projSpeed <= 0) return fallbackAngle ?? Math.atan2(targetY - fromY, targetX - fromX);
    // Pass 1
    let dx = targetX - fromX;
    let dy = targetY - fromY;
    let dist = Math.sqrt(dx * dx + dy * dy);
    let t = dist / projSpeed;
    let px = targetX + targetVx * t;
    let py = targetY + targetVy * t;
    // Pass 2 (refine)
    dx = px - fromX;
    dy = py - fromY;
    dist = Math.sqrt(dx * dx + dy * dy);
    t = dist / projSpeed;
    px = targetX + targetVx * t;
    py = targetY + targetVy * t;
    // Clamp inside world bounds so we never aim at a spot behind a wall that
    // the player can't physically reach.
    px = Math.max(0, Math.min(WORLD_WIDTH, px));
    py = Math.max(0, Math.min(WORLD_HEIGHT, py));
    return Math.atan2(py - fromY, px - fromX);
  }
}

