import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H } from "../core";
import type { WaveEvent } from "../core";
import type { GameContext } from "./GameContext";
import type { HUDManager } from "./HUDManager";
import { EnemyAgent } from "../agents/EnemyAgent";
import { GuardAgent } from "../agents/GuardAgent";
import { CollectorAgent } from "../agents/CollectorAgent";
import { TurretAgent } from "../agents/TurretAgent";
import { SawbladeAgent } from "../agents/SawbladeAgent";
import { WelderAgent } from "../agents/WelderAgent";
import { BossAgent } from "../agents/BossAgent";
import { SteeringBehaviors } from "../ai/SteeringBehaviors";
import type { PlayerPredictor } from "../ai/PlayerPredictor";
import type { FractureFX } from "../rendering";
import { Juice } from "../rendering";
import { UI_FONT, constrainTextBlock, drawPanel } from "../rendering/UITheme";
import { AudioManager } from "../audio";

export interface WaveOrchestratorDeps {
  hudManager: HUDManager;
  fractureFX?: FractureFX;
  playerPredictor: PlayerPredictor;
  onShowStoryHint?: (msg: string, dur?: number) => void;
  onRestoreStoryPower?: () => void;
  getStoryPhase?: () => string;
  onShowRoomUnlockedNotification?: (name: string) => void;
  onNarrativeWaveStart?: (wave: number) => void;
  onNarrativeWaveClear?: (wave: number) => void;
  onNarrativeBossSpawn?: (wave: number) => void;
  onNarrativeBossKill?: (wave: number) => void;
  onClearTriggeredRooms?: () => void;
  getMaxStreak?: () => number;
  onBossPhaseTransition?: (phase: number) => void;
  onFirstEnemyTypeSeen?: (type: 'guard' | 'collector' | 'sawblade' | 'welder' | 'turret') => void;
}

/**
 * WaveOrchestrator — manages wave lifecycle: spawning, boss fights, wave-clear detection.
 */
export class WaveOrchestrator {
  private ctx: GameContext;
  private deps: WaveOrchestratorDeps;
  currentWaveEvent: WaveEvent | null = null;

  // Room in which the CURRENT wave is committed to spawn. Captured at the moment
  // `_tryTriggerWave` fires so enemies spawn in the room the player actually
  // entered, not wherever they happen to be 3s later when the wave card clears.
  private _pendingSpawnCol: number | null = null;
  private _pendingSpawnRow: number | null = null;

  // Boss special mechanics
  private _trackedBossPhase = 1;
  private _bossTurretsSpawned = false;
  private _worldLockActive = false;
  private _worldLockMs = 0;
  private _worldLockFreeMs = 0;
  private _worldLockPhaseTriggered = false;
  private _worldLockUI: Phaser.GameObjects.Container | null = null;
  private static readonly WORLD_LOCK_DURATION = 8000;
  private static readonly WORLD_LOCK_FREE_DURATION = 8000;
  // Wave 15 — ARIA PRIME: boss healer welder
  private _bossWelderSpawned = false;

  get worldLockActive(): boolean { return this._worldLockActive; }

  constructor(ctx: GameContext, deps: WaveOrchestratorDeps) {
    this.ctx = ctx;
    this.deps = deps;
  }

  spawnWaveEnemies(): void {
    const ctx = this.ctx;
    ctx.arenaHazards.setupForWave(ctx.waveManager.currentWave);
    ctx.mapObstacles.setupForWave(ctx.waveManager.currentWave, ctx.upgradeSystem.unlockedThemes);

    // Fire narrative wave start
    this.deps.onNarrativeWaveStart?.(ctx.waveManager.currentWave);

    const isBossWave = ctx.waveManager.currentWave % 5 === 0;
    if (isBossWave) {
      this.spawnBoss();
      return;
    }

    const cfg = ctx.waveManager.getWaveConfig();
    const evt = ctx.waveManager.getWaveEvent(ctx.waveManager.currentWave);

    const dda = ctx.ddaSystem;
    const scaledHp    = Math.round(cfg.enemyHp * dda.enemyHpMult * evt.modifiers.hpMult);
    const scaledSpeed = cfg.enemySpeed * dda.speedMult * evt.modifiers.speedMult;
    const damageMult  = evt.modifiers.damageMult;
    const countMult   = dda.countMult;
    const scaledEnemyCount    = Math.max(1, Math.round(cfg.enemyCount    * countMult));
    const scaledGuardCount    = Math.round(cfg.guardCount    * countMult) + evt.modifiers.guardBonus;
      const scaledCollectorCount = Math.max(1, Math.round(cfg.collectorCount * countMult) + evt.modifiers.collectorBonus);
    const scaledTurretCount   = Math.round(cfg.turretCount   * countMult) + evt.modifiers.turretBonus;
    const scaledSawbladeCount = Math.round(cfg.sawbladeCount * countMult) + evt.modifiers.sawbladeBonus;
    const scaledWelderCount   = Math.round(cfg.welderCount   * countMult) + evt.modifiers.welderBonus;

    for (let i = 0; i < scaledEnemyCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new EnemyAgent(x, y, ctx.playerSprite, scaledHp, scaledSpeed, damageMult);
      agent.bindScene(ctx.scene);
      const sprite = ctx.scene.physics.add.sprite(x, y, "enemy")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.enemies.push(agent);
      const eg = ctx.scene.add.circle(x, y, 14, 0xff4444, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, eg);
      this._spawnPortalFX(x, y, 0xff4444, i * 60);
    }

    const reactorPos = ctx.mapObstacles.reactorMachinePos;

    for (let i = 0; i < scaledGuardCount; i++) {
      const { x: gx, y: gy } = this._randomEdgePosition();
      const agent = new GuardAgent(gx, gy, ctx.playerSprite, scaledHp + 20, scaledSpeed - 10);
      agent.damageMultiplier = damageMult;
      const sprite = ctx.scene.physics.add.sprite(gx, gy, "guard")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0).setScale(1.15);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.guards.push(agent);
      const gg = ctx.scene.add.circle(gx, gy, 14, 0xaa44ff, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, gg);
      this._spawnPortalFX(gx, gy, 0xaa44ff, i * 80);
    }

    for (let i = 0; i < scaledCollectorCount; i++) {
      const { x: cx, y: cy } = this._randomEdgePosition();
      const agent = new CollectorAgent(cx, cy, ctx.playerSprite, 30, scaledSpeed + 20);
      agent.damageMultiplier = damageMult;
      const sprite = ctx.scene.physics.add.sprite(cx, cy, "collector")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0).setScale(0.85);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.collectors.push(agent);
      const cg = ctx.scene.add.circle(cx, cy, 12, 0x44ffcc, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, cg);
      this._spawnPortalFX(cx, cy, 0x44ffcc, i * 70);
    }

    for (let i = 0; i < scaledTurretCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new TurretAgent(x, y, ctx.playerSprite, 100 + ctx.waveManager.currentWave * 10, 0, damageMult);
      agent.bindScene(ctx.scene);
      const sprite = ctx.scene.physics.add.sprite(x, y, "turret")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.turrets.push(agent);
      const tg = ctx.scene.add.circle(x, y, 16, 0xff6600, 0.3).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, tg);
      this._spawnPortalFX(x, y, 0xff6600, i * 90);
    }

    for (let i = 0; i < scaledSawbladeCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new SawbladeAgent(x, y, ctx.playerSprite, 40 + ctx.waveManager.currentWave * 5);
      agent.damageMultiplier = damageMult;
      agent.bindScene(ctx.scene);
      const sprite = ctx.scene.physics.add.sprite(x, y, "sawblade")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.sawblades.push(agent);
      const sg = ctx.scene.add.circle(x, y, 14, 0xcccccc, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, sg);
      this._spawnPortalFX(x, y, 0xcccccc, i * 75);
    }

    for (let i = 0; i < scaledWelderCount; i++) {
      const { x: wx, y: wy } = this._randomEdgePosition();
      const agent = new WelderAgent(wx, wy, ctx.playerSprite, 50 + ctx.waveManager.currentWave * 5);
      agent.damageMultiplier = damageMult;
      agent.bindScene(ctx.scene);
      const sprite = ctx.scene.physics.add.sprite(wx, wy, "welder")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.welders.push(agent);
      const wg = ctx.scene.add.circle(wx, wy, 12, 0xffcc00, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, wg);
      this._spawnPortalFX(wx, wy, 0xffcc00, i * 85);
    }

    ctx.allAgents = [
      ...ctx.enemies, ...ctx.guards, ...ctx.collectors,
      ...ctx.turrets, ...ctx.sawblades, ...ctx.welders,
    ];
    // MainScene reads ctx.allAgents.length to resize agentPositions

    // Narrative enemy identification — fire once per enemy type encountered
    if (ctx.guards.length > 0)    this.deps.onFirstEnemyTypeSeen?.('guard');
    if (ctx.collectors.length > 0) this.deps.onFirstEnemyTypeSeen?.('collector');
    if (ctx.sawblades.length > 0)  this.deps.onFirstEnemyTypeSeen?.('sawblade');
    if (ctx.welders.length > 0)    this.deps.onFirstEnemyTypeSeen?.('welder');
    if (ctx.turrets.length > 0)    this.deps.onFirstEnemyTypeSeen?.('turret');

    if (ctx.enemies.length > 0) {
      const angles = SteeringBehaviors.assignFlankAngles(ctx.enemies.length, Math.random() * Math.PI * 2);
      angles.forEach((a, i) => { ctx.enemies[i].flankAngle = a; });
    }

    // ── REACTOR ASSAULT — CIRCUIT world enemies surround and destroy the reactor ──
    // Guards blockade in a tight siege ring. Welders + collectors swarm from spread angles.
    if (reactorPos) {
      // Guards: hold siege positions in a ring — they're already IN the reactor room
      for (let i = 0; i < ctx.guards.length; i++) {
        const agent = ctx.guards[i];
        const angle = (i / Math.max(ctx.guards.length, 1)) * Math.PI * 2;
        agent.reactorTarget = {
          x: reactorPos.x + Math.cos(angle) * 65,
          y: reactorPos.y + Math.sin(angle) * 65,
        };
        if (agent.sprite) agent.sprite.setTint(0xcc44ff);
        const glow = ctx.enemyGlows.get(agent.id);
        if (glow) glow.setFillStyle(0xcc44ff, 0.55);
      }
      // Welders: approach from evenly spread angles, heal allies while rushing
      for (let i = 0; i < ctx.welders.length; i++) {
        const agent = ctx.welders[i];
        const angle = (i / Math.max(ctx.welders.length, 1)) * Math.PI * 2 + Math.PI / 4;
        agent.reactorTarget = {
          x: reactorPos.x + Math.cos(angle) * 45,
          y: reactorPos.y + Math.sin(angle) * 45,
        };
        if (agent.sprite) agent.sprite.setTint(0xffcc00);
        const glow = ctx.enemyGlows.get(agent.id);
        if (glow) glow.setFillStyle(0xffcc00, 0.50);
      }
      // Collectors: fast drones swarm from different spread angles
      for (let i = 0; i < ctx.collectors.length; i++) {
        const agent = ctx.collectors[i];
        const angle = (i / Math.max(ctx.collectors.length, 1)) * Math.PI * 2 + Math.PI / 6;
        agent.reactorTarget = {
          x: reactorPos.x + Math.cos(angle) * 35,
          y: reactorPos.y + Math.sin(angle) * 35,
        };
        if (agent.sprite) agent.sprite.setTint(0x44ddff);
        const glow = ctx.enemyGlows.get(agent.id);
        if (glow) glow.setFillStyle(0x44ddff, 0.50);
      }
    }

    const allHealTargets = ctx.allAgents as { posX: number; posY: number; hp: number; maxHp: number }[];
    for (const welder of ctx.welders) {
      welder.setAllies(allHealTargets);
    }
  }

  spawnBoss(): void {
    const ctx = this.ctx;
    const wave = ctx.waveManager.currentWave;
    const bossHp = 600 + wave * 200;
    // Reset per-fight state
    this._trackedBossPhase = 1;
    this._bossTurretsSpawned = false;
    this._worldLockActive = false;
    this._worldLockMs = 0;
    this._worldLockFreeMs = 0;
    this._worldLockPhaseTriggered = false;
    this._worldLockUI?.destroy(); this._worldLockUI = null;
    this._bossWelderSpawned = false;

    // Boss and player both go to the arena at world centre.
    // Spawn boss at the top of the arena; player at the centre.
    const arenaX = WORLD_WIDTH / 2;
    const arenaY = WORLD_HEIGHT / 2;
    const bx = arenaX;
    const by = arenaY - 280;   // top portion of the arena, well inside the walls

    const boss = new BossAgent(bx, by, ctx.playerSprite, bossHp);
    boss.bindScene(ctx.scene);
    boss.predictor = this.deps.playerPredictor;
    boss.onFire = () => this.deps.hudManager.showBossAttackWarning(boss.posX, boss.posY);
    boss.onDimensionSwitch = (world) => {
      const glow = ctx.enemyGlows.get(boss.id);
      const color = world === "FOUNDRY" ? 0xff6600 : 0xaa33ff;
      if (glow) glow.setFillStyle(color, 0.5);
      if (boss.sprite?.active) boss.sprite.setTint(color);
      ctx.scene.time.delayedCall(300, () => { if (boss.sprite?.active) boss.sprite.clearTint(); });
      // Shockwave ring from boss
      const ring = ctx.scene.add.circle(boss.posX, boss.posY, 30, color, 0.5)
        .setDepth(58).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 400, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      // Screen-wide color flash
      const flash = ctx.scene.add.rectangle(640, 360, 1280, 720, color, 0.12)
        .setScrollFactor(0).setDepth(200);
      ctx.scene.tweens.add({ targets: flash, alpha: 0, duration: 250, onComplete: () => flash.destroy() });
      this.deps.hudManager.showBossDimensionWarning(world);
      AudioManager.instance.phaseSurge();
    };
    const sprite = ctx.scene.physics.add.sprite(bx, by, "boss")
      .setCollideWorldBounds(true).setDepth(50).setScale(1.5);
    boss.bindSprite(sprite);
    ctx.enemyGroup.add(sprite);
    ctx.boss = boss;

    const glow = ctx.scene.add.circle(bx, by, 45, 0xff0000, 0.4)
      .setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
    ctx.enemyGlows.set(boss.id, glow);

    // Boss uses the centre arena regardless of which room triggered the fight.
    // Clear the pending spawn lock so the NEXT non-boss wave re-captures freshly.
    this._pendingSpawnCol = null;
    this._pendingSpawnRow = null;
    this.deps.hudManager.buildBossUI(wave, this._getBossName(wave));

    ctx.playerSprite.setPosition(arenaX, arenaY);
    const playerBody = ctx.playerSprite.body as Phaser.Physics.Arcade.Body;
    playerBody.reset(arenaX, arenaY);

    // ── Cinematic boss entrance sequence ─────────────────────────────────────
    const cam = ctx.scene.cameras.main;
    cam.centerOn(arenaX, arenaY);
    cam.stopFollow();

    // Phase 1: Dramatic zoom-in onto the arena center (0–600ms)
    cam.zoomTo(1.35, 600, "Quad.easeOut");

    // Warning lights: 4 red flare circles at arena corners, pulsing
    const warnColors = [0xff0000, 0xff2200, 0xff0022, 0xff1100];
    const warnOffsets = [[-420, -350], [420, -350], [420, 350], [-420, 350]];
    const warnLights = warnOffsets.map(([dx, dy], i) => {
      const wl = ctx.scene.add.circle(arenaX + dx, arenaY + dy, 16, warnColors[i % 4], 0)
        .setDepth(60).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: wl, alpha: { from: 0, to: 0.9 },
        duration: 180, yoyo: true, repeat: 4, delay: i * 80,
        ease: "Power2",
        onComplete: () => wl.destroy(),
      });
      return wl;
    });
    void warnLights; // cleanup via tweens

    // Phase 2: At 600ms — hold, show "THREAT DETECTED" title
    ctx.scene.time.delayedCall(600, () => {
      // Ambient flash from the portal
      const portalFlash = ctx.scene.add.circle(arenaX, arenaY, 130, 0xff0066, 0.35)
        .setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: portalFlash, alpha: 0, scaleX: 2.5, scaleY: 2.5,
        duration: 900, ease: "Expo.easeOut",
        onComplete: () => portalFlash.destroy(),
      });

      const threatText = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, "⚠  THREAT DETECTED  ⚠", {
        fontFamily: UI_FONT, fontSize: "22px", color: "#ff3333", fontStyle: "bold",
        stroke: "#000", strokeThickness: 4,
        shadow: { offsetX: 0, offsetY: 0, color: "#ff0000", blur: 12, fill: true },
      }).setOrigin(0.5).setDepth(125).setScrollFactor(0).setAlpha(0).setScale(0.6);
      ctx.scene.tweens.add({
        targets: threatText, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 280, ease: "Back.easeOut",
        onComplete: () => {
          ctx.scene.tweens.add({
            targets: threatText, alpha: 0, duration: 400, delay: 600,
            onComplete: () => threatText.destroy(),
          });
        },
      });
    });

    // Phase 3: At 1100ms — zoom back out, resume follow
    ctx.scene.time.delayedCall(1100, () => {
      ctx.scene.tweens.killTweensOf(cam);
      cam.setZoom(1);
      cam.zoomTo(1.0, 350, "Quad.easeOut");
      cam.startFollow(ctx.playerSprite, true, 0.075, 0.075);
      cam.setDeadzone(48, 32);
    });

    // Phase 4: At 1300ms — main announcement + boss spawn
    ctx.scene.time.delayedCall(1300, () => {
      const announce = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110, "⚠  BOSS INCOMING  ⚠", {
        fontFamily: UI_FONT, fontSize: "40px", color: "#ff3333", fontStyle: "bold",
        stroke: "#000", strokeThickness: 5,
        shadow: { offsetX: 0, offsetY: 0, color: "#ff0000", blur: 20, fill: true },
      }).setOrigin(0.5).setDepth(120).setScrollFactor(0).setAlpha(0).setScale(0.5);
      ctx.scene.tweens.add({
        targets: announce, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 200, ease: "Back.easeOut",
        onComplete: () => {
          ctx.scene.tweens.add({
            targets: announce, alpha: 0, scaleX: 1.5, scaleY: 1.5,
            duration: 1400, delay: 200, ease: "Power2",
            onComplete: () => announce.destroy(),
          });
        },
      });

      Juice.screenShake(ctx.scene, 0.015, 500);
      AudioManager.instance.bossIntroStinger();
      AudioManager.instance.startBossMusic();
      this.deps.onNarrativeBossSpawn?.(wave);
    });
  }

  onBossDeath(): void {
    const ctx = this.ctx;
    if (!ctx.boss) return;
    const pos = ctx.boss.getPosition();
    const bossSprite = ctx.boss.sprite;

    ctx.godMode = true;
    ctx.scene.time.delayedCall(3000, () => { ctx.godMode = false; });

    ctx.arenaHazards.clearAll();

    // ── Immediate white-flash + physics disable on boss sprite ───────────────
    if (bossSprite) {
      (bossSprite.body as Phaser.Physics.Arcade.Body | null)?.setEnable(false);
      bossSprite.setTintFill(0xffffff);
      // Spin + fade over 600ms before actual destroy
      ctx.scene.tweens.add({
        targets: bossSprite,
        angle: bossSprite.angle + 540,
        scaleX: 2.4,
        scaleY: 2.4,
        alpha: 0,
        duration: 600,
        ease: "Quad.easeOut",
        onComplete: () => bossSprite.destroy(),
      });
    }

    // ── Sequential staggered explosions (5 waves, 140ms apart) ───────────────
    const ringColors = [0xffffff, 0xff8800, 0xff4400, 0xff0000, 0xff00ff];
    for (let wave = 0; wave < 5; wave++) {
      ctx.scene.time.delayedCall(wave * 140, () => {
        AudioManager.instance.explosion();
        if (wave === 0) Juice.screenShake(ctx.scene, 0.045, 600);
        else if (wave < 3) Juice.screenShake(ctx.scene, 0.022, 300);

        const col = ringColors[wave];
        // Expanding ring per wave
        const ring = ctx.scene.add.circle(pos.x, pos.y, 10 + wave * 6, col, 0.75 - wave * 0.1)
          .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
        ring.setStrokeStyle(3, col, 0.9);
        ctx.scene.tweens.add({
          targets: ring,
          scaleX: 9 + wave * 2, scaleY: 9 + wave * 2,
          alpha: 0,
          duration: 600 + wave * 150,
          ease: "Expo.easeOut",
          onComplete: () => ring.destroy(),
        });

        // Sparks per wave — more on later waves
        const sparkCount = 6 + wave * 4;
        for (let i = 0; i < sparkCount; i++) {
          const angle = (i / sparkCount) * Math.PI * 2 + wave * 0.4;
          const dist = Phaser.Math.Between(30 + wave * 15, 90 + wave * 20);
          const spark = ctx.scene.add.circle(pos.x, pos.y, 2 + wave * 0.5, col, 1)
            .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
          ctx.scene.tweens.add({
            targets: spark,
            x: pos.x + Math.cos(angle) * dist,
            y: pos.y + Math.sin(angle) * dist,
            alpha: 0, scaleX: 0.2, scaleY: 0.2,
            duration: 700 + Math.random() * 400,
            ease: "Quad.easeOut",
            onComplete: () => spark.destroy(),
          });
        }
      });
    }

    // First explosion triggers the slow-mo — plays out over the full sequence
    Juice.slowMo(ctx.scene, 0.05, 1200);

    ctx.boss.clearMines();
    // bossSprite already handled above; set to null so no double-destroy
    if (ctx.boss.sprite === bossSprite) ctx.boss.sprite = null;
    ctx.enemyGlows.get(ctx.boss.id)?.destroy();
    ctx.enemyGlows.delete(ctx.boss.id);
    this.deps.hudManager.destroyBossUI();
    ctx.boss = null;
    AudioManager.instance.stopBossMusic();
    // Victory restoration — removes tension, restores harmony over 2s
    AudioManager.instance.playVictoryRestoration();
    // Clean up boss special UI
    this._worldLockActive = false;
    this._worldLockUI?.destroy(); this._worldLockUI = null;

    // Purge any lingering enemies left from boss phase (support turrets, etc.)
    // that would become stranded outside the map after arena rebuild.
    const purgeList = [...ctx.enemies, ...ctx.guards, ...ctx.collectors, ...ctx.turrets, ...ctx.sawblades, ...ctx.welders];
    for (const agent of purgeList) {
      if (agent.isDead) continue;
      agent.sprite?.destroy();
      ctx.enemyGlows.get(agent.id)?.destroy();
      ctx.enemyGlows.delete(agent.id);
    }
    ctx.enemies = []; ctx.guards = []; ctx.collectors = [];
    ctx.turrets = []; ctx.sawblades = []; ctx.welders = [];
    ctx.allAgents = [];

    for (let i = 0; i < 8; i++) {
      const sx = pos.x + Phaser.Math.Between(-40, 40);
      const sy = pos.y + Phaser.Math.Between(-40, 40);
      ctx.scrapManager.spawnScrap(sx, sy, Phaser.Math.Between(8, 15));
    }

    ctx.killCount++;
    ctx.missionSystem.onKill();
    ctx.missionSystem.onBossKill();

    // Fire narrative boss kill dialogue
    this.deps.onNarrativeBossKill?.(ctx.waveManager.currentWave);

    const victory = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "BOSS DESTROYED!", {
      fontFamily: UI_FONT, fontSize: "36px", color: "#00ff88", fontStyle: "bold",
      stroke: "#000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(120).setScrollFactor(0);
    ctx.scene.tweens.add({
      targets: victory, alpha: 0, y: GAME_HEIGHT / 2 - 50,
      duration: 2000, delay: 1000, onComplete: () => victory.destroy(),
    });

    const currentWave = ctx.waveManager.currentWave;
    if (currentWave >= 10) {
      ctx.scene.time.delayedCall(3000, () => {
        const scene = ctx.scene;
        const camera = scene.cameras.main;
        const data = {
          kills: ctx.killCount,
          wave: ctx.waveManager.currentWave,
          score: ctx.comboSystem.score,
          maxCombo: ctx.comboSystem.maxCombo,
          scrap: ctx.upgradeSystem.scrap,
          maxStreak: this.deps.getMaxStreak?.() ?? 0,
        };
        let switched = false;
        const go = (): void => {
          if (switched) return;
          switched = true;
          camera.resetFX();
          scene.scene.start("VictoryScene", data);
        };

        scene.input.enabled = false;
        AudioManager.instance.stopMusic();
        camera.resetFX();
        camera.fadeOut(650, 0, 0, 0);
        camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
        scene.time.delayedCall(900, go);
        window.setTimeout(go, 1200);
      });
      return;
    }

    ctx.waveManager.onWaveCleared();
    this._autoUnlockNextRoom();
    // Clear triggered rooms so waves can be re-triggered after boss
    this.deps.onClearTriggeredRooms?.();
    // Fire narrative wave clear for boss wave too
    this.deps.onNarrativeWaveClear?.(ctx.waveManager.currentWave);
    ctx.mapObstacles.setupForWave(ctx.waveManager.currentWave + 1, ctx.upgradeSystem.unlockedThemes);
    // Drop the player into the HUB ROOM (row 1, col 0). The previous fix used
    // WORLD_WIDTH/2 which lands in the *void* between rooms — the layout only
    // activates a single hub cell at [1][0], not the whole middle row.
    const hubX = CELL_W * 0.5;   // col 0 centre  ≈ 640
    const hubY = CELL_H * 1.5;   // row 1 centre  ≈ 1080
    ctx.playerSprite.setPosition(hubX, hubY);
    const pBody = ctx.playerSprite.body as Phaser.Physics.Arcade.Body | null;
    pBody?.reset(hubX, hubY);
    ctx.scene.cameras.main.centerOn(hubX, hubY);
    ctx.scene.time.delayedCall(2500, () => {
      if (!ctx.gameOver) {
        this.deps.onShowStoryHint?.("◉ BOSS DEFEATED  •  press [B] for shop  •  move to next room", 5000);
      }
    });
  }

  startNextWaveAfterRest(spawnCol?: number, spawnRow?: number): void {
    const ctx = this.ctx;
    // Lock the spawn room at trigger time. If the caller didn't pass one (legacy
    // paths, boss-wave auto-advance) we fall back to the player's current cell.
    if (typeof spawnCol === "number" && typeof spawnRow === "number") {
      this._pendingSpawnCol = spawnCol;
      this._pendingSpawnRow = spawnRow;
    } else {
      this._pendingSpawnCol = Math.floor((ctx.playerSprite?.x ?? WORLD_WIDTH / 2) / CELL_W);
      this._pendingSpawnRow = Math.floor((ctx.playerSprite?.y ?? WORLD_HEIGHT / 2) / CELL_H);
    }
    const nextWave = ctx.waveManager.currentWave + 1;
    this.currentWaveEvent = ctx.waveManager.getWaveEvent(nextWave);
    const isBossWave = nextWave % 5 === 0;

    // Mission-style event designations — each wave is a named operation
    const BREACH_EVENTS: Record<number, [string, string]> = {
      // [event code, tactical subtitle]
      1:  ["BREACH EVENT 01", "VOID PRESSURE NOMINAL — INITIAL INCURSION"],
      2:  ["BREACH EVENT 02", "ASSEMBLER UNITS INBOUND — REACTOR SURVIVAL REQUIRED"],
      3:  ["BREACH EVENT 03", "CIRCUIT STORM — VOID PRESSURE INCREASING"],
      4:  ["DEFENSE CYCLE 04", "IRON BATTALION — HEAVY UNITS DEPLOYED"],
      5:  ["BOSS PROTOCOL", "⚠ DEFENSE NODE ACTIVATED — ALL SYSTEMS CRITICAL ⚠"],
      6:  ["BREACH EVENT 06", "OVERCLOCKED ASSAULT — MACHINE CORE UNDER SIEGE"],
      7:  ["BREACH EVENT 07", "FRACTURE BREACH — DIMENSIONAL BARRIERS FAILING"],
      8:  ["CRISIS PROTOCOL 08", "SHADOW PROTOCOL — SYSTEMS CRITICAL"],
      9:  ["EXTINCTION WAVE 09", "VOID CORRUPTION MAXIMUM — LAST DEFENSE"],
      10: ["BOSS PROTOCOL II", "⚠ ARIA'S FINAL DEFENSE — OMEGA COUNTERSTRIKE ⚠"],
      11: ["BREACH EVENT 11", "ENDGAME — ALL SECTORS COMPROMISED"],
      12: ["BREACH EVENT 12", "CORRUPTION STORM — CORE EXPOSURE IMMINENT"],
      13: ["BREACH EVENT 13", "VOID SATURATION — REALITY FRACTURING"],
      14: ["FINAL CYCLE 14", "LAST STAND — ARIA PRIME POWERING UP"],
      15: ["BOSS PROTOCOL III", "⚠ ARIA PRIME — FINAL PROTOCOL ENGAGED ⚠"],
    };
    const [eventCode, subtitle] = BREACH_EVENTS[nextWave]
      ?? (isBossWave
        ? ["BOSS PROTOCOL", "⚠ DEFENSE NODE ACTIVATED — ALL SYSTEMS CRITICAL ⚠"]
        : [`BREACH EVENT ${String(nextWave).padStart(2, "0")}`, nextWave >= 8 ? "VOID CORRUPTION CRITICAL" : nextWave >= 5 ? "REACTOR SURVIVAL REQUIRED" : "VOID PRESSURE INCREASING"]);

    const cardBg = ctx.scene.add.graphics().setScrollFactor(0).setDepth(115);
    const cardW = 680;
    const cardH = 158;
    drawPanel(
      cardBg,
      GAME_WIDTH / 2 - cardW / 2,
      GAME_HEIGHT / 2 - cardH / 2,
      cardW,
      cardH,
      isBossWave ? 0xff3333 : 0x00ff88,
      0x040812,
      0.90,
      12,
    );

    const cardWave = ctx.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 22,
      eventCode, {
        fontFamily: UI_FONT, fontSize: "32px",
        color: isBossWave ? "#ff2200" : "#00ff88",
        fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0).setScale(0.5);

    const cardSub = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 32, subtitle, {
      fontFamily: UI_FONT, fontSize: "20px",
      color: isBossWave ? "#ff8800" : "#aaffdd",
      align: "center",
      wordWrap: { width: cardW - 80, useAdvancedWrap: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0);
    constrainTextBlock(cardSub, cardW - 80, 1, 14);

    let cardEvent: Phaser.GameObjects.Text | undefined;
    if (this.currentWaveEvent && this.currentWaveEvent.type !== "normal") {
      cardEvent = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, this.currentWaveEvent.label, {
        fontFamily: UI_FONT, fontSize: "16px",
        color: this.currentWaveEvent.color,
        fontStyle: "bold", align: "center",
        stroke: "#000000", strokeThickness: 3,
        wordWrap: { width: cardW - 80, useAdvancedWrap: true },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0);
      constrainTextBlock(cardEvent, cardW - 80, 1, 12);
    }

    ctx.scene.tweens.add({ targets: cardBg,  alpha: { from: 0, to: 1 }, duration: 200 });
    ctx.scene.tweens.add({ targets: cardWave, alpha: 1, scale: 1, duration: 300, ease: "Back.easeOut" });
    ctx.scene.tweens.add({ targets: cardSub,  alpha: 1, duration: 400, delay: 150 });
    if (cardEvent) ctx.scene.tweens.add({ targets: cardEvent, alpha: 1, duration: 400, delay: 250 });

    ctx.scene.time.delayedCall(2200, () => {
      ctx.scene.tweens.add({
        targets: [cardBg, cardWave, cardSub, ...(cardEvent ? [cardEvent] : [])], alpha: 0, duration: 400,
        onComplete: () => { cardBg.destroy(); cardWave.destroy(); cardSub.destroy(); cardEvent?.destroy(); },
      });
    });

    const waveText = this.deps.hudManager.waveTextRef;
    waveText.setText(`${eventCode}\n${subtitle}`);
    waveText.setAlpha(0).setScale(0.5).setColor(isBossWave ? "#ff0000" : "#00ff88");

    if (isBossWave) {
      Juice.screenShake(ctx.scene, 0.008, 400);
      AudioManager.instance.explosion();
      // Pre-boss silence ritual: fires ~3s before spawnBoss() to build dread
      AudioManager.instance.preBossSilence();
    } else {
      // Escalate audio tension with wave progression
      AudioManager.instance.setWaveTension(nextWave);
    }

    if (isBossWave) {
      // For boss waves: fade the screen out, rebuild the arena + teleport the player
      // during the blackout, then fade back in. This prevents a visible freeze caused
      // by the synchronous _layoutBossArena() call.
      ctx.scene.time.delayedCall(2800, () => {
        if (ctx.gameOver) return;
        const camera = ctx.scene.cameras.main;
        let rebuilt = false;
        const rebuildBossWave = (): void => {
          if (rebuilt) return;
          rebuilt = true;
          if (ctx.gameOver) return;
          try {
            ctx.waveManager.startWave();
            this.spawnWaveEnemies();
            this.deps.fractureFX?.onWaveStart(ctx.waveManager.currentWave);

            waveText.setText(`── ${eventCode} ──`);
            waveText.setAlpha(0).setScale(1.2);
          } catch (e) {
            console.error("[WaveOrchestrator] boss wave spawn failed:", e);
          }

          camera.resetFX();
          camera.fadeIn(700, 0, 0, 0);
          camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
            ctx.scene.tweens.add({
              targets: waveText, alpha: 1, duration: 300,
              onComplete: () => {
                ctx.scene.tweens.add({
                  targets: waveText, alpha: 0, scaleX: 0.8, scaleY: 0.8,
                  duration: 800, delay: 1200, ease: "Power2",
                });
              },
            });
            Juice.screenShake(ctx.scene, 0.004, 100);
          });
        };

        camera.resetFX();
        camera.fadeOut(500, 0, 0, 0);
        camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, rebuildBossWave);
        ctx.scene.time.delayedCall(700, rebuildBossWave);
        window.setTimeout(rebuildBossWave, 950);
      });
    } else {
      ctx.scene.time.delayedCall(3000, () => {
        if (ctx.gameOver) return;
        ctx.waveManager.startWave();
        this.spawnWaveEnemies();
        this.deps.fractureFX?.onWaveStart(ctx.waveManager.currentWave);

        waveText.setText(`── ${eventCode} ──`);
        waveText.setAlpha(1).setScale(1.2);
        ctx.scene.tweens.add({
          targets: waveText,
          alpha: 0, scaleX: 0.8, scaleY: 0.8,
          duration: 800, delay: 1200, ease: "Power2",
        });
        Juice.screenShake(ctx.scene, 0.004, 100);
      });
    }
  }

  /**
   * Call each frame from update(). Returns true if the wave was just cleared.
   */
  checkWaveCleared(): boolean {
    const ctx = this.ctx;
    if (!ctx.waveManager.isActive) return false;
    if (ctx.boss) return false;
    if (
      ctx.enemies.length > 0 || ctx.guards.length > 0 ||
      ctx.collectors.length > 0 ||
      ctx.turrets.length > 0 || ctx.sawblades.length > 0 ||
      ctx.welders.length > 0
    ) return false;

    ctx.waveManager.onWaveCleared();
    AudioManager.instance.waveComplete();
    ctx.missionSystem.onWaveComplete(ctx.waveManager.currentWave);
    if (ctx.damageTakenThisWave === 0) {
      ctx.missionSystem.onWaveNoDamage();
    }
    ctx.damageTakenThisWave = 0;
    this._autoUnlockNextRoom();
    if (this.deps.getStoryPhase?.() === "tutorial") {
      this.deps.onRestoreStoryPower?.();
    }
    // Fire narrative wave clear dialogue
    this.deps.onNarrativeWaveClear?.(ctx.waveManager.currentWave);
    // Only pre-build the next wave map for non-boss waves.
    // Boss waves are heavy (full arena rebuild) and must be deferred to spawn time
    // to avoid a synchronous freeze at the end of wave 4/9/14/…
    const nextWave = ctx.waveManager.currentWave + 1;
    if (nextWave % 5 !== 0) {
      ctx.mapObstacles.setupForWave(nextWave, ctx.upgradeSystem.unlockedThemes);
    }

    // Spawn scrap caches scattered around the arena
    const cacheCount = 3 + Math.floor(ctx.waveManager.currentWave * 0.5);
    for (let i = 0; i < cacheCount; i++) {
      const angle = (i / cacheCount) * Math.PI * 2 + Math.random() * 0.8;
      const dist = 180 + Math.random() * 220;
      const cx = ctx.playerSprite.x + Math.cos(angle) * dist;
      const cy = ctx.playerSprite.y + Math.sin(angle) * dist;
      const clamped = {
        x: Math.max(40, Math.min(WORLD_WIDTH - 40, cx)),
        y: Math.max(40, Math.min(WORLD_HEIGHT - 40, cy)),
      };
      const value = 12 + Math.floor(ctx.waveManager.currentWave * 3) + Phaser.Math.Between(0, 10);
      ctx.scrapManager.spawnScrap(clamped.x, clamped.y, value);
    }

    // Build next-wave preview string
    const isBoss = nextWave % 5 === 0;
    let previewLine: string;
    if (isBoss) {
      previewLine = `⚡ NEXT: WAVE ${nextWave}  —  BOSS ENCOUNTER  •  Prepare all upgrades`;
    } else {
      const nw = nextWave;
      const ec = Math.max(2, Math.min(14, Math.floor(4 * Math.pow(1.22, nw - 1) * (nw <= 3 ? 0.70 : nw <= 6 ? 0.85 : 1.0))));
      const gc = nw >= 3 ? Math.min(1 + Math.floor((nw - 3) * 0.55), 7) : 0;
      const tc = nw >= 4 ? Math.min(Math.floor((nw - 3) * 0.55), 5) : 0;
      const wc = nw >= 5 ? Math.min(1 + Math.floor((nw - 5) * 0.5), 4) : 0;
      const parts: string[] = [`${ec} drones`];
      if (gc > 0) parts.push(`${gc} guard${gc > 1 ? "s" : ""}`);
      if (tc > 0) parts.push(`${tc} turret${tc > 1 ? "s" : ""}`);
      if (wc > 0) parts.push(`${wc} welder${wc > 1 ? "s" : ""}`);
      previewLine = `NEXT: WAVE ${nextWave}  —  ${parts.join("  +  ")}`;
    }
    this.deps.onShowStoryHint?.(`◉ WAVE CLEARED — scrap caches dropped  •  [B] shop  •  next in ~12s`, 5000);
    ctx.scene.time.delayedCall(5500, () => {
      this.deps.onShowStoryHint?.(previewLine, 6500);
    });
    return true;
  }

  private _autoUnlockNextRoom(): void {
    const ctx = this.ctx;
    // Unlock order: CMD CENTER → Bio Lab → Data Lab → Quarantine → Supply → Vault
    const CYCLE = ["control", "factory", "server", "quarantine", "maintenance", "vault"];
    const ROOM_NAMES: Record<string, string> = {
      factory: "BIO LAB", server: "DATA LAB",
      control: "CMD CENTER", maintenance: "SUPPLY DEPOT",
      quarantine: "QUARANTINE ZONE", vault: "THE VAULT",
    };
    for (const theme of CYCLE) {
      if (!ctx.upgradeSystem.unlockedThemes.has(theme)) {
        ctx.upgradeSystem.markCardObtained(theme);
        ctx.mapObstacles.unlockTheme(theme);
        this.deps.onShowRoomUnlockedNotification?.(ROOM_NAMES[theme] ?? theme.toUpperCase());
        return;
      }
    }
  }

  private _randomEdgePosition(): { x: number; y: number } {
    const ctx = this.ctx;
    // Use the LOCKED spawn room (from startNextWaveAfterRest) so enemies appear
    // in the room the player committed to — not wherever the player wandered.
    const col = this._pendingSpawnCol;
    const row = this._pendingSpawnRow;
    const anchorX = col != null ? col * CELL_W + CELL_W / 2 : (ctx.playerSprite?.x ?? WORLD_WIDTH / 2);
    const anchorY = row != null ? row * CELL_H + CELL_H / 2 : (ctx.playerSprite?.y ?? WORLD_HEIGHT / 2);
    const isTutorial = this.deps.getStoryPhase?.() === "tutorial";
    return ctx.mapObstacles.getSpawnPositionInPlayerRoom(anchorX, anchorY, 120, isTutorial);
  }

  private _spawnPortalFX(x: number, y: number, color: number, delay: number): void {
    const ctx = this.ctx;
    ctx.scene.time.delayedCall(delay, () => {
      if (ctx.gameOver) return;
      const outerRing = ctx.scene.add.circle(x, y, 4, color, 0)
        .setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
      outerRing.setStrokeStyle(2, color, 0.9);
      ctx.scene.tweens.add({
        targets: outerRing, scaleX: 6, scaleY: 6, alpha: 0,
        duration: 500, ease: "Power2",
        onComplete: () => outerRing.destroy(),
      });
      const flash = ctx.scene.add.circle(x, y, 8, 0xffffff, 0.7)
        .setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: flash, scaleX: 0.1, scaleY: 0.1, alpha: 0,
        duration: 200, onComplete: () => flash.destroy(),
      });
      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2;
        const spark = ctx.scene.add.circle(x, y, 2, color, 1)
          .setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
        ctx.scene.tweens.add({
          targets: spark,
          x: x + Math.cos(angle) * 30,
          y: y + Math.sin(angle) * 30,
          alpha: 0, scaleX: 0.3, scaleY: 0.3,
          duration: 350, onComplete: () => spark.destroy(),
        });
      }
      AudioManager.instance.pickup();
    });
  }

  /**
   * Called every frame from MainScene.update() while a boss is alive.
   * Handles wave-specific boss mechanics: Wave 5 turret phase, Wave 10 world lock, Wave 15 healer.
   */
  updateBossSpecials(deltaMs: number): void {
    const ctx = this.ctx;
    if (!ctx.boss || ctx.boss.isDead) return;
    const wave = ctx.waveManager.currentWave;

    // ── Phase-change detection — stamp suppression on story hints ────────
    const currentPhase = ctx.boss.phase;
    if (currentPhase !== this._trackedBossPhase) {
      this._trackedBossPhase = currentPhase;
      this.deps.onBossPhaseTransition?.(currentPhase);
    }

    // ── Wave 15: spawn healer when boss reaches phase 3 ──────────────────
    this._triggerBossWelderIfNeeded();

    // ── Wave 5: Spawn turrets when boss enters phase 2 ──────────────────
    if (wave === 5 && !this._bossTurretsSpawned && ctx.boss.phase >= 2) {
      this._bossTurretsSpawned = true;
      const bx = ctx.boss.posX, by = ctx.boss.posY;
      const angles = [Math.PI * 0.75, Math.PI * 1.25]; // two flanking turrets
      for (const angle of angles) {
        const tx = Math.round(bx + Math.cos(angle) * 220);
        const ty = Math.round(by + Math.sin(angle) * 180);
        const hp = 80;
        const agent = new TurretAgent(tx, ty, ctx.playerSprite, hp, 0, 0.8);
        agent.bindScene(ctx.scene);
        const sprite = ctx.scene.physics.add.sprite(tx, ty, "turret")
          .setCollideWorldBounds(true).setDepth(50).setAlpha(0);
        agent.bindSprite(sprite);
        ctx.scene.tweens.add({ targets: sprite, alpha: 1, duration: 600, ease: "Quad.easeIn" });
        ctx.enemyGroup.add(sprite);
        const glow = ctx.scene.add.circle(tx, ty, 20, 0xff6600, 0.4)
          .setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
        ctx.enemyGlows.set(agent.id, glow);
        ctx.turrets.push(agent);
        ctx.allAgents.push(agent);
      }
      // Announce
      const txt = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, "TURRET SUPPORT ACTIVATED!", {
        fontFamily: UI_FONT, fontSize: "22px", color: "#ff8800", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(122).setScrollFactor(0).setAlpha(0);
      ctx.scene.tweens.add({ targets: txt, alpha: 1, duration: 200, hold: 1400, yoyo: true, onComplete: () => txt.destroy() });
    }

    // ── Wave 10: World lock cycle when boss enters phase 2 ──────────────
    if (wave === 10 && ctx.boss.phase >= 2) {
      if (!this._worldLockPhaseTriggered) {
        this._worldLockPhaseTriggered = true;
        this._worldLockFreeMs = 3000; // 3s grace before first lock
      }

      if (this._worldLockActive) {
        this._worldLockMs -= deltaMs;
        if (this._worldLockMs <= 0) {
          // Unlock
          this._worldLockActive = false;
          this._worldLockFreeMs = WaveOrchestrator.WORLD_LOCK_FREE_DURATION;
          this._worldLockUI?.destroy(); this._worldLockUI = null;
          // Unlock burst
          const flash = ctx.scene.add.rectangle(
            GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.18,
          ).setScrollFactor(0).setDepth(115);
          ctx.scene.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
          const unlockTxt = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, "DIMENSION LOCK RELEASED", {
            fontFamily: UI_FONT, fontSize: "20px", color: "#00ffcc", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 4,
          }).setOrigin(0.5).setDepth(122).setScrollFactor(0).setAlpha(0);
          ctx.scene.tweens.add({ targets: unlockTxt, alpha: 1, duration: 200, hold: 1000, yoyo: true, onComplete: () => unlockTxt.destroy() });
        } else {
          // Update countdown UI
          this._updateWorldLockUI(this._worldLockMs);
        }
      } else {
        this._worldLockFreeMs -= deltaMs;
        if (this._worldLockFreeMs <= 0) {
          // Engage lock
          this._worldLockActive = true;
          this._worldLockMs = WaveOrchestrator.WORLD_LOCK_DURATION;
          this._worldLockUI?.destroy(); this._worldLockUI = null;
          this._spawnWorldLockUI();
          // Lock flash
          const flash = ctx.scene.add.rectangle(
            GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xaa00ff, 0.25,
          ).setScrollFactor(0).setDepth(115);
          ctx.scene.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
          const lockTxt = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, "⚠ DIMENSION LOCKED ⚠", {
            fontFamily: UI_FONT, fontSize: "22px", color: "#ff44ff", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 4,
          }).setOrigin(0.5).setDepth(122).setScrollFactor(0).setAlpha(0);
          ctx.scene.tweens.add({ targets: lockTxt, alpha: 1, duration: 200, hold: 1200, yoyo: true, onComplete: () => lockTxt.destroy() });
          AudioManager.instance.worldShift();
        }
      }
    }
  }

  // ── Wave 15: ARIA PRIME — spawn boss healer welder on phase 3 ───────────
  private _triggerBossWelderIfNeeded(): void {
    const ctx = this.ctx;
    if (!ctx.boss) return;
    if (ctx.waveManager.currentWave !== 15) return;
    if (this._bossWelderSpawned) return;
    if (ctx.boss.phase < 3) return;
    this._bossWelderSpawned = true;
    this._spawnBossWelder();
  }

  private _spawnBossWelder(): void {
    const ctx = this.ctx;
    if (!ctx.boss) return;

    // Spawn offset: behind the boss relative to player
    const bx = ctx.boss.posX;
    const by = ctx.boss.posY;
    const spawnX = Phaser.Math.Clamp(bx + Phaser.Math.Between(-120, 120), 60, WORLD_WIDTH - 60);
    const spawnY = Phaser.Math.Clamp(by + Phaser.Math.Between(-120, 120), 60, WORLD_HEIGHT - 60);

    const agent = new WelderAgent(spawnX, spawnY, ctx.playerSprite, 40, 70);
    agent.bindScene(ctx.scene);
    // Boss is a valid HealTarget — posX, posY, hp, maxHp all exist
    agent.setAllies([ctx.boss]);

    const sprite = ctx.scene.physics.add.sprite(spawnX, spawnY, "welder")
      .setCollideWorldBounds(true).setDepth(50).setAlpha(0).setScale(1.2);
    agent.bindSprite(sprite);
    ctx.scene.tweens.add({ targets: sprite, alpha: 1, duration: 500, ease: "Quad.easeIn" });
    ctx.enemyGroup.add(sprite);

    const glow = ctx.scene.add.circle(spawnX, spawnY, 18, 0x44ff88, 0.5)
      .setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
    ctx.enemyGlows.set(agent.id, glow);
    ctx.welders.push(agent);
    ctx.allAgents.push(agent);

    // Entrance ring burst — green to distinguish it from the boss
    const ring = ctx.scene.add.circle(spawnX, spawnY, 10, 0x44ff88, 0.7)
      .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
    ctx.scene.tweens.add({ targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 500, ease: "Expo.easeOut", onComplete: () => ring.destroy() });

    // Announcement
    const txt = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100,
      "! ARIA PRIME CALLS A HEALER !", {
        fontFamily: UI_FONT, fontSize: "20px", color: "#44ff88", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 4,
        shadow: { offsetX: 0, offsetY: 0, color: "#00ff44", blur: 10, fill: true },
      }).setOrigin(0.5).setDepth(122).setScrollFactor(0).setAlpha(0).setScale(0.6);
    ctx.scene.tweens.add({ targets: txt, alpha: 1, scaleX: 1, scaleY: 1, duration: 200, ease: "Back.easeOut",
      onComplete: () => {
        ctx.scene.tweens.add({ targets: txt, alpha: 0, y: txt.y - 30, duration: 700, delay: 1500,
          onComplete: () => txt.destroy() });
      },
    });
  }

  private _spawnWorldLockUI(): void {
    const ctx = this.ctx;
    const x = GAME_WIDTH / 2, y = 48;
    const container = ctx.scene.add.container(0, 0).setDepth(110).setScrollFactor(0);

    // Background bar
    const bg = ctx.scene.add.graphics();
    bg.fillStyle(0x1a001a, 0.80);
    bg.fillRoundedRect(x - 100, y - 16, 200, 32, 6);
    bg.lineStyle(2, 0xcc44ff, 0.85);
    bg.strokeRoundedRect(x - 100, y - 16, 200, 32, 6);

    // Label
    const label = ctx.scene.add.text(x - 70, y, "WORLD LOCK:", {
      fontFamily: UI_FONT, fontSize: "13px", color: "#ff44ff", fontStyle: "bold",
    }).setOrigin(0, 0.5);

    // Countdown number
    const timer = ctx.scene.add.text(x + 42, y, "8", {
      fontFamily: "monospace", fontSize: "16px", color: "#ffaaff",
    }).setOrigin(0, 0.5);

    container.add([bg, label, timer]);
    container.setData("timerTxt", timer);
    this._worldLockUI = container;
  }

  private _updateWorldLockUI(remainingMs: number): void {
    if (!this._worldLockUI) return;
    const timerTxt = this._worldLockUI.getData("timerTxt") as Phaser.GameObjects.Text | null;
    if (timerTxt) {
      timerTxt.setText(`${Math.ceil(remainingMs / 1000)}`);
    }
  }

  private _getBossName(wave: number): string {
    const names = [
      "ARIA's SENTINEL",       // Wave 5
      "DEFENSE PROTOCOL MK-II", // Wave 10
      "ARIA PRIME",             // Wave 15
      "OMEGA PROTOCOL",         // Wave 20+
      "EXTINCTION ENGINE",
    ];
    return names[Math.floor(wave / 5 - 1) % names.length];
  }
}
