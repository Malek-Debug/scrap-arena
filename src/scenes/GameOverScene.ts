import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { WalletManager } from "../web3/WalletManager";
import { SecureStore } from "../core/SecureStore";
import { IntegrityGuard } from "../core/IntegrityGuard";
import { UI_FONT, UI_MONO, UI_ORBITRON, constrainTextBlock, drawPanel, fitTextWidth } from "../rendering/UITheme";
import { calculateRunScore, calculateRunGrade } from "../core/RunGrading";

const C_RED    = 0xff2200;
const C_ORANGE = 0xff5500;

const H_RED    = "#ff2200";
const H_ORANGE = "#ff5500";
const H_AMBER  = "#ff8800";
const H_DIM    = "#661100";

export class GameOverScene extends Phaser.Scene {
  private scanlineGfx!: Phaser.GameObjects.Graphics;
  private scanlineOffset = 0;
  private scanlineTimer?: Phaser.Time.TimerEvent;
  private restarting = false;

  constructor() { super({ key: "GameOverScene" }); }

  create(): void {
    this.restarting = false;
    this.scanlineOffset = 0;
    this.input.enabled = true;
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);

    const data = (this.scene.settings.data ?? {}) as {
      kills?: number; wave?: number; scrap?: number; score?: number; maxCombo?: number; maxStreak?: number; deathCause?: "player" | "reactor"; timePlayed?: number;
    };
    const kills      = data.kills      ?? 0;
    const wave       = data.wave       ?? 0;
    const scrap      = data.scrap      ?? 0;
    const combatScore = data.score     ?? 0;
    const maxCombo   = data.maxCombo   ?? 0;
    const maxStreak  = data.maxStreak  ?? 0;
    const deathCause = data.deathCause ?? "player";
    const timePlayed = data.timePlayed ?? 0;

    const score = calculateRunScore({ combatScore, kills, wave, maxCombo, maxStreak, completed: false });

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Audio
    AudioManager.instance.setScene(this);
    AudioManager.instance.startGameOverMusic();

    // Leaderboard (HMAC-protected via SecureStore; sync peek for UI render)
    type LeaderEntry = { score: number; wave: number; kills: number; maxCombo: number };
    const existing = (SecureStore.peekUnverified<LeaderEntry[]>("scrapArenaLeaders")) ?? [];
    const prevBest = existing.length > 0 ? (existing[0].score | 0) : 0;
    const top3: LeaderEntry[] = [...existing, { score, wave, kills, maxCombo }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    void SecureStore.set("scrapArenaLeaders", top3);
    const isNewRecord = score > prevBest && score > 0;

    // YouTube Playables: submit score
    if (typeof ytgame !== "undefined") {
      ytgame.engagement?.sendScore?.({ value: score });
    }

    // Ethereum: sign score if wallet connected
    if (WalletManager.instance.isConnected) {
      WalletManager.instance.signScore(score, wave).catch(() => { /* silent */ });
    }

    // Grade
    const { grade, gradeColor } = calculateRunGrade(score);
    const gradeHex = `#${gradeColor.toString(16).padStart(6, "0")}`;

    // Screen shake
    this.cameras.main.shake(500, 0.025);
    this.cameras.main.fadeIn(400);

    // ── 1. Pure black base ──
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000);

    // ── 2. Ember ambient glow ──
    const ambGfx = this.add.graphics();
    for (let r = 400; r > 0; r -= 50) {
      ambGfx.fillStyle(0x330000, 0.035);
      ambGfx.fillCircle(cx, cy + 30, r);
    }

    // ── 3. Vignette ──
    const vigGfx = this.add.graphics();
    const vigSteps = 22;
    const vigBand = Math.round(Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.34 / vigSteps);
    for (let i = 0; i < vigSteps; i++) {
      const w = (i + 1) * vigBand;
      vigGfx.fillStyle(0x000000, 0.03);
      vigGfx.fillRect(0, 0, GAME_WIDTH, w);
      vigGfx.fillRect(0, GAME_HEIGHT - w, GAME_WIDTH, w);
      vigGfx.fillRect(0, 0, w, GAME_HEIGHT);
      vigGfx.fillRect(GAME_WIDTH - w, 0, w, GAME_HEIGHT);
    }

    // ── 4. Animated red scanlines ──
    this.scanlineGfx = this.add.graphics().setDepth(90);
    this._redrawScanlines();
    this.scanlineTimer = this.time.addEvent({
      delay: 55, loop: true,
      callback: () => {
        this.scanlineOffset = (this.scanlineOffset + 2) % 8;
        this.scanlineGfx.clear();
        this._redrawScanlines();
      },
    });

    // ── 5. Outer border frame ──
    const frameGfx = this.add.graphics();
    frameGfx.lineStyle(2, C_RED, 0.3);
    frameGfx.strokeRect(16, 16, GAME_WIDTH - 32, GAME_HEIGHT - 32);
    frameGfx.lineStyle(1, C_RED, 0.12);
    frameGfx.strokeRect(24, 24, GAME_WIDTH - 48, GAME_HEIGHT - 48);
    const bL = 22;
    frameGfx.lineStyle(3, C_ORANGE, 0.85);
    [[16, 16], [GAME_WIDTH - 16 - bL, 16], [16, GAME_HEIGHT - 16 - bL], [GAME_WIDTH - 16 - bL, GAME_HEIGHT - 16 - bL]]
      .forEach(([bx, by]) => frameGfx.strokeRect(bx, by, bL, bL));

    // ── 6. Floating debris ──
    for (let i = 0; i < 28; i++) this.time.delayedCall(i * 80, () => this._spawnDebris());

    // ── 7. Title with glitch ──
    const titleY = 74;
    const titleGlow = this.add.graphics().setAlpha(0);
    titleGlow.fillStyle(0xff2200, 0.075);
    titleGlow.fillCircle(cx, titleY, 310);
    this.tweens.add({ targets: titleGlow, alpha: 1, duration: 800, delay: 100 });

    const titleGhost = this.add.text(cx + 5, titleY + 3, "SYSTEM FAILURE", {
      fontFamily: UI_ORBITRON, fontSize: "56px", color: "#3a0000", fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0);

    const title = this.add.text(cx, titleY, "SYSTEM FAILURE", {
      fontFamily: UI_ORBITRON, fontSize: "56px", color: H_RED, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: "#ff2200", blur: 22, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    const deathMsg = deathCause === "reactor"
      ? "FRACTURE STATION DESTROYED  //  REACTOR OFFLINE"
      : "MACHINE DESTROYED  //  SIGNAL LOST";
    const subtitleText = this.add.text(cx, titleY + 58, deathMsg, {
      fontFamily: UI_MONO, fontSize: "12px", color: "#bb3a16",
    }).setOrigin(0.5).setAlpha(0);

    this._glitchIn(title, 120, () => {
      this.tweens.add({ targets: titleGhost, alpha: 0.3, duration: 80 });
      this.tweens.add({ targets: subtitleText, alpha: 1, duration: 400, delay: 100 });
      this.time.addEvent({
        delay: 3500, loop: true,
        callback: () => {
          if (Phaser.Math.Between(0, 1) === 0) {
            this._glitchIn(title, 0);
            this.tweens.add({ targets: titleGhost, x: cx + 5 + Phaser.Math.Between(-8, 8), duration: 60, yoyo: true });
          }
        },
      });
    });

    // ── 8. Stats panel ──
    const panelX = cx - 430, panelY = 158, panelW = 560, panelH = 358;

    const panelGfx = this.add.graphics().setAlpha(0);
    drawPanel(panelGfx, panelX, panelY, panelW, panelH, C_RED, 0x080306, 0.94, 8);
    panelGfx.fillStyle(0xff2200, 0.055);
    panelGfx.fillRect(panelX + 1, panelY + 1, panelW - 2, 48);
    this.tweens.add({ targets: panelGfx, alpha: 1, duration: 280, delay: 400 });

    const panelHeader = this.add.text(panelX + 24, panelY + 24, "COMBAT LOG", {
      fontFamily: UI_FONT, fontSize: "13px", color: "#ff7a28", fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0);
    panelHeader.setOrigin(0, 0.5);
    this.tweens.add({ targets: panelHeader, alpha: 1, duration: 200, delay: 460 });

    const streakColor = maxStreak >= 12 ? "#ff00ff" : maxStreak >= 8 ? "#ff4400" : maxStreak >= 5 ? "#ff8800" : maxStreak >= 3 ? "#ffcc00" : H_ORANGE;
    const deathCauseLabel = deathCause === "reactor" ? "REACTOR DESTROYED" : "COMBAT CASUALTY";
    const deathCauseColor = deathCause === "reactor" ? "#ff6600" : H_RED;
    const statDefs: { label: string; value: string; col: string; big?: boolean; isScore?: boolean; targetNum?: number }[] = [
      { label: "SCORE",          value: `0`,               col: H_AMBER,  big: true, isScore: true, targetNum: score },
      { label: "CAUSE OF DEATH", value: deathCauseLabel,   col: deathCauseColor },
      { label: "WAVES SURVIVED", value: `${wave}`,         col: H_ORANGE },
      { label: "KILLS",          value: `${kills}`,     col: H_ORANGE },
      { label: "SCRAP",          value: `${scrap}`,     col: H_ORANGE },
      { label: "BEST COMBO",     value: `${maxCombo}x`, col: maxCombo >= 10 ? "#ffdd00" : H_ORANGE },
      { label: "BEST STREAK",    value: `${maxStreak}`, col: streakColor },
      { label: "TIME",            value: `${Math.floor(timePlayed / 60)}:${(timePlayed % 60).toString().padStart(2, '0')}`, col: H_ORANGE },
    ];

    const lh = 38, sy = panelY + 72, lx = panelX + 28, vx = panelX + panelW - 28;
    statDefs.forEach((s, i) => {
      const y = sy + i * lh;
      const delay = 520 + i * 140;
      const lbl = this.add.text(lx - 20, y, s.label, { fontFamily: UI_FONT, fontSize: "13px", color: "#d15b22" }).setOrigin(0, 0.5).setAlpha(0);
      const val = this.add.text(vx + 20, y, s.value, {
        fontFamily: UI_MONO, fontSize: s.big ? "22px" : "16px", color: s.col, fontStyle: "bold",
      }).setOrigin(1, 0.5).setAlpha(0);
      const sep = this.add.graphics().setAlpha(0);
      sep.lineStyle(1, C_RED, 0.15); sep.lineBetween(lx, y + 15, vx, y + 15);
      this.tweens.add({ targets: lbl, alpha: 1, x: lx, duration: 200, delay, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: val, alpha: 1, x: vx, duration: 200, delay, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: sep, alpha: 1, duration: 160, delay: delay + 80 });
      if (s.isScore && s.targetNum && s.targetNum > 0) {
        const ctr = { v: 0 };
        this.tweens.add({
          targets: ctr, v: s.targetNum, duration: 1100, delay: delay + 220, ease: "Cubic.easeOut",
          onUpdate: () => val.setText(`${ctr.v | 0}`),
          onComplete: () => val.setText(`${s.targetNum}`),
        });
      }
    });

    // Best score + new record
    const bestY = panelY + panelH - 24;
    const bestText = this.add.text(panelX + 28, bestY, `BEST RUN  ${top3[0]?.score ?? 0}`, {
      fontFamily: UI_MONO, fontSize: "12px", color: "#d15b22",
    }).setOrigin(0, 0.5).setAlpha(0);
    this.tweens.add({ targets: bestText, alpha: 0.8, duration: 200, delay: 1000 });

    if (isNewRecord) {
      const nrText = this.add.text(panelX + panelW - 28, bestY, "NEW RECORD", {
        fontFamily: UI_FONT, fontSize: "14px", color: "#ffdd00", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(1, 0.5).setAlpha(0);
      this.tweens.add({
        targets: nrText, alpha: 1, duration: 300, delay: 1100,
        onComplete: () => { this.tweens.add({ targets: nrText, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1 }); },
      });
    }

    // ── 9. Grade badge — placed outside the stats panel to the right ──
    const badgeCardX = panelX + panelW + 28;
    const badgeCardY = panelY;
    const badgeCardW = 270;
    const badgeCardH = panelH;
    const badgePanel = this.add.graphics().setAlpha(0);
    drawPanel(badgePanel, badgeCardX, badgeCardY, badgeCardW, badgeCardH, gradeColor, 0x090306, 0.90, 8);
    this.tweens.add({ targets: badgePanel, alpha: 1, duration: 280, delay: 560 });
    const badgeR = 76;
    const badgeX = badgeCardX + badgeCardW / 2, badgeY = badgeCardY + 128;
    const glowGfx = this.add.graphics().setAlpha(0).setScale(0.2);
    glowGfx.lineStyle(2, gradeColor, 0.15); glowGfx.strokeCircle(badgeX, badgeY, badgeR + 36);
    glowGfx.lineStyle(2, gradeColor, 0.3); glowGfx.strokeCircle(badgeX, badgeY, badgeR + 20);
    glowGfx.lineStyle(3, gradeColor, 0.5); glowGfx.strokeCircle(badgeX, badgeY, badgeR + 8);

    const badgeGfx = this.add.graphics().setAlpha(0).setScale(0.2);
    badgeGfx.fillStyle(0x160000, 0.96); badgeGfx.fillCircle(badgeX, badgeY, badgeR);
    badgeGfx.lineStyle(3, gradeColor, 1); badgeGfx.strokeCircle(badgeX, badgeY, badgeR);
    badgeGfx.lineStyle(1, gradeColor, 0.25); badgeGfx.strokeCircle(badgeX, badgeY, badgeR - 10);

    const gradeLetter = this.add.text(badgeX, badgeY, grade, {
      fontFamily: UI_FONT, fontSize: "86px", color: gradeHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
    }).setOrigin(0.5).setAlpha(0).setScale(0.2);

    const gradeLabel = this.add.text(badgeX, badgeY + badgeR + 22, "PERFORMANCE GRADE", {
      fontFamily: UI_FONT, fontSize: "11px", color: "#d15b22",
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [glowGfx, badgeGfx, gradeLetter], alpha: 1, scale: 1,
      duration: 450, delay: 850, ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: gradeLabel, alpha: 1, duration: 300 });
        const pulseGfx = this.add.graphics();
        pulseGfx.lineStyle(4, gradeColor, 0.6); pulseGfx.strokeCircle(badgeX, badgeY, badgeR + 4);
        this.tweens.add({
          targets: pulseGfx, alpha: { from: 0.6, to: 0 }, scaleX: { from: 1, to: 1.5 }, scaleY: { from: 1, to: 1.5 },
          duration: 1200, repeat: -1, ease: "Sine.easeOut",
        });
      },
    });

    // ── 10. Buttons ──
    const btnY = 542;
    this._buildButton(cx - 190, btnY, "RETRY", C_RED, H_RED, "#ffb0a0", 600, () => this._retry());
    this._buildButton(cx + 190, btnY, "MAIN MENU", C_ORANGE, H_ORANGE, "#ffcc88", 750, () => this._mainMenu());

    // Wallet sign score (Ethereum challenge)
    this._buildWalletSignButton(cx, btnY + 50, score, wave);

    // ── TAINTED watermark (anti-cheat: only shown if integrity flag tripped) ──
    if (IntegrityGuard.instance.isTainted) {
      const tainted = this.add.text(cx, panelY + panelH + 38, "⚠  RUN  TAINTED  ⚠", {
        fontFamily: UI_FONT, fontSize: "12px", color: "#ff3300", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0).setDepth(50);
      this.tweens.add({ targets: tainted, alpha: 0.85, duration: 400, delay: 1500 });
      this.tweens.add({ targets: tainted, alpha: { from: 0.85, to: 0.35 }, duration: 700, yoyo: true, repeat: -1, delay: 1900 });
    }

    // ── 11. Bottom status bar ──
    const barGfx = this.add.graphics().setDepth(5);
    barGfx.fillStyle(0x140000, 0.8);
    barGfx.fillRect(0, GAME_HEIGHT - 34, GAME_WIDTH, 34);
    barGfx.lineStyle(1, C_RED, 0.3);
    barGfx.lineBetween(0, GAME_HEIGHT - 34, GAME_WIDTH, GAME_HEIGHT - 34);

    this.add.text(36, GAME_HEIGHT - 17, "[ SPACE ] RETRY   [ ESC ] MAIN MENU", {
      fontFamily: UI_MONO, fontSize: "11px", color: H_DIM,
    }).setOrigin(0, 0.5).setDepth(6);
    this.add.text(GAME_WIDTH - 36, GAME_HEIGHT - 17, "SCRAP ARENA  //  GAME OVER", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#440000",
    }).setOrigin(1, 0.5).setDepth(6);

    // Keyboard shortcuts (delayed)
    this.time.delayedCall(700, () => {
      this.input.keyboard?.on("keydown-SPACE", this._retry, this);
      this.input.keyboard?.on("keydown-ESC", this._mainMenu, this);
    });

    // Cleanup on shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._cleanupScene());
  }

  private _redrawScanlines(): void {
    for (let y = this.scanlineOffset; y < GAME_HEIGHT; y += 8) {
      this.scanlineGfx.fillStyle(0xff0000, 0.025);
      this.scanlineGfx.fillRect(0, y, GAME_WIDTH, 2);
    }
  }

  private _glitchIn(text: Phaser.GameObjects.Text, delay: number, onDone?: () => void): void {
    const ox = text.x;
    let step = 0;
    const STEPS = 14;
    const tick = (): void => {
      if (step >= STEPS) { text.setAlpha(1).setX(ox); onDone?.(); return; }
      const even = step % 2 === 0;
      text.setAlpha(even ? 0.92 : 0.04);
      text.setX(ox + (even ? Phaser.Math.Between(-12, 12) : 0));
      step++;
      this.time.delayedCall(32, tick);
    };
    this.time.delayedCall(delay, tick);
  }

  private _buildWalletSignButton(x: number, y: number, score: number, wave: number): void {
    const wallet = WalletManager.instance;
    const bg = this.add.graphics().setDepth(10);
    const txt = this.add.text(x, y,
      wallet.isConnected ? "⬡  SIGN SCORE ON-CHAIN" : "⬡  CONNECT & SIGN SCORE",
      { fontFamily: UI_FONT, fontSize: "12px", color: wallet.isConnected ? "#00ff88" : "#ff8800" }
    ).setOrigin(0.5).setDepth(11);
    constrainTextBlock(txt, 260, 1, 10);

    const draw = (hover: boolean, done: boolean) => {
      bg.clear();
      const col = done ? 0x00ff88 : 0xff8800;
      bg.fillStyle(0x160000, 0.85); bg.lineStyle(1, col, hover || done ? 0.9 : 0.3);
      const W = 280, H = 28;
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 3);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 3);
    };
    draw(false, wallet.isConnected);

    const hit = this.add.zone(x, y, 280, 28)
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

  private _buildButton(x: number, y: number, label: string, borderCol: number, borderHex: string, hoverHex: string, delay: number, onClick: () => void): void {
    const W = 260, H = 54;
    const bg = this.add.graphics().setAlpha(0).setDepth(10);
    const drawBg = (hover: boolean): void => {
      bg.clear();
      bg.fillStyle(hover ? borderCol : 0x130406, hover ? 0.30 : 0.86);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 8);
      bg.lineStyle(2, hover ? 0xffffff : borderCol, hover ? 0.92 : 0.68);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 8);
      bg.lineStyle(1, borderCol, hover ? 0.48 : 0.20);
      bg.lineBetween(x - W / 2 + 22, y, x - 58, y);
      bg.lineBetween(x + 58, y, x + W / 2 - 22, y);
    };
    drawBg(false);

    const txt = this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: "18px", color: borderHex, fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0).setDepth(11);
    fitTextWidth(txt, W - 24, 12);

    const hit = this.add.zone(x, y, W, H).setInteractive({ useHandCursor: true }).setDepth(12).setScrollFactor(0);
    hit.on("pointerover", () => { drawBg(true); txt.setColor(hoverHex); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(borderHex); });
    hit.on("pointerdown", () => {
      hit.disableInteractive();
      txt.setColor(hoverHex);
      onClick();
    });

    this.tweens.add({ targets: [bg, txt], alpha: 1, duration: 250, delay });
  }

  private _spawnDebris(): void {
    const x = Phaser.Math.Between(0, GAME_WIDTH), y = Phaser.Math.Between(0, GAME_HEIGHT);
    const w = Phaser.Math.Between(3, 14), h = Phaser.Math.Between(1, 4), ang = Phaser.Math.Between(0, 360);
    const dur = Phaser.Math.Between(4000, 10000);
    const col = Phaser.Math.RND.pick<number>([0xff2200, 0xff4400, 0x881100, 0x440000, 0xcc3300]);
    const alpha = Phaser.Math.FloatBetween(0.08, 0.5);
    const rad = Phaser.Math.DegToRad(ang);
    const dist = Phaser.Math.FloatBetween(18, 75) * (dur / 1000);
    const d = this.add.rectangle(x, y, w, h, col).setAlpha(alpha).setAngle(ang);
    this.tweens.add({
      targets: d, x: x + Math.cos(rad) * dist, y: y + Math.sin(rad) * dist,
      angle: ang + Phaser.Math.Between(-200, 200), alpha: 0, duration: dur, ease: "Linear",
      onComplete: () => { d.destroy(); if (this.scene.isActive("GameOverScene")) this._spawnDebris(); },
    });
  }

  private _retry(): void {
    this._transitionTo("MainScene");
  }

  private _mainMenu(): void {
    this._transitionTo("TitleScene");
  }

  private _transitionTo(sceneKey: "MainScene" | "TitleScene"): void {
    if (this.restarting) return;
    this.restarting = true;
    this.input.enabled = false;
    this._cleanupScene();
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

  private _cleanupScene(): void {
    this.scanlineTimer?.destroy();
    this.scanlineTimer = undefined;
    this.input.keyboard?.off("keydown-SPACE", this._retry, this);
    this.input.keyboard?.off("keydown-ESC", this._mainMenu, this);
  }
}
