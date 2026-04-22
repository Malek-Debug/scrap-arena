import Phaser from "phaser";
import { WorldType, GAME_WIDTH, GAME_HEIGHT } from "../core";
import type { GameContext, AnyAgent } from "./GameContext";
import { EnemyAgent } from "../agents/EnemyAgent";
import { GuardAgent } from "../agents/GuardAgent";
import { CollectorAgent } from "../agents/CollectorAgent";
import { TurretAgent } from "../agents/TurretAgent";
import { SawbladeAgent } from "../agents/SawbladeAgent";
import { Juice } from "../rendering";
import { AudioManager } from "../audio";
import { ShootSkill } from "../ai/skills/ShootSkill";
import type { Projectile } from "../ai/skills/ShootSkill";
import type { FractureFX, DeathFX } from "../rendering";
import type { DimensionBackground } from "../rendering";
import type { GlitchEvents } from "../rendering";

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

  checkCollisions(deltaMs: number): void {
    this._sparkBudgetThisFrame = 0;
    const ctx = this.ctx;
    const projectiles = ShootSkill.activeProjectiles;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.active) continue;

      if (ctx.mapObstacles.bulletHit(p.sprite.x, p.sprite.y, p.damage)) {
        ShootSkill.recycleProjectile(p);
        continue;
      }

      if (p.ownerId === -1 || p.ownerId === -2) {
        for (const agent of ctx.allAgents) {
          if (agent.isDead || !agent.sprite) continue;
          const breach = (agent as GuardAgent | CollectorAgent).breach;
          const isBreachActive = breach?.isActive ?? false;
          if (!this._isAgentInCurrentWorld(agent) && !isBreachActive) continue;
          const dx = p.sprite.x - agent.posX;
          const dy = p.sprite.y - agent.posY;
          if (dx * dx + dy * dy < 1024) {
            agent.takeDamage(p.damage);
            this._addStaggerDamage(agent, p.damage);
            if (agent.sprite && !agent.isStaggered) {
              agent.sprite.setTint(0xffffff);
              ctx.scene.time.delayedCall(80, () => { if (agent.sprite?.active && !agent.isStaggered) agent.sprite.clearTint(); });
            }
            this._spawnHitSparks(p.sprite.x, p.sprite.y, p.ownerId === -2 ? 0xcc44ff : 0x00ff88);
            ShootSkill.recycleProjectile(p);
            break;
          }
        }
        if (ctx.boss && !ctx.boss.isDead && p.active) {
          const dx = p.sprite.x - ctx.boss.posX;
          const dy = p.sprite.y - ctx.boss.posY;
          if (dx * dx + dy * dy < 2500) {
            ctx.boss.takeDamage(p.damage);
            if (ctx.boss.sprite) {
              ctx.boss.sprite.setTint(0xffffff);
              ctx.scene.time.delayedCall(80, () => { if (ctx.boss?.sprite?.active) ctx.boss.sprite.setTint(0xff2200); });
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
          if (ctx.abilityShieldActive && ctx.upgradeSystem.mirrorPlatingLevel > 0) {
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
          this.damagePlayer(12, guard.posX, guard.posY);
          ctx.contactDamageCooldown = 600;
          Juice.screenShake(ctx.scene, 0.01, 150);
          const warn = ctx.scene.add.text(guard.posX, guard.posY - 20, "⚠ BREACH!", {
            fontFamily: "monospace", fontSize: "14px", color: "#ff00ff", fontStyle: "bold",
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
          this.damagePlayer(5, enemy.posX, enemy.posY);
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
          this.damagePlayer(saw.contactDamage, saw.posX, saw.posY);
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
    }
    const armorReduction = ctx.upgradeSystem.armorLevel * 0.12;
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
    Juice.screenShake(ctx.scene, 0.012, 180);
    this.deps.fractureFX?.onPlayerDamage();

    // Red tint + scale punch for immediate impact feel
    ctx.playerSprite.setTint(0xff2200);
    ctx.scene.tweens.add({
      targets: ctx.playerSprite,
      scaleX: ctx.playerSprite.scaleX * 1.18,
      scaleY: ctx.playerSprite.scaleY * 1.18,
      duration: 55, yoyo: true, ease: "Power2",
      onComplete: () => {
        if (ctx.playerSprite?.active) ctx.playerSprite.clearTint();
      },
    });

    this._spawnDamageNumber(ctx.playerSprite.x, ctx.playerSprite.y - 20, finalDmg);

    if (ctx.playerHp <= 0) {
      this.onGameOver?.();
    }
  }

  processDeath(): void {
    const ctx = this.ctx;
    if (ctx.deathQueue.length === 0) return;

    for (const agent of ctx.deathQueue) {
      const pos = agent.getPosition();

      ctx.ddaSystem.recordKill();
      AudioManager.instance.explosion();

      const comboResult = ctx.comboSystem.onKill();
      ctx.missionSystem.onComboReached(ctx.comboSystem.combo);
      if (ctx.comboSystem.combo >= 3) {
        AudioManager.instance.comboHit(ctx.comboSystem.combo);
      }
      if (comboResult.milestone) {
        const mt = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, comboResult.milestone.label, {
          fontFamily: "monospace", fontSize: "32px",
          color: comboResult.milestone.color, fontStyle: "bold",
          stroke: "#000000", strokeThickness: 4,
        }).setOrigin(0.5).setDepth(110).setAlpha(0).setScrollFactor(0);
        ctx.scene.tweens.add({
          targets: mt, alpha: 1, scaleX: 1.3, scaleY: 1.3,
          duration: 200, yoyo: true, hold: 600,
          onComplete: () => mt.destroy(),
        });
        Juice.screenShake(ctx.scene, 0.008, 120);
      }
      if (ctx.comboSystem.combo > 1) {
        const mx = ctx.scene.add.text(pos.x + 15, pos.y - 15, `x${comboResult.multiplier.toFixed(1)}`, {
          fontFamily: "monospace", fontSize: "16px",
          color: "#ffcc00", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(51);
        ctx.scene.tweens.add({ targets: mx, y: pos.y - 40, alpha: 0, duration: 500, onComplete: () => mx.destroy() });
      }

      Juice.screenShake(ctx.scene, 0.006, 100);

      const core = ctx.scene.add.circle(pos.x, pos.y, 6, 0xffffff, 1)
        .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: core, alpha: 0, scaleX: 4, scaleY: 4,
        duration: 120, onComplete: () => core.destroy(),
      });

      const burst = ctx.scene.add.circle(pos.x, pos.y, 10, 0xff4400, 0.8)
        .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: burst, alpha: 0, scaleX: 4, scaleY: 4,
        duration: 350, ease: "Quad.easeOut",
        onComplete: () => burst.destroy(),
      });

      const shockwave = ctx.scene.add.circle(pos.x, pos.y, 5, 0xff8800, 0)
        .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
      shockwave.setStrokeStyle(2, 0xff6600, 0.7);
      ctx.scene.tweens.add({
        targets: shockwave, scaleX: 8, scaleY: 8, alpha: 0,
        duration: 400, ease: "Quad.easeOut",
        onComplete: () => shockwave.destroy(),
      });

      this._spawnHitSparks(pos.x, pos.y, 0xff8800, 8);

      this.deps.deathFX?.spawnDeathEffect(pos.x, pos.y, this.deps.fractureFX?.intensity ?? 0);
      this.deps.fractureFX?.onKill(pos.x, pos.y);
      this.deps.dimensionBg?.spawnCrack(pos.x, pos.y);
      this.deps.glitchEvents?.triggerOnKillStreak(ctx.killCount + 1);

      if (
        agent instanceof EnemyAgent || agent instanceof GuardAgent ||
        agent instanceof TurretAgent || agent instanceof SawbladeAgent
      ) {
        const scrapValue = Phaser.Math.Between(3, 8);
        ctx.scrapManager.spawnScrap(pos.x, pos.y, scrapValue);
        ctx.powerUpSystem.tryDrop(pos.x, pos.y);
      }

      agent.sprite?.destroy();
      const glow = ctx.enemyGlows.get(agent.id);
      if (glow) { glow.destroy(); ctx.enemyGlows.delete(agent.id); }
      ctx.killCount++;
      ctx.missionSystem.onKill();

      this.onAddKill?.(pos);

      if (agent.isStaggered) {
        this._spreadFear(pos);
      }

      ctx.playerHp = Math.min(ctx.playerStats.maxHp, ctx.playerHp + 3);

      const scoreVal = Math.round(10 * comboResult.multiplier);
      const scorePop = ctx.scene.add.text(pos.x, pos.y - 10, `+${scoreVal}`, {
        fontFamily: "monospace", fontSize: "14px",
        color: ctx.comboSystem.combo >= 5 ? "#ffdd00" : "#00ff88",
        fontStyle: "bold", stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(55);
      ctx.scene.tweens.add({
        targets: scorePop, y: pos.y - 50, alpha: 0, duration: 700, ease: "Power2",
        onComplete: () => scorePop.destroy(),
      });
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
          fontFamily: "monospace", fontSize: "17px", color: "#00ffdd",
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
    const ctx = this.ctx;
    AudioManager.instance.hit();

    this._sparkBudgetThisFrame++;
    if (this._sparkBudgetThisFrame > 4) return;

    const flash = ctx.scene.add.circle(x, y, 8, 0xffffff, 0.9)
      .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
    ctx.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 2.5, scaleY: 2.5,
      duration: 80, onComplete: () => flash.destroy(),
    });

    const ring = ctx.scene.add.circle(x, y, 3, color, 0.5)
      .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    ring.setStrokeStyle(2, color, 0.8);
    ctx.scene.tweens.add({
      targets: ring, scaleX: 6, scaleY: 6, alpha: 0,
      duration: 200, ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });

    const actualCount = this._sparkBudgetThisFrame > 2 ? 1 : count;
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(15, 40);
      const size = 1 + Math.random() * 2;
      const spark = ctx.scene.add.circle(x, y, size, color, 1).setDepth(15)
        .setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        duration: 150 + Math.random() * 100,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private _spawnDamageNumber(x: number, y: number, amount: number): void {
    const txt = this.ctx.scene.add.text(x, y, `-${amount}`, {
      fontFamily: "monospace", fontSize: "14px",
      color: "#ff4444", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(50);
    this.ctx.scene.tweens.add({
      targets: txt, y: y - 30, alpha: 0,
      duration: 600, ease: "Power2",
      onComplete: () => txt.destroy(),
    });
  }

  private _addStaggerDamage(agent: AnyAgent, damage: number): void {
    if (agent.isStaggered) return;
    agent.staggerGauge += damage * 0.35;
    if (agent.staggerGauge >= 100) {
      agent.isStaggered = true;
      agent.staggerTimer = 1500;
      agent.staggerGauge = 0;
      if (agent.sprite?.active) agent.sprite.setTint(0xffffff);
      const txt = this.ctx.scene.add.text(agent.posX, agent.posY - 18, "STAGGER!", {
        fontFamily: "monospace", fontSize: "11px", color: "#ffffff",
        fontStyle: "bold", stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(70);
      this.ctx.scene.tweens.add({
        targets: txt, y: txt.y - 22, alpha: 0, duration: 600,
        onComplete: () => txt.destroy(),
      });
      AudioManager.instance.staggerHit();
      this._chainShockCount++;
      AudioManager.instance.chainShock(this._chainShockCount);
    }
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
    let nearestDist2 = Infinity;
    let nearestAgent: AnyAgent | null = null;
    for (const agent of this.ctx.allAgents) {
      if (agent.isDead) continue;
      if (!this._isAgentInCurrentWorld(agent)) continue;
      const dx = agent.posX - p.sprite.x;
      const dy = agent.posY - p.sprite.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist2) { nearestDist2 = d2; nearestAgent = agent; }
    }
    const tx = nearestAgent?.posX ?? (this.ctx.playerSprite.x + Math.cos(Math.random() * Math.PI * 2) * 150);
    const ty = nearestAgent?.posY ?? (this.ctx.playerSprite.y + Math.sin(Math.random() * Math.PI * 2) * 150);
    const reflectAngle = Math.atan2(ty - p.sprite.y, tx - p.sprite.x);
    ShootSkill.fireImmediate(p.sprite.x, p.sprite.y, reflectAngle, {
      damage: Math.round(p.damage * 1.2),
      range: 340, speed: 520, tint: 0x44ffcc, ownerId: -1,
    });
    AudioManager.instance.shieldAbsorb();
  }

  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    const w = this.ctx.worldManager.currentWorld;
    if (w === WorldType.FOUNDRY) {
      return agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent;
    } else {
      return !(agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent);
    }
  }

  private _isOwnerInCurrentWorld(ownerId: number): boolean {
    if (ownerId < 0) return true;
    if (this.ctx.boss && ownerId === this.ctx.boss.id) return true;
    const agent = this.ctx.allAgents.find(a => a.id === ownerId);
    return agent ? this._isAgentInCurrentWorld(agent) : true;
  }

  private _isOwnerBreaching(ownerId: number): boolean {
    const agent = this.ctx.allAgents.find(a => a.id === ownerId);
    if (!agent) return false;
    const breach = (agent as GuardAgent | CollectorAgent).breach;
    return breach?.isActive ?? false;
  }

}
