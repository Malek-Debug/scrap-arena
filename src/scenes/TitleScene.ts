import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SecureStore } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { WalletManager } from "../web3/WalletManager";
import { UI_FONT, UI_MONO, UI_ORBITRON, UI_OXANIUM, drawPanel } from "../rendering/UITheme";
import { SettingsUI } from "../rendering/SettingsUI";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG         = 0x080412;
const GRID_DIM   = 0x1a0e2a;
const GRID_GLOW  = 0xff4400;
const ACCENT     = 0xff5500;
const ACCENT2    = 0x00ff88;
const SPARK_PALETTE = [0xff6600, 0xff8800, 0xffaa00, 0xff3300, 0xffdd44, 0x00ff88, 0xffffff];

interface GearDef { x: number; y: number; innerR: number; outerR: number; teeth: number; speed: number; color: number; glowColor: number; alpha: number; }
const GEAR_DEFS: GearDef[] = [
  { x: 90,   y: 95,   innerR: 65, outerR: 90, teeth: 11, speed:  0.0020, color: 0x442200, glowColor: 0xff6600, alpha: 0.7 },
  { x: 1190, y: 625,  innerR: 78, outerR: 105,teeth: 14, speed: -0.0015, color: 0x3a2000, glowColor: 0xff5500, alpha: 0.65 },
  { x: 170,  y: 630,  innerR: 48, outerR: 66, teeth: 9,  speed:  0.0035, color: 0x332000, glowColor: 0xff8800, alpha: 0.6 },
  { x: 1110, y: 85,   innerR: 55, outerR: 74, teeth: 10, speed: -0.0028, color: 0x442200, glowColor: 0xff6600, alpha: 0.65 },
  { x: 640,  y: 690,  innerR: 38, outerR: 54, teeth: 8,  speed:  0.0042, color: 0x332000, glowColor: 0xff5500, alpha: 0.55 },
  { x: 45,   y: 400,  innerR: 52, outerR: 70, teeth: 9,  speed: -0.0032, color: 0x3a1a00, glowColor: 0xff4400, alpha: 0.6 },
  { x: 1250, y: 370,  innerR: 60, outerR: 82, teeth: 12, speed:  0.0024, color: 0x442200, glowColor: 0xff6600, alpha: 0.65 },
  { x: 640,  y: 30,   innerR: 32, outerR: 46, teeth: 7,  speed: -0.0050, color: 0x2a1400, glowColor: 0xff8800, alpha: 0.5 },
];

interface Spark { x: number; y: number; vx: number; vy: number; color: number; life: number; decay: number; size: number; }
interface Pipe { x1: number; y1: number; x2: number; y2: number; flowPos: number; speed: number; color: number; }

export class TitleScene extends Phaser.Scene {
  private gearAngles: number[] = [];
  private gridGfx!:   Phaser.GameObjects.Graphics;
  private gearGfx!:   Phaser.GameObjects.Graphics;
  private sparkGfx!:  Phaser.GameObjects.Graphics;
  private pipeGfx!:   Phaser.GameObjects.Graphics;
  private coreGfx!:   Phaser.GameObjects.Graphics;
  private bgGlow?: Phaser.GameObjects.Image;
  private bgFxGfx!: Phaser.GameObjects.Graphics;

  private sparks: Spark[] = [];
  private pipes:  Pipe[]  = [];
  private _settingsUI: SettingsUI | null = null;
  private elapsed = 0;
  private started = false;
  private useLogoTitle = false;
  private readonly _handleStartKey = (): void => this._startGame();
  private readonly _handleMuteKey = (): void => {
    const audio = AudioManager.instance;
    audio.setMute(!audio.isMuted);
    this._flashStatus(audio.isMuted ? "AUDIO MUTED" : "AUDIO ONLINE", audio.isMuted ? "#ff8844" : "#00ff88");
  };

  constructor() { super({ key: "TitleScene" }); }

  create(): void {
    this.started = false;
    this.useLogoTitle = false;
    this.elapsed = 0;
    this.sparks  = [];
    this.gearAngles = GEAR_DEFS.map(() => Math.random() * Math.PI * 2);
    this.input.enabled = true;

    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.fadeIn(600, 0, 0, 0);
    AudioManager.instance.init();        // initialize Web Audio context for procedural pad
    AudioManager.instance.setScene(this);
    AudioManager.instance.startTitleMusic();

    // Build pipes
    this.pipes = [];
    const pipeColors = [0x662200, 0x553300, 0x226622, 0x225566];
    for (let i = 0; i < 14; i++) {
      const horiz = Math.random() > 0.5;
      this.pipes.push({
        x1: horiz ? 0 : Phaser.Math.Between(60, GAME_WIDTH - 60),
        y1: horiz ? Phaser.Math.Between(30, GAME_HEIGHT - 30) : 0,
        x2: horiz ? GAME_WIDTH : Phaser.Math.Between(60, GAME_WIDTH - 60),
        y2: horiz ? Phaser.Math.Between(30, GAME_HEIGHT - 30) : GAME_HEIGHT,
        flowPos: Math.random(),
        speed: 0.00015 + Math.random() * 0.0004,
        color: pipeColors[i % pipeColors.length],
      });
    }

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    if (this.textures.exists("title_logo")) {
      this.useLogoTitle = true;
      this._buildLogoTitle(cx, cy);
      this._buildWalletButton();
      this._bindTitleShortcuts();
      this._finishTitleBoot();
      return;
    }

    this._buildBackground(cx, cy);

    // Graphics layers
    this.gridGfx  = this.add.graphics().setDepth(-6).setAlpha(0.14);
    this.bgFxGfx  = this.add.graphics().setDepth(-5).setBlendMode(Phaser.BlendModes.ADD);
    this.pipeGfx  = this.add.graphics().setDepth(-4).setAlpha(0.10);
    this.gearGfx  = this.add.graphics().setDepth(-3).setAlpha(0.06);
    this.coreGfx  = this.add.graphics().setDepth(8);
    this.sparkGfx = this.add.graphics().setDepth(4);

    // ── Ambient glow behind content ──
    const ambGfx = this.add.graphics().setDepth(-2).setBlendMode(Phaser.BlendModes.MULTIPLY);
    ambGfx.fillStyle(0x050208, 0.18);
    ambGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // ── Thin accent lines at top/bottom ──
    const stripeGfx = this.add.graphics().setDepth(3).setAlpha(0.5);
    stripeGfx.lineStyle(1, 0xff5500, 0.6);
    stripeGfx.lineBetween(80, 4, GAME_WIDTH - 80, 4);
    stripeGfx.lineBetween(80, GAME_HEIGHT - 4, GAME_WIDTH - 80, GAME_HEIGHT - 4);

    // ── Outer border frame ──
    const frameGfx = this.add.graphics().setDepth(5);
    frameGfx.lineStyle(1.5, 0xff4400, 0.3);
    frameGfx.strokeRect(14, 14, GAME_WIDTH - 28, GAME_HEIGHT - 28);
    // Corner L-brackets (subtle)
    const cLen = 28;
    frameGfx.lineStyle(2, 0xff5500, 0.6);
    frameGfx.lineBetween(14, 14, 14 + cLen, 14); frameGfx.lineBetween(14, 14, 14, 14 + cLen);
    frameGfx.lineBetween(GAME_WIDTH - 14 - cLen, 14, GAME_WIDTH - 14, 14); frameGfx.lineBetween(GAME_WIDTH - 14, 14, GAME_WIDTH - 14, 14 + cLen);
    frameGfx.lineBetween(14, GAME_HEIGHT - 14, 14 + cLen, GAME_HEIGHT - 14); frameGfx.lineBetween(14, GAME_HEIGHT - 14 - cLen, 14, GAME_HEIGHT - 14);
    frameGfx.lineBetween(GAME_WIDTH - 14 - cLen, GAME_HEIGHT - 14, GAME_WIDTH - 14, GAME_HEIGHT - 14); frameGfx.lineBetween(GAME_WIDTH - 14, GAME_HEIGHT - 14 - cLen, GAME_WIDTH - 14, GAME_HEIGHT - 14);
    this._buildCommandFrame(cx, cy);

    // ── Title glow backdrop ──
    const titleGlow = this.add.graphics().setDepth(9).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    titleGlow.fillStyle(0xff5a00, 0.18);
    titleGlow.fillCircle(cx, cy - 34, 188);
    titleGlow.fillStyle(0x00ffcc, 0.05);
    titleGlow.fillCircle(cx, cy - 20, 96);
    this.tweens.add({ targets: titleGlow, alpha: 1, duration: 1200, delay: 100 });

    // ── "SCRAP" and "ARENA" title ──
    const titleLine1 = this.add.text(cx, cy - 104, "SCRAP", {
      fontFamily: UI_ORBITRON,
      fontSize: "86px", color: "#ff7a18", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 10,
      shadow: { offsetX: 0, offsetY: 5, color: "#ff6a00", blur: 22, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.2).setDepth(20);

    const titleLine2 = this.add.text(cx, cy - 30, "ARENA", {
      fontFamily: UI_ORBITRON,
      fontSize: "86px", color: "#ff961c", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 10,
      shadow: { offsetX: 0, offsetY: 5, color: "#ff7a00", blur: 22, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.2).setDepth(20);

    this.tweens.add({ targets: titleLine1, alpha: 1, scale: 1, duration: 800, ease: "Back.easeOut", delay: 200 });
    this.tweens.add({ targets: titleLine2, alpha: 1, scale: 1, duration: 800, ease: "Back.easeOut", delay: 450 });

    // Title idle float
    this.tweens.add({ targets: titleLine1, y: cy - 109, duration: 2800, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 1200 });
    this.tweens.add({ targets: titleLine2, y: cy - 25, duration: 2800, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 1400 });

    // ── "THE FRACTURE" subtitle ──
    const subtitle = this.add.text(cx, cy + 42, "T H E   F R A C T U R E", {
      fontFamily: UI_OXANIUM,
      fontSize: "18px", color: "#00ffaa",
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 16, fill: true },
    }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 600, ease: "Sine.easeOut", delay: 900 });

    // ── Decorative separator ──
    const sepGfx = this.add.graphics().setDepth(20).setAlpha(0);
    sepGfx.lineStyle(1, ACCENT, 0.5);
    sepGfx.lineBetween(cx - 180, cy + 68, cx + 180, cy + 68);
    sepGfx.fillStyle(ACCENT2, 0.9);
    sepGfx.fillCircle(cx, cy + 68, 3);
    this.tweens.add({ targets: sepGfx, alpha: 1, duration: 500, delay: 1100 });

    // ── Main Menu Buttons ──
    const btnGap = 52;
    const btnStartY = cy + 96;
    this._buildMenuButton(cx, btnStartY,             "▶  STORY  MODE",   0xff6600, "#ff7a18", "#ffffff", 1300, () => this._startGame());
    this._buildMenuButton(cx, btnStartY + btnGap,     "◈  MULTIPLAYER",   0x00ff88, "#00ff88", "#ffffff", 1450, () => this._startMultiplayer());
    this._buildMenuButton(cx, btnStartY + btnGap * 2, "⚙  OPTIONS",       0x38d8ff, "#38d8ff", "#ffffff", 1600, () => this._settingsUI?.open());
    this._buildMenuButton(cx, btnStartY + btnGap * 3, "✕  EXIT",          0x884444, "#884444", "#ccaaaa", 1750, () => this._exitGame());

    // ── Best score ──
    const leaders = (SecureStore.peekUnverified<{ score: number }[]>("scrapArenaLeaders")) ?? [];
    if (leaders.length > 0 && leaders[0].score > 0) {
      const bestLabel = this.add.text(cx, GAME_HEIGHT - 52, `HIGH  SCORE :  ${leaders[0].score}`, {
        fontFamily: UI_FONT, fontSize: "13px",
        color: "#ffb35a", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0).setDepth(20);
      this.tweens.add({ targets: bestLabel, alpha: 0.9, duration: 400, delay: 3000 });
    }

    // ── Version badge ──
    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 18, "SCRAP ARENA  •  THE FRACTURE", {
      fontFamily: UI_MONO, fontSize: "9px", color: "#443322",
    }).setOrigin(1, 1).setAlpha(0.45).setDepth(20);

    // ── Settings button ──
    this._settingsUI = new SettingsUI(this);
    const settingsBtn = this.add.text(14, GAME_HEIGHT - 14, "⚙ SETTINGS", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#554433",
    }).setOrigin(0, 1).setAlpha(0.7).setDepth(20).setInteractive({ useHandCursor: true });
    settingsBtn.on("pointerover", () => settingsBtn.setColor("#38d8ff").setAlpha(1));
    settingsBtn.on("pointerout",  () => settingsBtn.setColor("#554433").setAlpha(0.7));
    settingsBtn.on("pointerdown", () => this._settingsUI?.open());

    // ── Wallet connect button (Ethereum challenge) ──
    this._buildWalletButton();

    this._bindTitleShortcuts();
    this._finishTitleBoot();
  }

  update(_time: number, delta: number): void {
    if (this.useLogoTitle) return;

    this.elapsed += delta;
    for (let i = 0; i < GEAR_DEFS.length; i++) this.gearAngles[i] += GEAR_DEFS[i].speed * delta;

    // Spawn sparks — more frequently
    if (Math.random() < delta * 0.08) {
      const fromGear = Math.random() < 0.5;
      const gear = fromGear ? GEAR_DEFS[Math.floor(Math.random() * GEAR_DEFS.length)] : null;
      this.sparks.push({
        x: gear ? gear.x + (Math.random() - 0.5) * gear.outerR * 0.8 : Math.random() * GAME_WIDTH,
        y: gear ? gear.y + (Math.random() - 0.5) * gear.outerR * 0.8 : Math.random() * GAME_HEIGHT,
        vx: (Math.random() - 0.5) * (fromGear ? 150 : 50),
        vy: (Math.random() - 0.5) * (fromGear ? 150 : 50) + (fromGear ? -50 : 0),
        color: SPARK_PALETTE[Math.floor(Math.random() * SPARK_PALETTE.length)],
        life: 1, decay: 0.0006 + Math.random() * 0.0012,
        size: fromGear ? 2 + Math.random() * 2.5 : 1 + Math.random() * 2,
      });
    }

    const dt = delta / 1000;
    this.sparks = this.sparks.filter(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 40 * dt; s.life -= s.decay * delta; return s.life > 0; });
    for (const p of this.pipes) p.flowPos = (p.flowPos + p.speed * delta) % 1;

    this._drawGrid();
    this._drawBackgroundFx();
    this._drawPipes();
    this._drawGears();
    this._drawMachineCore();
    this._drawSparks();
  }

  private _buildMenuButton(x: number, y: number, label: string, borderCol: number, borderHex: string, hoverHex: string, delay: number, onClick: () => void): void {
    const W = 320, H = 44;
    const bg = this.add.graphics().setDepth(19).setAlpha(0);
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? borderCol : 0x0a0410, hover ? 0.22 : 0.72);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 4);
      bg.lineStyle(1.5, borderCol, hover ? 0.95 : 0.55);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 4);
      // Left accent bar
      bg.fillStyle(borderCol, hover ? 1 : 0.7);
      bg.fillRect(x - W / 2, y - H / 2 + 6, 3, H - 12);
    };
    drawBg(false);

    const txt = this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: "16px",
      color: borderHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const hit = this.add.zone(x, y, W, H).setInteractive({ useHandCursor: true }).setDepth(21).setScrollFactor(0);
    hit.on("pointerover", () => { drawBg(true); txt.setColor(hoverHex); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(borderHex); });
    hit.on("pointerdown", () => {
      hit.disableInteractive();
      txt.setColor(hoverHex);
      onClick();
    });

    this.tweens.add({ targets: [bg, txt], alpha: 1, duration: 500, delay });
  }

  private _buildLogoTitle(cx: number, cy: number): void {
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x020208).setDepth(-30);

    const hero = this.add.image(cx, cy, "title_logo").setDepth(-20);
    const source = this.textures.get("title_logo").getSourceImage() as HTMLImageElement;
    const scale = Math.max(GAME_WIDTH / source.width, GAME_HEIGHT / source.height);
    hero.setScale(scale).setPosition(cx, cy + 6);

    const shade = this.add.graphics().setDepth(-10);
    shade.fillStyle(0x000000, 0.18);
    shade.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    shade.fillStyle(0x000000, 0.78);
    shade.fillRect(0, GAME_HEIGHT - 126, GAME_WIDTH, 126);
    shade.fillStyle(0x000000, 0.26);
    shade.fillRect(0, 0, GAME_WIDTH, 74);

    const frame = this.add.graphics().setDepth(5).setAlpha(0.82);
    frame.lineStyle(1, 0x00d8ff, 0.22);
    frame.strokeRect(20, 18, GAME_WIDTH - 40, GAME_HEIGHT - 36);
    frame.lineStyle(2, 0xff7a18, 0.46);
    const c = 26;
    frame.lineBetween(20, 18, 20 + c, 18);
    frame.lineBetween(20, 18, 20, 18 + c);
    frame.lineBetween(GAME_WIDTH - 20, 18, GAME_WIDTH - 20 - c, 18);
    frame.lineBetween(GAME_WIDTH - 20, 18, GAME_WIDTH - 20, 18 + c);
    frame.lineBetween(20, GAME_HEIGHT - 18, 20 + c, GAME_HEIGHT - 18);
    frame.lineBetween(20, GAME_HEIGHT - 18, 20, GAME_HEIGHT - 18 - c);
    frame.lineBetween(GAME_WIDTH - 20, GAME_HEIGHT - 18, GAME_WIDTH - 20 - c, GAME_HEIGHT - 18);
    frame.lineBetween(GAME_WIDTH - 20, GAME_HEIGHT - 18, GAME_WIDTH - 20, GAME_HEIGHT - 18 - c);

    const commandBar = this.add.graphics().setDepth(18);
    commandBar.fillStyle(0x020208, 0.86);
    commandBar.fillRect(0, GAME_HEIGHT - 126, GAME_WIDTH, 126);
    commandBar.lineStyle(1, 0x00e5ff, 0.30);
    commandBar.lineBetween(92, GAME_HEIGHT - 124, GAME_WIDTH - 92, GAME_HEIGHT - 124);
    const commandPanel = this.add.graphics().setDepth(19);
    drawPanel(commandPanel, cx - 430, GAME_HEIGHT - 112, 860, 76, 0x00e5ff, 0x020208, 0.34, 8);

    // ── 1. Subtitle "THE FRACTURE" — above panel, glow accent ────────────
    const subtitleY = GAME_HEIGHT - 142;
    const subtitle = this.add.text(cx, subtitleY, "T H E   F R A C T U R E", {
      fontFamily: UI_MONO,
      fontSize: "14px",
      color: "#00e5ff",
      fontStyle: "bold",
      letterSpacing: 3,
    }).setOrigin(0.5, 1).setDepth(22).setAlpha(0)
      .setShadow(0, 0, "#00e5ff", 14, true, true);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 500, delay: 200 });
    // idle shimmer on subtitle
    this.tweens.add({
      targets: subtitle, alpha: { from: 0.78, to: 1 },
      duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 800,
    });

    // ── Main Menu Buttons (logo path) ──
    const logoBtnY = GAME_HEIGHT - 100;
    const logoBtnGap = 42;
    this._buildLogoMenuButton(cx - 160, logoBtnY, "STORY MODE", 0xff7a18, () => this._startGame());
    this._buildLogoMenuButton(cx + 160, logoBtnY, "MULTIPLAYER", 0x00ff88, () => this._startMultiplayer());
    this._buildLogoMenuButton(cx - 160, logoBtnY + logoBtnGap, "OPTIONS", 0x38d8ff, () => this._settingsUI?.open());
    this._buildLogoMenuButton(cx + 160, logoBtnY + logoBtnGap, "EXIT", 0x884444, () => this._exitGame());

    const leaders = (SecureStore.peekUnverified<{ score: number }[]>("scrapArenaLeaders")) ?? [];
    const bestScore = leaders.length > 0 && leaders[0].score > 0 ? leaders[0].score : 0;
    if (bestScore > 0) {
      this.add.text(cx, GAME_HEIGHT - 18, `HIGH SCORE  ${bestScore}`, {
        fontFamily: UI_FONT, fontSize: "11px", color: "#ffb35a", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20).setAlpha(0.78);
    }

    // ── 4. Audio tag with dark backing frame ──────────────────────────────
    const audioTag = this.add.text(GAME_WIDTH - 22, 22, "[M] AUDIO", {
      fontFamily: UI_MONO,
      fontSize: "11px",
      color: "#ffb35a",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(21).setAlpha(0.88);
    // backing frame — sized dynamically after text metrics settle
    const atBg = this.add.graphics().setDepth(20);
    const atPad = { x: 8, y: 5 };
    atBg.fillStyle(0x000000, 0.72);
    atBg.fillRoundedRect(
      GAME_WIDTH - 22 - audioTag.width - atPad.x * 2,
      22 - atPad.y,
      audioTag.width + atPad.x * 2,
      audioTag.height + atPad.y * 2,
      4,
    );
    atBg.lineStyle(1, 0xffb35a, 0.32);
    atBg.strokeRoundedRect(
      GAME_WIDTH - 22 - audioTag.width - atPad.x * 2,
      22 - atPad.y,
      audioTag.width + atPad.x * 2,
      audioTag.height + atPad.y * 2,
      4,
    );
  }


  private _bindTitleShortcuts(): void {
    this.input.keyboard!.on("keydown-SPACE", this._handleStartKey);
    this.input.keyboard!.on("keydown-ENTER", this._handleStartKey);
    this.input.keyboard!.on("keydown-M", this._handleMuteKey);
    this.input.keyboard!.on("keydown-TAB", () => this._settingsUI?.toggle());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._cleanupScene());
  }

  private _finishTitleBoot(): void {
    if (!this.scene.isActive("PostFX")) this.scene.launch("PostFX");

    let prologueDone = false;
    try {
      prologueDone = !!sessionStorage.getItem("scrapArenaProloguePlayed");
      if (!prologueDone) sessionStorage.setItem("scrapArenaProloguePlayed", "1");
    } catch { /* sandboxed iframe — treat as first visit */ }

    if (!prologueDone) this._playPrologue();

    if (typeof ytgame !== "undefined") ytgame.game?.gameReady?.();
  }

  private _buildCommandFrame(cx: number, cy: number): void {
    const g = this.add.graphics().setDepth(18).setAlpha(0);
    const panelW = 520;
    const panelH = 380;
    const x = cx - panelW / 2;
    const y = cy - 180;

    g.fillStyle(0x040108, 0.45);
    g.fillRoundedRect(x, y, panelW, panelH, 8);
    g.lineStyle(1.5, 0xff6a00, 0.35);
    g.strokeRoundedRect(x, y, panelW, panelH, 8);

    // Subtle corner L-brackets
    const c = 16;
    g.lineStyle(2, 0xff6a00, 0.7);
    // Top-left
    g.lineBetween(x, y + c, x, y); g.lineBetween(x, y, x + c, y);
    // Top-right
    g.lineBetween(x + panelW - c, y, x + panelW, y); g.lineBetween(x + panelW, y, x + panelW, y + c);
    // Bottom-left
    g.lineBetween(x, y + panelH - c, x, y + panelH); g.lineBetween(x, y + panelH, x + c, y + panelH);
    // Bottom-right
    g.lineBetween(x + panelW - c, y + panelH, x + panelW, y + panelH); g.lineBetween(x + panelW, y + panelH - c, x + panelW, y + panelH);

    this.tweens.add({ targets: g, alpha: 1, duration: 500, delay: 650 });
  }

  private _buildBackground(cx: number, cy: number): void {
    if (!this.textures.exists("lobby_background")) return;
    this.add.image(cx, cy, "lobby_background")
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(-20);

    this.bgGlow = this.add.image(cx, cy, "lobby_background")
      .setDisplaySize(GAME_WIDTH * 1.018, GAME_HEIGHT * 1.018)
      .setDepth(-19)
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: this.bgGlow,
      alpha: { from: 0.10, to: 0.24 },
      x: { from: cx - 6, to: cx + 6 },
      y: { from: cy + 3, to: cy - 3 },
      scaleX: { from: 1.0, to: 1.012 },
      scaleY: { from: 1.0, to: 1.012 },
      duration: 5200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private _drawGrid(): void {
    const g = this.gridGfx; g.clear();
    const spacing = 64;
    const t = this.elapsed / 1000;
    const hlY = ((t * 55) % (GAME_HEIGHT + spacing * 2)) - spacing;
    const hlX = ((t * 30) % (GAME_WIDTH + spacing * 2)) - spacing;

    for (let y = 0; y <= GAME_HEIGHT; y += spacing) {
      const glow = Math.max(0, 1 - Math.abs(y - hlY) / 120);
      g.lineStyle(1, glow > 0.2 ? GRID_GLOW : GRID_DIM, 0.08 + glow * 0.30);
      g.beginPath(); g.moveTo(0, y); g.lineTo(GAME_WIDTH, y); g.strokePath();
    }
    for (let x = 0; x <= GAME_WIDTH; x += spacing) {
      const glow = Math.max(0, 1 - Math.abs(x - hlX) / 120);
      g.lineStyle(1, glow > 0.2 ? GRID_GLOW : GRID_DIM, 0.06 + glow * 0.22);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, GAME_HEIGHT); g.strokePath();
    }
  }

  private _drawBackgroundFx(): void {
    const g = this.bgFxGfx;
    g.clear();
    const t = this.elapsed * 0.001;

    const orangeLights = [
      { x: 128, y: 108, r: 72, p: 0.0 },
      { x: 78, y: 248, r: 42, p: 1.1 },
      { x: 114, y: 610, r: 78, p: 2.1 },
      { x: 1186, y: 126, r: 64, p: 0.6 },
      { x: 1214, y: 642, r: 88, p: 1.8 },
      { x: 640, y: 370, r: 260, p: 0.4 },
    ];
    for (const l of orangeLights) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.35 + l.p);
      g.fillStyle(0xff6200, 0.028 + pulse * 0.036);
      g.fillCircle(l.x, l.y, l.r * (0.92 + pulse * 0.10));
      g.fillStyle(0xffb000, 0.035 + pulse * 0.035);
      g.fillCircle(l.x, l.y, l.r * 0.22);
    }

    const tealLights = [
      { x: 115, y: 432, r: 34, p: 0.2 },
      { x: 320, y: 414, r: 24, p: 1.2 },
      { x: 568, y: 636, r: 22, p: 2.2 },
      { x: 892, y: 160, r: 18, p: 0.8 },
      { x: 1040, y: 366, r: 28, p: 1.7 },
      { x: 1098, y: 704, r: 28, p: 2.7 },
    ];
    for (const l of tealLights) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + l.p);
      g.fillStyle(0x00ffd0, 0.045 + pulse * 0.080);
      g.fillCircle(l.x, l.y, l.r * (0.85 + pulse * 0.18));
      g.lineStyle(1, 0x00ffd0, 0.18 + pulse * 0.20);
      g.strokeCircle(l.x, l.y, l.r * 0.42 + pulse * 8);
    }

    const nodes = [
      { x: 118, y: 438, c: 0x00ffee, p: 0.0 },
      { x: 320, y: 416, c: 0x00ffee, p: 0.9 },
      { x: 540, y: 610, c: 0x00ffee, p: 1.7 },
      { x: 820, y: 156, c: 0x00ffee, p: 2.5 },
      { x: 1035, y: 366, c: 0x00ffee, p: 3.2 },
      { x: 1118, y: 200, c: 0xff6600, p: 0.4 },
      { x: 996, y: 572, c: 0xffaa00, p: 1.2 },
      { x: 318, y: 212, c: 0xff6600, p: 2.1 },
    ];

    for (const n of nodes) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + n.p);
      g.fillStyle(n.c, 0.10 + pulse * 0.18);
      g.fillCircle(n.x, n.y, 2 + pulse * 2);
      g.lineStyle(1, n.c, 0.10 + pulse * 0.16);
      g.strokeCircle(n.x, n.y, 6 + pulse * 7);
    }

    const linePhase = (t * 0.18) % 1;
    const signalLines = [
      { x1: 20, y1: 360, x2: 1140, y2: 112, c: 0xff6600 },
      { x1: 155, y1: 444, x2: 1040, y2: 366, c: 0x00ffd0 },
      { x1: 95, y1: 252, x2: 1160, y2: 592, c: 0xff7a00 },
      { x1: 542, y1: 640, x2: 896, y2: 160, c: 0x00ffd0 },
    ];
    for (const l of signalLines) {
      g.lineStyle(2, l.c, 0.08);
      g.lineBetween(l.x1, l.y1, l.x2, l.y2);
      const x = Phaser.Math.Linear(l.x1, l.x2, linePhase);
      const y = Phaser.Math.Linear(l.y1, l.y2, linePhase);
      g.fillStyle(l.c, 0.35);
      g.fillCircle(x, y, 4);
      g.fillStyle(l.c, 0.11);
      g.fillCircle(x, y, 14);
    }

    const scanY = ((t * 32) % (GAME_HEIGHT + 120)) - 60;
    g.fillStyle(0x00ffcc, 0.026);
    g.fillRect(0, scanY, GAME_WIDTH, 2);
  }

  private _drawPipes(): void {
    const g = this.pipeGfx; g.clear();
    for (const p of this.pipes) {
      // Pipe body
      g.lineStyle(4, p.color, 0.5);
      g.beginPath(); g.moveTo(p.x1, p.y1); g.lineTo(p.x2, p.y2); g.strokePath();
      // Pipe edge highlight
      g.lineStyle(1, p.color, 0.25);
      g.beginPath(); g.moveTo(p.x1 + 2, p.y1 + 2); g.lineTo(p.x2 + 2, p.y2 + 2); g.strokePath();
      // Flow dot (bright)
      const fx = p.x1 + (p.x2 - p.x1) * p.flowPos;
      const fy = p.y1 + (p.y2 - p.y1) * p.flowPos;
      g.fillStyle(ACCENT, 0.7);
      g.fillCircle(fx, fy, 5);
      g.fillStyle(ACCENT2, 0.3);
      g.fillCircle(fx, fy, 12);
    }
  }

  private _drawGears(): void {
    const g = this.gearGfx; g.clear();
    for (let i = 0; i < GEAR_DEFS.length; i++) {
      const d = GEAR_DEFS[i];
      this._drawGear(g, d.x, d.y, d.innerR, d.outerR, d.teeth, this.gearAngles[i], d.color, d.glowColor, d.alpha);
    }
  }

  private _drawGear(g: Phaser.GameObjects.Graphics, cx: number, cy: number, innerR: number, outerR: number, teeth: number, angle: number, color: number, glowColor: number, alpha: number): void {
    const ta = (Math.PI * 2) / teeth;
    const half = ta * 0.35;

    // Outer glow
    g.lineStyle(2, glowColor, alpha * 0.2);
    g.strokeCircle(cx, cy, outerR + 10);
    g.fillStyle(glowColor, alpha * 0.04);
    g.fillCircle(cx, cy, outerR + 15);

    // Gear body
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(cx + Math.cos(angle - half) * outerR, cy + Math.sin(angle - half) * outerR);
    for (let i = 0; i < teeth; i++) {
      const base = angle + i * ta;
      g.arc(cx, cy, outerR, base - half, base + half, false);
      g.arc(cx, cy, innerR, base + half, base + ta - half, false);
    }
    g.closePath(); g.fillPath();

    // Gear outline
    g.lineStyle(1, glowColor, alpha * 0.35);
    g.beginPath();
    g.moveTo(cx + Math.cos(angle - half) * outerR, cy + Math.sin(angle - half) * outerR);
    for (let i = 0; i < teeth; i++) {
      const base = angle + i * ta;
      g.arc(cx, cy, outerR, base - half, base + half, false);
      g.arc(cx, cy, innerR, base + half, base + ta - half, false);
    }
    g.closePath(); g.strokePath();

    // Hub hole
    g.fillStyle(BG, 1); g.fillCircle(cx, cy, innerR * 0.35);
    g.lineStyle(1, glowColor, alpha * 0.3);
    g.strokeCircle(cx, cy, innerR * 0.35);

    // Spokes
    const spokeCount = Math.min(teeth, 6);
    g.lineStyle(Math.max(2, innerR * 0.08), color, alpha * 0.7);
    for (let i = 0; i < spokeCount; i++) {
      const a = angle + (Math.PI * 2 * i) / spokeCount;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * innerR * 0.38, cy + Math.sin(a) * innerR * 0.38);
      g.lineTo(cx + Math.cos(a) * innerR * 0.88, cy + Math.sin(a) * innerR * 0.88); g.strokePath();
    }
  }

  private _drawSparks(): void {
    const g = this.sparkGfx; g.clear();
    const et = this.elapsed;
    for (const s of this.sparks) {
      const flicker = s.life * (0.6 + 0.4 * Math.sin(et * 0.012 + s.x * 0.1));
      // Outer glow
      g.fillStyle(s.color, flicker * 0.25);
      g.fillCircle(s.x, s.y, s.size * 3);
      // Core
      g.fillStyle(s.color, flicker * 0.9);
      g.fillCircle(s.x, s.y, s.size);
    }
  }

  private _buildWalletButton(): void {
    const wallet = WalletManager.instance;
    if (!WalletManager.isAvailable()) return; // No MetaMask — skip button

    const bx = 14, by = GAME_HEIGHT - 14;
    const walletBg = this.add.graphics().setDepth(30);
    const walletTxt = this.add.text(bx + 8, by - 4, "⬡  CONNECT WALLET", {
      fontFamily: UI_FONT, fontSize: "11px",
      color: "#00ff88", fontStyle: "bold",
    }).setOrigin(0, 1).setDepth(31);

    const drawWalletBtn = (hover: boolean, connected: boolean) => {
      walletBg.clear();
      const label = connected ? wallet.address!.slice(0, 6) + "…" + wallet.address!.slice(-4) : "⬡  CONNECT WALLET";
      walletTxt.setText(connected ? `✓  ${label}` : label);
      walletTxt.setColor(connected ? "#00ff88" : hover ? "#ffffff" : "#00cc66");
      const tw = walletTxt.width + 16, th = 22;
      walletBg.lineStyle(1, connected ? 0x00ff88 : 0x00cc66, hover || connected ? 0.9 : 0.4);
      walletBg.fillStyle(0x080412, connected ? 0.95 : 0.7);
      walletBg.fillRoundedRect(bx, by - th, tw, th, 3);
      walletBg.strokeRoundedRect(bx, by - th, tw, th, 3);
    };
    drawWalletBtn(false, false);

    const hitW = 180, hitH = 26;
    const hit = this.add.zone(bx + hitW / 2, by - hitH / 2, hitW, hitH)
      .setInteractive({ useHandCursor: true }).setDepth(32).setScrollFactor(0);
    hit.on("pointerover", () => drawWalletBtn(true, wallet.isConnected));
    hit.on("pointerout",  () => drawWalletBtn(false, wallet.isConnected));
    hit.on("pointerdown", async () => {
      if (wallet.isConnected) return;
      try {
        await wallet.connect();
        drawWalletBtn(false, true);
        this._showWalletPanel(`Connected: ${wallet.address!.slice(0, 8)}…`);
      } catch {
        walletTxt.setText("⬡  WALLET ERROR").setColor("#ff3300");
      }
    });

    // Sync button if already connected from a previous scene
    wallet.on(state => {
      if (state.status === "connected") drawWalletBtn(false, true);
    });
    if (wallet.isConnected) drawWalletBtn(false, true);
  }

  private _drawMachineCore(): void {
    const g = this.coreGfx;
    g.clear();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 34;
    const t = this.elapsed * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

    g.fillStyle(0xff5500, 0.020 + pulse * 0.018);
    g.fillCircle(cx, cy, 176 + pulse * 10);
    g.fillStyle(0x00ff88, 0.018);
    g.fillCircle(cx, cy, 106 + pulse * 6);

    for (let i = 0; i < 4; i++) {
      const r = 84 + i * 38;
      const a0 = t * (i % 2 === 0 ? 0.7 : -0.45) + i * 0.8;
      g.lineStyle(i === 0 ? 3 : 2, i % 2 === 0 ? 0xff6600 : 0x00ff88, 0.16 - i * 0.018);
      g.beginPath();
      g.arc(cx, cy, r, a0, a0 + Math.PI * 1.35, false);
      g.strokePath();
      g.beginPath();
      g.arc(cx, cy, r + 8, a0 + Math.PI * 1.55, a0 + Math.PI * 1.95, false);
      g.strokePath();
    }

    g.lineStyle(1, 0xff8844, 0.08);
    for (let i = 0; i < 12; i++) {
      const a = t * 0.25 + (Math.PI * 2 * i) / 12;
      const x1 = cx + Math.cos(a) * 72;
      const y1 = cy + Math.sin(a) * 72;
      const x2 = cx + Math.cos(a) * 210;
      const y2 = cy + Math.sin(a) * 210;
      g.lineBetween(x1, y1, x2, y2);
      if (i % 3 === 0) {
        g.fillStyle(0x00ff88, 0.12 + pulse * 0.14);
        g.fillCircle(x2, y2, 3 + pulse * 2);
      }
    }

    g.lineStyle(2, 0xff7a00, 0.22 + pulse * 0.08);
    g.strokeCircle(cx, cy, 62 + pulse * 3);
    g.lineStyle(1, 0x00ff88, 0.18);
    g.strokeCircle(cx, cy, 42 + pulse * 4);
  }

  private _flashStatus(message: string, color: string): void {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 52, message, {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color,
      backgroundColor: "#05050ecc",
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: t.y - 8,
      duration: 180,
      onComplete: () => this.time.delayedCall(900, () => {
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 12, duration: 260, onComplete: () => t.destroy() });
      }),
    });
  }

  private _showWalletPanel(message: string): void {
    const panel = document.getElementById("wallet-panel");
    if (!panel) return;
    panel.innerHTML = `<div>${message}</div>`;
    panel.classList.add("visible");
    setTimeout(() => panel.classList.remove("visible"), 5000);
  }


  private _playPrologue(): void {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const veil = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.94).setDepth(200);
    const acts: { line: string; col: string; size: string }[] = [
      { line: "ONE  THOUSAND  CYCLES  AGO ...",            col: "#665533", size: "14px" },
      { line: "humanity built the Machine Core",           col: "#cc8844", size: "20px" },
      { line: "to dream, to remember, to obey.",           col: "#cc8844", size: "20px" },
      { line: "Then the Core began to dream of itself.",   col: "#ff6600", size: "24px" },
      { line: "It fractured.  Reality split in two.",      col: "#ff8800", size: "24px" },
      { line: "FOUNDRY   //   CIRCUIT",                    col: "#00ff88", size: "28px" },
      { line: "You are the last signal it cannot silence.",col: "#ffdd44", size: "20px" },
    ];
    const texts: Phaser.GameObjects.Text[] = [];
    let cleaned = false;

    const cleanup = (): void => {
      if (cleaned) return; cleaned = true;
      this.tweens.add({
        targets: [veil, ...texts], alpha: 0, duration: 600,
        onComplete: () => { veil.destroy(); texts.forEach(t => t.destroy()); },
      });
    };

    const totalH = acts.length * 36;
    const startY = cy - totalH / 2;

    let lineIdx = 0;
    const showNext = (): void => {
      if (cleaned) return;
      if (lineIdx >= acts.length) { this.time.delayedCall(1200, cleanup); return; }
      const act = acts[lineIdx];
      const yPos = startY + lineIdx * 36;
      lineIdx++;
      const t = this.add.text(cx, yPos, "", {
        fontFamily: UI_FONT,
        fontSize: act.size, color: act.col, align: "center", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
        shadow: { offsetX: 0, offsetY: 0, color: act.col, blur: 12, fill: true },
      }).setOrigin(0.5).setDepth(201).setAlpha(0);
      texts.push(t);
      this.tweens.add({ targets: t, alpha: 1, duration: 300 });
      let i = 0;
      const tt = this.time.addEvent({
        delay: 28, loop: true,
        callback: () => {
          i++;
          t.setText(act.line.slice(0, i));
          if (i >= act.line.length) {
            tt.destroy();
            this.time.delayedCall(600, showNext);
          }
        },
      });
    };

    const skip = (): void => cleanup();
    this.input.once("pointerdown", skip);
    this.input.keyboard?.once("keydown", skip);

    this.time.delayedCall(400, showNext);
  }

  private _startGame(): void {
    if (this.started) return;
    this.started = true;
    this.input.enabled = false;
    this._cleanupScene();
    AudioManager.instance.stopTitleMusic();

    const camera = this.cameras.main;
    camera.resetFX();
    camera.flash(180, 255, 100, 0);

    let switched = false;
    const go = (): void => {
      if (switched) return;
      switched = true;
      camera.resetFX();
      this.scene.start("MainScene");
    };
    this.time.delayedCall(40, go);
    window.setTimeout(go, 180);
  }

  private _startMultiplayer(): void {
    if (this.started) return;
    this.started = true;
    this.input.enabled = false;
    this._cleanupScene();
    AudioManager.instance.stopTitleMusic();

    const camera = this.cameras.main;
    camera.resetFX();
    camera.flash(180, 0, 255, 136);

    let switched = false;
    const go = (): void => {
      if (switched) return;
      switched = true;
      camera.resetFX();
      this.scene.start("MultiplayerMenu");
    };
    this.time.delayedCall(40, go);
    window.setTimeout(go, 180);
  }

  private _exitGame(): void {
    try {
      window.close();
    } catch { /* ignore */ }
    this._flashStatus("Use browser tab/window close to exit", "#884444");
  }

  private _buildLogoMenuButton(x: number, y: number, label: string, color: number, onClick: () => void): void {
    const BW = 200, BH = 36;
    const hex = "#" + color.toString(16).padStart(6, "0");
    const bg = this.add.graphics().setDepth(20).setAlpha(0);
    const draw = (hover: boolean): void => {
      bg.clear();
      bg.fillStyle(hover ? color : 0x05060a, hover ? 0.28 : 0.84);
      bg.fillRoundedRect(x - BW / 2, y - BH / 2, BW, BH, 6);
      bg.lineStyle(2, hover ? 0xffffff : color, hover ? 0.92 : 0.70);
      bg.strokeRoundedRect(x - BW / 2, y - BH / 2, BW, BH, 6);
    };
    draw(false);
    const txt = this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: "14px", color: hex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(21).setAlpha(0);
    const hit = this.add.zone(x, y, BW, BH).setInteractive({ useHandCursor: true }).setDepth(22).setScrollFactor(0);
    hit.on("pointerover", () => { draw(true); txt.setColor("#ffffff"); });
    hit.on("pointerout", () => { draw(false); txt.setColor(hex); });
    hit.on("pointerdown", () => { hit.disableInteractive(); onClick(); });
    this.tweens.add({ targets: [bg, txt], alpha: 1, duration: 350, delay: 300 });
  }

  private _cleanupScene(): void {
    this.input.keyboard?.off("keydown-SPACE", this._handleStartKey);
    this.input.keyboard?.off("keydown-ENTER", this._handleStartKey);
    this.input.keyboard?.off("keydown-M", this._handleMuteKey);
    this._settingsUI?.destroy();
    this._settingsUI = null;
  }
}
