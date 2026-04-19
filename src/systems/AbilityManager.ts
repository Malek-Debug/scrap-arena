import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import type { GameContext } from "./GameContext";
import { Juice } from "../rendering";
import { AudioManager } from "../audio";
import { ShootSkill } from "../ai/skills/ShootSkill";

/**
 * AbilityManager — handles the four special abilities (E/R/F/C keys),
 * their cooldowns, VFX, and shield/chrono timers.
 */
export class AbilityManager {
  private ctx: GameContext;

  // Ability keys
  private eKey: Phaser.Input.Keyboard.Key;
  private rKey: Phaser.Input.Keyboard.Key;
  private fKey: Phaser.Input.Keyboard.Key;
  private cKey: Phaser.Input.Keyboard.Key;

  // Chrono Pulse state (owned here; expose via getter for AI tick)
  private _chronoActive = false;
  private _chronoTimer = 0;

  // Callback for spawning VFX sparks from the combat system
  private onSpawnHitSparks: (x: number, y: number, color: number, count?: number) => void;

  constructor(
    ctx: GameContext,
    keys: {
      eKey: Phaser.Input.Keyboard.Key;
      rKey: Phaser.Input.Keyboard.Key;
      fKey: Phaser.Input.Keyboard.Key;
      cKey: Phaser.Input.Keyboard.Key;
    },
    onSpawnHitSparks: (x: number, y: number, color: number, count?: number) => void,
  ) {
    this.ctx = ctx;
    this.eKey = keys.eKey;
    this.rKey = keys.rKey;
    this.fKey = keys.fKey;
    this.cKey = keys.cKey;
    this.onSpawnHitSparks = onSpawnHitSparks;
  }

  get chronoActive(): boolean {
    return this._chronoActive;
  }

  /**
   * Call once per frame. Handles cooldown ticking, key input, and timer countdowns.
   */
  update(deltaMs: number): void {
    const ctx = this.ctx;
    const abilitySystem = ctx.abilitySystem;

    // Capture ready-state BEFORE the cooldown tick to detect the exact frame each ability finishes
    const wasReady = {
      nova_burst:   abilitySystem.canUse("nova_burst"),
      phase_surge:  abilitySystem.canUse("phase_surge"),
      scrap_shield: abilitySystem.canUse("scrap_shield"),
      chrono_pulse: abilitySystem.canUse("chrono_pulse"),
    };

    abilitySystem.update(deltaMs);

    // Play a soft ready-chime when a cooldown just hit zero
    if (!wasReady.nova_burst   && abilitySystem.canUse("nova_burst"))
      AudioManager.instance.abilityReady("nova_burst");
    if (!wasReady.phase_surge  && abilitySystem.canUse("phase_surge"))
      AudioManager.instance.abilityReady("phase_surge");
    if (!wasReady.scrap_shield && abilitySystem.canUse("scrap_shield"))
      AudioManager.instance.abilityReady("scrap_shield");
    if (!wasReady.chrono_pulse && abilitySystem.canUse("chrono_pulse"))
      AudioManager.instance.abilityReady("chrono_pulse");

    if (Phaser.Input.Keyboard.JustDown(this.eKey) && abilitySystem.canUse("nova_burst")) {
      abilitySystem.trigger("nova_burst");
      this._triggerNovaBurst();
      ctx.missionSystem.onAbilityUse();
    }
    if (Phaser.Input.Keyboard.JustDown(this.rKey) && abilitySystem.canUse("phase_surge")) {
      abilitySystem.trigger("phase_surge");
      this._triggerPhaseSurge();
      ctx.missionSystem.onAbilityUse();
    }
    if (Phaser.Input.Keyboard.JustDown(this.fKey) && abilitySystem.canUse("scrap_shield")) {
      abilitySystem.trigger("scrap_shield");
      this._triggerScrapShield();
      ctx.missionSystem.onAbilityUse();
    }
    if (Phaser.Input.Keyboard.JustDown(this.cKey) && abilitySystem.canUse("chrono_pulse")) {
      abilitySystem.trigger("chrono_pulse");
      this._triggerChronoPulse();
      ctx.missionSystem.onAbilityUse();
    }

    // Chrono Pulse timer
    if (this._chronoActive) {
      this._chronoTimer -= deltaMs;
      ShootSkill.chronoCenter.x = ctx.playerSprite.x;
      ShootSkill.chronoCenter.y = ctx.playerSprite.y;
      if (this._chronoTimer <= 0) {
        this._chronoActive = false;
        ShootSkill.chronoActive = false;
      }
    }

    // Shield timer
    if (ctx.abilityShieldActive) {
      ctx.abilityShieldTimer -= deltaMs;
      if (ctx.abilityShieldTimer <= 0) {
        ctx.abilityShieldActive = false;
        ctx.abilityShieldGfx?.destroy();
        ctx.abilityShieldGfx = null;
      } else if (ctx.abilityShieldGfx) {
        ctx.abilityShieldGfx.setPosition(ctx.playerSprite.x, ctx.playerSprite.y);
        ctx.abilityShieldGfx.setAlpha(0.4 + 0.2 * Math.sin(performance.now() * 0.01));
      }
    }
  }

  private _triggerNovaBurst(): void {
    const { playerSprite, playerStats, scene } = this.ctx;
    const cx = playerSprite.x;
    const cy = playerSprite.y;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      ShootSkill.fireImmediate(cx, cy, angle, {
        damage: playerStats.damage * 1.5,
        range: 420, speed: 480, tint: 0x00ffff, ownerId: -1,
      });
    }
    const ring = scene.add.circle(cx, cy, 10, 0x00ffff, 0.5)
      .setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: ring, scaleX: 9, scaleY: 9, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    this.onSpawnHitSparks(cx, cy, 0x00ffff, 10);
    Juice.screenShake(scene, 0.007, 120);
    AudioManager.instance.novaBurst();
  }

  private _triggerPhaseSurge(): void {
    const { playerSprite, playerStats, scene } = this.ctx;
    const cx = playerSprite.x;
    const cy = playerSprite.y;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      ShootSkill.fireImmediate(cx, cy, angle, {
        damage: playerStats.damage * 2,
        range: 550, speed: 620, tint: 0xcc44ff, ownerId: -1,
      });
    }
    const ring = scene.add.circle(cx, cy, 8, 0xcc44ff, 0.6)
      .setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: ring, scaleX: 10, scaleY: 10, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
    this.onSpawnHitSparks(cx, cy, 0xcc44ff, 8);
    Juice.screenShake(scene, 0.006, 100);
    AudioManager.instance.phaseSurge();
  }

  private _triggerScrapShield(): void {
    const { playerSprite, scene } = this.ctx;
    this.ctx.abilityShieldActive = true;
    this.ctx.abilityShieldTimer = 4000;
    this.ctx.abilityShieldGfx?.destroy();
    this.ctx.abilityShieldGfx = scene.add.arc(
      playerSprite.x, playerSprite.y, 28, 0, 360, false, 0x44ff88, 0.5,
    ).setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
    this.ctx.abilityShieldGfx.setStrokeStyle(2, 0x44ff88, 0.9);
    Juice.screenShake(scene, 0.004, 80);
    AudioManager.instance.shieldUp();
  }

  private _triggerChronoPulse(): void {
    const { playerSprite, scene } = this.ctx;
    this._chronoActive = true;
    this._chronoTimer = 3000;
    ShootSkill.chronoActive = true;
    ShootSkill.chronoCenter.x = playerSprite.x;
    ShootSkill.chronoCenter.y = playerSprite.y;
    AudioManager.instance.chronoPulse();
    Juice.screenShake(scene, 0.01, 200);
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.circle(playerSprite.x, playerSprite.y, 5, 0x44ccff, 0)
        .setDepth(60).setBlendMode(Phaser.BlendModes.ADD);
      ring.setStrokeStyle(2, 0x44ccff, 0.9);
      scene.tweens.add({
        targets: ring, scaleX: 35, scaleY: 35, alpha: 0,
        delay: i * 160, duration: 700, ease: "Quad.easeOut",
        onComplete: () => ring.destroy(),
      });
    }
    const overlay = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x224488, 0.12)
      .setOrigin(0).setScrollFactor(0).setDepth(95);
    scene.tweens.add({ targets: overlay, alpha: 0, duration: 3000, onComplete: () => overlay.destroy() });
  }
}
