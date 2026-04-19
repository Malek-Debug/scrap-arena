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
      speed: 250,
      range: 600,
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

      // Phases 2+: use PlayerPredictor for adaptive lead shots, fallback to velocity intercept
      let aimAngle = directAngle;
      if (p >= 2) {
        if (this.predictor) {
          const leadMs = p >= 3 ? 600 : 400;
          const pred = this.predictor.predictedPosition(leadMs);
          aimAngle = Math.atan2(pred.y - this.posY, pred.x - this.posX);
        } else {
          const playerBody = (this.playerRef as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body | null;
          const pVx = playerBody?.velocity.x ?? 0;
          const pVy = playerBody?.velocity.y ?? 0;
          aimAngle = SteeringBehaviors.interceptAngle(this.posX, this.posY, this.playerRef.x, this.playerRef.y, pVx, pVy, 250);
        }
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

    // ── Mine drops (phase 4 only) ─────────────────────────
    if (p === 4 && this._scene) {
      this._mineTimer += delta * 1000;
      if (this._mineTimer >= 2200) {
        this._mineTimer = 0;
        this._dropMine(this.posX, this.posY);
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
}

