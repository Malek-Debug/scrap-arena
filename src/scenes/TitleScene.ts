import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { WalletManager } from "../web3/WalletManager";

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

  private sparks: Spark[] = [];
  private pipes:  Pipe[]  = [];
  private elapsed = 0;
  private started = false;

  constructor() { super({ key: "TitleScene" }); }

  create(): void {
    this.started = false;
    this.elapsed = 0;
    this.sparks  = [];
    this.gearAngles = GEAR_DEFS.map(() => Math.random() * Math.PI * 2);

    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.fadeIn(600, 0, 0, 0);
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

    // Graphics layers
    this.gridGfx  = this.add.graphics().setDepth(0);
    this.pipeGfx  = this.add.graphics().setDepth(1);
    this.gearGfx  = this.add.graphics().setDepth(2);
    this.sparkGfx = this.add.graphics().setDepth(4);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // ── Ambient glow behind content ──
    const ambGfx = this.add.graphics().setDepth(0);
    ambGfx.fillStyle(0xff4400, 0.04);
    ambGfx.fillCircle(cx, cy - 40, 500);
    ambGfx.fillStyle(0x4400ff, 0.02);
    ambGfx.fillCircle(cx - 300, cy + 200, 350);
    ambGfx.fillStyle(0x4400ff, 0.02);
    ambGfx.fillCircle(cx + 300, cy + 200, 350);

    // ── Hazard stripes at top/bottom ──
    const stripeGfx = this.add.graphics().setDepth(3).setAlpha(0.35);
    for (let sx = -20; sx < GAME_WIDTH + 40; sx += 32) {
      stripeGfx.fillStyle(0xff6600, 1);
      stripeGfx.fillRect(sx, 0, 16, 6);
      stripeGfx.fillRect(sx + 16, GAME_HEIGHT - 6, 16, 6);
    }

    // ── Outer border frame ──
    const frameGfx = this.add.graphics().setDepth(5);
    frameGfx.lineStyle(2, 0xff4400, 0.4);
    frameGfx.strokeRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24);
    frameGfx.lineStyle(1, 0xff6600, 0.15);
    frameGfx.strokeRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40);
    const bL = 20;
    frameGfx.lineStyle(3, 0xff5500, 0.8);
    [[12, 12], [GAME_WIDTH - 12 - bL, 12], [12, GAME_HEIGHT - 12 - bL], [GAME_WIDTH - 12 - bL, GAME_HEIGHT - 12 - bL]]
      .forEach(([bx, by]) => frameGfx.strokeRect(bx, by, bL, bL));

    // ── Title glow backdrop ──
    const titleGlow = this.add.graphics().setDepth(9).setAlpha(0);
    titleGlow.fillStyle(0xff4400, 0.12);
    titleGlow.fillCircle(cx, cy - 60, 220);
    titleGlow.fillStyle(0xff6600, 0.06);
    titleGlow.fillCircle(cx, cy - 60, 340);
    this.tweens.add({ targets: titleGlow, alpha: 1, duration: 1200, delay: 100 });

    // ── "SCRAP" and "ARENA" title ──
    const titleLine1 = this.add.text(cx, cy - 108, "SCRAP", {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: "92px", color: "#ff6600", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 10,
      shadow: { offsetX: 0, offsetY: 4, color: "#ff4400", blur: 30, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.2).setDepth(20);

    const titleLine2 = this.add.text(cx, cy - 28, "ARENA", {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: "92px", color: "#ff8800", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 10,
      shadow: { offsetX: 0, offsetY: 4, color: "#ff6600", blur: 30, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.2).setDepth(20);

    this.tweens.add({ targets: titleLine1, alpha: 1, scale: 1, duration: 800, ease: "Back.easeOut", delay: 200 });
    this.tweens.add({ targets: titleLine2, alpha: 1, scale: 1, duration: 800, ease: "Back.easeOut", delay: 450 });

    // Title idle float
    this.tweens.add({ targets: titleLine1, y: cy - 113, duration: 2800, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 1200 });
    this.tweens.add({ targets: titleLine2, y: cy - 23, duration: 2800, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 1400 });

    // ── "THE FRACTURE" subtitle ──
    const subtitle = this.add.text(cx, cy + 48, "T H E   F R A C T U R E", {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: "20px", color: "#00ff88",
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 16, fill: true },
    }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 600, ease: "Sine.easeOut", delay: 900 });

    // ── Decorative separator ──
    const sepGfx = this.add.graphics().setDepth(20).setAlpha(0);
    sepGfx.lineStyle(2, ACCENT, 0.7);
    sepGfx.lineBetween(cx - 220, cy + 78, cx + 220, cy + 78);
    sepGfx.fillStyle(ACCENT, 1);
    sepGfx.fillCircle(cx, cy + 78, 4);
    sepGfx.fillStyle(ACCENT2, 0.8);
    sepGfx.fillCircle(cx - 220, cy + 78, 3);
    sepGfx.fillCircle(cx + 220, cy + 78, 3);
    this.tweens.add({ targets: sepGfx, alpha: 1, duration: 500, delay: 1100 });

    // ── START GAME Button ──
    const btnStartY = cy + 128;
    this._buildMenuButton(cx, btnStartY, "▶   S T A R T   G A M E", 0xff5500, "#ff5500", "#ffffff", 1300, () => this._startGame());

    // ── Controls hint ──
    const controlsHint = this.add.text(cx, cy + 196, "WASD move  •  Mouse aim  •  LMB shoot  •  Q shift  •  E / R / F abilities", {
      fontFamily: '"Courier New", Courier, monospace', fontSize: "12px", color: "#776644",
    }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.tweens.add({ targets: controlsHint, alpha: 0.8, duration: 500, delay: 2000 });

    // ── Lore crawl ──
    const loreText = this.add.text(cx, cy + 240, [
      "The Machine Core has fractured.",
      "Corruption bleeds through every system.",
      "Only you can shut them down.",
    ].join("\n"), {
      fontFamily: '"Courier New", Courier, monospace', fontSize: "12px",
      color: "#448855", align: "center", lineSpacing: 5,
    }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.tweens.add({ targets: loreText, alpha: 0.9, duration: 800, delay: 2600 });

    // ── Best score ──
    const leaders = JSON.parse(localStorage.getItem("scrapArenaLeaders") ?? "[]") as { score: number }[];
    if (leaders.length > 0 && leaders[0].score > 0) {
      const bestLabel = this.add.text(cx, cy + 300, `HIGH  SCORE :  ${leaders[0].score}`, {
        fontFamily: '"Courier New", Courier, monospace', fontSize: "14px",
        color: "#bb8833", fontStyle: "bold",
      }).setOrigin(0.5).setAlpha(0).setDepth(20);
      this.tweens.add({ targets: bestLabel, alpha: 0.9, duration: 400, delay: 3000 });
    }

    // ── Version badge ──
    this.add.text(GAME_WIDTH - 14, GAME_HEIGHT - 14, "GAMEDEV.JS JAM 2026  •  MACHINES", {
      fontFamily: '"Courier New", Courier, monospace', fontSize: "10px", color: "#554433",
    }).setOrigin(1, 1).setAlpha(0.6).setDepth(20);

    // ── Wallet connect button (Ethereum challenge) ──
    this._buildWalletButton();

    // ── Keyboard shortcuts ──
    this.input.keyboard!.on("keydown-SPACE", () => this._startGame());
    this.input.keyboard!.on("keydown-ENTER", () => this._startGame());

    // ── PostFX ──
    if (!this.scene.isActive("PostFX")) this.scene.launch("PostFX");

    // YouTube Playables: game is fully loaded and ready for interaction
    if (typeof ytgame !== "undefined") ytgame.game.gameReady();
  }

  update(_time: number, delta: number): void {
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
    this._drawPipes();
    this._drawGears();
    this._drawSparks();
  }

  private _buildMenuButton(x: number, y: number, label: string, borderCol: number, borderHex: string, hoverHex: string, delay: number, onClick: () => void): void {
    const W = 380, H = 56;
    const bg = this.add.graphics().setDepth(19).setAlpha(0);
    const drawBg = (hover: boolean) => {
      bg.clear();
      // Background fill
      bg.fillStyle(hover ? borderCol : 0x1a0808, hover ? 0.35 : 0.9);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 6);
      // Border
      bg.lineStyle(2, borderCol, hover ? 1 : 0.8);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 6);
      // Inner glow line
      bg.lineStyle(1, borderCol, hover ? 0.4 : 0.15);
      bg.strokeRoundedRect(x - W / 2 + 3, y - H / 2 + 3, W - 6, H - 6, 4);
      // Corner ticks
      const ct = 10;
      bg.lineStyle(3, borderCol, 1);
      [[x - W / 2, y - H / 2], [x + W / 2 - ct, y - H / 2], [x - W / 2, y + H / 2 - ct], [x + W / 2 - ct, y + H / 2 - ct]]
        .forEach(([bx, by]) => bg.strokeRect(bx, by, ct, ct));
    };
    drawBg(false);

    const txt = this.add.text(x, y, label, {
      fontFamily: '"Courier New", Courier, monospace', fontSize: "22px",
      color: borderHex, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const hit = this.add.rectangle(x, y, W, H).setAlpha(0.001).setInteractive({ useHandCursor: true }).setDepth(21);
    hit.on("pointerover", () => { drawBg(true); txt.setColor(hoverHex); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(borderHex); });
    hit.on("pointerdown", onClick);

    this.tweens.add({ targets: [bg, txt], alpha: 1, duration: 500, delay });
    this.tweens.add({ targets: bg, alpha: { from: 0.85, to: 1 }, duration: 1200, yoyo: true, repeat: -1, delay: delay + 500, ease: "Sine.easeInOut" });
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
      fontFamily: '"Courier New", Courier, monospace', fontSize: "11px",
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
    const hit = this.add.rectangle(bx + hitW / 2, by - hitH / 2, hitW, hitH)
      .setAlpha(0.001).setInteractive({ useHandCursor: true }).setDepth(32);
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

  private _showWalletPanel(message: string): void {
    const panel = document.getElementById("wallet-panel");
    if (!panel) return;
    panel.innerHTML = `<div>${message}</div>`;
    panel.classList.add("visible");
    setTimeout(() => panel.classList.remove("visible"), 5000);
  }

  private _startGame(): void {
    if (this.started) return;
    this.started = true;
    AudioManager.instance.stopTitleMusic();
    this.cameras.main.flash(200, 255, 100, 0);
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("MainScene");
    });
  }
}
