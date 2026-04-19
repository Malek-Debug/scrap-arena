import Phaser from "phaser";
import { WorldType } from "../core";
import type { RoomPhysicsZone } from "../core";
import type { GameContext } from "./GameContext";
import type { CombatSystem } from "./CombatSystem";
import type { InputState } from "../input";
import { ShootSkill } from "../ai/skills/ShootSkill";
import type { DashSkill } from "../ai/skills/DashSkill";
import type { WeaponVisual } from "../rendering";
import type { GameJuice } from "../rendering";
import { Juice } from "../rendering";
import { AudioManager } from "../audio";

const MAX_HEAT          = 100;
const HEAT_PER_SHOT     = 11;
const HEAT_COOLDOWN_RATE = 25;
const OVERHEAT_DURATION  = 2400;

/**
 * PlayerController — manages player movement, heat, shooting, dashing,
 * and kill-streak tracking.
 */
export class PlayerController {
  private ctx: GameContext;
  private playerGlow: Phaser.GameObjects.Arc;
  private shootSkill: ShootSkill;
  private dashSkill: DashSkill;
  private weaponVisual: WeaponVisual;
  private gameJuice: GameJuice;
  private combatSystem: CombatSystem;
  private onTryTriggerWave?: () => void;
  private onShowPhysicsZoneBanner?: (label: string) => void;

  // Charge state
  private _chargeTimer = 0;
  private _prevAction1 = false;
  private _chargeGfx: Phaser.GameObjects.Arc | null = null;

  // Kill streak
  private _killStreak = 0;
  private _streakAura: Phaser.GameObjects.Arc | null = null;

  // Room physics tracking
  private _playerGravityVY = 0;
  private _lastRoomZone: RoomPhysicsZone | null = null;

  constructor(
    ctx: GameContext,
    playerGlow: Phaser.GameObjects.Arc,
    shootSkill: ShootSkill,
    dashSkill: DashSkill,
    weaponVisual: WeaponVisual,
    gameJuice: GameJuice,
    combatSystem: CombatSystem,
    onTryTriggerWave?: () => void,
    onShowPhysicsZoneBanner?: (label: string) => void,
  ) {
    this.ctx = ctx;
    this.playerGlow = playerGlow;
    this.shootSkill = shootSkill;
    this.dashSkill = dashSkill;
    this.weaponVisual = weaponVisual;
    this.gameJuice = gameJuice;
    this.combatSystem = combatSystem;
    this.onTryTriggerWave = onTryTriggerWave;
    this.onShowPhysicsZoneBanner = onShowPhysicsZoneBanner;
  }

  get killStreak(): number {
    return this._killStreak;
  }

  /** Sync the ShootSkill reference after upgrades. */
  setShootSkill(skill: ShootSkill): void {
    this.shootSkill = skill;
  }

  update(deltaMs: number, inp: InputState): void {
    const ctx = this.ctx;
    const scene = ctx.scene;
    const deltaSec = deltaMs / 1000;

    // ── Heat cooldown ────────────────────────────────────────────────────────
    this.combatSystem.resetSparkBudget();
    if (ctx.heatOverheatTimer > 0) {
      ctx.heatOverheatTimer -= deltaMs;
      if (ctx.heatOverheatTimer <= 0) {
        ctx.heatOverheatTimer = 0;
        ctx.playerHeat = 0;
      }
    } else {
      ctx.playerHeat = Math.max(0, ctx.playerHeat - HEAT_COOLDOWN_RATE * deltaSec);
    }

    // ── Movement ─────────────────────────────────────────────────────────────
    let vx = inp.moveX * ctx.playerStats.speed;
    let vy = inp.moveY * ctx.playerStats.speed;

    const roomZone: RoomPhysicsZone | null =
      ctx.mapObstacles?.getRoomPhysicsAt?.(ctx.playerSprite.x, ctx.playerSprite.y) ?? null;

    if (roomZone) {
      vx *= roomZone.speedMultiplier;
      vy *= roomZone.speedMultiplier;

      if (roomZone.gravityPull) {
        // Pull player toward gravity center (same logic as enemy code)
        const g = roomZone.gravityPull;
        const gdx = g.x - ctx.playerSprite.x;
        const gdy = g.y - ctx.playerSprite.y;
        const gDist = Math.sqrt(gdx * gdx + gdy * gdy);
        if (gDist > 10) {
          vx += (gdx / gDist) * g.strength;
          vy += (gdy / gDist) * g.strength;
        }
      } else {
        this._playerGravityVY = 0;
      }

      if (roomZone.friction && roomZone.friction < 1) {
        vx *= roomZone.friction;
        vy *= roomZone.friction;
      }

      if (roomZone.damagePerSec > 0) {
        this.combatSystem.damagePlayer(roomZone.damagePerSec * deltaSec);
      }
      if (roomZone.healPerSec > 0 && ctx.playerHp < ctx.playerStats.maxHp) {
        ctx.playerHp = Math.min(ctx.playerStats.maxHp, ctx.playerHp + roomZone.healPerSec * deltaSec);
      }

      if (roomZone.physicsLabel && roomZone !== this._lastRoomZone) {
        this.onShowPhysicsZoneBanner?.(roomZone.physicsLabel);
      }
      this._lastRoomZone = roomZone;
    } else {
      this._playerGravityVY = 0;
      if (this._lastRoomZone) this._lastRoomZone = null;
    }

    ctx.playerSprite.setVelocity(vx, vy);

    // Flip sprite toward aim direction
    if (inp.aimAngle !== undefined) {
      const facingRight = Math.cos(inp.aimAngle) >= 0;
      ctx.playerSprite.setFlipX(!facingRight);
    }

    // Glow tracks player
    this.playerGlow.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);

    // Weapon visual update
    this.weaponVisual.update(ctx.playerSprite.x, ctx.playerSprite.y, inp.aimAngle, deltaMs);

    // GameJuice (ambient lighting) update
    this.gameJuice.update(deltaMs);

    // ── Plasma charge ─────────────────────────────────────────────────────────
    const wasAction1 = this._prevAction1;
    this._prevAction1 = inp.action1;

    if (inp.action1 && ctx.heatOverheatTimer <= 0) {
      this._chargeTimer += deltaMs;
      if (this._chargeTimer >= 300) {
        const chargeRatio = Math.min((this._chargeTimer - 300) / 1200, 1);
        if (!this._chargeGfx) {
          this._chargeGfx = scene.add.arc(
            ctx.playerSprite.x, ctx.playerSprite.y, 12, 0, 360, false, 0x00ffdd, 0.35,
          ).setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
        } else {
          this._chargeGfx.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);
          const r = 12 + chargeRatio * 20;
          this._chargeGfx.setRadius(r);
          this._chargeGfx.setAlpha(0.25 + chargeRatio * 0.45);
        }
      }
    } else if (!inp.action1 && wasAction1) {
      if (this._chargeTimer >= 1500) {
        // Full charge — release plasma beam
        ctx.playerHeat = MAX_HEAT;
        ctx.heatOverheatTimer = OVERHEAT_DURATION;
        this.combatSystem.firePlasmaBeam(inp.aimAngle);
      }
      this._chargeTimer = 0;
      this._chargeGfx?.destroy();
      this._chargeGfx = null;
    } else if (!inp.action1) {
      if (this._chargeTimer > 0) {
        this._chargeTimer = 0;
        this._chargeGfx?.destroy();
        this._chargeGfx = null;
      }
    }

    // ── Shooting ──────────────────────────────────────────────────────────────
    const canShoot = this.shootSkill.canUse && ctx.heatOverheatTimer <= 0;
    // Apply room bullet speed mod so rooms like Server (1.3×) and Vault (1.4×) feel distinct
    ShootSkill.playerBulletSpeedMult = roomZone?.bulletSpeedMod ?? 1.0;
    if (inp.action1 && canShoot && this._chargeTimer < 1500) {
      this.onTryTriggerWave?.();
      ctx.playerHeat += HEAT_PER_SHOT;
      if (ctx.playerHeat >= MAX_HEAT) {
        ctx.playerHeat = MAX_HEAT;
        ctx.heatOverheatTimer = OVERHEAT_DURATION;
        AudioManager.instance.overheatActive();
        const ohTxt = scene.add.text(ctx.playerSprite.x, ctx.playerSprite.y - 30, "⚠ OVERHEAT!", {
          fontFamily: "monospace", fontSize: "16px", color: "#ff2200", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(70);
        scene.tweens.add({ targets: ohTxt, y: ohTxt.y - 40, alpha: 0, duration: 800, onComplete: () => ohTxt.destroy() });
      }
      this.shootSkill.tryUse(ctx.playerSprite.x, ctx.playerSprite.y, inp.aimAngle);
      AudioManager.instance.shoot();
      Juice.screenShake(scene, 0.003, 60);

      // Rift Sync echo bullet
      if (ctx.upgradeSystem.riftsyncLevel > 0) {
        const echoAngle = inp.aimAngle + (Math.random() - 0.5) * 0.15;
        ShootSkill.fireImmediate(ctx.playerSprite.x, ctx.playerSprite.y, echoAngle, {
          damage: Math.round(ctx.playerStats.damage * 0.4), range: 280, speed: 480,
          tint: ctx.worldManager.currentWorld === WorldType.FOUNDRY ? 0xcc44ff : 0x44ff88,
          ownerId: -2,
        });
      }

      // Muzzle flash
      const flash = scene.add.circle(ctx.playerSprite.x, ctx.playerSprite.y, 5, 0xffff88, 0.8)
        .setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 60, onComplete: () => flash.destroy() });
    }
    this.shootSkill.tick();

    // ── Dash ──────────────────────────────────────────────────────────────────
    if (inp.action2JustDown && this.dashSkill.canUse) {
      this.dashSkill.tryUse(ctx.playerSprite, inp.aimAngle, scene);
      AudioManager.instance.dash();
    }
    this.dashSkill.tick();

    // ── Kill streak aura ──────────────────────────────────────────────────────
    if (this._streakAura && this._killStreak >= 3) {
      this._streakAura.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);
      this._streakAura.setAlpha(0.1 + 0.08 * Math.sin(performance.now() * 0.006));
    }

    // ── Passive HP regen ──────────────────────────────────────────────────────
    if (ctx.playerHp > 0 && ctx.playerHp < ctx.playerStats.maxHp * 0.7) {
      ctx.playerHp = Math.min(ctx.playerStats.maxHp, ctx.playerHp + 1.5 * deltaSec);
    }
  }

  addKill(pos: { x: number; y: number }): void {
    const ctx = this.ctx;
    this._killStreak++;
    if (this._killStreak >= 3) {
      ctx.scrapManager.setVortex(true, Math.min(this._killStreak * 0.3, 2.5));
      if (!this._streakAura) {
        this._streakAura = ctx.scene.add
          .circle(ctx.playerSprite.x, ctx.playerSprite.y, 65, 0xffcc00, 0)
          .setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
        this._streakAura.setStrokeStyle(3, 0xffcc00, 0.8);
      }
    }
    const streakTxt = ctx.scene.add.text(pos.x + 8, pos.y - 32, `×${this._killStreak}`, {
      fontFamily: "monospace", fontSize: "15px", color: "#ffcc00", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(55);
    ctx.scene.tweens.add({ targets: streakTxt, y: pos.y - 60, alpha: 0, duration: 700, onComplete: () => streakTxt.destroy() });
  }

  breakStreak(): void {
    const ctx = this.ctx;
    if (this._killStreak >= 3) {
      const breakTxt = ctx.scene.add.text(ctx.playerSprite.x, ctx.playerSprite.y - 40, "STREAK BROKEN!", {
        fontFamily: "monospace", fontSize: "14px", color: "#ff6600",
        fontStyle: "bold", stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(70);
      ctx.scene.tweens.add({ targets: breakTxt, y: breakTxt.y - 30, alpha: 0, duration: 700, onComplete: () => breakTxt.destroy() });
    }
    this._killStreak = 0;
    ctx.scrapManager.setVortex(false, 1);
    this._streakAura?.destroy();
    this._streakAura = null;
  }

  destroy(): void {
    this._chargeGfx?.destroy();
    this._streakAura?.destroy();
  }
}
