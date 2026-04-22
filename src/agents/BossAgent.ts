import Phaser from "phaser";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { SteeringBehaviors } from "../ai/SteeringBehaviors";
import type { PlayerPredictor } from "../ai/PlayerPredictor";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

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

  /** Injected by MainScene after spawn — enables adaptive lead shots */
  predictor: PlayerPredictor | null = null;

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

    // ── Periodic screen shake ─────────────────────────────
    if (p >= 3 && this._scene) {
      this._shakeTimer += delta * 1000;
      const shakeInterval = p === 4 ? 1200 : 2000;
      if (this._shakeTimer >= shakeInterval) {
        this._shakeTimer = 0;
        this._scene.cameras.main.shake(180, p === 4 ? 0.013 : 0.008);
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
    this._scene.cameras.main.shake(140, 0.007);
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

  private _onPhaseTransition(newPhase: 1 | 2 | 3 | 4): void {
    if (!this._scene || !this.sprite) return;

    // Flash and scale burst on phase transition
    const colors: Record<number, number> = { 1: 0xff4400, 2: 0xff0000, 3: 0xff00ff, 4: 0xffffff };
    this.sprite.setTint(colors[newPhase] ?? 0xffffff);

    this._scene.time.delayedCall(300, () => {
      this.sprite?.clearTint();
    });

    // Shockwave ring
    const ring = this._scene.add.circle(this.posX, this.posY, 20, colors[newPhase] ?? 0xff0000, 0.7)
      .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
    this._scene.tweens.add({
      targets: ring, scaleX: 8, scaleY: 8, alpha: 0, duration: 600,
      onComplete: () => ring.destroy(),
    });

    // Phase label
    const labels: Record<number, string> = {
      2: "PHASE II — ORBITAL",
      3: "PHASE III — FRENZY",
      4: "⚠ BERSERK MODE ⚠",
    };
    if (labels[newPhase]) {
      const txt = this._scene.add.text(this.posX, this.posY - 60, labels[newPhase], {
        fontFamily: "monospace", fontSize: "18px",
        color: newPhase === 4 ? "#ffffff" : "#ff4400",
        stroke: "#000", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(120);
      this._scene.tweens.add({
        targets: txt, y: txt.y - 60, alpha: 0, duration: 1400,
        onComplete: () => txt.destroy(),
      });
    }

    this._scene.cameras.main.shake(300, 0.018);
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

