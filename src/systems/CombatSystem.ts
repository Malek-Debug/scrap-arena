import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { ParticleVFX } from "../rendering/ParticleVFX";
import { WeaponVFX } from "../rendering/WeaponVFX";
import type { GameContext, AnyAgent } from "./GameContext";
import { EnemyAgent } from "../agents/EnemyAgent";
import { GuardAgent } from "../agents/GuardAgent";
import { CollectorAgent } from "../agents/CollectorAgent";
import { TurretAgent } from "../agents/TurretAgent";
import { SawbladeAgent } from "../agents/SawbladeAgent";
import { WelderAgent } from "../agents/WelderAgent";
import { Juice } from "../rendering";
import { AudioManager } from "../audio";
import { ShootSkill } from "../ai/skills/ShootSkill";
import type { Projectile } from "../ai/skills/ShootSkill";
import type { FractureFX, DeathFX } from "../rendering";
import type { DimensionBackground } from "../rendering";
import type { GlitchEvents } from "../rendering";
import { UI_FONT } from "../rendering/UITheme";

/** Per-type death presentation profile — only presentation, no gameplay values. */
interface DeathProfile {
  burstColor: number;
  shockColor: number;
  shakeIntensity: number;
  shakeDuration: number;
  sparkCount: number;
  sparkColor: number;
  coreRadius: number;
  burstRadius: number;
  burstDuration: number;
  shockDuration: number;
  /** ms before sprite is destroyed (0 = immediate) */
  spriteDeathDelay: number;
  /** degrees per ms of final spin (0 = no spin) */
  spriteSpinRate: number;
  /** if true, sprite fades during spriteDeathDelay */
  spriteFade: boolean;
  /** scale multiplier applied instantly on death pop */
  scalePunch: number;
}

export interface CombatSystemDeps {
  fractureFX?: FractureFX;
  deathFX?: DeathFX;
  dimensionBg?: DimensionBackground;
  glitchEvents?: GlitchEvents;
}

/**
 * CombatSystem — collision detection, damage, stagger, fear, plasma beam, death processing.
 */
export class CombatSystem {
  private ctx: GameContext;
  private deps: CombatSystemDeps;

  // Per-frame spark budget (reset at start of checkCollisions)
  private _sparkBudgetThisFrame = 0;

  // Per-frame hit-number budget — max 4 enemy damage numbers per frame to avoid text flooding
  private _hitNumberBudgetThisFrame = 0;

  // Per-frame combo milestone banner budget — max 1 per frame to prevent stacking
  private _milestoneBannerThisFrame = false;

  // Per-frame death VFX budget — caps full-quality explosions to prevent ADD-blend white-out
  // when 10+ enemies die simultaneously. Beyond the cap, deaths get only a single small ring.
  private _deathVfxBudgetThisFrame = 0;
  private static readonly MAX_DEATH_VFX = 4;

  // Chain shock counter for audio escalation
  private _chainShockCount = 0;

  // Callbacks for kill streak management (PlayerController hooks)
  onAddKill?: (pos: { x: number; y: number }) => void;
  onBreakStreak?: () => void;

  // Callback for game-over (MainScene handles this)
  onGameOver?: () => void;

  constructor(ctx: GameContext, deps: CombatSystemDeps = {}) {
    this.ctx = ctx;
    this.deps = deps;
  }

  resetSparkBudget(): void {
    this._sparkBudgetThisFrame = 0;
  }

  private _gridQuery: number[] = [];

  checkCollisions(deltaMs: number): void {
    this._sparkBudgetThisFrame = 0;
    this._hitNumberBudgetThisFrame = 0;
    this._milestoneBannerThisFrame = false;
    this._deathVfxBudgetThisFrame = 0;
    const ctx = this.ctx;
    const projectiles = ShootSkill.activeProjectiles;
    const grid = ctx.spatialGrid;
    const agents = ctx.allAgents;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.active) continue;

      if (ctx.mapObstacles.bulletHit(p.sprite.x, p.sprite.y, p.damage)) {
        ShootSkill.recycleProjectile(p);
        continue;
      }

      if (p.ownerId === -1 || p.ownerId === -2) {
        this._gridQuery.length = 0;
        grid.query(p.sprite.x, p.sprite.y, p.bulletRadius + 40, this._gridQuery);
        for (let qi = 0; qi < this._gridQuery.length; qi++) {
          const agentIdx = this._gridQuery[qi];
          if (agentIdx >= agents.length) continue;
          const agent = agents[agentIdx];
          if (agent.isDead || !agent.sprite) continue;
          const breach = (agent as GuardAgent | CollectorAgent).breach;
          const isBreachActive = breach?.isActive ?? false;
          if (!this._isAgentInCurrentWorld(agent) && !isBreachActive) continue;
          const dx = p.sprite.x - agent.posX;
          const dy = p.sprite.y - agent.posY;
          const combinedR = p.bulletRadius + agent.hitRadius;
          if (dx * dx + dy * dy < combinedR * combinedR) {
            agent.takeDamage(p.damage);
            const triggeredStagger = this._addStaggerDamage(agent, p.damage);
            if (agent.sprite && !agent.isStaggered) {
              agent.sprite.setTint(0xffffff);
              agent.hitFlashFrames = 3;
            }
            const wCat = WeaponVFX.category(p.damage);
            if (triggeredStagger) {
              this._spawnCritNumber(agent.posX, agent.posY, p.damage);
              WeaponVFX.critBurst(ctx.scene, p.sprite.x, p.sprite.y, wCat);
            } else if (this._hitNumberBudgetThisFrame < 4) {
              this._hitNumberBudgetThisFrame++;
              this._spawnEnemyHitNumber(agent.posX, agent.posY, p.damage);
              WeaponVFX.impactBurst(ctx.scene, p.sprite.x, p.sprite.y, wCat);
            }
            this._spawnHitSparks(p.sprite.x, p.sprite.y, p.ownerId === -2 ? 0xcc44ff : 0x00ff88);
            ShootSkill.recycleProjectile(p);
            break;
          }
        }
        if (ctx.boss && !ctx.boss.isDead && p.active) {
          const bossInWorld = ctx.worldManager.isAgentInCurrentWorld(ctx.boss);
          const dx = p.sprite.x - ctx.boss.posX;
          const dy = p.sprite.y - ctx.boss.posY;
          if (dx * dx + dy * dy < 2500 && bossInWorld) {
            ctx.boss.takeDamage(p.damage);
            if (ctx.boss.sprite) {
              ctx.boss.sprite.setTint(0xffffff);
              ctx.scene.time.delayedCall(80, () => { if (ctx.boss?.sprite?.active) ctx.boss.sprite.setTint(0xff2200); });
            }
            // Boss hit numbers rate-limited like enemy numbers
            if (this._hitNumberBudgetThisFrame < 4) {
              this._hitNumberBudgetThisFrame++;
              this._spawnEnemyHitNumber(ctx.boss.posX, ctx.boss.posY, p.damage);
            }
            this._spawnHitSparks(p.sprite.x, p.sprite.y, 0xff2200);
            ShootSkill.recycleProjectile(p);
            // isDead is a getter; no assignment needed — MainScene checks ctx.boss.isDead each frame
          }
        }
      } else {
        const ownerInWorld = this._isOwnerInCurrentWorld(p.ownerId);
        const ownerIsBreaching = this._isOwnerBreaching(p.ownerId);
        if (!ownerInWorld && !ownerIsBreaching) continue;
        const dx = p.sprite.x - ctx.playerSprite.x;
        const dy = p.sprite.y - ctx.playerSprite.y;
        if (dx * dx + dy * dy < 784) {
          if (ctx.upgradeSystem.mirrorPlatingLevel > 0) {
            this._reflectBullet(p);
            this._spawnHitSparks(p.sprite.x, p.sprite.y, 0x44ffcc);
          } else {
            this.damagePlayer(p.damage, p.sprite.x, p.sprite.y);
            this._spawnHitSparks(p.sprite.x, p.sprite.y, 0xff4400);
          }
          ShootSkill.recycleProjectile(p);
        }
      }
    }

    if (ctx.contactDamageCooldown <= 0) {
      for (const guard of ctx.guards) {
        if (guard.isDead || !guard.breach.isActive) continue;
        const dx = guard.posX - ctx.playerSprite.x;
        const dy = guard.posY - ctx.playerSprite.y;
        if (dx * dx + dy * dy < 600) {
          this.damagePlayer(this._enemyDamage(guard, 12), guard.posX, guard.posY);
          ctx.contactDamageCooldown = 600;
          Juice.screenShake(ctx.scene, 0.01, 150);
          const warn = ctx.scene.add.text(guard.posX, guard.posY - 20, "⚠ BREACH!", {
            fontFamily: UI_FONT, fontSize: "14px", color: "#ff66ff", fontStyle: "bold",
          }).setOrigin(0.5).setDepth(110);
          ctx.scene.tweens.add({ targets: warn, y: warn.y - 30, alpha: 0, duration: 600, onComplete: () => warn.destroy() });
          break;
        }
      }
    }

    if (ctx.contactDamageCooldown <= 0) {
      for (const enemy of ctx.enemies) {
        if (enemy.isDead || !this._isAgentInCurrentWorld(enemy)) continue;
        const dx = enemy.posX - ctx.playerSprite.x;
        const dy = enemy.posY - ctx.playerSprite.y;
        if (dx * dx + dy * dy < 900) {
          this.damagePlayer(this._enemyDamage(enemy, 5), enemy.posX, enemy.posY);
          ctx.contactDamageCooldown = 500;
          Juice.screenShake(ctx.scene, 0.006, 100);
          break;
        }
      }
    }

    if (ctx.contactDamageCooldown <= 0) {
      for (const saw of ctx.sawblades) {
        if (saw.isDead || saw.hasHitRecently || !this._isAgentInCurrentWorld(saw)) continue;
        const dx = saw.posX - ctx.playerSprite.x;
        const dy = saw.posY - ctx.playerSprite.y;
        if (dx * dx + dy * dy < 1024) {
          this.damagePlayer(this._enemyDamage(saw, saw.contactDamage), saw.posX, saw.posY);
          saw.registerHit();
          ctx.contactDamageCooldown = 300;
          Juice.screenShake(ctx.scene, 0.01, 150);
          break;
        }
      }
    }

    void deltaMs;

    if (ctx.boss && !ctx.boss.isDead && ctx.contactDamageCooldown <= 0) {
      const dx = ctx.boss.posX - ctx.playerSprite.x;
      const dy = ctx.boss.posY - ctx.playerSprite.y;
      if (dx * dx + dy * dy < 900) {
        this.damagePlayer(10, ctx.boss.posX, ctx.boss.posY);
        ctx.contactDamageCooldown = 400;
        Juice.screenShake(ctx.scene, 0.01, 150);
      }
    }

    if (ctx.boss && !ctx.boss.isDead) {
      const mineDmg = ctx.boss.checkMineCollision(ctx.playerSprite.x, ctx.playerSprite.y);
      if (mineDmg > 0) {
        this.damagePlayer(mineDmg);
        ctx.contactDamageCooldown = 600;
        Juice.screenShake(ctx.scene, 0.015, 200);
      }
    }
  }

  damagePlayer(amount: number, sourceX?: number, sourceY?: number): void {
    const ctx = this.ctx;
    if (ctx.godMode) return;
    if (ctx.iFrameTimer > 0) return;  // I-frames: immune right after being hit
    if (ctx.abilityShieldActive) return;
    if (ctx.playerShielded) {
      amount *= 0.8;
      AudioManager.instance.shieldAbsorb();
      ParticleVFX.shieldImpact(ctx.scene, ctx.playerSprite.x, ctx.playerSprite.y);
    }
    const armorReduction = ctx.upgradeSystem.armorLevel * 0.15;
    const finalDmg = Math.max(1, Math.round(amount * (1 - armorReduction)));
    ctx.playerHp = Math.max(0, ctx.playerHp - finalDmg);
    ctx.damageTakenThisWave += finalDmg;

    // Grant i-frames (350ms after taking any hit)
    ctx.iFrameTimer = 350;

    // Knockback — push player away from damage source
    if (sourceX !== undefined && sourceY !== undefined) {
      const kdx = ctx.playerSprite.x - sourceX;
      const kdy = ctx.playerSprite.y - sourceY;
      const kDist = Math.sqrt(kdx * kdx + kdy * kdy);
      if (kDist > 0) {
        const kStrength = 240;
        ctx.playerKnockbackVX = (kdx / kDist) * kStrength;
        ctx.playerKnockbackVY = (kdy / kDist) * kStrength;
      } else {
        // Default knockback upward if source is at same position
        ctx.playerKnockbackVX = 0;
        ctx.playerKnockbackVY = -200;
      }
    }

    this.onBreakStreak?.();

    AudioManager.instance.playerHit();
    // Scale shake intensity with damage severity
    const shakeAmt = Math.min(0.028, 0.010 + (finalDmg / 30) * 0.018);
    Juice.screenShake(ctx.scene, shakeAmt, 200);
    this.deps.fractureFX?.onPlayerDamage();

    // Full-screen red flash — gives immediate body-hit feedback separate from vignette
    const dmgFlash = ctx.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0,
    ).setScrollFactor(0).setDepth(149);
    ctx.scene.tweens.add({
      targets: dmgFlash, fillAlpha: { from: 0.28, to: 0 },
      duration: 180, ease: "Quad.easeOut", onComplete: () => dmgFlash.destroy(),
    });

    // Red tint + scale punch for immediate impact feel
    ctx.playerSprite.setTint(0xff2200);
    ctx.scene.tweens.killTweensOf(ctx.playerSprite);
    const baseScX = ctx.playerBaseScale ?? ctx.playerSprite.scaleX;
    const baseScY = ctx.playerBaseScale ?? ctx.playerSprite.scaleY;
    ctx.playerSprite.setScale(baseScX, baseScY);
    ctx.scene.tweens.add({
      targets: ctx.playerSprite,
      scaleX: baseScX * 1.18,
      scaleY: baseScY * 1.18,
      duration: 55, yoyo: true, ease: "Power2",
      onComplete: () => {
        if (ctx.playerSprite?.active) {
          ctx.playerSprite.clearTint();
          ctx.playerSprite.setScale(baseScX, baseScY);
        }
      },
    });

    this._spawnDamageNumber(ctx.playerSprite.x, ctx.playerSprite.y - 20, finalDmg);

    if (ctx.playerHp <= 0) {
      this.onGameOver?.();
    }
  }

  private _getDeathProfile(agent: AnyAgent): DeathProfile {
    if (agent instanceof TurretAgent) {
      return {
        burstColor: 0xff6600, shockColor: 0xff9900,
        shakeIntensity: 0.010, shakeDuration: 160,
        sparkCount: 14, sparkColor: 0xff9900,
        coreRadius: 8, burstRadius: 14, burstDuration: 450, shockDuration: 500,
        spriteDeathDelay: 240, spriteSpinRate: 0.0, spriteFade: true, scalePunch: 1.25,
      };
    }
    if (agent instanceof GuardAgent) {
      return {
        burstColor: 0xaa44ff, shockColor: 0xcc66ff,
        shakeIntensity: 0.008, shakeDuration: 130,
        sparkCount: 8, sparkColor: 0xcc66ff,
        coreRadius: 7, burstRadius: 12, burstDuration: 380, shockDuration: 440,
        spriteDeathDelay: 170, spriteSpinRate: 0.012, spriteFade: true, scalePunch: 1.20,
      };
    }
    if (agent instanceof CollectorAgent) {
      return {
        burstColor: 0x44ffcc, shockColor: 0x88ffee,
        shakeIntensity: 0.004, shakeDuration: 80,
        sparkCount: 5, sparkColor: 0x44ffcc,
        coreRadius: 5, burstRadius: 8, burstDuration: 240, shockDuration: 280,
        spriteDeathDelay: 120, spriteSpinRate: 0.018, spriteFade: true, scalePunch: 1.15,
      };
    }
    if (agent instanceof WelderAgent) {
      return {
        burstColor: 0xffcc00, shockColor: 0xffee44,
        shakeIntensity: 0.005, shakeDuration: 90,
        sparkCount: 6, sparkColor: 0xffcc00,
        coreRadius: 5, burstRadius: 9, burstDuration: 260, shockDuration: 300,
        spriteDeathDelay: 130, spriteSpinRate: 0.010, spriteFade: true, scalePunch: 1.15,
      };
    }
    if (agent instanceof SawbladeAgent) {
      return {
        burstColor: 0xdddddd, shockColor: 0xffffff,
        shakeIntensity: 0.007, shakeDuration: 120,
        sparkCount: 12, sparkColor: 0xcccccc,
        coreRadius: 7, burstRadius: 11, burstDuration: 320, shockDuration: 360,
        spriteDeathDelay: 280, spriteSpinRate: 0.030, spriteFade: true, scalePunch: 1.20,
      };
    }
    // EnemyAgent (default drone)
    return {
      burstColor: 0xff4400, shockColor: 0xff6600,
      shakeIntensity: 0.006, shakeDuration: 100,
      sparkCount: 8, sparkColor: 0xff8800,
      coreRadius: 6, burstRadius: 10, burstDuration: 260, shockDuration: 300,
      spriteDeathDelay: 150, spriteSpinRate: 0.008, spriteFade: true, scalePunch: 1.20,
    };
  }

  processDeath(): void {
    const ctx = this.ctx;
    if (ctx.deathQueue.length === 0) return;

    for (const agent of ctx.deathQueue) {
      const pos = agent.getPosition();
      const profile = this._getDeathProfile(agent);

      ctx.ddaSystem.recordKill();
      AudioManager.instance.explosion();

      const comboResult = ctx.comboSystem.onKill();
      ctx.missionSystem.onComboReached(ctx.comboSystem.combo);
      if (ctx.comboSystem.combo >= 3) {
        AudioManager.instance.comboHit(ctx.comboSystem.combo);
      }
      if (comboResult.milestone && !this._milestoneBannerThisFrame) {
        this._milestoneBannerThisFrame = true;
        // World-space placement above the kill position — no screen-space collision
        const mt = ctx.scene.add.text(pos.x, pos.y - 55, comboResult.milestone.label, {
          fontFamily: UI_FONT, fontSize: "26px",
          color: comboResult.milestone.color, fontStyle: "bold",
          stroke: "#000000", strokeThickness: 4,
        }).setOrigin(0.5).setDepth(110).setAlpha(0);
        ctx.scene.tweens.add({
          targets: mt, alpha: 1, scaleX: 1.2, scaleY: 1.2,
          duration: 180, yoyo: true, hold: 500,
          onComplete: () => mt.destroy(),
        });
        Juice.screenShake(ctx.scene, 0.008, 120);
      }
      if (ctx.comboSystem.combo > 1) {
        const mx = ctx.scene.add.text(pos.x + 15, pos.y - 15, `x${comboResult.multiplier.toFixed(1)}`, {
          fontFamily: UI_FONT, fontSize: "16px",
          color: "#ffcc00", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(51);
        ctx.scene.tweens.add({ targets: mx, y: pos.y - 40, alpha: 0, duration: 500, onComplete: () => mx.destroy() });
      }

      Juice.screenShake(ctx.scene, profile.shakeIntensity, profile.shakeDuration);

      // Hit-stop on kill — very brief for feel without causing perceived stutter
      if (this._deathVfxBudgetThisFrame === 0) {
        Juice.hitStop(ctx.scene, 16);
      }

      // Death VFX budget: first 8 deaths per frame get the full 3-ring explosion.
      // Beyond that each death gets a single small shockwave ring only — still
      // communicates the kill without ADD-blend stacking white-out on mass deaths.
      this._deathVfxBudgetThisFrame++;
      if (this._deathVfxBudgetThisFrame <= CombatSystem.MAX_DEATH_VFX) {
        const shockwave = ctx.scene.add.circle(pos.x, pos.y, profile.coreRadius, profile.burstColor, 0.7)
          .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
        ctx.scene.tweens.add({
          targets: shockwave, scaleX: 6, scaleY: 6, alpha: 0,
          duration: profile.burstDuration, ease: "Expo.easeOut",
          onComplete: () => shockwave.destroy(),
        });
        ParticleVFX.explosion(ctx.scene, pos.x, pos.y, profile.burstColor);
        this.deps.deathFX?.spawnDeathEffect(pos.x, pos.y, this.deps.fractureFX?.intensity ?? 0);
        this.deps.dimensionBg?.spawnCrack(pos.x, pos.y);
      }
      this.deps.fractureFX?.onKill(pos.x, pos.y);
      this.deps.glitchEvents?.triggerOnKillStreak(ctx.comboSystem.combo);

      if (
        agent instanceof EnemyAgent || agent instanceof GuardAgent ||
        agent instanceof TurretAgent || agent instanceof SawbladeAgent ||
        agent instanceof WelderAgent
      ) {
        const scrapValue = Phaser.Math.Between(3, 8);
        ctx.scrapManager.spawnScrap(pos.x, pos.y, scrapValue);
        ctx.powerUpSystem.tryDrop(pos.x, pos.y);
      }

      // Per-type sprite death — scale punch, optional spin, fade before destroy
      const sprite = agent.sprite;
      if (sprite && profile.spriteDeathDelay > 0) {
        // Disable physics so dead sprite doesn't collide during fade
        (sprite.body as Phaser.Physics.Arcade.Body | null)?.setEnable(false);
        // Scale punch on death
        sprite.setScale(sprite.scaleX * profile.scalePunch, sprite.scaleY * profile.scalePunch);
        const tweenProps: Phaser.Types.Tweens.TweenBuilderConfig = {
          targets: sprite,
          duration: profile.spriteDeathDelay,
          ease: "Quad.easeIn",
          onComplete: () => { sprite.destroy(); },
        };
        if (profile.spriteFade) (tweenProps as Record<string, unknown>).alpha = 0;
        if (profile.spriteSpinRate > 0) {
          (tweenProps as Record<string, unknown>).angle = sprite.angle + profile.spriteSpinRate * profile.spriteDeathDelay * (180 / Math.PI);
        }
        ctx.scene.tweens.add(tweenProps);
      } else {
        sprite?.destroy();
      }
      const glow = ctx.enemyGlows.get(agent.id);
      if (glow) { glow.destroy(); ctx.enemyGlows.delete(agent.id); }
      ctx.killCount++;
      ctx.missionSystem.onKill();

      this.onAddKill?.(pos);

      // Kill confirmation tick — only show for first 2 deaths per frame
      if (this._deathVfxBudgetThisFrame <= 2) {
        const kc = ctx.scene.add.text(
          ctx.playerSprite.x + (Math.random() - 0.5) * 30,
          ctx.playerSprite.y - 28,
          "✓", {
            fontFamily: UI_FONT, fontSize: "16px",
            color: "#44ff88", fontStyle: "bold",
            stroke: "#003311", strokeThickness: 2,
          },
        ).setOrigin(0.5).setDepth(71).setScale(0.6);
        ctx.scene.tweens.add({
          targets: kc, scaleX: 1.0, scaleY: 1.0, alpha: { from: 1, to: 0 },
          y: kc.y - 20, duration: 500, ease: "Power2",
          onComplete: () => kc.destroy(),
        });
      }

      if (agent.isStaggered) {
        this._spreadFear(pos);
      }

      const prevHp = ctx.playerHp;
      const killHeal = 3 + ctx.upgradeSystem.killRegenBonus;
      ctx.playerHp = Math.min(ctx.playerStats.maxHp, ctx.playerHp + killHeal);
      // Show heal number only if HP actually increased (not already at max)
      if (ctx.playerHp > prevHp && this._deathVfxBudgetThisFrame <= 3) {
        this.spawnHealNumber(
          ctx.playerSprite.x + (Math.random() - 0.5) * 28,
          ctx.playerSprite.y - 14,
          Math.round(ctx.playerHp - prevHp),
        );
        ParticleVFX.healBurst(ctx.scene, ctx.playerSprite.x, ctx.playerSprite.y);
      }

      // Score pop — budgeted to avoid mass text-object creation
      if (this._deathVfxBudgetThisFrame <= 3) {
        const scoreVal = Math.round(10 * comboResult.multiplier);
        const scorePop = ctx.scene.add.text(pos.x, pos.y - 10, `+${scoreVal}`, {
          fontFamily: UI_FONT, fontSize: "14px",
          color: ctx.comboSystem.combo >= 5 ? "#ffdd00" : "#00ff88",
          fontStyle: "bold", stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(55);
        ctx.scene.tweens.add({
          targets: scorePop, y: pos.y - 50, alpha: 0, duration: 700, ease: "Power2",
          onComplete: () => scorePop.destroy(),
        });
      }
    }

    ctx.enemies    = ctx.enemies.filter(a => !a.isDead);
    ctx.guards     = ctx.guards.filter(a => !a.isDead);
    ctx.collectors = ctx.collectors.filter(a => !a.isDead);
    ctx.turrets    = ctx.turrets.filter(a => !a.isDead);
    ctx.sawblades  = ctx.sawblades.filter(a => !a.isDead);
    ctx.welders    = ctx.welders.filter(a => !a.isDead);
    ctx.allAgents  = [
      ...ctx.enemies, ...ctx.guards, ...ctx.collectors,
      ...ctx.turrets, ...ctx.sawblades, ...ctx.welders,
    ];
    ctx.deathQueue.length = 0;
  }

  firePlasmaBeam(angle: number): void {
    const ctx = this.ctx;
    AudioManager.instance.plasmaRelease();
    Juice.screenShake(ctx.scene, 0.018, 280);
    const BEAM_LENGTH = 420;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const bx2 = ctx.playerSprite.x + cos * BEAM_LENGTH;
    const by2 = ctx.playerSprite.y + sin * BEAM_LENGTH;

    const beam = ctx.scene.add.graphics().setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
    beam.lineStyle(6, 0x00ffdd, 0.95);
    beam.lineBetween(ctx.playerSprite.x, ctx.playerSprite.y, bx2, by2);
    beam.lineStyle(22, 0x00ffdd, 0.25);
    beam.lineBetween(ctx.playerSprite.x, ctx.playerSprite.y, bx2, by2);
    ctx.scene.tweens.add({ targets: beam, alpha: 0, duration: 320, onComplete: () => beam.destroy() });

    const origin = ctx.scene.add.circle(ctx.playerSprite.x, ctx.playerSprite.y, 18, 0x00ffdd, 0.7)
      .setDepth(57).setBlendMode(Phaser.BlendModes.ADD);
    ctx.scene.tweens.add({ targets: origin, alpha: 0, scaleX: 3, scaleY: 3, duration: 300, onComplete: () => origin.destroy() });

    const BEAM_HALF_W = 22;
    let hits = 0;
    for (const agent of [...ctx.allAgents]) {
      if (agent.isDead) continue;
      if (!this._isAgentInCurrentWorld(agent)) continue;
      const dx = agent.posX - ctx.playerSprite.x;
      const dy = agent.posY - ctx.playerSprite.y;
      const along = dx * cos + dy * sin;
      const perp = Math.abs(-dx * sin + dy * cos);
      if (along > 0 && along < BEAM_LENGTH && perp < BEAM_HALF_W) {
        agent.takeDamage(ctx.playerStats.damage * 5);
        this._addStaggerDamage(agent, ctx.playerStats.damage * 5);
        hits++;
        this._spawnHitSparks(
          ctx.playerSprite.x + cos * along,
          ctx.playerSprite.y + sin * along,
          0x00ffdd, 4,
        );
        if (agent.isDead && !ctx.deathQueue.includes(agent)) {
          ctx.deathQueue.push(agent);
        }
      }
    }

    if (hits > 0) {
      const hitTxt = ctx.scene.add.text(
        ctx.playerSprite.x + cos * 90,
        ctx.playerSprite.y + sin * 90 - 18,
        `PLASMA ×${hits}`, {
          fontFamily: UI_FONT, fontSize: "17px", color: "#00ffdd",
          fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
        },
      ).setOrigin(0.5).setDepth(70);
      ctx.scene.tweens.add({ targets: hitTxt, y: hitTxt.y - 45, alpha: 0, duration: 900, onComplete: () => hitTxt.destroy() });
    }
  }

  spawnHitSparks(x: number, y: number, color: number, count = 3): void {
    this._spawnHitSparks(x, y, color, count);
  }

  private _spawnHitSparks(x: number, y: number, color: number, count = 3): void {
    AudioManager.instance.hit();

    this._sparkBudgetThisFrame++;
    if (this._sparkBudgetThisFrame > 4) return;

    const ctx = this.ctx;
    const flash = ctx.scene.add.circle(x, y, 6, 0xffffff, 0.85)
      .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
    ctx.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 2, scaleY: 2,
      duration: 70, onComplete: () => flash.destroy(),
    });

    // Particle sparks only for first 2 hits per frame
    if (this._sparkBudgetThisFrame <= 2) {
      ParticleVFX.hitSparks(ctx.scene, x, y, color, Math.min(count, 2));
    }
  }

  // ── Damage number visual grammar ─────────────────────────────────────────────
  // All floating combat text flows through these four helpers so the visual
  // language is consistent and easy to tune in one place.

  /** Player took damage — large red, fast rise, scale punch. */
  private _spawnDamageNumber(x: number, y: number, amount: number): void {
    const scene = this.ctx.scene;
    // Slight random horizontal scatter so numbers don't stack on repeated hits
    const ox = (Math.random() - 0.5) * 24;
    const txt = scene.add.text(x + ox, y, `-${amount}`, {
      fontFamily: UI_FONT, fontSize: "22px",
      color: "#ff3300", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(72).setScale(0.6);
    scene.tweens.add({
      targets: txt, scaleX: 1, scaleY: 1,
      duration: 80, ease: "Back.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: txt, y: y - 52, alpha: 0,
          duration: 650, ease: "Power2",
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  /** Enemy took a normal hit — small white/grey, gentle drift, not distracting. */
  private _spawnEnemyHitNumber(x: number, y: number, amount: number): void {
    const scene = this.ctx.scene;
    const ox = (Math.random() - 0.5) * 18;
    const txt = scene.add.text(x + ox, y - 16, `${amount}`, {
      fontFamily: UI_FONT, fontSize: "15px",
      color: "#e0e0e0", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(56);
    scene.tweens.add({
      targets: txt, y: y - 44, alpha: 0,
      duration: 520, ease: "Power1",
      onComplete: () => txt.destroy(),
    });
  }

  /** Enemy hit triggered a stagger — golden "CRIT" burst with scale punch. */
  private _spawnCritNumber(x: number, y: number, amount: number): void {
    const scene = this.ctx.scene;
    // Number itself
    const txt = scene.add.text(x, y - 10, `${amount}!`, {
      fontFamily: UI_FONT, fontSize: "20px",
      color: "#ffcc00", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(73).setScale(0.5);
    scene.tweens.add({
      targets: txt, scaleX: 1.3, scaleY: 1.3,
      duration: 100, ease: "Back.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: txt, y: y - 58, alpha: 0, scaleX: 0.8, scaleY: 0.8,
          duration: 600, ease: "Power2",
          onComplete: () => txt.destroy(),
        });
      },
    });
    // Small star-burst ring
    const ring = scene.add.circle(x, y - 10, 4, 0xffcc00, 0)
      .setDepth(72).setBlendMode(Phaser.BlendModes.ADD);
    ring.setStrokeStyle(2, 0xffcc00, 1);
    scene.tweens.add({
      targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 260, ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  /** Player healed (on-kill regen) — small green, drifts downward (filling feel). */
  spawnHealNumber(x: number, y: number, amount: number): void {
    const scene = this.ctx.scene;
    const txt = scene.add.text(x + (Math.random() - 0.5) * 20, y - 8, `+${amount}`, {
      fontFamily: UI_FONT, fontSize: "13px",
      color: "#44ff88", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(54);
    scene.tweens.add({
      targets: txt, y: y + 22, alpha: 0,
      duration: 580, ease: "Power1",
      onComplete: () => txt.destroy(),
    });
  }

  /** Returns true if this hit triggered a stagger (used to pick crit vs normal number). */
  private _addStaggerDamage(agent: AnyAgent, damage: number): boolean {
    if (agent.isStaggered) return false;
    agent.staggerGauge += damage * 0.35;
    if (agent.staggerGauge >= 100) {
      agent.isStaggered = true;
      agent.staggerTimer = 1500;
      agent.staggerGauge = 0;
      if (agent.sprite?.active) {
        agent.sprite.setTint(0xffffff);
        // Scale punch — makes the stagger feel weighty
        const sx = agent.sprite.scaleX, sy = agent.sprite.scaleY;
        this.ctx.scene.tweens.add({
          targets: agent.sprite,
          scaleX: sx * 1.25, scaleY: sy * 1.25,
          duration: 60, yoyo: true, ease: "Back.easeOut",
          onComplete: () => { if (agent.sprite?.active) agent.sprite.setScale(sx, sy); },
        });
      }
      // Upgraded STAGGER label — slightly larger, holds longer before fading
      const txt = this.ctx.scene.add.text(agent.posX, agent.posY - 18, "STAGGER!", {
        fontFamily: UI_FONT, fontSize: "13px", color: "#ffffff",
        fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(70).setScale(0.7);
      this.ctx.scene.tweens.add({
        targets: txt, scaleX: 1, scaleY: 1, duration: 100, ease: "Back.easeOut",
        onComplete: () => {
          this.ctx.scene.tweens.add({
            targets: txt, y: txt.y - 28, alpha: 0,
            duration: 700, delay: 150,
            onComplete: () => txt.destroy(),
          });
        },
      });
      AudioManager.instance.staggerHit();
      this._chainShockCount++;
      AudioManager.instance.chainShock(this._chainShockCount);
      return true;
    }
    return false;
  }

  private _spreadFear(pos: { x: number; y: number }): void {
    const FEAR_RADIUS2 = 200 * 200;
    for (const agent of this.ctx.enemies) {
      if (agent.isDead) continue;
      if (!this._isAgentInCurrentWorld(agent)) continue;
      const dx = agent.posX - pos.x;
      const dy = agent.posY - pos.y;
      if (dx * dx + dy * dy < FEAR_RADIUS2) {
        if (!agent.isStaggered) {
          agent.isFearing = true;
          agent.fearTimer = 2200;
          if (agent.sprite?.active) agent.sprite.setTint(0xff8800);
        }
      }
    }
  }

  private _reflectBullet(p: Projectile): void {
    const body = p.sprite.body as Phaser.Physics.Arcade.Body;
    // Preserve the bullet's actual speed; reverse direction exactly
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2) || 400;
    const reflectAngle = Math.atan2(-body.velocity.y, -body.velocity.x);

    ShootSkill.fireImmediate(p.sprite.x, p.sprite.y, reflectAngle, {
      damage: p.damage,
      range: 500,
      speed,
      tint: 0x44ffcc,
      ownerId: -1,  // player-owned: hits enemies, not the player
    });

    // Reflected bullet visual punch — cyan ring burst at impact point
    const scene = this.ctx.scene;
    const ring = scene.add.circle(p.sprite.x, p.sprite.y, 6, 0x44ffcc, 0)
      .setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
    ring.setStrokeStyle(2, 0x44ffcc, 1);
    scene.tweens.add({
      targets: ring, scaleX: 7, scaleY: 7, alpha: 0,
      duration: 220, ease: "Quad.easeOut", onComplete: () => ring.destroy(),
    });
    const flash = scene.add.circle(p.sprite.x, p.sprite.y, 9, 0xaaffff, 0.8)
      .setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 2.5, scaleY: 2.5,
      duration: 120, onComplete: () => flash.destroy(),
    });

    AudioManager.instance.shieldAbsorb();
  }

  private _enemyDamage(agent: { damageMultiplier?: number }, baseDamage: number): number {
    return Math.max(1, Math.round(baseDamage * (agent.damageMultiplier ?? 1)));
  }

  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    return this.ctx.worldManager.isAgentInCurrentWorld(agent);
  }

  // O(1) agent lookup by id — rebuilt lazily when allAgents changes
  private _agentMap = new Map<number, AnyAgent>();
  private _agentMapGeneration = -1;

  private _getAgentMap(): Map<number, AnyAgent> {
    const agents = this.ctx.allAgents;
    // Rebuild only when the array length changes (new wave or death)
    if (agents.length !== this._agentMapGeneration) {
      this._agentMap.clear();
      for (const a of agents) this._agentMap.set(a.id, a);
      this._agentMapGeneration = agents.length;
    }
    return this._agentMap;
  }

  private _isOwnerInCurrentWorld(ownerId: number): boolean {
    if (ownerId < 0) return true;
    if (this.ctx.boss && ownerId === this.ctx.boss.id) return true;
    const agent = this._getAgentMap().get(ownerId);
    return agent ? this._isAgentInCurrentWorld(agent) : true;
  }

  private _isOwnerBreaching(ownerId: number): boolean {
    const agent = this._getAgentMap().get(ownerId);
    if (!agent) return false;
    const breach = (agent as GuardAgent | CollectorAgent).breach;
    return breach?.isActive ?? false;
  }

}
