import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { WalletManager } from "../web3/WalletManager";
import { SecureStore } from "../core/SecureStore";

const GOLD  = "#ffcc00";
const GREEN = "#00ff88";
const CYAN  = "#00ccff";
const WHITE = "#ffffff";
const DIM   = "#886622";

function calcGrade(score: number): { grade: string; gradeColor: number } {
  if      (score >= 5000) return { grade: "S", gradeColor: 0xffcc00 };
  else if (score >= 3000) return { grade: "A", gradeColor: 0xcc44ff };
  else if (score >= 1500) return { grade: "B", gradeColor: 0x00ccff };
  else if (score >= 500)  return { grade: "C", gradeColor: 0x00ff88 };
  else                    return { grade: "D", gradeColor: 0xaaaaaa };
}

export class VictoryScene extends Phaser.Scene {
  private particleTimer?: Phaser.Time.TimerEvent;
  private confettiTimer?: Phaser.Time.TimerEvent;
  private transitioning = false;
  private scanGfx?: Phaser.GameObjects.Graphics;
  private scanOffset = 0;

  constructor() { super({ key: "VictoryScene" }); }

  create(): void {
    this.transitioning = false;
    this.scanOffset = 0;

    const data = (this.scene.settings.data ?? {}) as {
      kills?: number; wave?: number; scrap?: number; score?: number; maxCombo?: number;
    };
    const kills    = data.kills    ?? 0;
    const wave     = data.wave     ?? 0;
    const scrap    = data.scrap    ?? 0;
    const score    = data.score    ?? 0;
    const maxCombo = data.maxCombo ?? 0;

    const { grade, gradeColor } = calcGrade(score);

    // Audio
    AudioManager.instance.setScene(this);
    AudioManager.instance.stopMusic();

    // Leaderboard persistence (HMAC-protected via SecureStore).
    // Synchronous "peek" gives us a leaderboard snapshot to render NOW; the
    // verified async write happens in the background. UI hint only — never
    // trusted for signing.
    type LeaderEntry = { score: number; wave: number; kills: number; maxCombo: number };
    const existing = (SecureStore.peekUnverified<LeaderEntry[]>("scrapArenaLeaders")) ?? [];
    const prevBest = existing.length > 0 ? (existing[0].score | 0) : 0;
    const merged: LeaderEntry[] = [...existing, { score, wave, kills, maxCombo }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    void SecureStore.set("scrapArenaLeaders", merged);
    const top3 = merged;
    const isNewRecord = score > prevBest;
    const currentRunIdx = top3.findIndex(e => e.score === score && e.wave === wave && e.kills === kills && e.maxCombo === maxCombo);

    // YouTube Playables: submit score
    if (typeof ytgame !== "undefined") {
      ytgame.engagement.sendScore({ value: score });
    }

    // Ethereum: sign score if wallet connected (async, non-blocking)
    if (WalletManager.instance.isConnected) {
      WalletManager.instance.signScore(score, wave).catch(() => { /* silent */ });
    }

    const cx = GAME_WIDTH / 2;

    // ── Deep dark background with green/gold ambient ──
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020408);

    // Ambient glow
    const ambGfx = this.add.graphics();
    ambGfx.fillStyle(0x004400, 0.06);
    ambGfx.fillCircle(cx, 100, 400);
    ambGfx.fillStyle(0x443300, 0.04);
    ambGfx.fillCircle(cx, GAME_HEIGHT / 2, 500);

    // Gold/green border
    const gfx = this.add.graphics();
    gfx.lineStyle(2, 0xffdd00, 0.5);
    gfx.strokeRect(16, 16, GAME_WIDTH - 32, GAME_HEIGHT - 32);
    gfx.lineStyle(1, 0x00ff88, 0.2);
    gfx.strokeRect(24, 24, GAME_WIDTH - 48, GAME_HEIGHT - 48);

    // Corner brackets
    const bL = 24;
    gfx.lineStyle(3, 0x00ff88, 0.9);
    [[16, 16], [GAME_WIDTH - 16 - bL, 16], [16, GAME_HEIGHT - 16 - bL], [GAME_WIDTH - 16 - bL, GAME_HEIGHT - 16 - bL]].forEach(([bx, by]) => gfx.strokeRect(bx, by, bL, bL));

    // Scanlines overlay
    this.scanGfx = this.add.graphics().setDepth(90);
    this._drawScanlines();

    // Particle rain
    this.particleTimer = this.time.addEvent({ delay: 50, loop: true, callback: () => this._spawnRainParticle() });
    this.confettiTimer = this.time.addEvent({ delay: 80, loop: true, callback: () => this._spawnConfetti() });

    // Camera effects
    this.cameras.main.shake(600, 0.006);
    this.cameras.main.fadeIn(800);

    // ── "MISSION COMPLETE" title ──
    const titleGlow = this.add.graphics().setAlpha(0);
    titleGlow.fillStyle(0x00ff44, 0.06);
    titleGlow.fillCircle(cx, 70, 280);
    this.tweens.add({ targets: titleGlow, alpha: 1, duration: 1000, delay: 100 });

    const titleText = this.add.text(cx, 68, "MISSION  COMPLETE", {
      fontFamily: "monospace", fontSize: "52px", color: GOLD,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: "#ffcc00", blur: 20, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.3);
    this.tweens.add({ targets: titleText, alpha: 1, scale: 1, duration: 700, delay: 150, ease: "Back.easeOut" });

    // Subtitle
    const subtitle = this.add.text(cx, 126, "//  M A C H I N E   C O R E   D E S T R O Y E D  //", {
      fontFamily: "monospace", fontSize: "13px", color: GREEN,
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 8, fill: true },
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 500, delay: 500 });

    // Survived banner
    const survivedTxt = this.add.text(cx, 156, `YOU SURVIVED ALL ${wave} WAVES`, {
      fontFamily: "monospace", fontSize: "15px", color: CYAN, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: survivedTxt, alpha: 1, duration: 400, delay: 800 });
    this.tweens.add({ targets: survivedTxt, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 1500 });

    // ── Stats panel ──
    const panelX = cx - 280, panelW = 560, panelY = 178, panelH = 210;

    gfx.fillStyle(0x060e04, 0.85);
    gfx.fillRoundedRect(panelX, panelY, panelW, panelH, 4);
    gfx.lineStyle(2, 0xffdd00, 0.5);
    gfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 4);
    gfx.lineStyle(1, 0x00ff88, 0.2);
    gfx.strokeRoundedRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8, 2);

    this.add.text(cx, panelY + 18, "── COMBAT LOG ──", {
      fontFamily: "monospace", fontSize: "12px", color: GOLD,
    }).setOrigin(0.5);

    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: "monospace", fontSize: "17px", color: GOLD };
    const statStyle: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: "monospace", fontSize: "17px", color: CYAN };
    const statStartY = panelY + 40, lineH = 28, labelX = panelX + 20, valueX = panelX + panelW - 20;

    type StatRow = [string, string, Phaser.Types.GameObjects.Text.TextStyle, boolean?, number?];
    const rows: StatRow[] = [
      ["Final Score:",        `0`,            { fontFamily: "monospace", fontSize: "19px", color: GOLD, fontStyle: "bold" }, true, score],
      ["Waves Survived:",     `${wave}`,      statStyle],
      ["Machines Destroyed:", `${kills}`,     statStyle],
      ["Best Combo:",         `${maxCombo}x`, { fontFamily: "monospace", fontSize: "17px", color: maxCombo >= 10 ? "#ff00ff" : maxCombo >= 5 ? "#ff6600" : CYAN }],
      ["Scrap Collected:",    `${scrap}`,     statStyle],
    ];

    rows.forEach(([label, value, style, isScore, target], i) => {
      const y = statStartY + i * lineH;
      const delay = 400 + i * 180;
      const lbl = this.add.text(labelX, y, label, labelStyle).setOrigin(0, 0.5).setAlpha(0);
      const val = this.add.text(valueX, y, value, style).setOrigin(1, 0.5).setAlpha(0);
      this.tweens.add({ targets: lbl, alpha: 1, duration: 250, delay });
      this.tweens.add({ targets: val, alpha: 1, duration: 250, delay });
      if (isScore && target && target > 0) {
        const ctr = { v: 0 };
        this.tweens.add({
          targets: ctr, v: target, duration: 1200, delay: delay + 250, ease: "Cubic.easeOut",
          onUpdate: () => val.setText(`${ctr.v | 0}`),
          onComplete: () => val.setText(`${target}`),
        });
      }
    });

    // ── Grade badge ──
    const gradeHex = `#${gradeColor.toString(16).padStart(6, "0")}`;
    const badgeX = panelX + panelW - 50, badgeY = panelY + panelH / 2 + 15;

    const badgeGfx = this.add.graphics().setAlpha(0).setScale(0);
    badgeGfx.lineStyle(3, gradeColor, 0.6);
    badgeGfx.strokeCircle(badgeX, badgeY, 50);
    badgeGfx.lineStyle(1, gradeColor, 0.25);
    badgeGfx.strokeCircle(badgeX, badgeY, 60);

    const gradeTxt = this.add.text(badgeX, badgeY, grade, {
      fontFamily: "monospace", fontSize: "80px", color: gradeHex,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0);

    this.tweens.add({
      targets: [gradeTxt, badgeGfx], alpha: 1, scale: 1, duration: 400, delay: 1200, ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: gradeTxt, scale: { from: 1.05, to: 0.95 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      },
    });

    // ── New record badge ──
    let extraGap = 0;
    if (isNewRecord) {
      extraGap = 32;
      const rec = this.add.text(cx, panelY + panelH + 14, "★  NEW  RECORD!  ★", {
        fontFamily: "monospace", fontSize: "18px", color: GOLD, fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
        shadow: { offsetX: 0, offsetY: 0, color: "#ffcc00", blur: 10, fill: true },
      }).setOrigin(0.5);
      this.tweens.add({ targets: rec, alpha: { from: 1, to: 0.3 }, duration: 500, yoyo: true, repeat: -1 });
    }

    // ── Leaderboard panel ──
    const lbY = panelY + panelH + extraGap + 8, lbH = 102;
    gfx.fillStyle(0x040a02, 0.75);
    gfx.fillRoundedRect(panelX, lbY, panelW, lbH, 4);
    gfx.lineStyle(1, 0xffdd00, 0.3);
    gfx.strokeRoundedRect(panelX, lbY, panelW, lbH, 4);

    this.add.text(cx, lbY + 14, "── TOP SCORES ──", { fontFamily: "monospace", fontSize: "11px", color: DIM }).setOrigin(0.5);
    if (top3.length === 0) {
      this.add.text(cx, lbY + 55, "NO RECORDS YET", { fontFamily: "monospace", fontSize: "14px", color: DIM }).setOrigin(0.5);
    } else {
      const rowColors = [WHITE, "#888888", "#555555"];
      top3.forEach((e, i) => {
        const isMe = i === currentRunIdx;
        const col = isMe ? GOLD : rowColors[i];
        const prefix = isMe ? "►" : " ";
        this.add.text(cx, lbY + 32 + i * 23,
          `${prefix} #${i + 1}  ${String(e.score).padStart(6, "0")}  W${e.wave}  K${e.kills}  C${e.maxCombo}x`,
          { fontFamily: "monospace", fontSize: "13px", color: col }
        ).setOrigin(0.5);
      });
    }

    // ── Buttons ──
    const btnY = lbY + lbH + 34;
    this._buildButton(cx - 170, btnY, "▶  PLAY AGAIN", 0x00ff88, GREEN, "#aaffcc", () => this._playAgain());
    this._buildButton(cx + 170, btnY, "⌂  MAIN MENU", 0x00ccff, CYAN, "#aaddff", () => this._mainMenu());

    // ── Wallet: sign score on-chain (Ethereum challenge) ──
    this._buildWalletSignButton(cx, btnY + 56, score, wave);

    // ── Bottom status bar ──
    const barGfx = this.add.graphics().setDepth(5);
    barGfx.fillStyle(0x020804, 0.8);
    barGfx.fillRect(0, GAME_HEIGHT - 32, GAME_WIDTH, 32);
    barGfx.lineStyle(1, 0x00ff88, 0.25);
    barGfx.lineBetween(0, GAME_HEIGHT - 32, GAME_WIDTH, GAME_HEIGHT - 32);
    this.add.text(36, GAME_HEIGHT - 16, "[ SPACE ] PLAY AGAIN   [ ESC ] MAIN MENU", {
      fontFamily: "monospace", fontSize: "11px", color: "#336622",
    }).setOrigin(0, 0.5).setDepth(6);
    this.add.text(GAME_WIDTH - 36, GAME_HEIGHT - 16, "SCRAP ARENA  //  VICTORY", {
      fontFamily: "monospace", fontSize: "11px", color: "#224400",
    }).setOrigin(1, 0.5).setDepth(6);

    // Keyboard
    this.time.delayedCall(500, () => {
      this.input.keyboard?.on("keydown-SPACE", this._playAgain, this);
      this.input.keyboard?.on("keydown-ESC", this._mainMenu, this);
    });

    // Scanline animation
    this.time.addEvent({
      delay: 60, loop: true, callback: () => {
        this.scanOffset = (this.scanOffset + 2) % 8;
        this.scanGfx?.clear();
        this._drawScanlines();
      },
    });
  }

  private _buildWalletSignButton(x: number, y: number, score: number, wave: number): void {
    const wallet = WalletManager.instance;
    const bg = this.add.graphics().setDepth(10);
    let label = wallet.isConnected ? "⬡  SIGN SCORE ON-CHAIN" : "⬡  CONNECT & SIGN SCORE";

    const draw = (hover: boolean, done: boolean) => {
      bg.clear();
      const col = done ? 0x00ff88 : 0xffcc00;
      bg.lineStyle(1, col, hover || done ? 0.9 : 0.35);
      bg.fillStyle(0x020804, 0.8);
      const W = 320, H = 30;
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 3);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 3);
    };
    draw(false, wallet.isConnected);

    const txt = this.add.text(x, y, label, {
      fontFamily: "monospace", fontSize: "13px", color: wallet.isConnected ? "#00ff88" : "#ffcc00",
    }).setOrigin(0.5).setDepth(11);

    const hit = this.add.rectangle(x, y, 320, 30).setAlpha(0.001)
      .setInteractive({ useHandCursor: true }).setDepth(12);
    hit.on("pointerover", () => draw(true, wallet.isConnected));
    hit.on("pointerout",  () => draw(false, wallet.isConnected));
    hit.on("pointerdown", async () => {
      try {
        if (!wallet.isConnected) await wallet.connect();
        txt.setText("⬡  SIGNING…").setColor("#ffaa00");
        await wallet.signScore(score, wave);
        txt.setText("✓  SCORE SIGNED!").setColor("#00ff88");
        draw(false, true);
        hit.disableInteractive();
      } catch {
        txt.setText("✗  SIGN FAILED").setColor("#ff3300");
      }
    });
  }

  private _buildButton(x: number, y: number, label: string, borderCol: number, borderHex: string, hoverHex: string, onClick: () => void): void {
    const W = 280, H = 48;
    const bg = this.add.graphics().setDepth(10);
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? borderCol : 0x040a02, hover ? 0.2 : 0.9);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 4);
      bg.lineStyle(2, borderCol, hover ? 1 : 0.6);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 4);
      const ct = 8;
      bg.lineStyle(2, borderCol, 1);
      [[x - W / 2, y - H / 2], [x + W / 2 - ct, y - H / 2], [x - W / 2, y + H / 2 - ct], [x + W / 2 - ct, y + H / 2 - ct]].forEach(([bx, by]) => bg.strokeRect(bx, by, ct, ct));
    };
    drawBg(false);
    const txt = this.add.text(x, y, label, {
      fontFamily: "monospace", fontSize: "18px", color: borderHex, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(11);
    const hit = this.add.rectangle(x, y, W, H).setAlpha(0.001).setInteractive({ useHandCursor: true }).setDepth(12);
    hit.on("pointerover", () => { drawBg(true); txt.setColor(hoverHex); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(borderHex); });
    hit.on("pointerdown", onClick);
  }

  private _drawScanlines(): void {
    if (!this.scanGfx) return;
    for (let y = this.scanOffset; y < GAME_HEIGHT; y += 4) {
      this.scanGfx.fillStyle(0x00ff44, 0.015);
      this.scanGfx.fillRect(0, y, GAME_WIDTH, 1);
    }
  }

  private _spawnRainParticle(): void {
    const x = Phaser.Math.Between(0, GAME_WIDTH);
    const size = Phaser.Math.Between(2, 5);
    const color = Phaser.Math.RND.pick([0xffdd00, 0x00ff88, 0xffaa00, 0xffffff]);
    const particle = this.add.rectangle(x, -size, size, size, color).setAlpha(0.7);
    this.tweens.add({
      targets: particle, y: GAME_HEIGHT + size, x: x + Phaser.Math.Between(-20, 20),
      alpha: 0, duration: Phaser.Math.Between(1500, 3000), ease: "Linear",
      onComplete: () => particle.destroy(),
    });
  }

  private _spawnConfetti(): void {
    const fromLeft = Phaser.Math.Between(0, 1) === 0;
    const x = fromLeft ? Phaser.Math.Between(-5, 5) : GAME_WIDTH + Phaser.Math.Between(-5, 5);
    const y = Phaser.Math.Between(0, GAME_HEIGHT);
    const size = Phaser.Math.Between(3, 7);
    const color = Phaser.Math.RND.pick([0xffdd00, 0xff6600, 0x00ff88, 0x00ccff, 0xff00ff, 0xffffff]);
    const spark = this.add.rectangle(x, y, size, size, color).setAlpha(0.9);
    this.tweens.add({
      targets: spark,
      x: fromLeft ? Phaser.Math.Between(40, 180) : Phaser.Math.Between(GAME_WIDTH - 180, GAME_WIDTH - 40),
      y: y + Phaser.Math.Between(-50, 50), alpha: 0,
      duration: Phaser.Math.Between(500, 1000), ease: "Cubic.easeOut",
      onComplete: () => spark.destroy(),
    });
  }

  private _playAgain = (): void => {
    if (this.transitioning) return;
    this.transitioning = true;
    this._cleanupTimers();
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("MainScene");
    });
  };

  private _mainMenu = (): void => {
    if (this.transitioning) return;
    this.transitioning = true;
    this._cleanupTimers();
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("TitleScene");
    });
  };

  private _cleanupTimers(): void {
    this.particleTimer?.destroy();
    this.confettiTimer?.destroy();
    this.input.keyboard?.off("keydown-SPACE", this._playAgain, this);
    this.input.keyboard?.off("keydown-ESC", this._mainMenu, this);
  }
}
