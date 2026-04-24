import Phaser from "phaser";
import {
  AI_TICK_RATE, GAME_HEIGHT, GAME_WIDTH, WORLD_WIDTH, WORLD_HEIGHT,
  CELL_W, CELL_H,
  ResourceSystem, SpatialGrid, SystemsBus,
  WaveManager, ScrapManager, UpgradeSystem,
  WorldManager, WorldType, WORLD_PALETTES,
  ComboSystem, ArenaHazards, DDASystem,
  AbilitySystem, PowerUpSystem, MissionSystem,
  MapObstacles, StorySystem,
  GameState, GameStateMachine,
} from "../core";
import type { PlayerStats } from "../core";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { DashSkill } from "../ai/skills/DashSkill";
import { PlayerPredictor } from "../ai/PlayerPredictor";
import { InputMultiplexer } from "../input";
import { Juice, GameJuice, UpgradeUI, FractureFX, DimensionBackground, GlitchEvents, DeathFX, MissionUI, WeaponVisual, EnemyRadar, VFXPool } from "../rendering";
import { AudioManager } from "../audio";
import { AbilityManager, HUDManager, CombatSystem, WaveOrchestrator, PlayerController, StoryController } from "../systems";
import type { GameContext } from "../systems/GameContext";
import { EnemyAgent } from "../agents/EnemyAgent";
import { GuardAgent } from "../agents/GuardAgent";
import { CollectorAgent } from "../agents/CollectorAgent";
import { TurretAgent } from "../agents/TurretAgent";
import { SawbladeAgent } from "../agents/SawbladeAgent";
import { WelderAgent } from "../agents/WelderAgent";
import { ShadowDouble } from "../agents/ShadowDouble";
import { BossAgent } from "../agents/BossAgent";

type AnyAgent = EnemyAgent | GuardAgent | CollectorAgent | TurretAgent | SawbladeAgent | WelderAgent;

export class MainScene extends Phaser.Scene {
  private playerSprite!: Phaser.Physics.Arcade.Sprite;
  private playerHp = 100;
  private playerStats: PlayerStats = { speed: 200, damage: 10, maxHp: 100, fireRate: 280, projectileSpeed: 520, pickupRange: 100 };
  private playerShootSkill!: ShootSkill;
  private playerDashSkill!: DashSkill;
  private playerGlow!: Phaser.GameObjects.Arc;
  private enemies: EnemyAgent[] = [];
  private guards: GuardAgent[] = [];
  private collectors: CollectorAgent[] = [];
  private turrets: TurretAgent[] = [];
  private sawblades: SawbladeAgent[] = [];
  private welders: WelderAgent[] = [];
  private allAgents: AnyAgent[] = [];
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private comboSystem!: ComboSystem;
  private boss: BossAgent | null = null;
  private resourceSprites: Map<number, Phaser.GameObjects.Arc> = new Map();
  private enemyGlows: Map<number, Phaser.GameObjects.Arc> = new Map();
  private spatialGrid!: SpatialGrid;
  private agentPositions!: Float32Array;
  private inputMux!: InputMultiplexer;
  private waveManager!: WaveManager;
  private scrapManager!: ScrapManager;
  private upgradeSystem!: UpgradeSystem;
  private upgradeUI!: UpgradeUI;
  private worldManager!: WorldManager;
  private arenaHazards!: ArenaHazards;
  private ddaSystem!: DDASystem;
  private playerPredictor!: PlayerPredictor;
  private qKey!: Phaser.Input.Keyboard.Key;
  private shopKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;
  private fKey!: Phaser.Input.Keyboard.Key;
  private cKey!: Phaser.Input.Keyboard.Key;
  private repairKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private dimensionTint!: Phaser.GameObjects.Rectangle;
  private fractureFX!: FractureFX;
  private dimensionBg!: DimensionBackground;
  private glitchEvents!: GlitchEvents;
  private deathFX!: DeathFX;
  private shadowDouble!: ShadowDouble;
  private gameJuice!: GameJuice;
  private vfxPool!: VFXPool;
  private readonly _radarCache: { posX: number; posY: number; type: string; isDead?: boolean }[] = [];
  private readonly _stateMachine = new GameStateMachine();
  private aiAccumulator = 0;
  private _aiLearningShown = false;
  private tutorialOverlay: Phaser.GameObjects.Text | null = null;
  private killCount = 0;
  private totalScrapCollected = 0;
  private deathQueue: AnyAgent[] = [];
  private contactDamageCooldown = 0;
  private iFrameTimer = 0;
  private playerKnockbackVX = 0;
  private playerKnockbackVY = 0;
  private pauseContainer: Phaser.GameObjects.Container | null = null;
  private playerHeat = 0;
  private heatOverheatTimer = 0;
  private abilitySystem!: AbilitySystem;
  private abilityShieldActive = false;
  private abilityShieldTimer = 0;
  private abilityShieldGfx: Phaser.GameObjects.Arc | null = null;
  private powerUpSystem!: PowerUpSystem;
  private _baseFireRate = 280;
  private _baseDamage = 10;
  private _baseSpeed = 200;
  private damageTakenThisWave = 0;
  private missionSystem!: MissionSystem;
  private missionUI!: MissionUI;
  private weaponVisual!: WeaponVisual;
  private enemyRadar!: EnemyRadar;
  private mapObstacles!: MapObstacles;
  private fogOverlay!: Phaser.GameObjects.Graphics;
  private _fogMaskGfx!: Phaser.GameObjects.Graphics;
  // ── Reactor power restore mechanic ──────────────────────
  private _powerCardHeld = false;
  private _powerCardSprite: Phaser.GameObjects.Arc | null = null;
  private _corruptionCriticalShown = false;
  private _waveCooldownMs = 0;  // rest timer after wave clear
  // ── Reactor defense mechanic ───────────────────────────
  private reactorHp = 500;
  private reactorMaxHp = 500;
  private _reactorDmgCooldown = 0;
  private _reactorWarnShown50 = false;
  private _reactorWarnShown25 = false;
  // ── Shop / interact proximity hint ──────────────────────
  private _interactHint: Phaser.GameObjects.Text | null = null;
  private playerShielded = false;
  private _physicsZoneBannerText: Phaser.GameObjects.Text | null = null;
  private storySystem!: StorySystem;
  private godMode = false;
  private _worldSwitchTutorialShown = false;
  private _ctx!: GameContext;
  private _abilityMgr!: AbilityManager;
  private _hudMgr!: HUDManager;
  private _combatSys!: CombatSystem;
  private _waveOrch!: WaveOrchestrator;
  private _playerCtrl!: PlayerController;
  private _storyCtrl!: StoryController;

  private get gameOver(): boolean { return this._stateMachine.isGameOver; }
  private set gameOver(v: boolean) { if (v) this._stateMachine.transition(GameState.GAME_OVER); }
  private get paused(): boolean { return this._stateMachine.isPaused; }
  private set paused(v: boolean) {
    if (v) this._stateMachine.transition(GameState.PAUSED);
    else if (!this._stateMachine.isGameOver) this._stateMachine.transition(GameState.PLAYING);
  }

  private static readonly MAX_HEAT = 100;
  private static readonly WORLD_SWITCH_HEAT_COST = 18;

  constructor() { super({ key: "MainScene" }); }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this._resetState();
    ShootSkill.initPool(this, 256);
    this.spatialGrid = new SpatialGrid(WORLD_WIDTH, WORLD_HEIGHT, 80);
    this.waveManager = new WaveManager();
    this.scrapManager = new ScrapManager(this);
    this.upgradeSystem = new UpgradeSystem(this.playerStats);
    this.upgradeUI = new UpgradeUI(this);
    this.worldManager = new WorldManager();
    this.arenaHazards = new ArenaHazards(this);
    this.mapObstacles = new MapObstacles(this);
    this.comboSystem = new ComboSystem();
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.shopKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => this._togglePause());
    this.repairKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.storySystem = new StorySystem();
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.input.keyboard!.on('keydown-G', (ev: KeyboardEvent) => {
      if (ev.ctrlKey) { this.godMode = !this.godMode; this._storyCtrl?.showGodModeIndicator(this.godMode); }
    });
    this.abilitySystem = new AbilitySystem();
    this.powerUpSystem = new PowerUpSystem(this);
    this._baseFireRate = this.playerStats.fireRate;
    this._baseDamage = this.playerStats.damage;
    this._baseSpeed = this.playerStats.speed;
    this._spawnPlayer();
    this._spawnResources(30);
    this.mapObstacles.setupForWave(1, this.upgradeSystem.unlockedThemes);
    this.fogOverlay = this.add.graphics().setDepth(100).setScrollFactor(0);
    // Geometry mask: punch a transparent hole where the player can see (inverted = fog outside the circle)
    this._fogMaskGfx = this.add.graphics().setScrollFactor(0).setVisible(false);
    const _fogGeomMask = this._fogMaskGfx.createGeometryMask();
    _fogGeomMask.setInvertAlpha(true);
    this.fogOverlay.setMask(_fogGeomMask);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.playerSprite, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(60, 40);
    this.allAgents = [];
    this.agentPositions = new Float32Array(0);
    this.inputMux = new InputMultiplexer(this);
    this.playerShootSkill = new ShootSkill(-1, { damage: this.playerStats.damage, range: 320, speed: this.playerStats.projectileSpeed, tint: 0x00ff88 }, this.playerStats.fireRate);
    this.playerDashSkill = new DashSkill(520, 1000, 5);
    this._registerBusEvents();
    AudioManager.instance.init();
    AudioManager.instance.setScene(this);
    AudioManager.instance.startMusic('foundry');
    try { this.dimensionBg = new DimensionBackground(this); } catch (e) { console.error("DimensionBg init failed:", e); }
    try { this.fractureFX = new FractureFX(this); } catch (e) { console.error("FractureFX init failed:", e); }
    try { this.glitchEvents = new GlitchEvents(this); } catch (e) { console.error("GlitchEvents init failed:", e); }
    try { this.deathFX = new DeathFX(this); } catch (e) { console.error("DeathFX init failed:", e); }
    try { this.shadowDouble = new ShadowDouble(this, this.playerSprite); } catch (e) { console.error("ShadowDouble init failed:", e); }
    this.gameJuice = new GameJuice(this);
    this.gameJuice.initAmbient();
    this.vfxPool = new VFXPool(this);
    this.missionSystem = new MissionSystem();
    this.missionUI = new MissionUI(this);
    this.weaponVisual = new WeaponVisual(this);
    this.enemyRadar = new EnemyRadar(this);
    this._ctx = this._buildGameContext();
    this._combatSys = new CombatSystem(this._ctx, { fractureFX: this.fractureFX, deathFX: this.deathFX, dimensionBg: this.dimensionBg, glitchEvents: this.glitchEvents });
    this._combatSys.onAddKill = (pos) => this._playerCtrl?.addKill(pos);
    this._combatSys.onBreakStreak = () => this._playerCtrl?.breakStreak();
    this._combatSys.onGameOver = () => this._onGameOver();
    this._hudMgr = new HUDManager(this._ctx, this.missionUI, () => this._openShop(false));
    this._hudMgr.build();
    this._abilityMgr = new AbilityManager(this._ctx, { eKey: this.eKey, rKey: this.rKey, fKey: this.fKey, cKey: this.cKey }, (x, y, c, n) => this._combatSys.spawnHitSparks(x, y, c, n));
    this._waveOrch = new WaveOrchestrator(this._ctx, {
      hudManager: this._hudMgr, fractureFX: this.fractureFX, playerPredictor: this.playerPredictor,
      onShowStoryHint: (msg, dur) => this._storyCtrl?.showStoryHint(msg, dur),
      onRestoreStoryPower: () => this._storyCtrl?.restorePower(),
      getStoryPhase: () => this.storySystem.phase,
      onShowRoomUnlockedNotification: (name) => this._showRoomUnlockedNotification(name),
      onNarrativeWaveStart: (wave) => this._storyCtrl?.onWaveStart(wave),
      onNarrativeWaveClear: (wave) => this._storyCtrl?.onWaveClear(wave),
      onNarrativeBossSpawn: (wave) => this._storyCtrl?.onBossSpawn(wave),
      onNarrativeBossKill: (wave) => this._storyCtrl?.onBossKill(wave),
      onClearTriggeredRooms: () => this.storySystem.triggeredRooms.clear(),
    });
    this._playerCtrl = new PlayerController(this._ctx, this.playerGlow, this.playerShootSkill, this.playerDashSkill, this.weaponVisual, this.gameJuice, this._combatSys, () => this._tryTriggerWave("shoot"), (label) => this._showPhysicsZoneBanner(label));
    this._storyCtrl = new StoryController(this._ctx, this.storySystem, this.interactKey, () => this._tryTriggerWave("enter"));
    this.physics.add.collider(this.playerSprite, this.mapObstacles.staticGroup);
    this.enemyGroup = this.physics.add.group();
    this.physics.add.collider(this.enemyGroup, this.mapObstacles.staticGroup);
    this.events.on("obstacle_explosion", (cx: number, cy: number, radius: number, damage: number) => {
      for (const agent of this.allAgents) { if (agent.isDead || !agent.sprite) continue; const dx = agent.posX - cx, dy = agent.posY - cy; if (dx*dx+dy*dy < radius*radius) agent.takeDamage(damage); }
    });
    const pal = this.worldManager.palette;
    this.dimensionTint = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, pal.tintColor, 0.10).setScrollFactor(0).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this._storyCtrl.showLoreIntro();
    this.cameras.main.fadeIn(400, 0, 0, 0);
    // Floating interact hint (screen-space UI)
    this._interactHint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, "", {
      fontFamily: "monospace", fontSize: "14px", color: "#ffffff",
      backgroundColor: "#000000cc", padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(150).setScrollFactor(0).setAlpha(0);
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameOver || this.paused || this.upgradeUI.isVisible) return;
    const deltaSec = deltaMs / 1000;
    this.waveManager.update(deltaMs);
    this.comboSystem.update(deltaMs);
    const inp = this.inputMux.update(this.playerSprite.x, this.playerSprite.y);
    this._storyCtrl.updateStory();
    this._storyCtrl.updateBlackoutVision();
    this._storyCtrl.updateSurveillancePlayerDots();
    let _rc = 0;
    const _fillRadar = (agents: readonly { posX: number; posY: number; isDead?: boolean }[], type: string) => {
      for (const a of agents) { if (this._radarCache.length <= _rc) this._radarCache.push({ posX: 0, posY: 0, type: "", isDead: false }); const e = this._radarCache[_rc++]; e.posX = a.posX; e.posY = a.posY; e.type = type; e.isDead = a.isDead; }
    };
    _fillRadar(this.enemies, "enemy"); _fillRadar(this.guards, "guard"); _fillRadar(this.collectors, "collector");
    _fillRadar(this.turrets, "turret"); _fillRadar(this.sawblades, "sawblade"); _fillRadar(this.welders, "welder");
    if (this.boss) { if (this._radarCache.length <= _rc) this._radarCache.push({ posX: 0, posY: 0, type: "", isDead: false }); const be = this._radarCache[_rc++]; be.posX = this.boss.posX; be.posY = this.boss.posY; be.type = "boss"; be.isDead = this.boss.isDead; }
    this.enemyRadar.update(this.playerSprite.x, this.playerSprite.y, this.cameras.main, this._radarCache, _rc);
    if (Phaser.Input.Keyboard.JustDown(this.qKey) && this.worldManager.canSwitch) {
      this.playerHeat = Math.min(MainScene.MAX_HEAT - 1, this.playerHeat + MainScene.WORLD_SWITCH_HEAT_COST);
      this._performWorldSwitch(); this.missionSystem.onWorldSwitch();
      if (!this._worldSwitchTutorialShown) {
        this._worldSwitchTutorialShown = true;
        this._showWorldSwitchTutorial();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.shopKey) && !this.upgradeUI.isVisible) this._openShop(false);
    const instabilityDmg = this.worldManager.update(deltaMs);
    if (instabilityDmg > 0) {
      this._combatSys.damagePlayer(instabilityDmg);
      const warn = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.15).setDepth(199).setScrollFactor(0);
      this.tweens.add({ targets: warn, alpha: 0, duration: 300, onComplete: () => warn.destroy() });
    }
    this.ddaSystem.update(deltaMs);
    this.ddaSystem.recordPlayerHp(this.playerHp / this.playerStats.maxHp);
    if (this.ddaSystem.lastChange) {
      const ch = this.ddaSystem.lastChange;
      const msg = ch.direction === "up" ? "⚡ CORE IS LEARNING YOUR PATTERNS" : "⚙ CORE RECALIBRATING";
      const col = ch.direction === "up" ? "#ff4400" : "#00ccff";
      const note = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2+80, msg, { fontFamily: "monospace", fontSize: "14px", color: col, fontStyle: "bold", stroke: "#000000", strokeThickness: 3, backgroundColor: "#00000088", padding: { x: 12, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(115).setAlpha(0);
      this.tweens.add({ targets: note, alpha: 1, duration: 300, onComplete: () => this.time.delayedCall(1800, () => { this.tweens.add({ targets: note, alpha: 0, duration: 500, onComplete: () => note.destroy() }); }) });
    }
    this.playerPredictor.update(deltaMs, this.playerSprite.x, this.playerSprite.y, this.worldManager.currentWorld);
    if (!this._aiLearningShown && this.playerPredictor.sampleCount >= 15) { this._aiLearningShown = true; this._storyCtrl.showAiLearningNotice(); }
    this._playerCtrl.update(deltaMs, inp);
    // Safety: push player out of locked-door barriers in case arcade physics
    // tunneled through (high velocity dash, low-fps frame, etc.)
    if (this.mapObstacles && this.playerSprite) {
      const br = this.mapObstacles.resolveBarrierCollision(this.playerSprite.x, this.playerSprite.y, 20);
      if (br.x !== this.playerSprite.x || br.y !== this.playerSprite.y) {
        this.playerSprite.setPosition(br.x, br.y);
        (this.playerSprite.body as Phaser.Physics.Arcade.Body).reset(br.x, br.y);
      }
    }
    this._abilityMgr.update(deltaMs);
    this.powerUpSystem.update(deltaMs);
    const puType = this.powerUpSystem.checkPickup(this.playerSprite.x, this.playerSprite.y, this.playerStats.pickupRange);
    if (puType) { this._applyPowerUp(puType); this._showPowerUpText(puType); }
    ShootSkill.updateAll(deltaMs);
    if (this.mapObstacles) {
      this.mapObstacles.updateBossPhysics(deltaMs);
      const bossWind = this.mapObstacles.isBossArena ? this.mapObstacles.bossWindForce : null;
      const wds = deltaMs * 0.001;
      for (const proj of ShootSkill.activeProjectiles) {
        const body = (proj.sprite as any).body as Phaser.Physics.Arcade.Body; if (!body) continue;
        // Boss-owned projectiles ignore the arena wind & room-zone wind. The
        // boss IS the source of the field — its shots fly true so it can hit
        // the player as reliably as the player can hit it (was making the boss
        // miss every shot in phases 3-4).
        const isBossProjectile = proj.ownerId >= 9000;
        if (isBossProjectile) continue;
        const pZone = this.mapObstacles.getRoomPhysicsAt(proj.sprite.x, proj.sprite.y);
        if (pZone?.windForce) { body.velocity.x = Phaser.Math.Clamp(body.velocity.x + pZone.windForce.x*wds*3, -900, 900); body.velocity.y = Phaser.Math.Clamp(body.velocity.y + pZone.windForce.y*wds*3, -900, 900); }
        if (bossWind) { body.velocity.x = Phaser.Math.Clamp(body.velocity.x + bossWind.x*wds*4, -1000, 1000); body.velocity.y = Phaser.Math.Clamp(body.velocity.y + bossWind.y*wds*4, -1000, 1000); }
      }
    }
    this._combatSys.checkCollisions(deltaMs);
    const hazardDmg = this.arenaHazards.update(deltaMs, this.playerSprite.x, this.playerSprite.y);
    if (hazardDmg > 0) this._combatSys.damagePlayer(Math.ceil(hazardDmg));
    this.mapObstacles.update();
    // ── REACTOR DEFENSE: enemies reaching reactor deal damage ────────────────
    const reactDefPos = this.mapObstacles?.reactorMachinePos;
    if (reactDefPos && !this.gameOver) {
      this._reactorDmgCooldown = Math.max(0, this._reactorDmgCooldown - deltaMs);
      if (this._reactorDmgCooldown <= 0) {
        const DAMAGE_R2 = 58 * 58;
        let anyInRange = false;
        for (const agent of this.allAgents) {
          if (agent.isDead) continue;
          const dx = agent.posX - reactDefPos.x;
          const dy = agent.posY - reactDefPos.y;
          if (dx * dx + dy * dy < DAMAGE_R2) { anyInRange = true; break; }
        }
        if (anyInRange) {
          this.reactorHp = Math.max(0, this.reactorHp - 15);
          this._reactorDmgCooldown = 500;
          this._hudMgr?.flashReactorBar();
          AudioManager.instance.reactorAlarm();
          Juice.screenShake(this, 0.007, 140);
          if (!this._reactorWarnShown50 && this.reactorHp <= this.reactorMaxHp * 0.5) {
            this._reactorWarnShown50 = true;
            this._storyCtrl?.showStoryHint("⚠ WARNING: REACTOR AT 50% — ELIMINATE ATTACKERS!", 4500);
          }
          if (!this._reactorWarnShown25 && this.reactorHp <= this.reactorMaxHp * 0.25) {
            this._reactorWarnShown25 = true;
            this._storyCtrl?.showStoryHint("🔴 CRITICAL: REACTOR AT 25%! STATION WILL BE LOST!", 5500);
          }
          if (this.reactorHp <= 0) this._reactorDestroyed();
        }
      }
      // Update reactor damage overlay (drawn directly on world layer)
      const overlay = this.mapObstacles.reactorDamageOverlay;
      if (overlay) {
        overlay.clear();
        const hpRatio = this.reactorHp / this.reactorMaxHp;
        if (hpRatio < 1) {
          const dmgRatio = 1 - hpRatio;
          overlay.fillStyle(0xff2200, dmgRatio * 0.55);
          overlay.fillCircle(reactDefPos.x, reactDefPos.y, 60);
          // Warning pulse ring when below 50%
          if (hpRatio < 0.5) {
            const pulse = Math.sin(performance.now() * 0.006) * 0.5 + 0.5;
            overlay.lineStyle(3, 0xff4400, 0.4 + pulse * 0.5);
            overlay.strokeCircle(reactDefPos.x, reactDefPos.y, 65 + pulse * 8);
          }
        }
      }
    }
    const laserDmg = this.mapObstacles.checkLaserDamage(this.playerSprite.x, this.playerSprite.y, 14);
    if (laserDmg > 0) this._combatSys.damagePlayer(laserDmg);
    this.fogOverlay.clear();
    this._fogMaskGfx.clear();
    const fogZone = this.mapObstacles?.getRoomPhysicsAt(this.playerSprite.x, this.playerSprite.y) ?? null;
    if (fogZone && fogZone.visibilityRadius > 0) {
      // Fill the whole screen with dark fog
      this.fogOverlay.fillStyle(0x050510, 0.90);
      this.fogOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      // The mask graphics punches a transparent circle = the visible area
      this._fogMaskGfx.fillStyle(0xffffff, 1);
      this._fogMaskGfx.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, fogZone.visibilityRadius);
    }
    if (this.mapObstacles) {
      const propEnemies: { posX: number; posY: number; hp: number; takeDamage(n: number): void }[] = [];
      for (const agent of this.allAgents) { if (agent.isDead) continue; propEnemies.push({ posX: agent.posX, posY: agent.posY, hp: agent.hp, takeDamage: (n) => { agent.hp -= n; } }); }
      const propResults = this.mapObstacles.updateActiveProps(this.playerSprite.x, this.playerSprite.y, deltaMs, propEnemies);
      const pBody = this.playerSprite.body as Phaser.Physics.Arcade.Body | null;
      if (pBody) { pBody.velocity.x += propResults.playerVelocityMod.x; pBody.velocity.y += propResults.playerVelocityMod.y; }
      this.playerShielded = propResults.playerShielded;
    }
    this.scrapManager.update(this.playerSprite.x, this.playerSprite.y, deltaMs);
    this._updateInteractMechanics();
    if (Phaser.Input.Keyboard.JustDown(this.repairKey)) {
      const repaired = this.mapObstacles.repairNearby(this.playerSprite.x, this.playerSprite.y, 100, 30);
      if (repaired) {
        const fx = this.add.circle(this.playerSprite.x, this.playerSprite.y, 40, 0x44ff88, 0.4).setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: fx, scaleX: 2, scaleY: 2, alpha: 0, duration: 400, onComplete: () => fx.destroy() });
        this.comboSystem.addScore(25);
      }
    }
    this.aiAccumulator += deltaSec;
    while (this.aiAccumulator >= AI_TICK_RATE) { this._rebuildSpatialGrid(); this._tickAllAgents(AI_TICK_RATE); this.aiAccumulator -= AI_TICK_RATE; }
    if (this.boss && !this.boss.isDead) this.boss.tick(deltaSec);
    this._updateAgentVisuals(deltaMs);
    this._hudMgr.drawBreachRings();
    if (this.boss && !this.boss.isDead) {
      this.boss.updateMovement(deltaMs);
      const bRes = this.mapObstacles.resolveCollision(this.boss.posX, this.boss.posY, 24);
      if (bRes.x !== this.boss.posX || bRes.y !== this.boss.posY) { this.boss.posX = bRes.x; this.boss.posY = bRes.y; if (this.boss.sprite) this.boss.sprite.setPosition(bRes.x, bRes.y); }
      const bossGlow = this.enemyGlows.get(this.boss.id);
      if (bossGlow) bossGlow.setPosition(this.boss.posX, this.boss.posY);
      this._hudMgr.updateBossHpBar(this.boss.hp, this.boss.maxHp);
    }
    this._combatSys.processDeath();
    if (this.boss?.isDead) {
      this._waveOrch.onBossDeath();
      this._waveCooldownMs = 12000; // post-boss rest: same cooldown as a normal wave clear
    }
    if (this.agentPositions.length !== this.allAgents.length * 2) this.agentPositions = new Float32Array(this.allAgents.length * 2);
    if (this._waveOrch.checkWaveCleared()) {
      this._waveCooldownMs = 12000; // 12 seconds rest after wave clear
    }
    if (this._waveCooldownMs > 0) this._waveCooldownMs -= deltaMs;
    this._hudMgr.update(this.playerHeat, this.heatOverheatTimer);
    if (this._storyCtrl) this._hudMgr.setNarrativePhase(`▸ ${this._storyCtrl.getNarrativePhaseLabel()}`);
    const intensity = this.fractureFX?.intensity ?? 0;
    this.fractureFX?.update(deltaMs);
    const breachCount = this.guards.filter(g => g.breach?.isActive).length + this.collectors.filter(c => c.breach?.isActive).length;
    this.dimensionBg?.setReactivity(this._countActiveEnemies(), breachCount);
    this.dimensionBg?.update(deltaMs, intensity);
    this.glitchEvents?.update(deltaMs, intensity);
    this.deathFX?.update(deltaMs);
    this.shadowDouble?.update(deltaMs, this.playerSprite.x, this.playerSprite.y, inp.aimAngle);
    this.shadowDouble?.setIntensity(intensity);
    this.gameJuice.update(deltaMs);
    if (this.contactDamageCooldown > 0) this.contactDamageCooldown -= deltaMs;
    if (this.iFrameTimer > 0) this.iFrameTimer -= deltaMs;
  }

  private _updateAgentVisuals(deltaMs: number): void {
    const corruptibleMachines = this.mapObstacles.getCorruptibleMachines();
    for (const agent of this.allAgents) {
      if ("updateMovement" in agent) {
        (agent as EnemyAgent).updateMovement(deltaMs);
        const resolved = this.mapObstacles.resolveCollision(agent.posX, agent.posY, 16);
        if (resolved.x !== agent.posX || resolved.y !== agent.posY) { agent.posX = resolved.x; agent.posY = resolved.y; if (agent.sprite) agent.sprite.setPosition(resolved.x, resolved.y); }
        const eLaserDmg = this.mapObstacles.checkLaserDamage(agent.posX, agent.posY, 14);
        if (eLaserDmg > 0 && agent.hp > 0) agent.hp -= eLaserDmg;
        if (agent.hp > 0 && !agent.isDead) {
          for (const m of corruptibleMachines) { const cdx = agent.posX - m.x, cdy = agent.posY - m.y; if (cdx*cdx+cdy*cdy < 3600) { this.mapObstacles.corruptMachine(m.id, 0.15); break; } }
        }
        const enemyZone = this.mapObstacles.getRoomPhysicsAt(agent.posX, agent.posY);
        if (enemyZone) {
          if (enemyZone.enemySpeedMod != null && enemyZone.enemySpeedMod !== 1 && agent.sprite?.body) {
            (agent.sprite.body as Phaser.Physics.Arcade.Body).velocity.x *= enemyZone.enemySpeedMod;
            (agent.sprite.body as Phaser.Physics.Arcade.Body).velocity.y *= enemyZone.enemySpeedMod;
          }
          if (enemyZone.gravityPull) {
            const gp = enemyZone.gravityPull;
            const gdx = gp.x - agent.posX, gdy = gp.y - agent.posY;
            const gDist = Math.sqrt(gdx*gdx + gdy*gdy);
            if (gDist > 10 && gDist < 500) { agent.posX += (gdx/gDist)*gp.strength*deltaMs*0.001; agent.posY += (gdy/gDist)*gp.strength*deltaMs*0.001; if (agent.sprite) agent.sprite.setPosition(agent.posX, agent.posY); }
          }
        }
      }
      if (agent instanceof SawbladeAgent && agent.sprite) agent.sprite.rotation += 0.15;
      if (agent.sprite && agent.sprite.body) { const vx = (agent.sprite.body as Phaser.Physics.Arcade.Body).velocity.x; if (vx > 5) agent.sprite.setFlipX(false); else if (vx < -5) agent.sprite.setFlipX(true); }
      const glow = this.enemyGlows.get(agent.id);
      if (glow) glow.setPosition(agent.posX, agent.posY);
      if (agent.sprite) {
        const inWorld = this._isAgentInCurrentWorld(agent);
        const breach = (agent as GuardAgent | CollectorAgent).breach;
        const isBreaching = breach?.isActive ?? false, isCharging = breach?.isCharging ?? false;
        let targetAlpha: number;
        if (isBreaching) {
          targetAlpha = 1.0;
          const pulse = Math.sin(performance.now() * 0.008) * 0.5 + 0.5;
          agent.sprite.setTint(Phaser.Display.Color.GetColor(255, Math.floor(pulse * 80), 255));
        } else if (isCharging) {
          targetAlpha = 0.5 + breach.chargeProgress * 0.5;
          const v = Math.floor(breach.chargeProgress * 200);
          agent.sprite.setTint(Phaser.Display.Color.GetColor(100 + v, 0, 200 + v));
        } else {
          if (!inWorld) agent.sprite.clearTint();
          targetAlpha = inWorld ? 1 : 0.15;
        }
        agent.sprite.alpha += (targetAlpha - agent.sprite.alpha) * 0.12;
        if (glow) { glow.alpha = (isBreaching || inWorld) ? 0.35 : 0.04; if (isBreaching) glow.setFillStyle(0xff00ff, 0.4); else if (isCharging) glow.setFillStyle(0xaa44ff, 0.3); }
      }
    }
  }

  private _buildGameContext(): GameContext {
    const s = this;
    return {
      get scene()                 { return s as unknown as Phaser.Scene; },
      get playerSprite()          { return s.playerSprite; },
      get playerHp()              { return s.playerHp; },         set playerHp(v)             { s.playerHp = v; },
      get playerHeat()            { return s.playerHeat; },       set playerHeat(v)           { s.playerHeat = v; },
      get heatOverheatTimer()     { return s.heatOverheatTimer; }, set heatOverheatTimer(v)   { s.heatOverheatTimer = v; },
      get playerStats()           { return s.playerStats; },
      get mapObstacles()          { return s.mapObstacles; },
      get waveManager()           { return s.waveManager; },
      get upgradeSystem()         { return s.upgradeSystem; },
      get scrapManager()          { return s.scrapManager; },
      get comboSystem()           { return s.comboSystem; },
      get abilitySystem()         { return s.abilitySystem; },
      get missionSystem()         { return s.missionSystem; },
      get powerUpSystem()         { return s.powerUpSystem; },
      get worldManager()          { return s.worldManager; },
      get ddaSystem()             { return s.ddaSystem; },
      get arenaHazards()          { return s.arenaHazards; },
      get enemies()               { return s.enemies; },          set enemies(v)              { s.enemies = v; },
      get guards()                { return s.guards; },           set guards(v)               { s.guards = v; },
      get collectors()            { return s.collectors; },       set collectors(v)           { s.collectors = v; },
      get turrets()               { return s.turrets; },          set turrets(v)              { s.turrets = v; },
      get sawblades()             { return s.sawblades; },        set sawblades(v)            { s.sawblades = v; },
      get welders()               { return s.welders; },          set welders(v)              { s.welders = v; },
      get allAgents()             { return s.allAgents; },        set allAgents(v)            { s.allAgents = v; },
      get boss()                  { return s.boss; },             set boss(v)                 { s.boss = v; },
      get enemyGlows()            { return s.enemyGlows; },
      get enemyGroup()            { return s.enemyGroup; },
      get killCount()             { return s.killCount; },        set killCount(v)            { s.killCount = v; },
      get gameOver()              { return s.gameOver; },         set gameOver(v)             { s.gameOver = v; },
      get godMode()               { return s.godMode; },          set godMode(v)              { s.godMode = v; },
      get playerShielded()        { return s.playerShielded; },   set playerShielded(v)       { s.playerShielded = v; },
      get damageTakenThisWave()   { return s.damageTakenThisWave; }, set damageTakenThisWave(v) { s.damageTakenThisWave = v; },
      get abilityShieldActive()   { return s.abilityShieldActive; }, set abilityShieldActive(v) { s.abilityShieldActive = v; },
      get abilityShieldTimer()    { return s.abilityShieldTimer; },  set abilityShieldTimer(v)  { s.abilityShieldTimer = v; },
      get abilityShieldGfx()      { return s.abilityShieldGfx; },   set abilityShieldGfx(v)    { s.abilityShieldGfx = v; },
      get contactDamageCooldown() { return s.contactDamageCooldown; }, set contactDamageCooldown(v) { s.contactDamageCooldown = v; },
      get iFrameTimer()           { return s.iFrameTimer; },           set iFrameTimer(v)           { s.iFrameTimer = v; },
      get playerKnockbackVX()     { return s.playerKnockbackVX; },     set playerKnockbackVX(v)     { s.playerKnockbackVX = v; },
      get playerKnockbackVY()     { return s.playerKnockbackVY; },     set playerKnockbackVY(v)     { s.playerKnockbackVY = v; },
      get deathQueue()            { return s.deathQueue; },
      get reactorHp()             { return s.reactorHp; },         set reactorHp(v)             { s.reactorHp = v; },
      get reactorMaxHp()          { return s.reactorMaxHp; },
    };
  }

  private _spawnPlayer(): void {
    const usePxPlayer = this.textures.exists("player_idle_sheet");
    const tex = usePxPlayer ? "player_idle_sheet" : "player";
    const spawnX = Math.floor(CELL_W / 2), spawnY = Math.floor(CELL_H + CELL_H / 2);  // Hub at row 1
    this.playerSprite = this.physics.add.sprite(spawnX, spawnY, tex);
    this.playerSprite.setCollideWorldBounds(true).setDepth(50).setScale(usePxPlayer ? 2.2 : 1.3).setData("hp", this.playerHp);
    if (usePxPlayer) this.playerSprite.play("player_idle");
    this.playerGlow = this.add.circle(spawnX, spawnY, 20, 0x00ff88, 0.3).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
  }

  private _spawnResources(count: number): void {
    const rs = ResourceSystem.instance;
    rs.clear();
    this.resourceSprites.forEach(s => s.destroy());
    this.resourceSprites.clear();
    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(60, WORLD_WIDTH - 60), y = Phaser.Math.Between(60, WORLD_HEIGHT - 60);
      const node = rs.spawn(x, y, 20, 8000);
      this.resourceSprites.set(node.id, this.add.circle(x, y, 8, 0xffcc00, 1).setDepth(1));
    }
  }

  private _updateInteractMechanics(): void {
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;
    let hintText = "";

    // ── SHOP TERMINAL (Armory) ─────────────────────────────
    const shopPos = this.mapObstacles?.shopTerminalPos;
    if (shopPos) {
      const shopDist = Math.hypot(px - shopPos.x, py - shopPos.y);
      if (shopDist < 120) {
        hintText = "[ X ] OPEN SHOP";
        if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
          this._openShop(false);
          return;
        }
      }
    }

    // ── CORRUPTION 80% → POWER CARD SPAWNS ────────────────
    const stats = this.mapObstacles?.getCorruptionStats();
    if (stats && stats.total > 0 && stats.avgCorruption >= 80 && !this._powerCardHeld && !this._powerCardSprite) {
      if (!this._corruptionCriticalShown) {
        this._corruptionCriticalShown = true;
        this._storyCtrl?.showStoryHint("⚠ CRITICAL CORRUPTION — find the POWER CARD and restore the reactor!", 6000);
        this._storyCtrl?.checkCorruptionWarning();
        // Spawn power card in a room away from player
        const reactorPos = this.mapObstacles.reactorMachinePos;
        const cardX = reactorPos ? reactorPos.x - 180 : 400;
        const cardY = reactorPos ? reactorPos.y - 180 : 300;
        this._powerCardSprite = this.add.circle(cardX, cardY, 14, 0x00ff88, 1).setDepth(16);
        this.tweens.add({
          targets: this._powerCardSprite,
          alpha: { from: 0.5, to: 1 }, scaleX: { from: 0.8, to: 1.2 }, scaleY: { from: 0.8, to: 1.2 },
          duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        });
        const cardLabel = this.add.text(cardX, cardY - 22, "POWER CARD", {
          fontFamily: "monospace", fontSize: "11px", color: "#00ff88",
          stroke: "#000", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(17);
        this.tweens.add({ targets: cardLabel, alpha: { from: 0.6, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
      }
    }

    // ── PICK UP POWER CARD ─────────────────────────────────
    if (this._powerCardSprite && !this._powerCardHeld) {
      const cdx = px - this._powerCardSprite.x;
      const cdy = py - this._powerCardSprite.y;
      if (cdx * cdx + cdy * cdy < 30 * 30) {
        this._powerCardHeld = true;
        this._powerCardSprite.destroy();
        this._powerCardSprite = null;
        this._storyCtrl?.showStoryHint("POWER CARD acquired — go to the REACTOR CORE and press [ X ]!", 5000);
      }
    }

    // ── USE POWER CARD AT REACTOR ──────────────────────────
    const reactPos = this.mapObstacles?.reactorMachinePos;
    if (reactPos && this._powerCardHeld) {
      const rDist = Math.hypot(px - reactPos.x, py - reactPos.y);
      if (rDist < 100) {
        hintText = "[ X ] RESTORE POWER";
        if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
          this._restoreReactorPower();
          return;
        }
      }
    }

    // ── Interact hint display ──────────────────────────────
    if (this._interactHint) {
      if (hintText) {
        this._interactHint.setText(hintText).setAlpha(1);
      } else {
        this._interactHint.setAlpha(0);
      }
    }
  }

  private _restoreReactorPower(): void {
    this._powerCardHeld = false;
    this._corruptionCriticalShown = false;
    // Reset all obstacle corruption to zero
    for (const obs of this.mapObstacles.getObstacles() as unknown as { corruption: number; kind: string; hp: number }[]) {
      if (obs.kind !== "wall" && obs.hp > 0) obs.corruption = 0;
    }
    // Visual flash
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x00ff88, 0.7)
      .setScrollFactor(0).setDepth(200);
    this.tweens.add({ targets: flash, alpha: 0, duration: 800, ease: "Power2", onComplete: () => flash.destroy() });
    this._storyCtrl?.showStoryHint("⚡ POWER RESTORED — station corruption cleared! +200 scrap", 5000);
    this.upgradeSystem.scrap += 200;
    AudioManager.instance.upgradeSelect?.();
  }

  private _openShop(afterWave: boolean): void {
    if (this.upgradeUI.isVisible) return;
    const upgrades = this.upgradeSystem.getAvailableUpgrades();
    if (upgrades.length === 0 && afterWave) { this._afterShopClose(); return; }
    this.upgradeUI.show(upgrades, this.upgradeSystem.scrap,
      (id: string) => {
        const purchased = this.upgradeSystem.tryPurchase(id);
        if (purchased) AudioManager.instance.upgradeSelect();
        if (purchased && id.startsWith("card_")) {
          const theme = id.replace("card_", "");
          this.mapObstacles.unlockTheme(theme);
          const ROOM_NAMES: Record<string, string> = { factory: "BIO LAB", server: "DATA LAB", power: "REACTOR CORE", control: "CMD CENTER", maintenance: "SUPPLY DEPOT" };
          this._showRoomUnlockedNotification(ROOM_NAMES[theme] ?? theme.toUpperCase());
        }
        this.worldManager.setPhaseMastery(this.upgradeSystem.phaseMasteryLevel);
        this.upgradeUI.hide();
        this._applyUpgradesToPlayer();
        if (afterWave) this._afterShopClose();
      },
      () => { this.upgradeUI.hide(); if (afterWave) this._afterShopClose(); },
    );
  }
  private _afterShopClose(): void { this._storyCtrl?.showStoryHint("◉ WALK INTO a combat room to start the next wave  •  cooldown must be over first", 5500); }
  private _showUpgradeUI(): void { this._openShop(true); }

  private _showRoomUnlockedNotification(roomName: string): void {
    const x = GAME_WIDTH / 2, y = GAME_HEIGHT * 0.3;
    AudioManager.instance.worldShift();
    // Backdrop slab + accent bar — animated reveal
    const bg = this.add.graphics().setDepth(250).setScrollFactor(0).setAlpha(0);
    bg.fillStyle(0x000000, 0.85); bg.fillRoundedRect(x-220, y-34, 440, 68, 12);
    bg.lineStyle(2, 0x00ff88, 1.0); bg.strokeRoundedRect(x-220, y-34, 440, 68, 12);
    // Accent ticks for industrial vibe
    bg.fillStyle(0x00ff88, 1.0);
    bg.fillRect(x-218, y-32, 8, 4); bg.fillRect(x+210, y+28, 8, 4);
    const label = this.add.text(x, y-12, "▰▰  SECTOR UNLOCKED  ▰▰", {
      fontSize: "13px", fontFamily: "monospace", color: "#00ff88",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(251).setScrollFactor(0).setAlpha(0);
    label.setShadow(0, 0, "#00ff88", 8, true, true);
    const sub = this.add.text(x, y+14, roomName, {
      fontSize: "20px", fontFamily: "monospace", color: "#ffffff",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(251).setScrollFactor(0).setAlpha(0);
    // Reveal: bg fade in, text slide up + fade
    this.tweens.add({ targets: bg, alpha: 1, duration: 240, ease: "Sine.easeOut" });
    this.tweens.add({ targets: [label, sub], alpha: 1, y: "-=6", duration: 360, delay: 80, ease: "Back.easeOut" });
    // Hold then dissolve
    this.time.delayedCall(2400, () => {
      this.tweens.add({
        targets: [bg, label, sub], alpha: 0, duration: 420, ease: "Sine.easeIn",
        onComplete: () => { bg.destroy(); label.destroy(); sub.destroy(); },
      });
    });
  }

  private _applyUpgradesToPlayer(): void {
    const ms = this.upgradeSystem.multiShotLevel;
    const spreadCount = ms === 0 ? 0 : ms * 2;
    const spreadAngle = ms === 0 ? 0 : 0.18 + ms * 0.05;
    this.playerShootSkill = new ShootSkill(-1, { damage: this.playerStats.damage, range: 320, speed: this.playerStats.projectileSpeed, tint: 0x00ff88, spreadCount, spreadAngle }, this.playerStats.fireRate);
    this._playerCtrl?.setShootSkill(this.playerShootSkill);
    this.playerHp = Math.min(this.playerHp + 20, this.playerStats.maxHp);
    this.weaponVisual?.setTier(WeaponVisual.calcTier(this.playerStats.damage));
  }

  private _rebuildSpatialGrid(): void {
    this.spatialGrid.clear();
    for (let i = 0; i < this.allAgents.length; i++) {
      const a = this.allAgents[i], pos = a.getPosition();
      this.agentPositions[i*2] = pos.x; this.agentPositions[i*2+1] = pos.y;
      this.spatialGrid.insert(i, pos.x, pos.y);
    }
  }

  private _tickAllAgents(delta: number): void {
    const steeredList = this.allAgents.map(a => ({ id: a.id, posX: a.posX, posY: a.posY }));
    const playerWorld = this.worldManager.currentWorld;
    for (const agent of this.enemies) {
      agent.predictor = this.playerPredictor;
      if (this._isAgentInCurrentWorld(agent)) {
        if (agent.isStaggered) {
          agent.staggerTimer -= delta * 1000;
          if (agent.staggerTimer <= 0) { agent.isStaggered = false; agent.staggerGauge = 0; if (agent.sprite?.active) agent.sprite.clearTint(); }
        } else if (agent.isFearing) {
          agent.fearTimer -= delta * 1000;
          if (agent.fearTimer <= 0) { agent.isFearing = false; if (agent.sprite?.active) agent.sprite.clearTint(); }
          else if (agent.sprite?.body) {
            const dx = agent.posX - this.playerSprite.x, dy = agent.posY - this.playerSprite.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 0) { const fb = agent.sprite.body as Phaser.Physics.Arcade.Body; fb.velocity.x = (dx/dist)*120; fb.velocity.y = (dy/dist)*120; agent.posX = agent.sprite.x; agent.posY = agent.sprite.y; }
          }
        } else {
          agent.nearbyAgents = steeredList.filter(n => n.id !== agent.id && Math.abs(n.posX-agent.posX) < 80 && Math.abs(n.posY-agent.posY) < 80);
          agent.tick(this._abilityMgr.chronoActive ? delta * 0.15 : delta);
        }
      }
      if (agent.isDead) this.deathQueue.push(agent);
    }
    for (const agent of [...this.guards, ...this.collectors] as (GuardAgent | CollectorAgent)[]) {
      agent.playerWorld = playerWorld;
      if (this._isAgentInCurrentWorld(agent) || agent.breach.isActive || agent.breach.isCharging) {
        agent.tick(this._abilityMgr.chronoActive ? delta * 0.15 : delta);
      }
      if (agent.isDead) this.deathQueue.push(agent);
    }
    for (const agent of [...this.turrets, ...this.sawblades, ...this.welders]) {
      if (this._isAgentInCurrentWorld(agent)) agent.tick(this._abilityMgr.chronoActive ? delta * 0.15 : delta);
      if (agent.isDead) this.deathQueue.push(agent);
    }
  }

  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    const w = this.worldManager.currentWorld;
    if (w === WorldType.FOUNDRY) return agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent;
    return agent instanceof GuardAgent || agent instanceof WelderAgent || agent instanceof CollectorAgent;
  }
  private _countActiveEnemies(): number { return this.allAgents.filter(a => this._isAgentInCurrentWorld(a)).length; }

  private _performWorldSwitch(): void {
    AudioManager.instance.worldSwitch();
    const newWorld = this.worldManager.switchWorld();
    AudioManager.instance.crossfadeToTheme(newWorld === 'FOUNDRY' ? 'foundry' : 'circuit');
    const pal = WORLD_PALETTES[newWorld];
    for (let i = ShootSkill.activeProjectiles.length - 1; i >= 0; i--) { const p = ShootSkill.activeProjectiles[i]; if (p.active && p.ownerId > 0) ShootSkill.recycleProjectile(p); }
    this.dimensionBg?.setWorld(newWorld);
    this.dimensionTint?.setFillStyle(pal.tintColor, 0.10);
    const flash = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, pal.flashColor, 0.5).setDepth(200).setScrollFactor(0);
    this.tweens.add({ targets: flash, alpha: 0, duration: 400, ease: "Power2", onComplete: () => flash.destroy() });
    for (let i = 0; i < 5; i++) {
      const ty = Phaser.Math.Between(50, GAME_HEIGHT-50);
      const tear = this.add.rectangle(GAME_WIDTH/2, ty, GAME_WIDTH, 2, pal.flashColor, 0.8).setDepth(201).setScrollFactor(0);
      this.tweens.add({ targets: tear, alpha: 0, scaleY: Phaser.Math.FloatBetween(3, 8), duration: 300, delay: i*30, onComplete: () => tear.destroy() });
    }
    Juice.screenShake(this, 0.012, 200);
    Juice.slowMo(this, 0.15, 200);
    this.glitchEvents?.triggerOnKillStreak(10);
  }

  private _applyPowerUp(type: string): void {
    const DURATION = 7000;
    AudioManager.instance.powerUp(type);
    switch (type) {
      case "rapid_fire":
        this.playerShootSkill = new ShootSkill(-1, { damage: this.playerStats.damage, range: 500, speed: this.playerStats.projectileSpeed, tint: 0xff4400 }, Math.floor(this.playerStats.fireRate * 0.45));
        this.time.delayedCall(DURATION, () => { if (!this.gameOver) this._applyUpgradesToPlayer(); });
        break;
      case "shield_regen": this.playerHp = Math.min(this.playerStats.maxHp, this.playerHp + 40); break;
      case "damage_boost":
        this.playerStats.damage = this._baseDamage * 2; this._applyUpgradesToPlayer();
        this.time.delayedCall(DURATION, () => { if (!this.gameOver) { this.playerStats.damage = this._baseDamage; this._applyUpgradesToPlayer(); } });
        break;
      case "speed_boost":
        this.playerStats.speed = this._baseSpeed * 1.6;
        this.time.delayedCall(DURATION, () => { if (!this.gameOver) this.playerStats.speed = this._baseSpeed; });
        break;
    }
  }

  private _showPowerUpText(type: string): void {
    const labels: Record<string, { text: string; color: string }> = {
      rapid_fire: { text: "⚡ RAPID FIRE!", color: "#ff6600" }, shield_regen: { text: "💚 +40 HP", color: "#00ff88" },
      scrap_magnet: { text: "◈ MAGNET!", color: "#ffcc00" }, damage_boost: { text: "⬆ DAMAGE×2!", color: "#ff0066" },
      speed_boost: { text: "▶ SPEED UP!", color: "#00aaff" },
    };
    const def = labels[type] ?? { text: "POWER UP!", color: "#ffffff" };
    const py = this.playerSprite.y - 36;
    const t = this.add.text(this.playerSprite.x, py, def.text, { fontFamily: "monospace", fontSize: "16px", color: def.color, fontStyle: "bold", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: py - 40, alpha: 0, duration: 1400, ease: "Power2", onComplete: () => t.destroy() });
  }

  private _showPhysicsZoneBanner(label: string): void {
    this._physicsZoneBannerText?.destroy();
    const cam = this.cameras.main;
    const bx = cam.scrollX + cam.width / 2, by = cam.scrollY + cam.height * 0.22;
    this._physicsZoneBannerText = this.add.text(bx, by, label, { fontSize: "18px", color: "#ffcc00", stroke: "#000000", strokeThickness: 4, fontStyle: "bold" }).setOrigin(0.5).setDepth(300).setAlpha(1);
    this.tweens.add({ targets: this._physicsZoneBannerText, alpha: 0, y: by - 30, duration: 2200, ease: "Quad.easeIn", onComplete: () => { this._physicsZoneBannerText?.destroy(); this._physicsZoneBannerText = null; } });
  }

  private _showWorldSwitchTutorial(): void {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const W = 620, H = 280;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(310);
    bg.fillStyle(0x000000, 0.92);
    bg.fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 18);
    bg.lineStyle(3, 0xff8844, 1);
    bg.strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 18);
    // Inner accent line
    bg.lineStyle(1, 0xff441166, 0.5);
    bg.strokeRoundedRect(cx - W / 2 + 6, cy - H / 2 + 6, W - 12, H - 12, 14);

    const title = this.add.text(cx, cy - H / 2 + 28, "⚙ PHASE-SHIFT PROTOCOL ⚙", {
      fontFamily: "monospace", fontSize: "22px", color: "#ff8844",
      fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(311);
    title.setShadow(0, 0, "#ff4400", 8, true, true);

    const lines = [
      { txt: "MACHINE CORE  [ amber world ]", col: "#ff9944" },
      { txt: "  Red drones attack YOU — fight them off", col: "#ccaa88" },
      { txt: "  Turrets and sawblades patrol the arena", col: "#ccaa88" },
      { txt: "", col: "#ffffff" },
      { txt: "VOID SECTOR  [ cyan world ]", col: "#44ccff" },
      { txt: "  Purple machines, drones & yellow units ATTACK THE REACTOR", col: "#cc66ff" },
      { txt: "  Switch to this world to defend the reactor!", col: "#88ccdd" },
      { txt: "", col: "#ffffff" },
      { txt: "Switching costs HEAT  •  4 second cooldown  •  Press Q again", col: "#aaaaaa" },
    ];
    lines.forEach((l, i) => {
      this.add.text(cx - W / 2 + 24, cy - H / 2 + 65 + i * 19, l.txt, {
        fontFamily: "monospace", fontSize: "12px", color: l.col,
      }).setScrollFactor(0).setDepth(311);
    });

    const allObjs = [bg, title];
    // Auto-dismiss after 5.5 s
    const dismiss = () => {
      this.tweens.add({
        targets: allObjs, alpha: 0, duration: 400,
        onComplete: () => allObjs.forEach(o => o.destroy()),
      });
    };
    this.time.delayedCall(5500, dismiss);
    // Also allow click-to-dismiss
    const hitArea = this.add.rectangle(cx, cy, W, H, 0x000000, 0)
      .setScrollFactor(0).setDepth(312).setInteractive();
    hitArea.once("pointerdown", () => { hitArea.destroy(); dismiss(); });
    allObjs.push(hitArea as unknown as Phaser.GameObjects.Graphics);
  }

  private _reactorDestroyed(): void {
    if (this.gameOver) return;
    Juice.screenShake(this, 0.035, 600);
    Juice.slowMo(this, 0.1, 1000);
    AudioManager.instance.playerDeath();
    const x = GAME_WIDTH / 2, y = GAME_HEIGHT / 2;
    const flash = this.add.rectangle(x, y, GAME_WIDTH, GAME_HEIGHT, 0xff2200, 0)
      .setScrollFactor(0).setDepth(200);
    this.tweens.add({
      targets: flash, alpha: 0.6, duration: 250, yoyo: true, repeat: 3,
      onComplete: () => {
        flash.destroy();
        const bg = this.add.graphics().setScrollFactor(0).setDepth(299);
        bg.fillStyle(0x000000, 0.75);
        bg.fillRoundedRect(x - 280, y - 70, 560, 140, 14);
        bg.lineStyle(3, 0xff2200, 1);
        bg.strokeRoundedRect(x - 280, y - 70, 560, 140, 14);
        const title = this.add.text(x, y - 24, "⚡ REACTOR DESTROYED", {
          fontFamily: "monospace", fontSize: "34px", color: "#ff2200",
          stroke: "#000000", strokeThickness: 6, fontStyle: "bold",
        }).setOrigin(0.5).setScrollFactor(0).setDepth(300);
        title.setShadow(0, 0, "#ff4400", 12, true, true);
        const sub = this.add.text(x, y + 28, "THE FRACTURE STATION IS LOST", {
          fontFamily: "monospace", fontSize: "16px", color: "#ff8844",
          stroke: "#000000", strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(300);
        this.time.delayedCall(2200, () => this._onGameOver());
      },
    });
  }

  private _onGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    AudioManager.instance.playerDeath();
    Juice.screenShake(this, 0.02, 300);
    Juice.slowMo(this, 0.1, 800);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const spark = this.add.circle(this.playerSprite.x + Math.cos(angle)*5, this.playerSprite.y + Math.sin(angle)*5, 3, 0x00ff88, 1);
      this.tweens.add({ targets: spark, x: this.playerSprite.x + Math.cos(angle)*80, y: this.playerSprite.y + Math.sin(angle)*80, alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: 600, onComplete: () => spark.destroy() });
    }
    this.playerSprite.setVisible(false);
    this.playerGlow?.setVisible(false);
    this.time.delayedCall(1200, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this._cleanup();
        this.scene.start("GameOverScene", { kills: this.killCount, wave: this.waveManager.currentWave, scrap: this.totalScrapCollected, score: this.comboSystem.score, maxCombo: this.comboSystem.maxCombo });
      });
    });
  }

  private _togglePause(): void {
    if (this.gameOver || this.upgradeUI.isVisible) return;
    if (this.paused) { this.paused = false; this.physics.resume(); this.pauseContainer?.destroy(); this.pauseContainer = null; return; }
    this.paused = true; this.physics.pause();
    this.pauseContainer = this.add.container(0, 0).setDepth(500).setScrollFactor(0);
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75);
    const scanGfx = this.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y += 4) { scanGfx.fillStyle(0x000000, 0.15); scanGfx.fillRect(0, y, GAME_WIDTH, 1); }
    const frameGfx = this.add.graphics();
    frameGfx.lineStyle(2, 0x00ff88, 0.5); frameGfx.strokeRect(cx-200, cy-180, 400, 360);
    frameGfx.lineStyle(1, 0x00ff88, 0.15); frameGfx.strokeRect(cx-194, cy-174, 388, 348);
    const title = this.add.text(cx, cy-140, "⏸ PAUSED", { fontFamily: "monospace", fontSize: "36px", color: "#00ff88", fontStyle: "bold", stroke: "#003311", strokeThickness: 4 }).setOrigin(0.5);
    const lineGfx = this.add.graphics(); lineGfx.lineStyle(1, 0x00ff88, 0.4); lineGfx.lineBetween(cx-140, cy-105, cx+140, cy-105);
    this.pauseContainer.add([overlay, scanGfx, frameGfx, title, lineGfx]);
    const buttons = [
      { label: "▶ RESUME", y: cy-50, color: 0x00ff88, hex: "#00ff88", action: () => this._togglePause() },
      { label: "⟳ RESTART", y: cy+10, color: 0xffaa00, hex: "#ffaa00", action: () => { this._togglePause(); this._cleanup(); this.scene.restart(); } },
      { label: "⌂ MAIN MENU", y: cy+70, color: 0xff4400, hex: "#ff4400", action: () => { this._togglePause(); this._cleanup(); this.scene.start("TitleScene"); } },
    ];
    for (const btn of buttons) {
      const bg = this.add.graphics();
      const draw = (hov: boolean) => { bg.clear(); bg.fillStyle(hov ? btn.color : 0x0a0a0a, hov ? 0.2 : 0.85); bg.fillRect(cx-130, btn.y-22, 260, 44); bg.lineStyle(2, btn.color, hov ? 1 : 0.6); bg.strokeRect(cx-130, btn.y-22, 260, 44); };
      draw(false);
      const txt = this.add.text(cx, btn.y, btn.label, { fontFamily: "monospace", fontSize: "18px", color: btn.hex, fontStyle: "bold" }).setOrigin(0.5);
      const hit = this.add.zone(cx, btn.y, 260, 44).setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => { draw(true); txt.setColor("#ffffff"); });
      hit.on("pointerout", () => { draw(false); txt.setColor(btn.hex); });
      hit.on("pointerdown", btn.action);
      this.pauseContainer.add([bg, txt, hit]);
    }
    this.pauseContainer.add(this.add.text(cx, cy+140, "ESC to resume", { fontFamily: "monospace", fontSize: "12px", color: "#336644" }).setOrigin(0.5));
  }

  private _registerBusEvents(): void {
    const bus = SystemsBus.instance;
    bus.on("scrap:collected", (value: unknown) => {
      const v = value as number;
      this.upgradeSystem.addScrap(v); this.totalScrapCollected += v; this.missionSystem.onScrapCollect(v); AudioManager.instance.pickup();
    });
    bus.on("resource:harvested", (node: unknown) => { this.resourceSprites.get((node as { id: number }).id)?.setVisible(false); });
    bus.on("resource:respawned", (node: unknown) => { this.resourceSprites.get((node as { id: number }).id)?.setVisible(true); });
    const onBreach = (_agentId: unknown, bx: unknown, by: unknown) => {
      const pos = { x: bx as number, y: by as number };
      const flash = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x9900ff, 0.25).setScrollFactor(0).setDepth(115).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
      const warn = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2-100, "⚠ DIMENSION BREACH DETECTED ⚠", { fontFamily: "monospace", fontSize: "22px", color: "#ff00ff", fontStyle: "bold", stroke: "#000000", strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0);
      this.tweens.add({ targets: warn, alpha: 1, duration: 200, yoyo: true, hold: 1200, onComplete: () => warn.destroy() });
      const ring = this.add.circle(pos.x, pos.y, 8, 0xff00ff, 0).setStrokeStyle(3, 0xff00ff, 1).setDepth(57).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ring, scaleX: 6, scaleY: 6, alpha: 0, duration: 600, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      AudioManager.instance.explosion();
    };
    bus.on("guard:breach", onBreach); bus.on("collector:breach", onBreach);
  }

  private _cleanup(): void {
    AudioManager.instance.stopMusic(); SystemsBus.instance.removeAll();
    this.scrapManager?.clear(); this.upgradeUI?.hide();
    this.fractureFX?.destroy(); this.dimensionBg?.destroy(); this.glitchEvents?.destroy();
    this.deathFX?.destroy(); this.shadowDouble?.destroy(); this.gameJuice?.destroy();
    this.abilityShieldGfx?.destroy(); this.abilityShieldGfx = null;
    this.pauseContainer?.destroy(); this.pauseContainer = null; this.paused = false;
    this.powerUpSystem?.clearAll(); this._hudMgr?.destroy();
    this.enemyGlows.forEach(g => g.destroy()); this.enemyGlows.clear();
    this.playerGlow?.destroy(); this.arenaHazards?.destroy();
    this.boss?.sprite?.destroy(); this.boss = null;
    this.dimensionTint?.destroy(); this.tutorialOverlay?.destroy();
    this.missionUI?.destroy(); this.weaponVisual?.destroy();
  }

  private _tryTriggerWave(reason: string): void {
    if (this.storySystem.phase !== "free" && this.storySystem.phase !== "tutorial") return;
    // Waves ONLY start when the player WALKS INTO a room after the cooldown has
    // already expired. Blocking the "shoot" path prevents the race condition where
    // the cooldown hits zero while the player is already standing in a room they
    // only passed through: one stray bullet would incorrectly start the wave there.
    // Rule: to fight in a room you must deliberately ENTER it post-cooldown.
    if (reason !== "enter") return;
    if (this._waveCooldownMs > 0) return;  // rest period — let the player breathe
    if (this.storySystem.triggeredRooms.has(this._storyCtrl.currentRoomKey)) return;
    if (this.waveManager.isActive || this.boss) return;
    if (this.enemies.length + this.guards.length + this.turrets.length + this.sawblades.length + this.welders.length > 0) return;
    // Don't trigger waves in utility rooms (Reactor / Armory / HUB) — except tutorial wave in HUB
    const px = this.playerSprite.x, py = this.playerSprite.y;
    const col = Math.floor(px / CELL_W), row = Math.floor(py / CELL_H);
    const theme = this.mapObstacles.getRoomThemeAtCell?.(col, row);
    const isTutorial = this.storySystem.phase === "tutorial";
    if (!isTutorial && (theme === "power" || theme === "armory" || theme === "hub")) return;
    this.storySystem.markTriggered(this._storyCtrl.currentRoomKey);
    // Pass the triggering room so the wave spawns THERE, even if the player walks
    // away during the 3s wave-start telegraph.
    this._waveOrch.startNextWaveAfterRest(col, row);
  }

  private _resetState(): void {
    this.playerHp = 100; this.playerHeat = 0; this.heatOverheatTimer = 0;
    this.playerStats = { speed: 200, damage: 10, maxHp: 100, fireRate: 280, projectileSpeed: 520, pickupRange: 100 };
    this.killCount = 0; this.totalScrapCollected = 0;
    this._stateMachine.forceSet(GameState.PLAYING);
    this.aiAccumulator = 0; this.contactDamageCooldown = 0;
    this.enemies = []; this.guards = []; this.collectors = [];
    this.turrets = []; this.sawblades = []; this.welders = [];
    this.allAgents = []; this.deathQueue = []; this.boss = null;
    this.comboSystem?.reset(); this.missionSystem?.reset(); this.weaponVisual?.setTier(1);
    this.abilitySystem?.reset(); this.abilityShieldActive = false; this.abilityShieldTimer = 0;
    ShootSkill.chronoActive = false; this.damageTakenThisWave = 0; this._waveCooldownMs = 0;
    this.iFrameTimer = 0; this.playerKnockbackVX = 0; this.playerKnockbackVY = 0;
    this.powerUpSystem?.clearAll(); this.mapObstacles?.clearAll();
    this.storySystem?.reset(); this._storyCtrl?.reset();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.godMode = false;
    this.reactorHp = 500; this.reactorMaxHp = 500;
    this._reactorDmgCooldown = 0; this._reactorWarnShown50 = false; this._reactorWarnShown25 = false;
    if (this.ddaSystem) { this.ddaSystem.reset(); } else { this.ddaSystem = new DDASystem(); }
    if (this.playerPredictor) { this.playerPredictor.reset(); } else { this.playerPredictor = new PlayerPredictor(); }
  }
}
