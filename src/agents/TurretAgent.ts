import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

/**
 * TurretAgent — stationary defense turret with rapid fire.
 *
 * Action set:
 *   Track  — always active, tracks player angle
 *   Attack — shoots when player is in range + weapon ready
 *
 * Does NOT move; stays at its spawn position.
 */
export class TurretAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  readonly shootSkill: ShootSkill;

  /** Set true by EMP — turret head goes dark for stun duration. */
  _suppressed = false;

  // ── Charge-shot state (machine-theme) ──────────────────────────────
  private _chargeMs = 0;
  private _chargeTelegraph: Phaser.GameObjects.Graphics | null = null;
  private _chargeGlow: Phaser.GameObjects.Arc | null = null;
  private static readonly CHARGE_INTERVAL_MS = 4200;
  private static readonly CHARGE_TELEGRAPH_MS = 800;

  private playerRef: { x: number; y: number };
  private _scene: Phaser.Scene | null = null;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 120,
    speed = 0,
    damageMultiplier = 1,
  ) {
    super(TurretAgent._buildActions(), 0.08);
    this.agentKind = "turret";
    this.hitRadius = 18; // frame 40px, scale 1.0 → visual radius ~20px; 18px is precise
    this.posX = x;
    this.posY = y;
    this.targetX = x;
    this.targetY = y;
    this.playerRef = playerRef;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.damageMultiplier = damageMultiplier;
    this.shootSkill = new ShootSkill(this.id, {
      damage: Math.max(1, Math.round(6 * this.damageMultiplier)),
      range: 400,
      tint: 0xff6600,
    }, 600);
  }

  bindScene(scene: Phaser.Scene): void {
    this._scene = scene;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  protected populateContext(ctx: ContextSnapshot): void {
    const dx = this.playerRef.x - this.posX;
    const dy = this.playerRef.y - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    ctx.distanceToPlayer = Math.min(dist / 600, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    ctx.danger = Math.max(0, 1 - dist / 400);
    ctx.health = this.hp / this.maxHp;
    ctx.targetVisible = dist < 400;
    ctx.ammo = this.shootSkill.normalizedCooldown;
    ctx.resource = 0;
    ctx.goalProgress = 1 - ctx.distanceToPlayer;

    if (ctx.targetVisible) {
      this.memory.lastKnownPlayerPos = { x: this.playerRef.x, y: this.playerRef.y };
    }
  }

  override tick(delta: number): void {
    this.shootSkill.tick();
    super.tick(delta);

    const current = this.reasoner.current;
    if (!current) return;

    // ── Charge-shot loop (independent of utility AI) ──────────────────
    if (!this._suppressed && this._scene && current.name === "Attack") {
      this._chargeMs += delta * 1000;
      const inWindup = this._chargeMs >= TurretAgent.CHARGE_INTERVAL_MS - TurretAgent.CHARGE_TELEGRAPH_MS;

      if (inWindup && !this._chargeTelegraph) {
        // Spawn charge telegraph: thick glow beam + charge glow at origin
        const angle = Math.atan2(this.playerRef.y - this.posY, this.playerRef.x - this.posX);
        const len = 650;
        const ex = this.posX + Math.cos(angle) * len;
        const ey = this.posY + Math.sin(angle) * len;

        this._chargeTelegraph = this._scene.add.graphics()
          .setDepth(45).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        // Outer glow beam (wide, soft)
        this._chargeTelegraph.lineStyle(9, 0xff4400, 0.35);
        this._chargeTelegraph.moveTo(this.posX, this.posY);
        this._chargeTelegraph.lineTo(ex, ey);
        this._chargeTelegraph.strokePath();
        // Core laser line (bright, crisp)
        this._chargeTelegraph.lineStyle(3, 0xff1100, 1.0);
        this._chargeTelegraph.moveTo(this.posX, this.posY);
        this._chargeTelegraph.lineTo(ex, ey);
        this._chargeTelegraph.strokePath();

        this._scene.tweens.add({
          targets: this._chargeTelegraph,
          alpha: 1,
          duration: TurretAgent.CHARGE_TELEGRAPH_MS,
          ease: "Quad.easeIn",
        });

        // Pulsing glow ball at turret barrel
        this._chargeGlow = this._scene.add.circle(
          this.posX + Math.cos(angle) * 14,
          this.posY + Math.sin(angle) * 14,
          6, 0xff6600, 0.7,
        ).setDepth(50).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this._scene.tweens.add({
          targets: this._chargeGlow,
          alpha: 1, scaleX: 2.8, scaleY: 2.8,
          duration: TurretAgent.CHARGE_TELEGRAPH_MS,
          ease: "Quad.easeIn",
        });
      }

      // Redraw the telegraph each tick so it tracks the moving player
      if (inWindup && this._chargeTelegraph) {
        const angle = Math.atan2(this.playerRef.y - this.posY, this.playerRef.x - this.posX);
        const len = 650;
        const ex = this.posX + Math.cos(angle) * len;
        const ey = this.posY + Math.sin(angle) * len;
        const chargeProgress = (this._chargeMs - (TurretAgent.CHARGE_INTERVAL_MS - TurretAgent.CHARGE_TELEGRAPH_MS)) / TurretAgent.CHARGE_TELEGRAPH_MS;
        this._chargeTelegraph.clear();
        this._chargeTelegraph.lineStyle(9 + chargeProgress * 5, 0xff4400, 0.35);
        this._chargeTelegraph.moveTo(this.posX, this.posY);
        this._chargeTelegraph.lineTo(ex, ey);
        this._chargeTelegraph.strokePath();
        this._chargeTelegraph.lineStyle(3 + chargeProgress * 2, 0xff1100, 1.0);
        this._chargeTelegraph.moveTo(this.posX, this.posY);
        this._chargeTelegraph.lineTo(ex, ey);
        this._chargeTelegraph.strokePath();
        if (this._chargeGlow) {
          this._chargeGlow.setPosition(
            this.posX + Math.cos(angle) * 14,
            this.posY + Math.sin(angle) * 14,
          );
        }
      }

      if (this._chargeMs >= TurretAgent.CHARGE_INTERVAL_MS) {
        this._chargeMs = 0;
        const angle = Math.atan2(this.playerRef.y - this.posY, this.playerRef.x - this.posX);
        if (this._chargeTelegraph) { this._chargeTelegraph.destroy(); this._chargeTelegraph = null; }
        if (this._chargeGlow) { this._chargeGlow.destroy(); this._chargeGlow = null; }
        // Heavy slug — bypass cooldown via fireImmediate
        ShootSkill.fireImmediate(this.posX, this.posY, angle, {
          damage: Math.max(1, Math.round(22 * this.damageMultiplier)),
          range: 700,
          speed: 520,
          tint: 0xff3300,
          ownerId: this.id,
        });
        // Visual: bright muzzle burst
        const burst = this._scene.add.circle(
          this.posX + Math.cos(angle) * 18,
          this.posY + Math.sin(angle) * 18,
          14, 0xffaa44, 1,
        ).setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
        this._scene.tweens.add({
          targets: burst, scale: 3, alpha: 0, duration: 220,
          onComplete: () => burst.destroy(),
        });
        this._scene.cameras.main.shake(100, 0.005);
      }
    } else if (this._chargeTelegraph) {
      this._chargeTelegraph.destroy();
      this._chargeTelegraph = null;
      if (this._chargeGlow) { this._chargeGlow.destroy(); this._chargeGlow = null; }
      this._chargeMs = Math.min(this._chargeMs, TurretAgent.CHARGE_INTERVAL_MS - TurretAgent.CHARGE_TELEGRAPH_MS - 200);
    }

    if (this._suppressed) return;

    switch (current.name) {
      case "Track": {
        // Track player position for aiming — turret does not move
        const pos = this.memory.lastKnownPlayerPos;
        if (pos) this.setTarget(pos.x, pos.y);
        break;
      }
      case "Attack": {
        const pos = this.memory.lastKnownPlayerPos;
        if (pos) this.setTarget(pos.x, pos.y);

        if (this.shootSkill.canUse && this._scene) {
          const angle = Math.atan2(
            this.playerRef.y - this.posY,
            this.playerRef.x - this.posX,
          );
          // Brief muzzle glow telegraph (visual only, no delay)
          const glowX = this.posX + Math.cos(angle) * 18;
          const glowY = this.posY + Math.sin(angle) * 18;
          const muzzleGlow = this._scene.add.circle(glowX, glowY, 5, 0xff6600, 0.7)
            .setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
          this._scene.tweens.add({
            targets: muzzleGlow, scale: 2, alpha: 0, duration: 120,
            onComplete: () => muzzleGlow.destroy(),
          });
          this.shootSkill.tryUse(this.posX, this.posY, angle);
        }
        break;
      }
    }
  }

  /** No-op — turret is stationary */
  updateMovement(_deltaMs: number): void {}

  setTarget(x: number, y: number): void {
    this.targetX = Phaser.Math.Clamp(x, 20, WORLD_WIDTH - 20);
    this.targetY = Phaser.Math.Clamp(y, 20, WORLD_HEIGHT - 20);
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.data?.set("hp", this.hp);
    this.memory.store("last_damage", amount, { x: this.posX, y: this.posY }, 4000);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  private static _buildActions(): Action[] {
    const track = new Action(
      "Track",
      [
        new Consideration("always_on", CurveType.Linear, 1, () => 0.8),
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 0.9 : 0.5),
      ],
      () => {},
      1.0, 0.2,
    );

    const attack = new Action(
      "Attack",
      [
        new Consideration("in_range", CurveType.Exponential, 3, (c) => 1 - c.distanceToPlayer),
        new Consideration("weapon_ready", CurveType.Linear, 1, (c) => c.ammo),
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0),
      ],
      () => {},
      1.4, 0.1,
    );

    return [track, attack];
  }
}
