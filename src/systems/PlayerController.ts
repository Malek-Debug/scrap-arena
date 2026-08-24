import Phaser from "phaser";
import { WorldType, GAME_WIDTH, GAME_HEIGHT } from "../core";
import type { RoomPhysicsZone } from "../core";
import type { GameContext } from "./GameContext";
import type { CombatSystem } from "./CombatSystem";
import type { InputState } from "../input";
import { ShootSkill } from "../ai/skills/ShootSkill";
import type { DashSkill } from "../ai/skills/DashSkill";
import type { WeaponVisual } from "../rendering";
import type { GameJuice } from "../rendering";
import { Juice } from "../rendering";
import { ParticleVFX } from "../rendering/ParticleVFX";
import { WeaponVFX } from "../rendering/WeaponVFX";
import { UI_FONT } from "../rendering/UITheme";
import { AudioManager } from "../audio";

const MAX_HEAT           = 100;
const BASE_HEAT_PER_SHOT = 11;
const BASE_COOLDOWN_RATE = 25;
const BASE_OVERHEAT_DUR  = 2400;

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
  onFirstShot?: () => void;
  onFirstDash?: () => void;
  onFirstHeatWarning?: () => void;
  onRampage?: () => void;
  private _firstShotFired = false;
  private _firstDashUsed = false;
  private _firstHeatWarnFired = false;

  // Charge state
  private _chargeTimer = 0;
  private _prevAction1 = false;
  private _chargeGfx: Phaser.GameObjects.Arc | null = null;

  // Kill streak
  private _killStreak = 0;
  private _maxKillStreak = 0;
  private _streakAura: Phaser.GameObjects.Arc | null = null;
  private _streakBaseDamage = 0;
  // Bullet speed bonus applied at tier 5+ (multiplied with room zone mod)
  private _streakBulletSpeedMult = 1.0;

  // Heat red zone bonus
  private _hotZoneActive = false;
  private _hotZoneGlow: Phaser.GameObjects.Arc | null = null;

  private static readonly STREAK_TIERS = [
    { kills: 3,  mult: 1.10, auraColor: 0xffcc00, auraRadius: 65,  auraStroke: 3 },
    { kills: 5,  mult: 1.20, auraColor: 0xff8800, auraRadius: 80,  auraStroke: 4 },
    { kills: 8,  mult: 1.35, auraColor: 0xff4400, auraRadius: 100, auraStroke: 5 },
    { kills: 12, mult: 1.55, auraColor: 0xff00ff, auraRadius: 120, auraStroke: 6 },
  ];

  // Room physics tracking
  private _lastRoomZone: RoomPhysicsZone | null = null;

  // Momentum-based movement — current resolved velocity (lerped toward target)
  private _velX = 0;
  private _velY = 0;

  // Footstep dust timer
  private _footstepTimer = 0;
  // Dash input buffer (150ms window)
  private _dashBufferTimer = 0;

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

  get maxKillStreak(): number {
    return this._maxKillStreak;
  }

  /** Sync the ShootSkill reference after upgrades. */
  setShootSkill(skill: ShootSkill): void {
    this.shootSkill = skill;
  }

  update(deltaMs: number, inp: InputState): void {
    const ctx = this.ctx;
    const scene = ctx.scene;
    const deltaSec = deltaMs / 1000;

    // ── Heat cooldown (modified by dimension + Thermal Regulator) ────────────
    this.combatSystem.resetSparkBudget();
    const dimHeatDissip = ctx.worldManager.heatDissipMult;
    const bonusCooling = ctx.upgradeSystem.bonusCooling;
    const effectiveCoolRate = (BASE_COOLDOWN_RATE + bonusCooling) * dimHeatDissip;
    if (ctx.heatOverheatTimer > 0) {
      ctx.heatOverheatTimer -= deltaMs;
      if (ctx.heatOverheatTimer <= 0) {
        ctx.heatOverheatTimer = 0;
        ctx.playerHeat = 0;
      }
    } else {
      ctx.playerHeat = Math.max(0, ctx.playerHeat - effectiveCoolRate * deltaSec);
    }

    // ── Movement with momentum (dimension speed bonus) ──────────────────────
    const dimSpeed = ctx.worldManager.speedMult;
    let targetVX = inp.moveX * ctx.playerStats.speed * dimSpeed;
    let targetVY = inp.moveY * ctx.playerStats.speed * dimSpeed;

    const roomZone: RoomPhysicsZone | null =
      ctx.mapObstacles?.getRoomPhysicsAt?.(ctx.playerSprite.x, ctx.playerSprite.y) ?? null;

    if (roomZone) {
      targetVX *= roomZone.speedMultiplier;
      targetVY *= roomZone.speedMultiplier;

      if (roomZone.gravityPull) {
        const g = roomZone.gravityPull;
        const gdx = g.x - ctx.playerSprite.x;
        const gdy = g.y - ctx.playerSprite.y;
        const gDist = Math.sqrt(gdx * gdx + gdy * gdy);
        if (gDist > 10) {
          targetVX += (gdx / gDist) * g.strength;
          targetVY += (gdy / gDist) * g.strength;
        }
      }

      if (roomZone.friction && roomZone.friction < 1) {
        targetVX *= roomZone.friction;
        targetVY *= roomZone.friction;
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
      if (this._lastRoomZone) this._lastRoomZone = null;
    }

    // Lerp current velocity toward target (acceleration feel)
    // Skip lerp during dash so dash momentum carries through
    const isMoving = inp.moveX !== 0 || inp.moveY !== 0;
    if (!this.dashSkill.isInvulnerable) {
      const lerpRate = isMoving ? Math.min(1, 14 * deltaSec) : Math.min(1, 14 * deltaSec);
      this._velX += (targetVX - this._velX) * lerpRate;
      this._velY += (targetVY - this._velY) * lerpRate;
    }

    // Apply knockback on top of movement, then decay it
    const kx = ctx.playerKnockbackVX;
    const ky = ctx.playerKnockbackVY;
    const knockbackDecay = Math.max(0, 1 - 14 * deltaSec);
    ctx.playerKnockbackVX *= knockbackDecay;
    ctx.playerKnockbackVY *= knockbackDecay;
    if (Math.abs(ctx.playerKnockbackVX) < 1) ctx.playerKnockbackVX = 0;
    if (Math.abs(ctx.playerKnockbackVY) < 1) ctx.playerKnockbackVY = 0;

    // Don't override physics velocity during dash — let the dash force carry
    if (!this.dashSkill.isInvulnerable) {
      ctx.playerSprite.setVelocity(this._velX + kx, this._velY + ky);
    } else {
      // Sync lerp state with actual body velocity so deceleration is smooth after dash
      const body = ctx.playerSprite.body as Phaser.Physics.Arcade.Body;
      this._velX = body.velocity.x;
      this._velY = body.velocity.y;
    }

    // ── I-frame visual flicker ────────────────────────────────────────────────
    if (ctx.iFrameTimer > 0) {
      ctx.playerSprite.setAlpha(Math.sin(ctx.iFrameTimer * 0.07) > 0 ? 1 : 0.25);
    } else {
      ctx.playerSprite.setAlpha(1);
    }

    // ── Footstep dust particles ───────────────────────────────────────────────
    const speed = Math.sqrt(this._velX * this._velX + this._velY * this._velY);
    if (speed > 60) {
      this._footstepTimer -= deltaMs;
      if (this._footstepTimer <= 0) {
        this._footstepTimer = 80;
        const dustColor = ctx.worldManager.currentWorld === WorldType.FOUNDRY ? 0xaa7744 : 0x8844cc;
        const dust = scene.add.circle(
          ctx.playerSprite.x + Phaser.Math.Between(-6, 6),
          ctx.playerSprite.y + 10,
          3 + Math.random() * 3, dustColor, 0.45,
        ).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: dust, alpha: 0, scaleX: 2.2, scaleY: 2.2, y: dust.y + 10, duration: 250, ease: "Quad.easeOut", onComplete: () => dust.destroy() });
      }
    } else {
      this._footstepTimer = 0;
    }

    // Flip sprite toward aim direction
    if (inp.aimAngle !== undefined) {
      const facingRight = Math.cos(inp.aimAngle) >= 0;
      ctx.playerSprite.setFlipX(!facingRight);
    }

    // Glow tracks player — color matches current dimension or active buff
    this.playerGlow.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);
    {
      const pus = ctx.powerUpSystem;
      const hasBuff = pus.rapidFireActive || pus.damageBoostActive || pus.speedBoostActive;
      if (hasBuff) {
        const buffColor = pus.damageBoostActive ? 0xff0044 : pus.rapidFireActive ? 0xff6600 : 0x00aaff;
        const pulse = Math.sin(performance.now() * 0.008) * 0.15 + 0.35;
        this.playerGlow.setFillStyle(buffColor, pulse);
        this.playerGlow.setStrokeStyle(3, buffColor, pulse + 0.2);
        this.playerGlow.setRadius(32);
      } else {
        const isFoundry = ctx.worldManager.currentWorld === WorldType.FOUNDRY;
        const rimColor  = isFoundry ? 0xffaa33 : 0x00ddff;
        const rimStroke = isFoundry ? 0xffcc88 : 0x44eeff;
        this.playerGlow.setFillStyle(rimColor, 0.22);
        this.playerGlow.setStrokeStyle(2, rimStroke, 0.55);
        this.playerGlow.setRadius(28);
      }
    }

    // Weapon visual update
    this.weaponVisual.update(ctx.playerSprite.x, ctx.playerSprite.y, inp.aimAngle, deltaMs);
    this.weaponVisual.setHeatTint(ctx.heatOverheatTimer > 0 ? 0 : ctx.playerHeat / 100);

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
        ctx.heatOverheatTimer = Math.max(800, BASE_OVERHEAT_DUR - ctx.upgradeSystem.overheatReduction);
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

    // ── Hot-zone damage + fire-rate bonus (heat 75–100%, not overheated) ────
    const heatRatio = ctx.playerHeat / 100;
    const nowInHotZone = heatRatio >= 0.75 && ctx.heatOverheatTimer <= 0;
    if (nowInHotZone && !this._firstHeatWarnFired) { this._firstHeatWarnFired = true; this.onFirstHeatWarning?.(); }
    if (nowInHotZone !== this._hotZoneActive) {
      this._hotZoneActive = nowInHotZone;
      // Recalculate effective damage from current stats + streak mult + hot zone
      const baseDmg = this._streakBaseDamage > 0 ? this._streakBaseDamage : ctx.playerStats.damage;
      const tiers = PlayerController.STREAK_TIERS;
      let streakMult = 1;
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (this._killStreak >= tiers[i].kills) { streakMult = tiers[i].mult; break; }
      }
      const newDmg = Math.round(baseDmg * streakMult * (nowInHotZone ? 1.2 : 1));
      this.shootSkill.setDamage(newDmg);
      // 15% fire rate improvement in red zone
      if (nowInHotZone) {
        this.shootSkill.setFireRateMult(1.15);
      } else {
        this.shootSkill.resetFireRateMult();
      }
    }

    // ── Red zone weapon glow aura ─────────────────────────────────────────
    if (nowInHotZone) {
      if (!this._hotZoneGlow) {
        this._hotZoneGlow = scene.add.circle(
          ctx.playerSprite.x, ctx.playerSprite.y, 22, 0xff3300, 0.0,
        ).setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
      }
      this._hotZoneGlow.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);
      const glowPulse = Math.sin(performance.now() * 0.009) * 0.5 + 0.5;
      this._hotZoneGlow.setAlpha(0.18 + glowPulse * 0.22);
      const glowR = 20 + glowPulse * 8;
      this._hotZoneGlow.setRadius(glowR);
    } else if (this._hotZoneGlow) {
      this._hotZoneGlow.destroy();
      this._hotZoneGlow = null;
    }

    // ── Shooting ──────────────────────────────────────────────────────────────
    const canShoot = this.shootSkill.canUse && ctx.heatOverheatTimer <= 0;
    // Apply room bullet speed mod × streak bullet speed bonus
    ShootSkill.playerBulletSpeedMult = (roomZone?.bulletSpeedMod ?? 1.0) * this._streakBulletSpeedMult;
    if (inp.action1 && canShoot && this._chargeTimer < 1500) {
      this.onTryTriggerWave?.();
      if (!this._firstShotFired) { this._firstShotFired = true; this.onFirstShot?.(); }
      const heatPerShot = (BASE_HEAT_PER_SHOT + ctx.upgradeSystem.heatPenalty) * ctx.worldManager.heatGenMult;
      ctx.playerHeat += heatPerShot;
      if (ctx.playerHeat >= MAX_HEAT) {
        ctx.playerHeat = MAX_HEAT;
        const overheatDur = Math.max(800, BASE_OVERHEAT_DUR - ctx.upgradeSystem.overheatReduction);
        ctx.heatOverheatTimer = overheatDur;
        AudioManager.instance.overheatActive();
        const muzzlePos = this.weaponVisual.getMuzzlePosition(inp.aimAngle);
        WeaponVFX.overheatSmoke(scene, muzzlePos.x, muzzlePos.y);
        const ohTxt = scene.add.text(ctx.playerSprite.x, ctx.playerSprite.y - 30, "⚠ OVERHEAT!", {
          fontFamily: UI_FONT, fontSize: "16px", color: "#ff2200", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(70);
        scene.tweens.add({ targets: ohTxt, y: ohTxt.y - 40, alpha: 0, duration: 800, onComplete: () => ohTxt.destroy() });
        // Nova discharge — radial burst from player position
        this._fireNovaDischarge(ctx.playerSprite.x, ctx.playerSprite.y, inp.aimAngle);
      }
      this.shootSkill.tryUse(ctx.playerSprite.x, ctx.playerSprite.y, inp.aimAngle);
      AudioManager.instance.shoot();
      Juice.screenShake(scene, 0.005, 80);

      // Recoil squash-stretch on player sprite (use known base to avoid tween conflicts)
      const bs = ctx.playerBaseScale;
      scene.tweens.killTweensOf(ctx.playerSprite);
      ctx.playerSprite.setScale(bs * 0.92, bs * 1.06);
      scene.tweens.add({
        targets: ctx.playerSprite,
        scaleX: bs, scaleY: bs,
        duration: 70, ease: "Power2",
      });

      // Rift Sync echo bullet
      if (ctx.upgradeSystem.riftsyncLevel > 0) {
        const echoAngle = inp.aimAngle + (Math.random() - 0.5) * 0.15;
        ShootSkill.fireImmediate(ctx.playerSprite.x, ctx.playerSprite.y, echoAngle, {
          damage: Math.round(ctx.playerStats.damage * 0.4), range: 280, speed: 480,
          tint: ctx.worldManager.currentWorld === WorldType.FOUNDRY ? 0xcc44ff : 0x44ff88,
          ownerId: -2,
        });
      }

      // Muzzle flash — directional particle cone + category-specific muzzle shape
      const wCat = WeaponVFX.category(ctx.playerStats.damage);
      const tipPos = this.weaponVisual.getMuzzlePosition(inp.aimAngle);
      ParticleVFX.muzzleFlash(scene, tipPos.x, tipPos.y, inp.aimAngle);
      WeaponVFX.muzzleFlash(scene, tipPos.x, tipPos.y, inp.aimAngle, wCat);
      WeaponVFX.weaponGlow(scene, tipPos.x, tipPos.y, wCat);
      this.weaponVisual.fire();
    }
    this.shootSkill.tick();

    // ── Dash (with 150ms input buffer) ─────────────────────────────────────────
    if (inp.action2JustDown) this._dashBufferTimer = 150;
    if (this._dashBufferTimer > 0) {
      this._dashBufferTimer -= deltaMs;
      if (this.dashSkill.canUse) {
        this._dashBufferTimer = 0;
        if (!this._firstDashUsed) { this._firstDashUsed = true; this.onFirstDash?.(); }
        this.dashSkill.forceMult = ctx.upgradeSystem.dashForceMult;
        this.dashSkill.tryUse(ctx.playerSprite, inp.aimAngle, scene);
        ctx.iFrameTimer = Math.max(ctx.iFrameTimer, 200);
        AudioManager.instance.dash();
      }
    }
    this.dashSkill.tick();

    // ── Kill streak aura ──────────────────────────────────────────────────────
    if (this._streakAura && this._killStreak >= 3) {
      this._streakAura.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);
      // Higher tiers pulse faster and brighter
      const tiers = PlayerController.STREAK_TIERS;
      let tierIdx = -1;
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (this._killStreak >= tiers[i].kills) { tierIdx = i; break; }
      }
      const speed = 0.006 + tierIdx * 0.003;
      const base  = 0.10  + tierIdx * 0.04;
      this._streakAura.setAlpha(base + 0.08 * Math.sin(performance.now() * speed));
    }

    // ── Passive HP regen — very slow, only in critical state ──────────────────
    if (ctx.playerHp > 0 && ctx.playerHp < ctx.playerStats.maxHp * 0.30) {
      ctx.playerHp = Math.min(ctx.playerStats.maxHp, ctx.playerHp + 0.4 * deltaSec);
    }
  }

  private _fireNovaDischarge(x: number, y: number, _aimAngle: number): void {
    const ctx = this.ctx;
    const scene = ctx.scene;
    const novaCount = 8;
    const novaDamage = Math.round(ctx.playerStats.damage * 0.6);
    for (let i = 0; i < novaCount; i++) {
      const angle = (i / novaCount) * Math.PI * 2;
      ShootSkill.fireImmediate(x, y, angle, {
        damage: novaDamage, range: 240, speed: 360, tint: 0xff4400, ownerId: -1,
      });
    }

    // Radial stagger pulse — 50px radius, 0 damage, 300ms stagger
    const STAGGER_R2 = 50 * 50;
    for (const agent of ctx.allAgents) {
      if (agent.isDead || agent.isStaggered) continue;
      const dx = agent.posX - x;
      const dy = agent.posY - y;
      if (dx * dx + dy * dy <= STAGGER_R2) {
        agent.isStaggered = true;
        agent.staggerTimer = 300;
        agent.staggerGauge = 0;
        if (agent.sprite?.active) agent.sprite.setTint(0xff6600);
      }
    }

    // Stagger pulse ring — distinct orange-white, separate from the nova burst
    const pulseRing = scene.add.circle(x, y, 14, 0xff8844, 0.7)
      .setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: pulseRing, scaleX: 50 / 14, scaleY: 50 / 14, alpha: 0,
      duration: 260, ease: "Expo.easeOut", onComplete: () => pulseRing.destroy() });
    // Outer shockwave ring
    const shockRing = scene.add.circle(x, y, 10, 0, 0)
      .setStrokeStyle(3, 0xffaa44, 0.9).setDepth(54).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: shockRing, scaleX: 50 / 10, scaleY: 50 / 10, alpha: 0,
      duration: 320, ease: "Quad.easeOut", onComplete: () => shockRing.destroy() });

    // Visual burst ring (original nova)
    const ring = scene.add.circle(x, y, 8, 0xff6600, 0.8)
      .setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 320, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    Juice.screenShake(scene, 0.008, 150);
  }

  addKill(pos: { x: number; y: number }): void {
    const ctx = this.ctx;
    const prevStreak = this._killStreak;
    this._killStreak++;
    if (this._killStreak > this._maxKillStreak) {
      this._maxKillStreak = this._killStreak;
    }

    // Record base damage once (before any multiplier is applied)
    if (this._streakBaseDamage === 0) {
      this._streakBaseDamage = ctx.playerStats.damage;
    }

    // Determine current and previous tier
    const tiers = PlayerController.STREAK_TIERS;
    let tierIdx = -1;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (this._killStreak >= tiers[i].kills) { tierIdx = i; break; }
    }
    let prevTierIdx = -1;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (prevStreak >= tiers[i].kills) { prevTierIdx = i; break; }
    }

    // Crossed a new tier threshold?
    if (tierIdx > prevTierIdx && tierIdx >= 0) {
      const tier = tiers[tierIdx];
      // Rebuild aura
      this._streakAura?.destroy();
      this._streakAura = ctx.scene.add
        .circle(ctx.playerSprite.x, ctx.playerSprite.y, tier.auraRadius, tier.auraColor, 0)
        .setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      this._streakAura.setStrokeStyle(tier.auraStroke, tier.auraColor, 0.8);

      // Apply damage multiplier
      const newDamage = Math.round(this._streakBaseDamage * tier.mult);
      this.shootSkill.setDamage(newDamage);

      // Tier 5+: bullet speed bonus +10%
      this._streakBulletSpeedMult = tierIdx >= 1 ? 1.10 : 1.0;

      // Tier 8: slow-mo momentum beat; Tier 12: time fracture
      if (tierIdx >= 3) {
        Juice.timeFracture(ctx.scene);
      } else if (tierIdx >= 2) {
        Juice.slowMo(ctx.scene, 0.35, 500);
      }

      // Scale punch on the player for visceral feedback
      Juice.punchScale(ctx.playerSprite, 1.3, 120);

      // Update scrap vortex
      ctx.scrapManager.setVortex(true, Math.min(this._killStreak * 0.3, 2.5));

      // Tier announcement — tier 12 gets a dedicated RAMPAGE banner
      const tierLabels = ["STREAK!", "HOT STREAK!", "KILLING SPREE!", "UNSTOPPABLE!"];
      const isRampage = tierIdx >= 3;
      const col = `#${tier.auraColor.toString(16).padStart(6, "0")}`;

      if (isRampage) {
        // Fixed screen-space slot — high enough to clear boss phase label at y = GAME_HEIGHT/2 - 115
        const bannerY = GAME_HEIGHT / 2 - 170;
        const banner = ctx.scene.add.text(GAME_WIDTH / 2, bannerY, "RAMPAGE!", {
          fontFamily: UI_FONT, fontSize: "36px", color: col, fontStyle: "bold",
          stroke: "#000000", strokeThickness: 6,
          shadow: { offsetX: 0, offsetY: 0, color: col, blur: 22, fill: true },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(122).setScale(0.3).setAlpha(0);
        ctx.scene.tweens.add({
          targets: banner, scaleX: 1.1, scaleY: 1.1, alpha: 1,
          duration: 180, ease: "Back.easeOut",
          onComplete: () => {
            ctx.scene.tweens.add({ targets: banner, y: bannerY - 55, alpha: 0,
              duration: 1000, delay: 500, ease: "Power2", onComplete: () => banner.destroy() });
          },
        });
        const sub = ctx.scene.add.text(GAME_WIDTH / 2, bannerY + 32, "+30% DMG", {
          fontFamily: UI_FONT, fontSize: "16px", color: "#ffaaff", fontStyle: "bold",
          stroke: "#000000", strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(122).setAlpha(0);
        ctx.scene.tweens.add({ targets: sub, alpha: 1, duration: 200, delay: 120,
          onComplete: () => {
            ctx.scene.tweens.add({ targets: sub, alpha: 0, y: sub.y - 30, duration: 700, delay: 600, onComplete: () => sub.destroy() });
          },
        });
        // Full-screen flash — low alpha so it doesn't compete with boss/reactor flashes
        const flash = ctx.scene.add
          .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, tier.auraColor, 0.10)
          .setScrollFactor(0).setDepth(121);
        ctx.scene.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
        // Notify listeners (e.g. story hint suppression)
        this.onRampage?.();
      } else {
        const tierTxt = ctx.scene.add.text(ctx.playerSprite.x, ctx.playerSprite.y - 55, tierLabels[tierIdx], {
          fontFamily: UI_FONT, fontSize: "20px", color: col, fontStyle: "bold",
          stroke: "#000000", strokeThickness: 4,
          shadow: { offsetX: 0, offsetY: 0, color: col, blur: 12, fill: true },
        }).setOrigin(0.5).setDepth(70).setScale(0.4);
        ctx.scene.tweens.add({
          targets: tierTxt, scale: 1, duration: 160, ease: "Back.easeOut",
          onComplete: () => {
            ctx.scene.tweens.add({ targets: tierTxt, y: tierTxt.y - 40, alpha: 0, duration: 800, delay: 300, onComplete: () => tierTxt.destroy() });
          },
        });
      }

      // Tier-up burst ring — scales with tier
      const ringScale = 5 + tierIdx * 1.5;
      const ring = ctx.scene.add.circle(ctx.playerSprite.x, ctx.playerSprite.y, 20, tier.auraColor, 0.7)
        .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({ targets: ring, scale: ringScale, alpha: 0, duration: 400 + tierIdx * 60, ease: "Quad.easeOut", onComplete: () => ring.destroy() });

      AudioManager.instance.comboHit(this._killStreak);
    } else if (tierIdx >= 0 && !this._streakAura) {
      // Streak still active but aura was lost — restore it
      const tier = tiers[tierIdx];
      this._streakAura = ctx.scene.add
        .circle(ctx.playerSprite.x, ctx.playerSprite.y, tier.auraRadius, tier.auraColor, 0)
        .setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      this._streakAura.setStrokeStyle(tier.auraStroke, tier.auraColor, 0.8);
    }

    // Floating kill counter (always shown)
    const col = tierIdx >= 0 ? `#${tiers[tierIdx].auraColor.toString(16).padStart(6, "0")}` : "#ffcc00";
    const streakTxt = ctx.scene.add.text(pos.x + 8, pos.y - 32, `×${this._killStreak}`, {
      fontFamily: UI_FONT, fontSize: "15px", color: col, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(55);
    ctx.scene.tweens.add({ targets: streakTxt, y: pos.y - 60, alpha: 0, duration: 700, onComplete: () => streakTxt.destroy() });
  }

  breakStreak(): void {
    const ctx = this.ctx;
    const tiers = PlayerController.STREAK_TIERS;
    const brokenStreak = this._killStreak;

    if (brokenStreak >= 3) {
      // Determine which tier was active when streak broke
      let tierIdx = -1;
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (brokenStreak >= tiers[i].kills) { tierIdx = i; break; }
      }

      const isHighTier = brokenStreak >= 8;
      const breakLabels = ["STREAK BROKEN!", "STREAK LOST!", "SPREE ENDED!", "RAMPAGE ENDED!"];
      const label = breakLabels[Math.min(tierIdx, breakLabels.length - 1)] ?? "STREAK BROKEN!";

      if (isHighTier) {
        // Stronger break for 8+ kills — larger text, camera shake, prominent flash
        const col = tierIdx >= 0 ? `#${tiers[tierIdx].auraColor.toString(16).padStart(6, "0")}` : "#ff6600";
        const breakTxt = ctx.scene.add.text(ctx.playerSprite.x, ctx.playerSprite.y - 55, label, {
          fontFamily: UI_FONT, fontSize: `${22 + tierIdx * 2}px`, color: "#ff6600",
          fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
          shadow: { offsetX: 0, offsetY: 0, color: "#ff2200", blur: 14, fill: true },
        }).setOrigin(0.5).setDepth(70).setScale(0.5);
        ctx.scene.tweens.add({
          targets: breakTxt, scale: 1, duration: 180, ease: "Back.easeOut",
          onComplete: () => {
            ctx.scene.tweens.add({ targets: breakTxt, y: breakTxt.y - 40, alpha: 0, duration: 700, delay: 200, onComplete: () => breakTxt.destroy() });
          },
        });

        // Camera shake — scales with tier
        const shakeAmt = 0.010 + tierIdx * 0.006;
        Juice.screenShake(ctx.scene, shakeAmt, 250 + tierIdx * 50);

        // Burst ring at player position
        const ringCol = tierIdx >= 0 ? tiers[tierIdx].auraColor : 0xff6600;
        const breakRing = ctx.scene.add.circle(ctx.playerSprite.x, ctx.playerSprite.y, 18, ringCol, 0.6)
          .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
        ctx.scene.tweens.add({ targets: breakRing, scaleX: 4 + tierIdx, scaleY: 4 + tierIdx, alpha: 0,
          duration: 380, ease: "Expo.easeOut", onComplete: () => breakRing.destroy() });

        // Audio — escalating break hit
        AudioManager.instance.comboHit(Math.max(1, brokenStreak - 2));

        void col; // suppress unused warning
      } else {
        // Standard small break text for tier 1-2 (3–7 kills)
        const fontSize = 14 + (tierIdx >= 0 ? tierIdx * 2 : 0);
        const breakTxt = ctx.scene.add.text(ctx.playerSprite.x, ctx.playerSprite.y - 40, label, {
          fontFamily: UI_FONT, fontSize: `${fontSize}px`, color: "#ff6600",
          fontStyle: "bold", stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(70);
        ctx.scene.tweens.add({ targets: breakTxt, y: breakTxt.y - 30, alpha: 0, duration: 700, onComplete: () => breakTxt.destroy() });
      }
    }

    // Restore base damage and reset streak bonuses
    if (this._streakBaseDamage > 0) {
      this.shootSkill.setDamage(this._streakBaseDamage);
      this._streakBaseDamage = 0;
    }
    this._streakBulletSpeedMult = 1.0;
    this._killStreak = 0;
    ctx.scrapManager.setVortex(false, 1);
    this._streakAura?.destroy();
    this._streakAura = null;
  }

  destroy(): void {
    this._chargeGfx?.destroy();
    this._streakAura?.destroy();
    this._hotZoneGlow?.destroy();
    this._hotZoneGlow = null;
  }
}
