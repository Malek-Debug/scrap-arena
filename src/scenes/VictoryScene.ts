import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { WalletManager } from "../web3/WalletManager";
import { SecureStore } from "../core/SecureStore";
import { UI_FONT, UI_MONO, UI_ORBITRON, constrainTextBlock, drawPanel, fitTextWidth } from "../rendering/UITheme";
import { calculateRunScore, calculateRunGrade, VICTORY_BONUS } from "../core/RunGrading";

const GOLD  = "#ffcc00";
const GREEN = "#00ff88";
const CYAN  = "#00ccff";
const WHITE = "#ffffff";
const DIM   = "#886622";

export class VictoryScene extends Phaser.Scene {
  private particleTimer?: Phaser.Time.TimerEvent;
  private confettiTimer?: Phaser.Time.TimerEvent;
  private scanlineTimer?: Phaser.Time.TimerEvent;
  private transitioning = false;
  private scanGfx?: Phaser.GameObjects.Graphics;
  private scanOffset = 0;

  constructor() { super({ key: "VictoryScene" }); }

  create(): void {
    this.transitioning = false;
    this.scanOffset = 0;
    this.input.enabled = true;
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);

    const data = (this.scene.settings.data ?? {}) as {
      kills?: number; wave?: number; scrap?: number; score?: number; maxCombo?: number; maxStreak?: number;
    };
    const kills     = data.kills     ?? 0;
    const wave      = data.wave      ?? 0;
    const scrap     = data.scrap     ?? 0;
    const combatScore = data.score  ?? 0;
    const maxCombo  = data.maxCombo  ?? 0;
    const maxStreak = data.maxStreak ?? 0;

    const score = calculateRunScore({ combatScore, kills, wave, maxCombo, maxStreak, completed: true });
    const { grade, gradeColor } = calculateRunGrade(score);

    // Audio
    AudioManager.instance.setScene(this);
    AudioManager.instance.startVictoryMusic();

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
      ytgame.engagement?.sendScore?.({ value: score });
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

    const titleText = this.add.text(cx, 68, "MISSION COMPLETE", {
      fontFamily: UI_ORBITRON, fontSize: "52px", color: GOLD,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: "#ffcc00", blur: 20, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.3);
    this.tweens.add({ targets: titleText, alpha: 1, scale: 1, duration: 700, delay: 150, ease: "Back.easeOut" });

    // Subtitle
    const subtitle = this.add.text(cx, 126, "MACHINE CORE DESTROYED  //  FRACTURE SEALED", {
      fontFamily: UI_MONO, fontSize: "13px", color: GREEN,
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 8, fill: true },
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 500, delay: 500 });

    // Survived banner
    const survivedTxt = this.add.text(cx, 156, `YOU SURVIVED ALL ${wave} WAVES`, {
      fontFamily: UI_FONT, fontSize: "15px", color: CYAN, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: survivedTxt, alpha: 1, duration: 400, delay: 800 });
    this.tweens.add({ targets: survivedTxt, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 1500 });

    // ── Stats panel ──
    const panelX = cx - 430, panelW = 560, panelY = 178, panelH = 264;
    const panelCx = panelX + panelW / 2;

    const panelGfx = this.add.graphics();
    drawPanel(panelGfx, panelX, panelY, panelW, panelH, 0xffdd00, 0x030b08, 0.88, 8);
    panelGfx.fillStyle(0x00ff88, 0.045);
    panelGfx.fillRect(panelX + 1, panelY + 1, panelW - 2, 48);

    this.add.text(panelX + 24, panelY + 24, "VICTORY REPORT", {
      fontFamily: UI_FONT, fontSize: "13px", color: GOLD, fontStyle: "bold",
    }).setOrigin(0, 0.5);

    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: UI_FONT, fontSize: "16px", color: GOLD };
    const statStyle: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: UI_MONO, fontSize: "17px", color: CYAN };
    const statStartY = panelY + 70, lineH = 30, labelX = panelX + 28, valueX = panelX + panelW - 28;

    const streakCol = maxStreak >= 12 ? "#ff00ff" : maxStreak >= 8 ? "#ff4400" : maxStreak >= 5 ? "#ff8800" : maxStreak >= 3 ? "#ffcc00" : CYAN;
    type StatRow = [string, string, Phaser.Types.GameObjects.Text.TextStyle, boolean?, number?];
    const rows: StatRow[] = [
      ["Final Score:",        `0`,            { fontFamily: UI_MONO, fontSize: "19px", color: GOLD, fontStyle: "bold" }, true, score],
      ["Victory Bonus:",      `+${VICTORY_BONUS}`, { fontFamily: UI_MONO, fontSize: "17px", color: "#00ff88", fontStyle: "bold" }],
      ["Waves Survived:",     `${wave}`,      statStyle],
      ["Machines Destroyed:", `${kills}`,     statStyle],
      ["Best Combo:",         `${maxCombo}x`, { fontFamily: UI_MONO, fontSize: "17px", color: maxCombo >= 10 ? "#ff00ff" : maxCombo >= 5 ? "#ff6600" : CYAN }],
      ["Scrap Collected:",    `${scrap}`,     statStyle],
      ["Best Streak:",        `${maxStreak}`, { fontFamily: UI_MONO, fontSize: "17px", color: streakCol }],
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
    const badgeCardX = panelX + panelW + 28;
    const badgeCardY = panelY;
    const badgeCardW = 270;
    const badgeCardH = panelH;
    const badgePanel = this.add.graphics().setAlpha(0);
    drawPanel(badgePanel, badgeCardX, badgeCardY, badgeCardW, badgeCardH, gradeColor, 0x03100c, 0.88, 8);
    this.tweens.add({ targets: badgePanel, alpha: 1, duration: 280, delay: 560 });
    const badgeX = badgeCardX + badgeCardW / 2, badgeY = badgeCardY + 116;

    const badgeGfx = this.add.graphics().setAlpha(0).setScale(0);
    badgeGfx.lineStyle(3, gradeColor, 0.6);
    badgeGfx.strokeCircle(badgeX, badgeY, 50);
    badgeGfx.lineStyle(1, gradeColor, 0.25);
    badgeGfx.strokeCircle(badgeX, badgeY, 60);

    const gradeTxt = this.add.text(badgeX, badgeY, grade, {
      fontFamily: UI_FONT, fontSize: "80px", color: gradeHex,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0);
    const gradeLabel = this.add.text(badgeX, badgeY + 76, "PERFORMANCE GRADE", {
      fontFamily: UI_FONT, fontSize: "11px", color: GREEN, fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [gradeTxt, badgeGfx], alpha: 1, scale: 1, duration: 400, delay: 1200, ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: gradeLabel, alpha: 1, duration: 250 });
        this.tweens.add({ targets: gradeTxt, scale: { from: 1.05, to: 0.95 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      },
    });

    // ── New record badge ──
    let extraGap = 0;
    if (isNewRecord) {
      extraGap = 32;
      const rec = this.add.text(panelCx, panelY + panelH + 14, "★  NEW  RECORD!  ★", {
        fontFamily: UI_FONT, fontSize: "18px", color: GOLD, fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
        shadow: { offsetX: 0, offsetY: 0, color: "#ffcc00", blur: 10, fill: true },
      }).setOrigin(0.5);
      this.tweens.add({ targets: rec, alpha: { from: 1, to: 0.3 }, duration: 500, yoyo: true, repeat: -1 });
    }

    // ── Leaderboard panel ──
    const lbY = panelY + panelH + extraGap + 14, lbH = 104;
    const lbGfx = this.add.graphics();
    drawPanel(lbGfx, panelX, lbY, panelW + 298, lbH, 0x00ff88, 0x020806, 0.76, 8);

    this.add.text(panelX + 24, lbY + 18, "TOP SCORES", { fontFamily: UI_FONT, fontSize: "11px", color: GOLD, fontStyle: "bold" }).setOrigin(0, 0.5);
    if (top3.length === 0) {
      this.add.text(panelCx, lbY + 58, "NO RECORDS YET", { fontFamily: UI_FONT, fontSize: "14px", color: DIM }).setOrigin(0.5);
    } else {
      const rowColors = [WHITE, "#888888", "#555555"];
      top3.forEach((e, i) => {
        const isMe = i === currentRunIdx;
        const col = isMe ? GOLD : rowColors[i];
        const prefix = isMe ? "►" : " ";
        this.add.text(panelX + 38 + i * 265, lbY + 58,
          `${prefix} #${i + 1}  ${String(e.score).padStart(6, "0")}  W${e.wave}  K${e.kills}  C${e.maxCombo}x`,
          { fontFamily: UI_MONO, fontSize: "13px", color: col }
        ).setOrigin(0, 0.5);
      });
    }

    // ── Buttons ──
    const btnY = Math.min(GAME_HEIGHT - 118, lbY + lbH + 44);
    this._buildButton(cx - 170, btnY, "PLAY AGAIN", 0x00ff88, GREEN, "#aaffcc", () => this._playAgain());
    this._buildButton(cx + 170, btnY, "MAIN MENU", 0x00ccff, CYAN, "#aaddff", () => this._mainMenu());

    // ── Wallet: sign score on-chain (Ethereum challenge) ──
    this._buildWalletSignButton(cx, btnY + 54, score, wave);

    // ── Bottom status bar ──
    const barGfx = this.add.graphics().setDepth(5);
    barGfx.fillStyle(0x020804, 0.8);
    barGfx.fillRect(0, GAME_HEIGHT - 32, GAME_WIDTH, 32);
    barGfx.lineStyle(1, 0x00ff88, 0.25);
    barGfx.lineBetween(0, GAME_HEIGHT - 32, GAME_WIDTH, GAME_HEIGHT - 32);
    this.add.text(36, GAME_HEIGHT - 16, "[ SPACE ] PLAY AGAIN   [ ESC ] MAIN MENU", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#336622",
    }).setOrigin(0, 0.5).setDepth(6);
    this.add.text(GAME_WIDTH - 36, GAME_HEIGHT - 16, "SCRAP ARENA  //  VICTORY", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#224400",
    }).setOrigin(1, 0.5).setDepth(6);

    // Keyboard
    this.time.delayedCall(500, () => {
      this.input.keyboard?.on("keydown-SPACE", this._playAgain, this);
      this.input.keyboard?.on("keydown-ESC", this._mainMenu, this);
    });

    // Scanline animation
    this.scanlineTimer = this.time.addEvent({
      delay: 60, loop: true, callback: () => {
        this.scanOffset = (this.scanOffset + 2) % 8;
        this.scanGfx?.clear();
        this._drawScanlines();
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._cleanupTimers());
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
      fontFamily: UI_FONT, fontSize: "13px", color: wallet.isConnected ? "#00ff88" : "#ffcc00",
    }).setOrigin(0.5).setDepth(11);
    constrainTextBlock(txt, 300, 1, 10);

    const hit = this.add.zone(x, y, 320, 30)
      .setInteractive({ useHandCursor: true }).setDepth(12).setScrollFactor(0);
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
    const W = 280, H = 54;
    const bg = this.add.graphics().setDepth(10);
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? borderCol : 0x04100b, hover ? 0.24 : 0.90);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 8);
      bg.lineStyle(2, hover ? 0xffffff : borderCol, hover ? 0.92 : 0.68);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 8);
      bg.lineStyle(1, borderCol, hover ? 0.5 : 0.22);
      bg.lineBetween(x - W / 2 + 22, y, x - 62, y);
      bg.lineBetween(x + 62, y, x + W / 2 - 22, y);
    };
    drawBg(false);
    const txt = this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: "18px", color: borderHex, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(11);
    fitTextWidth(txt, W - 24, 12);
    const hit = this.add.zone(x, y, W, H).setInteractive({ useHandCursor: true }).setDepth(12).setScrollFactor(0);
    hit.on("pointerover", () => { drawBg(true); txt.setColor(hoverHex); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(borderHex); });
    hit.on("pointerdown", () => {
      hit.disableInteractive();
      txt.setColor(hoverHex);
      onClick();
    });
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
    this._transitionTo("MainScene");
  };

  private _mainMenu = (): void => {
    this._transitionTo("TitleScene");
  };

  private _transitionTo(sceneKey: "MainScene" | "TitleScene"): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.input.enabled = false;
    this._cleanupTimers();
    AudioManager.instance.stopMusic();

    const camera = this.cameras.main;
    camera.resetFX();

    let switched = false;
    const go = (): void => {
      if (switched) return;
      switched = true;
      camera.resetFX();
      this.scene.start(sceneKey);
    };
    this.time.delayedCall(30, go);
    window.setTimeout(go, 180);
  }

  private _cleanupTimers(): void {
    this.particleTimer?.destroy();
    this.particleTimer = undefined;
    this.confettiTimer?.destroy();
    this.confettiTimer = undefined;
    this.scanlineTimer?.destroy();
    this.scanlineTimer = undefined;
    this.input.keyboard?.off("keydown-SPACE", this._playAgain, this);
    this.input.keyboard?.off("keydown-ESC", this._mainMenu, this);
  }
}
