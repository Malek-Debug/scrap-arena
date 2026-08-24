import Phaser from "phaser";
import {
  AI_TICK_RATE, GAME_HEIGHT, GAME_WIDTH, WORLD_WIDTH, WORLD_HEIGHT,
  CELL_W, CELL_H,
  ResourceSystem, SpatialGrid, SystemsBus,
  WaveManager, ScrapManager, UpgradeSystem, DEFAULT_STATS,
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
import { Juice, GameJuice, UpgradeUI, FractureFX, DimensionBackground, GlitchEvents, DeathFX, MissionUI, WeaponVisual, EnemyRadar, VFXPool, ParticleVFX, EnvironmentManager, WeaponVFX, SettingsUI, DimensionOverlay } from "../rendering";
import { UI_FONT, UI_MONO, constrainTextBlock, drawPanel } from "../rendering/UITheme";
import { AudioManager } from "../audio";
import { AbilityManager, HUDManager, CombatSystem, WaveOrchestrator, PlayerController, StoryController, ReactorController } from "../systems";
import type { GameContext, AnyAgent } from "../systems/GameContext";
import { EnemyAgent } from "../agents/EnemyAgent";
import { GuardAgent } from "../agents/GuardAgent";
import { CollectorAgent } from "../agents/CollectorAgent";
import { TurretAgent } from "../agents/TurretAgent";
import { SawbladeAgent } from "../agents/SawbladeAgent";
import { WelderAgent } from "../agents/WelderAgent";
import { ShadowDouble } from "../agents/ShadowDouble";
import { BossAgent } from "../agents/BossAgent";

export class MainScene extends Phaser.Scene {
  private playerSprite!: Phaser.Physics.Arcade.Sprite;
  _playerBaseScale = 2.2;
  private _phaseSurgeTimer = 0;
  private playerHp = 100;
  private playerStats: PlayerStats = { ...DEFAULT_STATS };
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
  private _allAgentsDirty = false;
  private _steeredCache: { id: number; posX: number; posY: number }[] = [];
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
  private _dimOverlay!: DimensionOverlay;
  private glitchEvents!: GlitchEvents;
  private deathFX!: DeathFX;
  private shadowDouble!: ShadowDouble;
  private gameJuice!: GameJuice;
  private vfxPool!: VFXPool;
  private readonly _radarCache: { posX: number; posY: number; type: string; isDead?: boolean }[] = [];
  private _radarFrame = 0;
  private _cachedActiveEnemies = 0;
  private readonly _stateMachine = new GameStateMachine();
  private aiAccumulator = 0;
  private _aiLearningShown = false;
  private tutorialOverlay: Phaser.GameObjects.Text | null = null;
  private killCount = 0;
  private totalScrapCollected = 0;
  private _gameStartTime = 0;
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
  private _powerCardLabel: Phaser.GameObjects.Text | null = null;
  private _corruptionCriticalShown = false;
  private _waveCooldownMs = 0;  // rest timer after wave clear
  // ── Reactor defense mechanic ───────────────────────────
  private _reactorCtrl!: ReactorController;
  private static readonly REACTOR_MAX_HP = 500;
  private _deathCause: "player" | "reactor" = "player";
  // ── Shop / interact proximity hint ──────────────────────
  private _interactHint: Phaser.GameObjects.Text | null = null;
  private playerShielded = false;
  private _physicsZoneBannerText: Phaser.GameObjects.Text | null = null;
  private storySystem!: StorySystem;
  private godMode = false;
  private _worldSwitchTutorialShown = false;
  private _repairConsumed = false;
  private _ctx!: GameContext;
  private _abilityMgr!: AbilityManager;
  private _hudMgr!: HUDManager;
  private _combatSys!: CombatSystem;
  private _waveOrch!: WaveOrchestrator;
  private _playerCtrl!: PlayerController;
  private _storyCtrl!: StoryController;
  private cleanedUp = false;
  private _settingsUI!: SettingsUI;

  // ── Locked-barrier player feedback ──────────────────────
  private _barrierFeedbackCooldown = 0;  // ms until next feedback toast is allowed

  // ── Capture mode / controls overlay ────────────────────
  private _captureMode = false;
  private _captureHiddenObjs: Phaser.GameObjects.GameObject[] = [];
  private _controlsOverlay: Phaser.GameObjects.Container | null = null;

  // ── Per-frame scratch arrays — allocated once, reused every frame ──────────
  // Avoids thousands of tiny array/object allocations per second.
  private readonly _scratchPropEnemies: { posX: number; posY: number; hp: number; takeDamage(n: number): void }[] = [];
  private _scratchPropAgentRefs: AnyAgent[] = [];

  // P2.5 enemy readability overlays
  private _weldBeamGfx!: Phaser.GameObjects.Graphics;
  private _breachWarnings = new Map<number, Phaser.GameObjects.Text>();

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
    this.cleanedUp = false;
    this._gameStartTime = performance.now();
    ShootSkill.resetPool();
    Juice.reset(this);
    this.input.enabled = true;
    this.physics.resume();
    this.cameras.main.resetFX();
    this.cameras.main.setZoom(1);
    this.cameras.main.setAlpha(1);
    this.cameras.main.setBackgroundColor("#000000");
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
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M).on('down', () => {
      const audio = AudioManager.instance;
      audio.setMute(!audio.isMuted);
      this._showPhysicsZoneBanner(audio.isMuted ? "AUDIO MUTED" : "AUDIO ONLINE");
    });
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB).on('down', () => {
      if (this.gameOver) return;
      this._settingsUI.toggle();
      if (this._settingsUI.isOpen) {
        this.paused = true; this.physics.pause();
      } else if (!this.pauseContainer) {
        // Only unpause if the pause menu itself isn't open
        this.paused = false; this.physics.resume();
      }
    });
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F10).on('down', () => this._toggleCaptureMode());
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', () => {
      if (!this.gameOver) this._toggleControlsOverlay();
    });
    this.repairKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.storySystem = new StorySystem();
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.input.keyboard!.on('keydown-G', (ev: KeyboardEvent) => {
      if (ev.ctrlKey) { this.godMode = !this.godMode; this._storyCtrl?.showGodModeIndicator(this.godMode); }
    });
    this.abilitySystem = new AbilitySystem();
    this._settingsUI = new SettingsUI(this);
    this.powerUpSystem = new PowerUpSystem(this);
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
    this.cameras.main.startFollow(this.playerSprite, true, 0.075, 0.075);
    this.cameras.main.setDeadzone(48, 32);
    this.allAgents = [];
    this.agentPositions = new Float32Array(0);
    this.inputMux = new InputMultiplexer(this);
    this.playerShootSkill = new ShootSkill(-1, { damage: this.playerStats.damage, range: 450, speed: this.playerStats.projectileSpeed, tint: 0x00ff88 }, this.playerStats.fireRate);
    this.playerDashSkill = new DashSkill(750, 900, 5, 200);
    this._registerBusEvents();
    AudioManager.instance.init();
    AudioManager.instance.setScene(this);
    AudioManager.instance.startMusic('foundry');
    AudioManager.instance.setWaveTension(1);  // wave 1 starts calm
    try { this.dimensionBg = new DimensionBackground(this); } catch (e) { console.error("DimensionBg init failed:", e); }
    try { this._dimOverlay = new DimensionOverlay(this); this._dimOverlay.setWorld(WorldType.FOUNDRY); } catch (e) { console.error("DimOverlay init failed:", e); }
    try { this.fractureFX = new FractureFX(this); } catch (e) { console.error("FractureFX init failed:", e); }
    try { this.glitchEvents = new GlitchEvents(this); } catch (e) { console.error("GlitchEvents init failed:", e); }
    try { this.deathFX = new DeathFX(this); } catch (e) { console.error("DeathFX init failed:", e); }
    try { this.shadowDouble = new ShadowDouble(this, this.playerSprite); } catch (e) { console.error("ShadowDouble init failed:", e); }
    this.gameJuice = new GameJuice(this);
    this.gameJuice.initAmbient();
    this.vfxPool = new VFXPool(this);
    ParticleVFX.bakeTextures(this);
    WeaponVFX.bakeTextures(this);
    EnvironmentManager.bakeTextures(this);
    this._weldBeamGfx = this.add.graphics().setDepth(98).setBlendMode(Phaser.BlendModes.ADD);
    this.missionSystem = new MissionSystem();
    this.missionUI = new MissionUI(this);
    this.weaponVisual = new WeaponVisual(this);
    this.enemyRadar = new EnemyRadar(this);
    this._ctx = this._buildGameContext();
    this._combatSys = new CombatSystem(this._ctx, { fractureFX: this.fractureFX, deathFX: this.deathFX, dimensionBg: this.dimensionBg, glitchEvents: this.glitchEvents });
    this._combatSys.onAddKill = (pos) => {
      this._hudMgr.onFirstKill();
      this._playerCtrl?.addKill(pos);
    };
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
      onNarrativeWaveStart: (wave) => {
        this._storyCtrl?.onWaveStart(wave);
        if (wave === 1) {
          // Proactive world-switch explainer — fires 2s after the first wave starts so the
          // player has just had time to shoot but before circuit enemies reach the reactor.
          this.time.delayedCall(2000, () => {
            if (!this._worldSwitchTutorialShown && !this.gameOver) {
              this._worldSwitchTutorialShown = true;
              this._showWorldSwitchTutorial();
            }
          });
          // Circuit-enemy hint fires 1s after wave start
          this.time.delayedCall(1000, () => {
            if (!this.gameOver) this._hudMgr?.onFirstCircuitEnemy();
          });
        }
      },
      onNarrativeWaveClear: (wave) => this._storyCtrl?.onWaveClear(wave),
      onNarrativeBossSpawn: (wave) => this._storyCtrl?.onBossSpawn(wave),
      onNarrativeBossKill: (wave) => {
        this._storyCtrl?.onBossKill(wave);
        if (wave >= 10) this._storyCtrl?.onVictory();
      },
      onClearTriggeredRooms: () => this.storySystem.triggeredRooms.clear(),
      onFirstEnemyTypeSeen: (type) => {
        const ctrl = this._storyCtrl;
        if (!ctrl) return;
        switch (type) {
          case 'guard':     ctrl.onFirstGuardSeen();     break;
          case 'collector': ctrl.onFirstCollectorSeen(); break;
          case 'sawblade':  ctrl.onFirstSawbladeSeen();  break;
          case 'welder':    ctrl.onFirstWelderSeen();    break;
          case 'turret':    ctrl.onFirstTurretSeen();    break;
        }
      },
      getMaxStreak: () => this._playerCtrl?.maxKillStreak ?? 0,
      onBossPhaseTransition: () => this._storyCtrl?.suppressLowPriorityHints(3000),
    });
    this._playerCtrl = new PlayerController(this._ctx, this.playerGlow, this.playerShootSkill, this.playerDashSkill, this.weaponVisual, this.gameJuice, this._combatSys, () => this._tryTriggerWave("shoot"), (label) => this._showPhysicsZoneBanner(label));
    this._playerCtrl.onFirstShot = () => this._hudMgr.onFirstShot();
    this._playerCtrl.onFirstDash = () => this._hudMgr.onFirstDash();
    this._playerCtrl.onFirstHeatWarning = () => this._hudMgr.onFirstHeatWarning();
    this._playerCtrl.onRampage = () => this._storyCtrl?.suppressLowPriorityHints(2000);
    this._storyCtrl = new StoryController(this._ctx, this.storySystem, () => this._tryTriggerWave("enter"));
    this._reactorCtrl = new ReactorController(this._ctx, MainScene.REACTOR_MAX_HP, {
      hudManager: this._hudMgr,
      storyController: this._storyCtrl,
      onDestroyed: () => this._reactorDestroyed(),
      onDeathCause: (c) => { this._deathCause = c; },
      onReactorThreshold: (threshold: number) => {
        this._storyCtrl?.onReactorThreshold(threshold);
      },
    });
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
    this._interactHint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 125, "", {
      fontFamily: UI_FONT, fontSize: "13px", color: "#ffffff",
      backgroundColor: "#050913dd", padding: { x: 12, y: 8 },
      align: "center", wordWrap: { width: 520, useAdvancedWrap: true },
    }).setOrigin(0.5).setDepth(150).setScrollFactor(0).setAlpha(0);
    constrainTextBlock(this._interactHint, 520, 2, 10);
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
    if (++this._radarFrame % 2 === 0) {
      let _rc = 0;
      const _fillRadar = (agents: readonly { posX: number; posY: number; isDead?: boolean }[], type: string) => {
        for (const a of agents) { if (this._radarCache.length <= _rc) this._radarCache.push({ posX: 0, posY: 0, type: "", isDead: false }); const e = this._radarCache[_rc++]; e.posX = a.posX; e.posY = a.posY; e.type = type; e.isDead = a.isDead; }
      };
      _fillRadar(this.enemies, "enemy"); _fillRadar(this.guards, "guard"); _fillRadar(this.collectors, "collector");
      _fillRadar(this.turrets, "turret"); _fillRadar(this.sawblades, "sawblade"); _fillRadar(this.welders, "welder");
      if (this.boss) { if (this._radarCache.length <= _rc) this._radarCache.push({ posX: 0, posY: 0, type: "", isDead: false }); const be = this._radarCache[_rc++]; be.posX = this.boss.posX; be.posY = this.boss.posY; be.type = "boss"; be.isDead = this.boss.isDead; }
      const reactorDefPos = this.mapObstacles?.reactorMachinePos ?? null;
      this.enemyRadar.update(this.playerSprite.x, this.playerSprite.y, this.cameras.main, this._radarCache, _rc, reactorDefPos, this._reactorCtrl.hp / this._reactorCtrl.maxHp);
    }
    if (Phaser.Input.Keyboard.JustDown(this.qKey) && this.worldManager.canSwitch && !this._waveOrch.worldLockActive) {
      this.playerHeat = Math.min(MainScene.MAX_HEAT - 1, this.playerHeat + MainScene.WORLD_SWITCH_HEAT_COST);
      this._performWorldSwitch(); this.missionSystem.onWorldSwitch();
      this._hudMgr?.dimWorldLegend();
    }
    if (Phaser.Input.Keyboard.JustDown(this.shopKey) && !this.upgradeUI.isVisible) this._openShop(false);
    const instabilityDmg = this.worldManager.update(deltaMs);
    if (instabilityDmg > 0) {
      this._combatSys.damagePlayer(instabilityDmg);
      const warn = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.15).setDepth(199).setScrollFactor(0);
      this.tweens.add({ targets: warn, alpha: 0, duration: 300, onComplete: () => warn.destroy() });
    }
    this.ddaSystem.update(deltaMs);
    if (this._phaseSurgeTimer > 0) this._phaseSurgeTimer = Math.max(0, this._phaseSurgeTimer - deltaMs);
    this.ddaSystem.recordPlayerHp(this.playerHp / this.playerStats.maxHp);
    if (this.ddaSystem.lastChange) {
      const ch = this.ddaSystem.lastChange;
      const msg = ch.direction === "up" ? "⚡ CORE IS LEARNING YOUR PATTERNS" : "⚙ CORE RECALIBRATING";
      const col = ch.direction === "up" ? "#ff4400" : "#00ccff";
      const note = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2+80, msg, {
        fontFamily: UI_FONT, fontSize: "14px", color: col, fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3, backgroundColor: "#00000099",
        padding: { x: 14, y: 8 }, align: "center",
        wordWrap: { width: 620, useAdvancedWrap: true },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(115).setAlpha(0);
      constrainTextBlock(note, 620, 2, 11);
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
        // Show which card is required — debounced to avoid spam
        if (br.hitTheme && this._barrierFeedbackCooldown <= 0) {
          this._barrierFeedbackCooldown = 3000;
          this._showLockedRoomFeedback(br.hitTheme);
        }
      }
      if (this._barrierFeedbackCooldown > 0) this._barrierFeedbackCooldown -= deltaMs;
    }
    if (this.mapObstacles?.isBossArena && this.playerSprite) {
      const contained = this.mapObstacles.resolveBossArenaContainment(this.playerSprite.x, this.playerSprite.y, 20);
      if (contained.clamped) {
        this.playerSprite.setPosition(contained.x, contained.y);
        const body = this.playerSprite.body as Phaser.Physics.Arcade.Body;
        body.reset(contained.x, contained.y);
        this.playerKnockbackVX = 0;
        this.playerKnockbackVY = 0;
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
        // Boss and player shots fly true in the boss arena. The vortex should
        // pressure movement, not decide whether a clean shot is allowed to land.
        const isBossProjectile = proj.ownerId >= 9000;
        const isPlayerProjectile = proj.ownerId < 0;
        if (isBossProjectile || (bossWind && isPlayerProjectile)) continue;
        const pZone = this.mapObstacles.getRoomPhysicsAt(proj.sprite.x, proj.sprite.y);
        if (pZone?.windForce) { body.velocity.x = Phaser.Math.Clamp(body.velocity.x + pZone.windForce.x*wds*3, -900, 900); body.velocity.y = Phaser.Math.Clamp(body.velocity.y + pZone.windForce.y*wds*3, -900, 900); }
        if (bossWind) { body.velocity.x = Phaser.Math.Clamp(body.velocity.x + bossWind.x*wds*4, -1000, 1000); body.velocity.y = Phaser.Math.Clamp(body.velocity.y + bossWind.y*wds*4, -1000, 1000); }
      }
    }
    this._combatSys.checkCollisions(deltaMs);
    const hazardDmg = this.arenaHazards.update(deltaMs, this.playerSprite.x, this.playerSprite.y);
    if (hazardDmg > 0) this._combatSys.damagePlayer(Math.ceil(hazardDmg));
    this.mapObstacles.update();
    // ── REACTOR DEFENSE ──────────────────────────────────────────────────────
    this._reactorCtrl.update(deltaMs);
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
      // Reuse persistent scratch array — avoids per-frame object + closure allocation
      const propEnemies = this._scratchPropEnemies;
      propEnemies.length = 0;
      this._scratchPropAgentRefs.length = 0;
      for (const agent of this.allAgents) {
        if (agent.isDead) continue;
        const idx = propEnemies.length;
        this._scratchPropAgentRefs[idx] = agent;
        if (idx < propEnemies.length) {
          propEnemies[idx].posX = agent.posX;
          propEnemies[idx].posY = agent.posY;
          propEnemies[idx].hp = agent.hp;
        } else {
          const captured = agent;
          propEnemies.push({ posX: agent.posX, posY: agent.posY, hp: agent.hp, takeDamage: (n) => { captured.hp -= n; } });
        }
      }
      // Sync hp back from agent refs each frame
      for (let i = 0; i < propEnemies.length; i++) {
        const a = this._scratchPropAgentRefs[i];
        propEnemies[i].posX = a.posX;
        propEnemies[i].posY = a.posY;
        propEnemies[i].hp = a.hp;
      }
      const propResults = this.mapObstacles.updateActiveProps(this.playerSprite.x, this.playerSprite.y, deltaMs, propEnemies);
      const pBody = this.playerSprite.body as Phaser.Physics.Arcade.Body | null;
      if (pBody) { pBody.velocity.x += propResults.playerVelocityMod.x; pBody.velocity.y += propResults.playerVelocityMod.y; }
      this.playerShielded = propResults.playerShielded;
    }
    this.scrapManager.update(this.playerSprite.x, this.playerSprite.y, deltaMs);
    this._repairConsumed = false;
    this._updateInteractMechanics();
    if (!this._repairConsumed && Phaser.Input.Keyboard.JustDown(this.repairKey)) {
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
      // Ghost boss when in different dimension (visible but invulnerable)
      const bossInWorld = this.worldManager.isAgentInCurrentWorld(this.boss);
      if (this.boss.sprite) this.boss.sprite.setAlpha(bossInWorld ? 1.0 : 0.35);
    }
    this._combatSys.processDeath();
    if (this.boss?.isDead) {
      this._waveOrch.onBossDeath();
      this._waveCooldownMs = 12000; // post-boss rest: same cooldown as a normal wave clear
    }
    if (this.agentPositions.length < this.allAgents.length * 2) this.agentPositions = new Float32Array((this.allAgents.length + 32) * 2);
    this._waveOrch.updateBossSpecials(deltaMs);
    if (this._waveOrch.checkWaveCleared()) {
      this._waveCooldownMs = 12000; // 12 seconds rest after wave clear
    }
    if (this._waveCooldownMs > 0) this._waveCooldownMs -= deltaMs;
    this._hudMgr.update(this.playerHeat, this.heatOverheatTimer);
    if (this._storyCtrl) this._hudMgr.setNarrativePhase(`▸ ${this._storyCtrl.getNarrativePhaseLabel()}`);

    // Narrative HP callbacks
    const hpRatio = this.playerHp / this.playerStats.maxHp;
    if (hpRatio < 0.30) this._storyCtrl?.onPlayerLowHp();
    if (hpRatio < 0.15) this._storyCtrl?.onPlayerNearDeath();
    if (hpRatio >= 0.50) this._storyCtrl?.onPlayerHpRecovered();
    const intensity = this.fractureFX?.intensity ?? 0;
    this.fractureFX?.update(deltaMs);
    let breachCount = 0;
    for (const g of this.guards) if (g.breach?.isActive) breachCount++;
    for (const c of this.collectors) if (c.breach?.isActive) breachCount++;
    this.dimensionBg?.setReactivity(this._cachedActiveEnemies, breachCount);
    this.dimensionBg?.update(deltaMs, intensity);
    this._dimOverlay?.update(deltaMs);
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
    let activeCount = 0;
    for (const agent of this.allAgents) {
      const inWorld = this._isAgentInCurrentWorld(agent);
      if (inWorld) activeCount++;
      // Only run expensive physics for in-world agents
      if (inWorld && "updateMovement" in agent) {
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
      if (inWorld && agent instanceof SawbladeAgent && agent.sprite) agent.sprite.rotation += 0.15;
      if (inWorld && agent.sprite && agent.sprite.body) { const vx = (agent.sprite.body as Phaser.Physics.Arcade.Body).velocity.x; if (vx > 5) agent.sprite.setFlipX(false); else if (vx < -5) agent.sprite.setFlipX(true); }
      const glow = this.enemyGlows.get(agent.id);
      if (glow && inWorld) glow.setPosition(agent.posX, agent.posY);
      if (agent.sprite) {
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
          if (inWorld) {
            if (agent.hitFlashFrames > 0) {
              agent.hitFlashFrames--;
            } else {
              agent.sprite.clearTint();
            }
          } else {
            agent.sprite.setTint(0x606060);
          }
          targetAlpha = inWorld ? 1 : 0.18;
        }
        agent.sprite.alpha += (targetAlpha - agent.sprite.alpha) * 0.12;
        if (glow) { glow.alpha = (isBreaching || inWorld) ? 0.35 : 0.04; if (isBreaching) glow.setFillStyle(0xff00ff, 0.4); else if (isCharging) glow.setFillStyle(0xaa44ff, 0.3); }

        // Guard pre-breach building-up warning label
        if (agent instanceof GuardAgent && breach?.isBuildingUp) {
          let warnTxt = this._breachWarnings.get(agent.id);
          if (!warnTxt) {
            warnTxt = this.add.text(agent.posX, agent.posY - 28, "⚠ BREACH", {
              fontFamily: "monospace", fontSize: "11px", color: "#cc88ff", fontStyle: "bold",
              stroke: "#000000", strokeThickness: 2,
            }).setOrigin(0.5).setDepth(72).setAlpha(0);
            this.tweens.add({ targets: warnTxt, alpha: 0.9, duration: 300 });
            this._breachWarnings.set(agent.id, warnTxt);
          } else {
            warnTxt.setPosition(agent.posX, agent.posY - 28);
            const pulse = 0.5 + 0.4 * Math.sin(performance.now() * 0.007);
            warnTxt.setAlpha(pulse);
          }
        } else {
          const existing = this._breachWarnings.get(agent.id);
          if (existing) { existing.destroy(); this._breachWarnings.delete(agent.id); }
        }
      }
    }

    // Welder heal beam — redraw each frame for all active welders
    this._weldBeamGfx.clear();
    for (const welder of this.welders) {
      if (!welder.sprite || welder.isDead) continue;
      // Find nearest injured ally within a wider visual range (240px)
      let nearestAlly: { posX: number; posY: number } | null = null;
      let nearestDist = Infinity;
      for (const ally of (this.allAgents as AnyAgent[])) {
        if (ally === welder || ally.isDead || !("hp" in ally) || !("maxHp" in ally)) continue;
        const ax = (ally as { posX: number }).posX, ay = (ally as { posY: number }).posY;
        const d = Math.hypot(ax - welder.posX, ay - welder.posY);
        if (d < 240 && (ally as { hp: number }).hp < (ally as { maxHp: number }).maxHp && d < nearestDist) {
          nearestDist = d;
          nearestAlly = { posX: ax, posY: ay };
        }
      }
      if (nearestAlly && nearestDist < 240) {
        const alpha = nearestDist < 120 ? 0.7 : 0.35;
        this._weldBeamGfx.lineStyle(2, 0x44ffee, alpha);
        this._weldBeamGfx.lineBetween(welder.posX, welder.posY, nearestAlly.posX, nearestAlly.posY);
        const t = (performance.now() * 0.001) % 1;
        const dotX = welder.posX + (nearestAlly.posX - welder.posX) * t;
        const dotY = welder.posY + (nearestAlly.posY - welder.posY) * t;
        this._weldBeamGfx.fillStyle(0x88ffee, 0.9);
        this._weldBeamGfx.fillCircle(dotX, dotY, 3);
      }
    }
    this._cachedActiveEnemies = activeCount;
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
      get allAgents()             { return s.allAgents; },        set allAgents(v)            { s.allAgents = v; s._allAgentsDirty = true; },
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
      get reactorHp()             { return s._reactorCtrl?.hp ?? 500; },   set reactorHp(_v)            { /* read-only via ReactorController */ },
      get reactorMaxHp()          { return s._reactorCtrl?.maxHp ?? 500; },
      get spatialGrid()           { return s.spatialGrid; },
      get agentPositions()        { return s.agentPositions; },
      get playerBaseScale()       { return s._playerBaseScale; },
      get phaseSurgeTimer()       { return s._phaseSurgeTimer; }, set phaseSurgeTimer(v) { s._phaseSurgeTimer = v; },
    };
  }

  private _spawnPlayer(): void {
    const usePxPlayer = this.textures.exists("player_idle_sheet");
    const tex = usePxPlayer ? "player_idle_sheet" : "player";
    const spawnX = Math.floor(CELL_W / 2), spawnY = Math.floor(CELL_H + CELL_H / 2);  // Hub at row 1
    this.playerSprite = this.physics.add.sprite(spawnX, spawnY, tex);
    this._playerBaseScale = usePxPlayer ? 2.2 : 1.3;
    this.playerSprite.setCollideWorldBounds(true).setDepth(50).setScale(this._playerBaseScale).setData("hp", this.playerHp);
    if (usePxPlayer) this.playerSprite.play("player_idle");
    this.playerGlow = this.add.circle(spawnX, spawnY, 26, 0x00ff88, 0.22)
      .setDepth(49)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setStrokeStyle(2, 0xaaffdd, 0.55);
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
        this._powerCardLabel = this.add.text(cardX, cardY - 22, "POWER CARD", {
          fontFamily: UI_FONT, fontSize: "11px", color: "#00ff88",
          stroke: "#000", strokeThickness: 2,
        }).setOrigin(0.5).setDepth(17);
        this.tweens.add({ targets: this._powerCardLabel, alpha: { from: 0.6, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
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
        if (this._powerCardLabel) { this.tweens.killTweensOf(this._powerCardLabel); this._powerCardLabel.destroy(); this._powerCardLabel = null; }
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

    // ── REACTOR REPAIR USING [G] ───────────────────────────
    if (reactPos) {
      const reactorDist = Math.hypot(px - reactPos.x, py - reactPos.y);
      if (reactorDist < 140) {
        hintText = this._reactorCtrl.hp < this._reactorCtrl.maxHp ? "[ G ] REPAIR REACTOR" : "[ G ] MAINTAIN REACTOR";
        if (Phaser.Input.Keyboard.JustDown(this.repairKey)) {
          const repairedCorruption = this.mapObstacles.repairNearby(reactPos.x, reactPos.y, 150, 40);
          const healed = this._reactorCtrl.repair(50);
          this._repairConsumed = true;
          if (repairedCorruption || healed > 0) {
            AudioManager.instance.upgradeSelect();
            Juice.screenShake(this, 0.002, 80);
            this._storyCtrl?.showStoryHint("⚡ REACTOR REPAIRED", 1800);
          }
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
    this.upgradeSystem.currentWave = this.waveManager.currentWave;
    const upgrades = this.upgradeSystem.getAvailableUpgrades();
    if (upgrades.length === 0 && afterWave) { this._afterShopClose(); return; }
    this.upgradeUI.show(upgrades, this.upgradeSystem.scrap,
      (id: string) => {
        const purchased = this.upgradeSystem.tryPurchase(id);
        if (purchased) AudioManager.instance.upgradeSelect();
        if (purchased && id.startsWith("card_")) {
          const theme = id.replace("card_", "");
          this.mapObstacles.unlockTheme(theme);
          const ROOM_NAMES: Record<string, string> = {
            factory: "BIO LAB", server: "DATA LAB", power: "REACTOR CORE",
            control: "CMD CENTER", maintenance: "SUPPLY DEPOT",
            armory: "ARMORY", quarantine: "QUARANTINE ZONE", vault: "THE VAULT",
          };
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

  private _showLockedRoomFeedback(theme: string): void {
    const CARD_NAMES: Record<string, string> = {
      factory: "Bio Lab Access Card", server: "Data Lab Access Card",
      power: "Reactor Core Access Card", control: "Cmd Center Access Card",
      maintenance: "Supply Depot Access Card", armory: "Armory Access Card",
      quarantine: "Quarantine Access Card", vault: "Secure Vault Access Card",
    };
    const cardName = CARD_NAMES[theme] ?? `${theme.toUpperCase()} Access Card`;
    const x = GAME_WIDTH / 2, y = GAME_HEIGHT * 0.72;
    const bg = this.add.graphics().setDepth(250).setScrollFactor(0).setAlpha(0);
    bg.fillStyle(0x220000, 0.9); bg.fillRoundedRect(x - 210, y - 28, 420, 56, 8);
    bg.lineStyle(2, 0xff4444, 0.9); bg.strokeRoundedRect(x - 210, y - 28, 420, 56, 8);
    const line1 = this.add.text(x, y - 10, "⛔  LOCKED", {
      fontSize: "13px", fontFamily: "monospace", color: "#ff4444",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(251).setScrollFactor(0).setAlpha(0);
    const line2 = this.add.text(x, y + 12, `Requires: ${cardName}`, {
      fontSize: "11px", fontFamily: "monospace", color: "#ffaaaa",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(251).setScrollFactor(0).setAlpha(0);
    this.tweens.add({ targets: [bg, line1, line2], alpha: 1, duration: 200 });
    this.time.delayedCall(1800, () => {
      this.tweens.add({
        targets: [bg, line1, line2], alpha: 0, duration: 350,
        onComplete: () => { bg.destroy(); line1.destroy(); line2.destroy(); },
      });
    });
  }

  private _applyUpgradesToPlayer(): void {
    const dimDmg = Math.round(this.playerStats.damage * this.worldManager.damageMult);
    this.playerShootSkill = new ShootSkill(-1, {
      damage: dimDmg,
      range: 450,
      speed: this.playerStats.projectileSpeed,
      tint: 0x00ff88,
      ...this._currentSpreadConfig(),
    }, this.playerStats.fireRate);
    this._playerCtrl?.setShootSkill(this.playerShootSkill);
    this.playerHp = Math.min(this.playerHp + 20, this.playerStats.maxHp);
    this.weaponVisual?.setTier(WeaponVisual.calcTier(this.playerStats.damage));
  }

  private _currentSpreadConfig(): { spreadCount: number; spreadAngle: number } {
    const ms = this.upgradeSystem.multiShotLevel;
    return {
      spreadCount: ms === 0 ? 0 : ms * 2,
      spreadAngle: ms === 0 ? 0 : 0.18 + ms * 0.05,
    };
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
    // Rebuild steered cache only when allAgents length changes; otherwise update positions in-place
    const agents = this.allAgents;
    if (this._allAgentsDirty || this._steeredCache.length !== agents.length) {
      this._steeredCache.length = agents.length;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!this._steeredCache[i]) this._steeredCache[i] = { id: a.id, posX: a.posX, posY: a.posY };
        else { this._steeredCache[i].id = a.id; this._steeredCache[i].posX = a.posX; this._steeredCache[i].posY = a.posY; }
      }
      this._allAgentsDirty = false;
    } else {
      for (let i = 0; i < agents.length; i++) {
        this._steeredCache[i].posX = agents[i].posX;
        this._steeredCache[i].posY = agents[i].posY;
      }
    }
    const steeredList = this._steeredCache;
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
          // Reuse existing array if present — avoids per-tick allocation
          if (!agent.nearbyAgents) agent.nearbyAgents = [];
          agent.nearbyAgents.length = 0;
          for (const n of steeredList) {
            if (n.id !== agent.id && Math.abs(n.posX - agent.posX) < 80 && Math.abs(n.posY - agent.posY) < 80) {
              agent.nearbyAgents.push(n);
            }
          }
          agent.tick(this._abilityMgr.chronoActive ? delta * 0.15 : delta);
        }
      }
      if (agent.isDead) this.deathQueue.push(agent);
    }
    const chronoTick = this._abilityMgr.chronoActive ? delta * 0.15 : delta;
    for (const agent of this.guards as (GuardAgent | CollectorAgent)[]) {
      agent.playerWorld = playerWorld;
      if (this._isAgentInCurrentWorld(agent) || agent.breach.isActive || agent.breach.isCharging) {
        agent.tick(chronoTick);
      }
      if (agent.isDead) this.deathQueue.push(agent);
    }
    for (const agent of this.collectors as (GuardAgent | CollectorAgent)[]) {
      agent.playerWorld = playerWorld;
      if (this._isAgentInCurrentWorld(agent) || agent.breach.isActive || agent.breach.isCharging) {
        agent.tick(chronoTick);
      }
      if (agent.isDead) this.deathQueue.push(agent);
    }
    for (const agent of this.turrets) {
      if (this._isAgentInCurrentWorld(agent)) agent.tick(chronoTick);
      if (agent.isDead) this.deathQueue.push(agent);
    }
    for (const agent of this.sawblades) {
      if (this._isAgentInCurrentWorld(agent)) agent.tick(chronoTick);
      if (agent.isDead) this.deathQueue.push(agent);
    }
    for (const agent of this.welders) {
      if (this._isAgentInCurrentWorld(agent)) agent.tick(chronoTick);
      if (agent.isDead) this.deathQueue.push(agent);
    }
  }

  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    return this.worldManager.isAgentInCurrentWorld(agent);
  }

  private _performWorldSwitch(): void {
    // Phase Surge bonus: switching at high instability rewards the player
    const instabilityAtSwitch = this.worldManager.instability;
    const newWorld = this.worldManager.switchWorld();

    // Re-apply upgrades so dimension damage/speed bonuses take effect
    this._applyUpgradesToPlayer();

    if (instabilityAtSwitch >= 0.6) {
      const surgeDuration = 2500 + this.upgradeSystem.phaseSurgeBonus;
      const prevDmg = this.playerStats.damage;
      this.playerStats.damage = Math.round(prevDmg * 1.4);
      this._applyUpgradesToPlayer();
      this._phaseSurgeTimer = surgeDuration;

      // Activation flash — short violet burst around player
      const flash = this.add.circle(this.playerSprite.x, this.playerSprite.y, 48, 0xcc44ff, 0.6)
        .setDepth(109).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: flash, scale: 2.5, alpha: 0, duration: 300, ease: "Quad.easeOut", onComplete: () => flash.destroy() });

      // Player pulse
      Juice.punchScale(this.playerSprite, 1.4, 180);

      // Floating label
      const surgeLabel = this.add.text(this.playerSprite.x, this.playerSprite.y - 40, "PHASE SURGE!", {
        fontFamily: "Orbitron, sans-serif", fontSize: "16px", color: "#cc44ff", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(110);
      this.tweens.add({ targets: surgeLabel, y: surgeLabel.y - 30, alpha: 0, duration: 1400, onComplete: () => surgeLabel.destroy() });

      // Player tint during surge
      this.playerSprite.setTint(0xdd66ff);

      AudioManager.instance.phaseSurge();
      this.time.delayedCall(surgeDuration, () => {
        if (!this.gameOver) {
          this.playerStats.damage = prevDmg;
          this._applyUpgradesToPlayer();
          this._phaseSurgeTimer = 0;
          this.playerSprite.clearTint();
          // Expiration feedback
          const endFlash = this.add.circle(this.playerSprite.x, this.playerSprite.y, 32, 0x8822aa, 0.4)
            .setDepth(109).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: endFlash, scale: 1.8, alpha: 0, duration: 250, onComplete: () => endFlash.destroy() });
          const endLabel = this.add.text(this.playerSprite.x, this.playerSprite.y - 30, "SURGE ENDED", {
            fontFamily: "Orbitron, sans-serif", fontSize: "11px", color: "#8844aa",
            stroke: "#000000", strokeThickness: 2,
          }).setOrigin(0.5).setDepth(110);
          this.tweens.add({ targets: endLabel, y: endLabel.y - 20, alpha: 0, duration: 800, onComplete: () => endLabel.destroy() });
        }
      });
    }

    // ── Phase 1 (0ms): Screen fracture + glitch burst ────────────────────────
    Juice.screenShake(this, 0.028, 120);

    // Sharp pre-flash (white core — "reality cracking") at t=0
    const preFlash = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.30)
      .setDepth(203).setScrollFactor(0);
    this.tweens.add({ targets: preFlash, alpha: 0, duration: 90, ease: "Power3", onComplete: () => preFlash.destroy() });

    // ── Phase 2 (90ms): World distortion — screen tears, zoom ────────────────
    const pal = WORLD_PALETTES[newWorld];
    for (let i = 0; i < 11; i++) {
      const ty = Phaser.Math.Between(20, GAME_HEIGHT - 20);
      const tw = GAME_WIDTH * Phaser.Math.FloatBetween(0.3, 1.0);
      const tx = (GAME_WIDTH - tw) * Phaser.Math.FloatBetween(0, 1);
      const tearDelay = 80 + i * 18;
      const tear = this.add.rectangle(tx + tw/2, ty, tw, Phaser.Math.Between(1, 4), pal.flashColor, 0.92)
        .setDepth(201).setScrollFactor(0);
      this.tweens.add({ targets: tear, alpha: 0, scaleY: Phaser.Math.FloatBetween(3, 9), duration: 220, delay: tearDelay, onComplete: () => tear.destroy() });
    }

    // Zoom crunch: pull back → snap in — timed to tears
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.setZoom(1);
    this.cameras.main.zoomTo(0.91, 90, "Quad.easeIn", false, (_cam, progress) => {
      if (progress === 1) this.cameras.main.zoomTo(1.0, 260, "Back.easeOut");
    });

    // Slow-mo "reality freeze" aligned with the crunch
    Juice.slowMo(this, 0.08, 200);

    // ── Phase 3 (200ms): Color palette change + world switch ──────────────────
    this.time.delayedCall(180, () => {
      if (this.cleanedUp) return;
      for (let i = ShootSkill.activeProjectiles.length - 1; i >= 0; i--) {
        const p = ShootSkill.activeProjectiles[i];
        if (p.active && p.ownerId > 0) ShootSkill.recycleProjectile(p);
      }
      this.dimensionBg?.setWorld(newWorld);
      this.dimensionBg?.triggerSwitchBurst();
      this._dimOverlay?.setWorld(newWorld);
      this.dimensionTint?.setFillStyle(pal.tintColor, 0.10);

      // Cinematic audio: distortion gap then new ambience
      AudioManager.instance.worldSwitchCinematic(newWorld === 'FOUNDRY' ? 'foundry' : 'circuit');

      // Primary dimension colour flash
      const flash = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, pal.flashColor, 0.60)
        .setDepth(200).setScrollFactor(0);
      this.tweens.add({ targets: flash, alpha: 0, duration: 420, ease: "Power2", onComplete: () => flash.destroy() });

      // ── Phase 4 (280ms): Particle shift at player + radial burst ring ───────
      const px = this.playerSprite.x;
      const py = this.playerSprite.y;
      ParticleVFX.worldSwitch(this, px, py);

      Juice.screenShake(this, 0.018, 200);

      // Burst ring at player — dimension coloured
      const shiftRing = this.add.circle(px, py, 20, pal.flashColor, 0.75)
        .setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: shiftRing, scale: 8, alpha: 0, duration: 400, ease: "Quad.easeOut", onComplete: () => shiftRing.destroy() });

      // Outer shockwave ring
      const shockRing = this.add.circle(px, py, 14, 0xffffff, 0)
        .setStrokeStyle(2, pal.flashColor, 0.8).setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: shockRing, scale: 6, alpha: 0, duration: 380, ease: "Expo.easeOut", onComplete: () => shockRing.destroy() });

      // Story callback
      this._storyCtrl?.onWorldSwitch(newWorld);
    });

    // I-frames cover the whole transition window
    this.iFrameTimer = Math.max(this.iFrameTimer, 500);

    // Show world-switch banner — slight delay so it doesn't compete with the pre-flash
    this.time.delayedCall(220, () => {
      if (!this.cleanedUp) this._hudMgr?.showWorldSwitchBanner(newWorld);
    });
    // Ghost tints are handled per-frame in the agent update loop; no explicit call needed here
  }


  private _applyPowerUp(type: string): void {
    AudioManager.instance.powerUp(type);
    // Duration comes from PowerUpSystem — MainScene owns only the revert callbacks.
    const duration = this.powerUpSystem.activate(type as import("../core").PowerUpType);
    switch (type) {
      case "rapid_fire":
        this.playerShootSkill = new ShootSkill(-1, {
          damage: this.playerStats.damage,
          range: 500,
          speed: this.playerStats.projectileSpeed,
          tint: 0xff4400,
          ...this._currentSpreadConfig(),
        }, Math.floor(this.playerStats.fireRate * 0.45));
        this._playerCtrl?.setShootSkill(this.playerShootSkill);
        this.time.delayedCall(duration, () => { if (!this.gameOver) this._applyUpgradesToPlayer(); });
        break;
      case "shield_regen": this.playerHp = Math.min(this.playerStats.maxHp, this.playerHp + 40); break;
      case "scrap_magnet":
        this.scrapManager.setVortex(true, 2.5, "powerup");
        this.time.delayedCall(duration, () => {
          if (!this.gameOver && !this.cleanedUp) this.scrapManager.setVortex(false, 1, "powerup");
        });
        break;
      case "damage_boost":
        this.playerStats.damage = this._baseDamage * 2; this._applyUpgradesToPlayer();
        this.time.delayedCall(duration, () => { if (!this.gameOver) { this.playerStats.damage = this._baseDamage; this._applyUpgradesToPlayer(); } });
        break;
      case "speed_boost":
        this.playerStats.speed = this._baseSpeed * 1.6;
        this.time.delayedCall(duration, () => { if (!this.gameOver) this.playerStats.speed = this._baseSpeed; });
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
    const t = this.add.text(this.playerSprite.x, py, def.text, { fontFamily: UI_FONT, fontSize: "16px", color: def.color, fontStyle: "bold", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: py - 40, alpha: 0, duration: 1400, ease: "Power2", onComplete: () => t.destroy() });
  }

  private _showPhysicsZoneBanner(label: string): void {
    // Kill any active tween on the old banner before destroying it so the tween
    // onComplete can't fire against the newly-created object (prevents ghost doublets).
    if (this._physicsZoneBannerText) {
      this.tweens.killTweensOf(this._physicsZoneBannerText);
      this._physicsZoneBannerText.destroy();
      this._physicsZoneBannerText = null;
    }
    // Physics zone banner uses scrollFactor(0) + screen-relative position so it
    // is always centred at 22% from top of the viewport regardless of camera scroll.
    const bx = GAME_WIDTH / 2;
    const by = GAME_HEIGHT * 0.22;
    const banner = this.add.text(bx, by, label, {
      fontFamily: UI_FONT, fontSize: "18px", color: "#ffcc00",
      stroke: "#000000", strokeThickness: 4, fontStyle: "bold",
      align: "center", wordWrap: { width: 720, useAdvancedWrap: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(1);
    constrainTextBlock(banner, 720, 2, 12);
    this._physicsZoneBannerText = banner;
    // Capture the ref in a local to guard the onComplete callback against a new banner
    // being placed before this fade finishes.
    const captured = banner;
    this.tweens.add({
      targets: banner, alpha: 0, y: by - 30, duration: 2200, ease: "Quad.easeIn",
      onComplete: () => {
        captured.destroy();
        if (this._physicsZoneBannerText === captured) this._physicsZoneBannerText = null;
      },
    });
  }

  private _showWorldSwitchTutorial(): void {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const W = 620, H = 280;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(310);
    drawPanel(bg, cx - W / 2, cy - H / 2, W, H, 0xff8844, 0x05060b, 0.94, 14);

    const title = this.add.text(cx, cy - H / 2 + 28, "⚙ PHASE-SHIFT PROTOCOL ⚙", {
      fontFamily: UI_FONT, fontSize: "22px", color: "#ff8844",
      fontStyle: "bold", stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(311);
    title.setShadow(0, 0, "#ff4400", 8, true, true);
    const allObjs: Phaser.GameObjects.GameObject[] = [bg, title];

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
      const lineText = this.add.text(cx - W / 2 + 28, cy - H / 2 + 65 + i * 19, l.txt, {
        fontFamily: UI_FONT, fontSize: "12px", color: l.col,
        wordWrap: { width: W - 56, useAdvancedWrap: true },
      }).setScrollFactor(0).setDepth(311);
      constrainTextBlock(lineText, W - 56, 1, 10);
      allObjs.push(lineText);
    });

    // Auto-dismiss after 5.5 s
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      this.tweens.add({
        targets: allObjs, alpha: 0, duration: 400,
        onComplete: () => allObjs.forEach(o => o.destroy()),
      });
    };
    this.time.delayedCall(5500, dismiss);
    // Also allow click-to-dismiss
    const hitArea = this.add.rectangle(cx, cy, W, H, 0x000000, 0)
      .setScrollFactor(0).setDepth(312).setInteractive();
    hitArea.once("pointerdown", () => { hitArea.disableInteractive(); dismiss(); });
    allObjs.push(hitArea);
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
          fontFamily: UI_FONT, fontSize: "34px", color: "#ff2200",
          stroke: "#000000", strokeThickness: 6, fontStyle: "bold",
        }).setOrigin(0.5).setScrollFactor(0).setDepth(300);
        title.setShadow(0, 0, "#ff4400", 12, true, true);
        this.add.text(x, y + 28, "THE FRACTURE STATION IS LOST", {
          fontFamily: UI_FONT, fontSize: "16px", color: "#ff8844",
          stroke: "#000000", strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(300);
        this._deathCause = "reactor";
        this.time.delayedCall(2200, () => this._onGameOver());
      },
    });
  }

  private _onGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.input.enabled = false;
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
      const data = { kills: this.killCount, wave: this.waveManager.currentWave, scrap: this.totalScrapCollected, score: this.comboSystem.score, maxCombo: this.comboSystem.maxCombo, maxStreak: this._playerCtrl?.maxKillStreak ?? 0, deathCause: this._deathCause, timePlayed: Math.round((performance.now() - this._gameStartTime) / 1000) };
      const camera = this.cameras.main;
      let switched = false;
      const go = (): void => {
        if (switched) return;
        switched = true;
        this._cleanup();
        camera.resetFX();
        this.scene.start("GameOverScene", data);
      };

      camera.resetFX();
      camera.fadeOut(500, 0, 0, 0);
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
      this.time.delayedCall(750, go);
      window.setTimeout(go, 1000);
    });
  }

  private _togglePause(): void {
    if (this.gameOver || this.upgradeUI.isVisible) return;
    if (this.paused) {
      this.paused = false;
      this.physics.resume();
      this.pauseContainer?.destroy();
      this.pauseContainer = null;
      return;
    }
    this.paused = true;
    this.physics.pause();

    // ── Layout constants ─────────────────────────────────────────────────────
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const PW = 860;   // panel width
    const PH = 460;   // panel height
    const px = cx - PW / 2;
    const py = cy - PH / 2;
    // Left column: buttons  |  Right column: reference
    const COL_DIV = px + 360;  // x where divider sits
    const BTN_X   = px + 180;  // button centre x
    const REF_X   = COL_DIV + 28; // reference text left edge

    this.pauseContainer = this.add.container(0, 0).setDepth(500).setScrollFactor(0);
    const pc = this.pauseContainer;

    // ── Background overlay + scanlines ───────────────────────────────────────
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.80);
    const scanGfx = this.add.graphics();
    for (let sy = 0; sy < GAME_HEIGHT; sy += 3) {
      scanGfx.fillStyle(0x000000, 0.10);
      scanGfx.fillRect(0, sy, GAME_WIDTH, 1);
    }
    pc.add([overlay, scanGfx]);

    // ── Main panel frame ─────────────────────────────────────────────────────
    const frameGfx = this.add.graphics();
    // Outer fill
    frameGfx.fillStyle(0x020b14, 0.97);
    frameGfx.fillRoundedRect(px, py, PW, PH, 14);
    // Accent top bar
    frameGfx.fillStyle(0x00ff88, 0.08);
    frameGfx.fillRoundedRect(px, py, PW, 56, { tl: 14, tr: 14, bl: 0, br: 0 });
    // Border
    frameGfx.lineStyle(2, 0x00ff88, 0.75);
    frameGfx.strokeRoundedRect(px, py, PW, PH, 14);
    // Inner subtle border
    frameGfx.lineStyle(1, 0x00ff88, 0.15);
    frameGfx.strokeRoundedRect(px + 4, py + 4, PW - 8, PH - 8, 11);
    // Corner accent marks
    const corners = [[px + 16, py + 16], [px + PW - 16, py + 16], [px + 16, py + PH - 16], [px + PW - 16, py + PH - 16]];
    frameGfx.lineStyle(2, 0x00ff88, 0.55);
    for (const [cx2, cy2] of corners) {
      frameGfx.beginPath(); frameGfx.moveTo(cx2 - 8, cy2); frameGfx.lineTo(cx2, cy2); frameGfx.lineTo(cx2, cy2 - 8); frameGfx.strokePath();
      frameGfx.beginPath(); frameGfx.moveTo(cx2 + 8, cy2); frameGfx.lineTo(cx2, cy2); frameGfx.lineTo(cx2, cy2 + 8); frameGfx.strokePath();
    }
    pc.add(frameGfx);

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleY = py + 28;
    const title = this.add.text(cx, titleY, "// SYSTEM PAUSED //", {
      fontFamily: UI_FONT, fontSize: "22px", color: "#00ff88",
      fontStyle: "bold", stroke: "#001a0a", strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 10, fill: true },
    }).setOrigin(0.5, 0.5);
    // Wave status tag (top-right of panel)
    const waveLabel = `WAVE ${this.waveManager.currentWave > 0 ? this.waveManager.currentWave : "—"}`;
    const waveTag = this.add.text(px + PW - 16, titleY, waveLabel, {
      fontFamily: UI_MONO, fontSize: "11px", color: "#336644",
    }).setOrigin(1, 0.5);
    pc.add([title, waveTag]);

    // Header divider
    const hdivGfx = this.add.graphics();
    hdivGfx.lineStyle(1, 0x00ff88, 0.35);
    hdivGfx.lineBetween(px + 16, py + 56, px + PW - 16, py + 56);
    pc.add(hdivGfx);

    // ── Column divider ────────────────────────────────────────────────────────
    const cdivGfx = this.add.graphics();
    cdivGfx.lineStyle(1, 0x00ff88, 0.18);
    cdivGfx.lineBetween(COL_DIV, py + 66, COL_DIV, py + PH - 16);
    pc.add(cdivGfx);

    // ── LEFT COLUMN: Navigation buttons ──────────────────────────────────────
    const BTN_W = 280;
    const BTN_H = 48;
    const BTN_GAP = 14;
    const btnsStartY = py + 90;

    const buttons = [
      { label: "RESUME",    icon: "▶", color: 0x00ff88, hex: "#00ff88", action: () => this._togglePause() },
      { label: "RESTART",   icon: "↺", color: 0xffaa00, hex: "#ffaa00", action: () => { this._cleanup(); this.scene.restart(); } },
      { label: "MAIN MENU", icon: "⌂", color: 0xff4433, hex: "#ff4433", action: () => { this._cleanup(); this.scene.start("TitleScene"); } },
      { label: "SETTINGS",  icon: "⚙", color: 0x38d8ff, hex: "#38d8ff", action: () => { this._settingsUI.open(); } },
    ];

    buttons.forEach((btn, i) => {
      const by = btnsStartY + i * (BTN_H + BTN_GAP);
      const bx = BTN_X - BTN_W / 2;

      const bg = this.add.graphics();
      const drawBtn = (hov: boolean, active = false) => {
        bg.clear();
        // Fill
        if (hov || active) {
          bg.fillStyle(btn.color, 0.18);
        } else {
          bg.fillStyle(0x000000, 0.60);
        }
        bg.fillRoundedRect(bx, by, BTN_W, BTN_H, 6);
        // Left accent bar
        bg.fillStyle(btn.color, hov ? 0.95 : 0.40);
        bg.fillRect(bx, by + 6, 3, BTN_H - 12);
        // Border
        bg.lineStyle(1.5, btn.color, hov ? 0.90 : 0.35);
        bg.strokeRoundedRect(bx, by, BTN_W, BTN_H, 6);
      };
      drawBtn(false);

      const iconTxt = this.add.text(bx + 22, by + BTN_H / 2, btn.icon, {
        fontFamily: UI_FONT, fontSize: "16px", color: btn.hex, fontStyle: "bold",
      }).setOrigin(0.5, 0.5).setAlpha(0.70);

      const labelTxt = this.add.text(bx + 42, by + BTN_H / 2, btn.label, {
        fontFamily: UI_FONT, fontSize: "17px", color: btn.hex, fontStyle: "bold",
      }).setOrigin(0, 0.5);

      const hit = this.add.zone(BTN_X, by + BTN_H / 2, BTN_W, BTN_H).setScrollFactor(0).setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => {
        drawBtn(true);
        iconTxt.setAlpha(1);
        labelTxt.setColor("#ffffff");
      });
      hit.on("pointerout", () => {
        drawBtn(false);
        iconTxt.setAlpha(0.70);
        labelTxt.setColor(btn.hex);
      });
      hit.on("pointerdown", () => {
        drawBtn(false, true);
        hit.disableInteractive();
        labelTxt.setColor("#ffffff");
        this.time.delayedCall(80, () => btn.action());
      });

      pc.add([bg, iconTxt, labelTxt, hit]);
    });

    // ── RIGHT COLUMN: Controls reference ─────────────────────────────────────
    const refY = py + 74;

    // Section: CONTROLS
    const ctrlTitle = this.add.text(REF_X, refY, "CONTROLS", {
      fontFamily: UI_MONO, fontSize: "9px", color: "#00ff88", fontStyle: "bold",
      letterSpacing: 2,
    }).setOrigin(0, 0).setAlpha(0.80);
    pc.add(ctrlTitle);

    const ctrlSepGfx = this.add.graphics();
    ctrlSepGfx.lineStyle(1, 0x00ff88, 0.20);
    ctrlSepGfx.lineBetween(REF_X, refY + 14, px + PW - 20, refY + 14);
    pc.add(ctrlSepGfx);

    const CTRL_ROWS: [string, string][] = [
      ["WASD / ↑↓←→", "Move"],
      ["LMB / SPACE",  "Shoot"],
      ["SHIFT / RMB",  "Dash"],
      ["Q",            "Phase-shift"],
      ["E",            "Nova blast"],
      ["R",            "Surge"],
      ["F",            "Shield"],
      ["C",            "Chrono slow"],
      ["B",            "Open shop"],
      ["G",            "Repair reactor"],
      ["ESC / P",      "Pause"],
      ["TAB",          "Settings"],
    ];

    const ROW_H  = 17;
    const COL1_W = 96;
    CTRL_ROWS.forEach(([key, action], i) => {
      const ry = refY + 22 + i * ROW_H;
      // Key badge background
      const kbg = this.add.graphics();
      kbg.fillStyle(0x001a0d, 0.90);
      kbg.fillRoundedRect(REF_X, ry - 1, COL1_W, ROW_H - 2, 3);
      kbg.lineStyle(1, 0x00ff88, 0.22);
      kbg.strokeRoundedRect(REF_X, ry - 1, COL1_W, ROW_H - 2, 3);

      const keyTxt = this.add.text(REF_X + COL1_W / 2, ry + (ROW_H - 2) / 2 - 1, key, {
        fontFamily: UI_MONO, fontSize: "9px", color: "#88ffcc",
      }).setOrigin(0.5, 0.5);

      const actTxt = this.add.text(REF_X + COL1_W + 8, ry + (ROW_H - 2) / 2 - 1, action, {
        fontFamily: UI_MONO, fontSize: "9px", color: "#557766",
      }).setOrigin(0, 0.5);

      pc.add([kbg, keyTxt, actTxt]);
    });

    // Section: HOW TO PLAY  (below controls)
    const htpStartY = refY + 22 + CTRL_ROWS.length * ROW_H + 10;
    const htpSepGfx = this.add.graphics();
    htpSepGfx.lineStyle(1, 0x00ff88, 0.15);
    htpSepGfx.lineBetween(REF_X, htpStartY, px + PW - 20, htpStartY);
    pc.add(htpSepGfx);

    const htpTitle = this.add.text(REF_X, htpStartY + 6, "QUICK REFERENCE", {
      fontFamily: UI_MONO, fontSize: "9px", color: "#00ff88", fontStyle: "bold",
      letterSpacing: 2,
    }).setOrigin(0, 0).setAlpha(0.80);
    pc.add(htpTitle);

    const htpLines: [string, string][] = [
      ["MACHINE CORE",  "Red enemies hunt you — shoot them down"],
      ["VOID SECTOR",   "Defend the REACTOR — Q to phase-shift"],
      ["HEAT 75%+",     "+20% damage but overheat = 2.4s lockout"],
      ["SCRAP",         "Kill enemies → collect scrap → buy upgrades"],
    ];
    htpLines.forEach(([tag, desc], i) => {
      const ly = htpStartY + 20 + i * 16;
      pc.add(this.add.text(REF_X, ly, tag, {
        fontFamily: UI_MONO, fontSize: "9px", color: "#ff9944", fontStyle: "bold",
      }).setOrigin(0, 0));
      pc.add(this.add.text(REF_X + 80, ly, desc, {
        fontFamily: UI_MONO, fontSize: "9px", color: "#556655",
        wordWrap: { width: px + PW - 20 - REF_X - 84, useAdvancedWrap: true },
      }).setOrigin(0, 0));
    });

    // ── Entrance animation ────────────────────────────────────────────────────
    const panelObjs = [frameGfx, title, waveTag, hdivGfx, cdivGfx];
    for (const obj of panelObjs) {
      (obj as Phaser.GameObjects.GameObject & { setAlpha: (a: number) => void }).setAlpha(0);
    }
    this.tweens.add({
      targets: panelObjs, alpha: 1, duration: 180, ease: "Quad.easeOut",
    });
  }

  private _registerBusEvents(): void {
    const bus = SystemsBus.instance;
    bus.on("scrap:collected", (value: unknown) => {
      const v = value as number;
      this.upgradeSystem.addScrap(v); this.totalScrapCollected += v; this.missionSystem.onScrapCollect(v); AudioManager.instance.pickup();
      this._hudMgr.onFirstScrap();
    });
    bus.on("resource:harvested", (node: unknown) => { this.resourceSprites.get((node as { id: number }).id)?.setVisible(false); });
    bus.on("resource:respawned", (node: unknown) => { this.resourceSprites.get((node as { id: number }).id)?.setVisible(true); });
    const onBreach = (_agentId: unknown, bx: unknown, by: unknown) => {
      const pos = { x: bx as number, y: by as number };

      // Dimensional rift sound
      AudioManager.instance.dimensionBreach();

      // Screen-space flash — strong purple, then fades
      const flash = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x8800cc, 0.45)
        .setScrollFactor(0).setDepth(115).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: flash, alpha: 0, duration: 700, ease: "Quad.easeOut", onComplete: () => flash.destroy() });

      // Warning text — punches in, holds, fades
      const warn = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2 - 90,
        "! DIMENSION BREACH !",
        { fontFamily: UI_FONT, fontSize: "26px", color: "#ff44ff", fontStyle: "bold",
          stroke: "#000000", strokeThickness: 5,
          shadow: { offsetX: 0, offsetY: 0, color: "#ff00ff", blur: 14, fill: true } })
        .setOrigin(0.5).setScrollFactor(0).setDepth(116).setAlpha(0).setScale(0.6);
      this.tweens.add({ targets: warn, alpha: 1, scaleX: 1, scaleY: 1, duration: 180, ease: "Back.easeOut",
        onComplete: () => {
          this.tweens.add({ targets: warn, alpha: 0, y: warn.y - 30, duration: 800, delay: 1000, ease: "Quad.easeIn", onComplete: () => warn.destroy() });
        }
      });

      // Camera shake — via Juice so boss phase-transition priority survives
      Juice.screenShake(this, 0.018, 350);

      // Staggered rings expanding from breach point
      const ringColors = [0xffffff, 0xcc44ff, 0x8800ff, 0xff00ff];
      for (let i = 0; i < 4; i++) {
        this.time.delayedCall(i * 110, () => {
          const col = ringColors[i];
          const r = this.add.circle(pos.x, pos.y, 10 + i * 5, col, i === 0 ? 0.5 : 0.0)
            .setStrokeStyle(3 - i * 0.5, col, 1).setDepth(57).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: r, scaleX: 7 + i * 2, scaleY: 7 + i * 2, alpha: 0,
            duration: 700 + i * 80, ease: "Expo.easeOut", onComplete: () => r.destroy() });
          if (i < 2) AudioManager.instance.explosion();
        });
      }

      // Lingering glow at breach origin
      const glow = this.add.circle(pos.x, pos.y, 22, 0xcc00ff, 0.6)
        .setDepth(56).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, scaleX: 0.3, scaleY: 0.3, alpha: 0, duration: 900, ease: "Quad.easeOut", onComplete: () => glow.destroy() });
    };
    bus.on("guard:breach", onBreach); bus.on("collector:breach", onBreach);

    bus.on("collector:deposited", (_id: unknown, _val: unknown) => {
      const warn = this.add.text(GAME_WIDTH / 2, 50, "⚠ RESOURCES STOLEN!", {
        fontFamily: UI_FONT, fontSize: "14px", color: "#ff8800", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(110);
      this.tweens.add({ targets: warn, y: 40, alpha: 0, duration: 1500, onComplete: () => warn.destroy() });
    });
  }

  private _cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.input.enabled = true;
    this.physics.resume();
    this.cameras.main.resetFX();
    Juice.reset(this);
    ShootSkill.resetPool();
    ResourceSystem.instance.clear();
    AudioManager.instance.stopMusic(); SystemsBus.instance.removeAll();
    this.allAgents?.forEach((agent) => agent.destroy());
    this.allAgents = [];
    this.resourceSprites?.forEach((sprite) => {
      if (sprite?.scene) sprite.destroy();
    });
    this.resourceSprites?.clear();
    this.scrapManager?.clear(); this.upgradeUI?.hide();
    this.fractureFX?.destroy(); this.dimensionBg?.destroy(); this._dimOverlay?.destroy(); this.glitchEvents?.destroy();
    this.deathFX?.destroy(); this.shadowDouble?.destroy(); this.gameJuice?.destroy();
    this.abilityShieldGfx?.destroy(); this.abilityShieldGfx = null;
    this.pauseContainer?.destroy(); this.pauseContainer = null; this.paused = false;
    this._settingsUI?.destroy();
    this.powerUpSystem?.clearAll(); this._hudMgr?.destroy(); this._playerCtrl?.destroy();
    this.enemyGlows.forEach(g => g.destroy()); this.enemyGlows.clear();
    this.playerGlow?.destroy(); this.arenaHazards?.destroy(); this.mapObstacles?.destroy();
    this.boss?.sprite?.destroy(); this.boss = null;
    if (this._powerCardLabel) { this.tweens.killTweensOf(this._powerCardLabel); this._powerCardLabel.destroy(); this._powerCardLabel = null; }
    if (this._powerCardSprite) { this.tweens.killTweensOf(this._powerCardSprite); this._powerCardSprite.destroy(); this._powerCardSprite = null; }
    this.dimensionTint?.destroy(); this.tutorialOverlay?.destroy();
    this.missionUI?.destroy(); this.weaponVisual?.destroy(); this.enemyRadar?.destroy(); this.vfxPool?.destroy();
    this._weldBeamGfx?.destroy();
    this._breachWarnings.forEach(t => t.destroy()); this._breachWarnings.clear();
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
    this.playerStats = { ...DEFAULT_STATS };
    this.killCount = 0; this.totalScrapCollected = 0;
    this._stateMachine.forceSet(GameState.PLAYING);
    this.aiAccumulator = 0; this.contactDamageCooldown = 0;
    this.enemies = []; this.guards = []; this.collectors = [];
    this.turrets = []; this.sawblades = []; this.welders = [];
    this.allAgents = []; this.deathQueue = []; this.boss = null;
    this.abilityShieldActive = false; this.abilityShieldTimer = 0;
    ShootSkill.chronoActive = false; this.damageTakenThisWave = 0; this._waveCooldownMs = 0;
    this.iFrameTimer = 0; this.playerKnockbackVX = 0; this.playerKnockbackVY = 0;
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.godMode = false;
    this._captureMode = false;
    this._controlsOverlay?.destroy(true); this._controlsOverlay = null;
    this._captureHiddenObjs = [];
    this._reactorCtrl?.reset();
    if (this.ddaSystem) { this.ddaSystem.reset(); } else { this.ddaSystem = new DDASystem(); }
    if (this.playerPredictor) { this.playerPredictor.reset(); } else { this.playerPredictor = new PlayerPredictor(); }
  }

  // ── Capture Mode (F10) — hides all persistent HUD/UI for clean screenshots ──
  private _toggleCaptureMode(): void {
    this._captureMode = !this._captureMode;
    const on = this._captureMode;

    // 1. Named subsystems — hide via their own setVisible/setCaptureMode APIs
    this._hudMgr?.setCaptureMode(on);
    this._storyCtrl?.setCaptureMode(on);
    this.enemyRadar?.setVisible(!on);

    // 2. Remaining scrollFactor=0 objects not owned by the above subsystems.
    //    On enable: snapshot current list and hide them.
    //    On disable: restore visibility from the snapshot.
    if (on) {
      this._captureHiddenObjs = this.children.getAll().filter(go => {
        const sf = (go as Phaser.GameObjects.Text).scrollFactorX ?? 1;
        return sf === 0;
      });
      this._captureHiddenObjs.forEach(go => (go as Phaser.GameObjects.Text).setVisible(false));
      // Flash indicator (exempt from hide — created after snapshot)
      const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "CAPTURE MODE ON\nF10 to restore HUD", {
        fontFamily: UI_MONO, fontSize: "16px", color: "#00ff88",
        backgroundColor: "#000000cc", padding: { x: 16, y: 10 }, align: "center",
      }).setOrigin(0.5).setScrollFactor(0).setDepth(400);
      this.tweens.add({ targets: msg, alpha: 0, duration: 400, delay: 1200, onComplete: () => msg.destroy() });
    } else {
      this._captureHiddenObjs.forEach(go => (go as Phaser.GameObjects.Text).setVisible(true));
      this._captureHiddenObjs = [];
      const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "HUD RESTORED", {
        fontFamily: UI_MONO, fontSize: "16px", color: "#38d8ff",
        backgroundColor: "#000000cc", padding: { x: 16, y: 10 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(400);
      this.tweens.add({ targets: msg, alpha: 0, duration: 400, delay: 800, onComplete: () => msg.destroy() });
    }
  }

  // ── Controls Overlay (F1) — full control reference card ──────────────────────
  private _toggleControlsOverlay(): void {
    if (this._controlsOverlay) {
      this.tweens.add({
        targets: this._controlsOverlay, alpha: 0, duration: 200,
        onComplete: () => { this._controlsOverlay?.destroy(true); this._controlsOverlay = null; },
      });
      return;
    }
    const W = 520, H = 340;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const container = this.add.container(0, 0).setDepth(290).setScrollFactor(0).setAlpha(0);

    const bg = this.add.graphics();
    bg.fillStyle(0x020810, 0.92);
    bg.fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 8);
    bg.lineStyle(1, 0x38d8ff, 0.45);
    bg.strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 8);
    bg.lineStyle(3, 0x38d8ff, 0.7);
    const c = 14;
    [[cx-W/2,cy-H/2],[cx+W/2-c,cy-H/2],[cx-W/2,cy+H/2-c],[cx+W/2-c,cy+H/2-c]]
      .forEach(([bx,by]) => bg.strokeRect(bx,by,c,c));
    bg.lineStyle(1, 0x38d8ff, 0.3);
    bg.lineBetween(cx - W/2 + 16, cy - H/2 + 40, cx + W/2 - 16, cy - H/2 + 40);
    container.add(bg);

    const title = this.add.text(cx, cy - H/2 + 20, "CONTROLS  [ F1 to close ]", {
      fontFamily: UI_MONO, fontSize: "12px", color: "#38d8ff", fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setScrollFactor(0);
    container.add(title);

    const cols: [string, string][][] = [
      [
        ["WASD / Arrows", "Move"],
        ["Mouse", "Aim"],
        ["LMB / Space", "Shoot"],
        ["Shift / RMB", "Dash"],
        ["Q", "Phase-shift world"],
        ["X", "Interact / Purge"],
        ["G (repair)", "Repair props"],
      ],
      [
        ["E", "Ability: NOVA"],
        ["R", "Ability: SURGE"],
        ["F", "Ability: SHIELD"],
        ["C", "Ability: CHRONO"],
        ["B / Shop btn", "Open upgrades"],
        ["Esc", "Pause"],
        ["M", "Mute audio"],
      ],
      [
        ["F1", "This screen"],
        ["F10", "Capture mode"],
        ["Tab", "Settings"],
        ["Ctrl+G", "God mode"],
        ["", ""],
        ["FOUNDRY", "Enemies hunt YOU"],
        ["VOID", "Enemies hunt REACTOR"],
      ],
    ];

    const startY = cy - H/2 + 56;
    const colW = (W - 32) / 3;
    cols.forEach((entries, ci) => {
      const colX = cx - W/2 + 16 + ci * colW;
      entries.forEach(([key, desc], ri) => {
        if (!key && !desc) return;
        const ky = this.add.text(colX, startY + ri * 20, key, {
          fontFamily: UI_MONO, fontSize: "9px", color: "#ffbd55",
        }).setScrollFactor(0);
        const dsc = this.add.text(colX + 86, startY + ri * 20, desc, {
          fontFamily: UI_MONO, fontSize: "9px", color: "#a9c4cf",
        }).setScrollFactor(0);
        container.add([ky, dsc]);
      });
    });

    this._controlsOverlay = container;
    this.tweens.add({ targets: container, alpha: 1, duration: 200 });

    // Auto-close on click outside
    this.input.once("pointerdown", () => {
      if (this._controlsOverlay) {
        this.tweens.add({ targets: this._controlsOverlay, alpha: 0, duration: 150, onComplete: () => { this._controlsOverlay?.destroy(true); this._controlsOverlay = null; } });
      }
    });
  }
}
