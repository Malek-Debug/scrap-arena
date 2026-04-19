import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H, WorldType } from "../core";
import type { WaveEvent } from "../core";
import type { GameContext, AnyAgent } from "./GameContext";
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
}

/**
 * WaveOrchestrator — manages wave lifecycle: spawning, boss fights, wave-clear detection.
 */
export class WaveOrchestrator {
  private ctx: GameContext;
  private deps: WaveOrchestratorDeps;
  currentWaveEvent: WaveEvent | null = null;

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
    const countMult   = dda.countMult;
    const scaledEnemyCount    = Math.max(1, Math.round(cfg.enemyCount    * countMult));
    const scaledGuardCount    = Math.round(cfg.guardCount    * countMult);
    const scaledCollectorCount = Math.round(cfg.collectorCount * countMult);
    const scaledTurretCount   = Math.round(cfg.turretCount   * countMult) + evt.modifiers.turretBonus;
    const scaledSawbladeCount = Math.round(cfg.sawbladeCount * countMult) + evt.modifiers.sawbladeBonus;
    const scaledWelderCount   = Math.round(cfg.welderCount   * countMult);

    for (let i = 0; i < scaledEnemyCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new EnemyAgent(x, y, ctx.playerSprite, scaledHp, scaledSpeed);
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

    for (let i = 0; i < scaledGuardCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new GuardAgent(x, y, ctx.playerSprite, scaledHp + 20, scaledSpeed - 10);
      const sprite = ctx.scene.physics.add.sprite(x, y, "guard")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0).setScale(1.15);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.guards.push(agent);
      const gg = ctx.scene.add.circle(x, y, 14, 0xaa44ff, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, gg);
      this._spawnPortalFX(x, y, 0xaa44ff, i * 80);
    }

    for (let i = 0; i < scaledCollectorCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new CollectorAgent(x, y, ctx.playerSprite, 30, scaledSpeed + 20);
      const sprite = ctx.scene.physics.add.sprite(x, y, "collector")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0).setScale(0.85);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.collectors.push(agent);
      const cg = ctx.scene.add.circle(x, y, 12, 0x44ffcc, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, cg);
      this._spawnPortalFX(x, y, 0x44ffcc, i * 70);
    }

    for (let i = 0; i < scaledTurretCount; i++) {
      const { x, y } = this._randomEdgePosition();
      const agent = new TurretAgent(x, y, ctx.playerSprite, 100 + ctx.waveManager.currentWave * 10);
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
      const { x, y } = this._randomEdgePosition();
      const agent = new WelderAgent(x, y, ctx.playerSprite, 30 + ctx.waveManager.currentWave * 3);
      agent.bindScene(ctx.scene);
      const sprite = ctx.scene.physics.add.sprite(x, y, "welder")
        .setCollideWorldBounds(true).setDepth(50).setAlpha(0);
      agent.bindSprite(sprite);
      ctx.enemyGroup.add(sprite);
      ctx.welders.push(agent);
      const wg = ctx.scene.add.circle(x, y, 12, 0xffcc00, 0.25).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
      ctx.enemyGlows.set(agent.id, wg);
      this._spawnPortalFX(x, y, 0xffcc00, i * 85);
    }

    ctx.allAgents = [
      ...ctx.enemies, ...ctx.guards, ...ctx.collectors,
      ...ctx.turrets, ...ctx.sawblades, ...ctx.welders,
    ];
    // MainScene reads ctx.allAgents.length to resize agentPositions

    if (ctx.enemies.length > 0) {
      const angles = SteeringBehaviors.assignFlankAngles(ctx.enemies.length, Math.random() * Math.PI * 2);
      angles.forEach((a, i) => { ctx.enemies[i].flankAngle = a; });
    }

    const allHealTargets = ctx.allAgents as { posX: number; posY: number; hp: number; maxHp: number }[];
    for (const welder of ctx.welders) {
      welder.setAllies(allHealTargets);
    }
  }

  spawnBoss(): void {
    const ctx = this.ctx;
    const wave = ctx.waveManager.currentWave;
    const bossHp = 500 + wave * 100;
    const px = ctx.playerSprite?.x ?? CELL_W / 2;
    const py = ctx.playerSprite?.y ?? CELL_H / 2;
    const col = Math.floor(px / CELL_W);
    const row = Math.floor(py / CELL_H);
    const roomLeft   = col * CELL_W + 80;
    const roomRight  = (col + 1) * CELL_W - 80;
    const roomTop    = row * CELL_H + 80;
    const roomBottom = (row + 1) * CELL_H - 80;
    const bx = Phaser.Math.Clamp(px, roomLeft, roomRight);
    const by = Phaser.Math.Clamp(py - 200, roomTop, roomBottom);

    const boss = new BossAgent(bx, by, ctx.playerSprite, bossHp);
    boss.bindScene(ctx.scene);
    boss.predictor = this.deps.playerPredictor;
    const sprite = ctx.scene.physics.add.sprite(bx, by, "boss")
      .setCollideWorldBounds(true).setDepth(50).setScale(1.5);
    boss.bindSprite(sprite);
    ctx.enemyGroup.add(sprite);
    ctx.boss = boss;

    const glow = ctx.scene.add.circle(bx, by, 45, 0xff0000, 0.4)
      .setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
    ctx.enemyGlows.set(boss.id, glow);

    this.deps.hudManager.buildBossUI(wave, this._getBossName(wave));

    const arenaX = WORLD_WIDTH / 2;
    const arenaY = WORLD_HEIGHT / 2;
    ctx.playerSprite.setPosition(arenaX, arenaY);
    const playerBody = ctx.playerSprite.body as Phaser.Physics.Arcade.Body;
    playerBody.reset(arenaX, arenaY);
    ctx.scene.cameras.main.centerOn(arenaX, arenaY);

    const announce = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, "⚠ BOSS INCOMING ⚠", {
      fontFamily: "monospace", fontSize: "40px", color: "#ff0000", fontStyle: "bold",
      stroke: "#000", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(120).setScrollFactor(0);
    ctx.scene.tweens.add({
      targets: announce, alpha: 0, scaleX: 1.5, scaleY: 1.5,
      duration: 1500, ease: "Power2", onComplete: () => announce.destroy(),
    });

    Juice.screenShake(ctx.scene, 0.015, 500);
    AudioManager.instance.startBossMusic();
    // Fire narrative boss spawn dialogue
    this.deps.onNarrativeBossSpawn?.(wave);
  }

  onBossDeath(): void {
    const ctx = this.ctx;
    if (!ctx.boss) return;
    const pos = ctx.boss.getPosition();

    ctx.godMode = true;
    ctx.scene.time.delayedCall(3000, () => { ctx.godMode = false; });

    ctx.arenaHazards.clearAll();

    AudioManager.instance.explosion();
    Juice.screenShake(ctx.scene, 0.03, 500);
    Juice.slowMo(ctx.scene, 0.05, 1000);

    for (let i = 0; i < 3; i++) {
      const ring = ctx.scene.add.circle(pos.x, pos.y, 10 + i * 5, 0xff4400, 0.8 - i * 0.2)
        .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
      ctx.scene.tweens.add({
        targets: ring, scaleX: 8 + i * 3, scaleY: 8 + i * 3, alpha: 0,
        duration: 500 + i * 200, delay: i * 100, onComplete: () => ring.destroy(),
      });
    }

    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 120);
      const spark = ctx.scene.add.circle(pos.x, pos.y, 3, 0xff8800, 1).setDepth(15);
      ctx.scene.tweens.add({
        targets: spark,
        x: pos.x + Math.cos(angle) * dist,
        y: pos.y + Math.sin(angle) * dist,
        alpha: 0, duration: 800, onComplete: () => spark.destroy(),
      });
    }

    ctx.boss.clearMines();
    ctx.boss.sprite?.destroy();
    ctx.enemyGlows.get(ctx.boss.id)?.destroy();
    ctx.enemyGlows.delete(ctx.boss.id);
    this.deps.hudManager.destroyBossUI();
    ctx.boss = null;
    AudioManager.instance.stopBossMusic();

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
      fontFamily: "monospace", fontSize: "36px", color: "#00ff88", fontStyle: "bold",
      stroke: "#000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(120).setScrollFactor(0);
    ctx.scene.tweens.add({
      targets: victory, alpha: 0, y: GAME_HEIGHT / 2 - 50,
      duration: 2000, delay: 1000, onComplete: () => victory.destroy(),
    });

    const currentWave = ctx.waveManager.currentWave;
    if (currentWave >= 10) {
      ctx.scene.time.delayedCall(3000, () => {
        ctx.scene.cameras.main.fadeOut(800, 0, 0, 0);
        ctx.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          ctx.scene.scene.start("VictoryScene", {
            kills: ctx.killCount,
            wave: ctx.waveManager.currentWave,
            score: ctx.comboSystem.score,
            maxCombo: ctx.comboSystem.maxCombo,
            scrap: ctx.upgradeSystem.scrap,
          });
        });
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
    ctx.playerSprite.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    ctx.scene.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    ctx.scene.time.delayedCall(2500, () => {
      if (!ctx.gameOver) {
        this.deps.onShowStoryHint?.("◉ BOSS DEFEATED  •  press [B] for shop  •  move to next room", 5000);
      }
    });
  }

  startNextWaveAfterRest(): void {
    const ctx = this.ctx;
    const nextWave = ctx.waveManager.currentWave + 1;
    this.currentWaveEvent = ctx.waveManager.getWaveEvent(nextWave);
    const isBossWave = nextWave % 5 === 0;

    const waveNames: Record<number, string> = {
      1: "FIRST CONTACT", 2: "ASSEMBLER SURGE", 3: "CIRCUIT STORM",
      4: "IRON BATTALION", 5: "BOSS PROTOCOL", 6: "OVERCLOCKED",
      7: "FRACTURE BREACH", 8: "SYSTEMS CRITICAL", 9: "EXTINCTION WAVE", 10: "FINAL RECKONING",
    };
    const subtitle = isBossWave
      ? "⚠ BOSS INCOMING ⚠"
      : (waveNames[nextWave] ?? (
          nextWave >= 8 ? "SYSTEMS CRITICAL" :
          nextWave >= 5 ? "RESISTANCE ESCALATING" :
          nextWave >= 3 ? "THREAT LEVEL RISING" : "INCOMING"
        ));

    const cardBg = ctx.scene.add.graphics().setScrollFactor(0).setDepth(115);
    cardBg.fillStyle(0x000000, 0.75);
    cardBg.fillRect(0, GAME_HEIGHT / 2 - 70, GAME_WIDTH, 140);
    cardBg.lineStyle(1, isBossWave ? 0xff2200 : 0x00ff88, 0.5);
    cardBg.strokeRect(0, GAME_HEIGHT / 2 - 70, GAME_WIDTH, 140);

    const cardWave = ctx.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 22,
      `WAVE ${String(nextWave).padStart(2, "0")}`, {
        fontFamily: "monospace", fontSize: "52px",
        color: isBossWave ? "#ff2200" : "#00ff88",
        fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0).setScale(0.5);

    const cardSub = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 32, subtitle, {
      fontFamily: "monospace", fontSize: "20px",
      color: isBossWave ? "#ff8800" : "#aaffdd",
      letterSpacing: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0);

    let cardEvent: Phaser.GameObjects.Text | undefined;
    if (this.currentWaveEvent && this.currentWaveEvent.type !== "normal") {
      cardEvent = ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, this.currentWaveEvent.label, {
        fontFamily: "monospace", fontSize: "16px",
        color: this.currentWaveEvent.color,
        fontStyle: "bold", letterSpacing: 3,
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0);
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
    waveText.setText(`WAVE ${nextWave}\n${subtitle}`);
    waveText.setAlpha(0).setScale(0.5).setColor(isBossWave ? "#ff0000" : "#00ff88");

    if (isBossWave) {
      Juice.screenShake(ctx.scene, 0.008, 400);
      AudioManager.instance.explosion();
    }

    ctx.scene.time.delayedCall(3000, () => {
      if (ctx.gameOver) return;
      ctx.waveManager.startWave();
      this.spawnWaveEnemies();
      this.deps.fractureFX?.onWaveStart(ctx.waveManager.currentWave);

      const wave = ctx.waveManager.currentWave;
      waveText.setText(`── WAVE ${wave} ──`);
      waveText.setAlpha(1).setScale(1.2);
      ctx.scene.tweens.add({
        targets: waveText,
        alpha: 0, scaleX: 0.8, scaleY: 0.8,
        duration: 800, delay: 1200, ease: "Power2",
      });
      Juice.screenShake(ctx.scene, 0.004, 100);
    });
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
    ctx.mapObstacles.setupForWave(ctx.waveManager.currentWave + 1, ctx.upgradeSystem.unlockedThemes);
    this.deps.onShowStoryHint?.("◉ WAVE CLEARED  •  press [B] for shop  •  move to a new room to continue", 5000);
    return true;
  }

  private _autoUnlockNextRoom(): void {
    const ctx = this.ctx;
    // Unlock order matches room progression: CMD → Bio Lab → Data Lab → Quarantine → Supply → Vault
    const CYCLE = ["control", "factory", "server", "armory", "quarantine", "maintenance", "vault"];
    const ROOM_NAMES: Record<string, string> = {
      factory: "BIO LAB", server: "DATA LAB",
      control: "CMD CENTER", maintenance: "SUPPLY DEPOT",
      quarantine: "QUARANTINE ZONE", vault: "THE VAULT",
    };
    for (const theme of CYCLE) {
      if (!ctx.upgradeSystem.unlockedThemes.has(theme)) {
        ctx.upgradeSystem.unlockedThemes.add(theme);
        ctx.mapObstacles.unlockTheme(theme);
        this.deps.onShowRoomUnlockedNotification?.(ROOM_NAMES[theme] ?? theme.toUpperCase());
        return;
      }
    }
  }

  private _randomEdgePosition(): { x: number; y: number } {
    const ctx = this.ctx;
    const px = ctx.playerSprite?.x ?? WORLD_WIDTH / 2;
    const py = ctx.playerSprite?.y ?? WORLD_HEIGHT / 2;
    return ctx.mapObstacles.getSpawnPositionInPlayerRoom(px, py, 200);
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

  /** Needed by isAgentInCurrentWorld in checkCollisions */
  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    const w = this.ctx.worldManager.currentWorld;
    if (w === WorldType.FOUNDRY) {
      return agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent;
    } else {
      return !(agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent);
    }
  }
}
