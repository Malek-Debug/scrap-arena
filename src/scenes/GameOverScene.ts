import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";

const C_RED    = 0xff2200;
const C_ORANGE = 0xff5500;

const H_RED    = "#ff2200";
const H_ORANGE = "#ff5500";
const H_AMBER  = "#ff8800";
const H_DIM    = "#661100";
const H_WHITE  = "#ffffff";

export class GameOverScene extends Phaser.Scene {
  private scanlineGfx!: Phaser.GameObjects.Graphics;
  private scanlineOffset = 0;
  private scanlineTimer?: Phaser.Time.TimerEvent;
  private restarting = false;

  constructor() { super({ key: "GameOverScene" }); }

  create(): void {
    this.restarting = false;
    this.scanlineOffset = 0;

    const data = (this.scene.settings.data ?? {}) as {
      kills?: number; wave?: number; scrap?: number; score?: number; maxCombo?: number;
    };
    const kills    = data.kills    ?? 0;
    const wave     = data.wave     ?? 0;
    const scrap    = data.scrap    ?? 0;
    const score    = data.score    ?? 0;
    const maxCombo = data.maxCombo ?? 0;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Audio
    AudioManager.instance.setScene(this);
    AudioManager.instance.stopMusic();

    // Leaderboard persistence
    type LeaderEntry = { score: number; wave: number; kills: number; maxCombo: number };
    const saved: LeaderEntry[] = JSON.parse(localStorage.getItem("scrapArenaLeaders") ?? "[]");
    const prevBest = saved.length > 0 ? saved[0].score : 0;
    saved.push({ score, wave, kills, maxCombo });
    saved.sort((a, b) => b.score - a.score);
    const top3 = saved.slice(0, 3);
    localStorage.setItem("scrapArenaLeaders", JSON.stringify(top3));
    const isNewRecord = score > prevBest && score > 0;

    // Grade
    const gradeScore = score + wave * 500 + kills * 20 + maxCombo * 100;
    let grade: string, gradeColor: number, gradeHex: string;
    if      (gradeScore >= 20000) { grade = "S"; gradeColor = 0xffdd00; gradeHex = "#ffdd00"; }
    else if (gradeScore >= 10000) { grade = "A"; gradeColor = 0xff8800; gradeHex = "#ff8800"; }
    else if (gradeScore >= 5000)  { grade = "B"; gradeColor = 0xff5500; gradeHex = "#ff5500"; }
    else if (gradeScore >= 2000)  { grade = "C"; gradeColor = 0xff2200; gradeHex = "#ff2200"; }
    else                          { grade = "D"; gradeColor = 0x882200; gradeHex = "#882200"; }

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
    const titleY = 68;
    const titleGlow = this.add.graphics().setAlpha(0);
    titleGlow.fillStyle(0xff2200, 0.06);
    titleGlow.fillCircle(cx, titleY, 260);
    this.tweens.add({ targets: titleGlow, alpha: 1, duration: 800, delay: 100 });

    const titleGhost = this.add.text(cx + 5, titleY + 3, "SYSTEM FAILURE", {
      fontFamily: "monospace", fontSize: "58px", color: "#3a0000", fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0);

    const title = this.add.text(cx, titleY, "SYSTEM FAILURE", {
      fontFamily: "monospace", fontSize: "58px", color: H_RED, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: "#ff2200", blur: 22, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    const subtitleText = this.add.text(cx, titleY + 58, "//  M A C H I N E   D E S T R O Y E D  //", {
      fontFamily: "monospace", fontSize: "12px", color: H_DIM,
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
    const panelX = cx - 320, panelY = 140, panelW = 640, panelH = 230;

    const panelGfx = this.add.graphics().setAlpha(0);
    panelGfx.fillStyle(0x0d0000, 0.92);
    panelGfx.fillRoundedRect(panelX, panelY, panelW, panelH, 4);
    panelGfx.lineStyle(2, C_RED, 0.7);
    panelGfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 4);
    panelGfx.lineStyle(1, C_ORANGE, 0.2);
    panelGfx.strokeRoundedRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8, 2);
    const cL = 12;
    panelGfx.lineStyle(3, C_ORANGE, 1);
    [[panelX, panelY], [panelX + panelW - cL, panelY], [panelX, panelY + panelH - cL], [panelX + panelW - cL, panelY + panelH - cL]]
      .forEach(([bx, by]) => panelGfx.strokeRect(bx, by, cL, cL));
    this.tweens.add({ targets: panelGfx, alpha: 1, duration: 280, delay: 400 });

    const panelHeader = this.add.text(cx, panelY + 16, "── COMBAT LOG ──", {
      fontFamily: "monospace", fontSize: "12px", color: H_ORANGE,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: panelHeader, alpha: 1, duration: 200, delay: 460 });

    const statDefs: { label: string; value: string; col: string; big?: boolean }[] = [
      { label: "SCORE",          value: `${score}`,     col: H_AMBER,  big: true },
      { label: "WAVES SURVIVED", value: `${wave}`,      col: H_ORANGE },
      { label: "KILLS",          value: `${kills}`,     col: H_ORANGE },
      { label: "SCRAP",          value: `${scrap}`,     col: H_ORANGE },
      { label: "BEST COMBO",     value: `${maxCombo}x`, col: maxCombo >= 10 ? "#ffdd00" : H_ORANGE },
    ];

    const lh = 36, sy = panelY + 40, lx = panelX + 22, vx = panelX + panelW - 22;
    statDefs.forEach((s, i) => {
      const y = sy + i * lh;
      const delay = 520 + i * 140;
      const lbl = this.add.text(lx - 20, y, s.label, { fontFamily: "monospace", fontSize: "13px", color: "#993300" }).setOrigin(0, 0.5).setAlpha(0);
      const val = this.add.text(vx + 20, y, s.value, {
        fontFamily: "monospace", fontSize: s.big ? "20px" : "16px", color: s.col, fontStyle: s.big ? "bold" : "normal",
      }).setOrigin(1, 0.5).setAlpha(0);
      const sep = this.add.graphics().setAlpha(0);
      sep.lineStyle(1, C_RED, 0.15); sep.lineBetween(lx, y + 15, vx, y + 15);
      this.tweens.add({ targets: lbl, alpha: 1, x: lx, duration: 200, delay, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: val, alpha: 1, x: vx, duration: 200, delay, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: sep, alpha: 1, duration: 160, delay: delay + 80 });
    });

    // Best score + new record
    const bestY = panelY + panelH - 18;
    const bestText = this.add.text(panelX + 22, bestY, `BEST: ${top3[0]?.score ?? 0}`, {
      fontFamily: "monospace", fontSize: "12px", color: "#993300",
    }).setOrigin(0, 0.5).setAlpha(0);
    this.tweens.add({ targets: bestText, alpha: 0.8, duration: 200, delay: 1000 });

    if (isNewRecord) {
      const nrText = this.add.text(panelX + panelW - 22, bestY, "★ NEW RECORD ★", {
        fontFamily: "monospace", fontSize: "14px", color: "#ffdd00", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3,
      }).setOrigin(1, 0.5).setAlpha(0);
      this.tweens.add({
        targets: nrText, alpha: 1, duration: 300, delay: 1100,
        onComplete: () => { this.tweens.add({ targets: nrText, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1 }); },
      });
    }

    // ── 9. Grade badge ──
    const badgeX = cx + 290, badgeY = panelY + panelH / 2 + 10, badgeR = 75;
    const glowGfx = this.add.graphics().setAlpha(0).setScale(0.2);
    glowGfx.lineStyle(2, gradeColor, 0.15); glowGfx.strokeCircle(badgeX, badgeY, badgeR + 36);
    glowGfx.lineStyle(2, gradeColor, 0.3); glowGfx.strokeCircle(badgeX, badgeY, badgeR + 20);
    glowGfx.lineStyle(3, gradeColor, 0.5); glowGfx.strokeCircle(badgeX, badgeY, badgeR + 8);

    const badgeGfx = this.add.graphics().setAlpha(0).setScale(0.2);
    badgeGfx.fillStyle(0x160000, 0.96); badgeGfx.fillCircle(badgeX, badgeY, badgeR);
    badgeGfx.lineStyle(3, gradeColor, 1); badgeGfx.strokeCircle(badgeX, badgeY, badgeR);
    badgeGfx.lineStyle(1, gradeColor, 0.25); badgeGfx.strokeCircle(badgeX, badgeY, badgeR - 10);

    const gradeLetter = this.add.text(badgeX, badgeY, grade, {
      fontFamily: "monospace", fontSize: "86px", color: gradeHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
    }).setOrigin(0.5).setAlpha(0).setScale(0.2);

    const gradeLabel = this.add.text(badgeX, badgeY + badgeR + 18, "PERFORMANCE", {
      fontFamily: "monospace", fontSize: "10px", color: H_DIM,
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
    const btnY = GAME_HEIGHT - 86;
    this._buildButton(cx - 190, btnY, "▶  RETRY", C_RED, H_RED, "#ff8888", 600, () => this._retry());
    this._buildButton(cx + 190, btnY, "⌂  MAIN MENU", C_ORANGE, H_ORANGE, "#ffcc88", 750, () => this._mainMenu());

    // ── 11. Bottom status bar ──
    const barGfx = this.add.graphics().setDepth(5);
    barGfx.fillStyle(0x140000, 0.8);
    barGfx.fillRect(0, GAME_HEIGHT - 34, GAME_WIDTH, 34);
    barGfx.lineStyle(1, C_RED, 0.3);
    barGfx.lineBetween(0, GAME_HEIGHT - 34, GAME_WIDTH, GAME_HEIGHT - 34);

    this.add.text(36, GAME_HEIGHT - 17, "[ SPACE ] RETRY   [ ESC ] MAIN MENU", {
      fontFamily: "monospace", fontSize: "11px", color: H_DIM,
    }).setOrigin(0, 0.5).setDepth(6);
    this.add.text(GAME_WIDTH - 36, GAME_HEIGHT - 17, "SCRAP ARENA  //  GAME OVER", {
      fontFamily: "monospace", fontSize: "11px", color: "#440000",
    }).setOrigin(1, 0.5).setDepth(6);

    // Keyboard shortcuts (delayed)
    this.time.delayedCall(700, () => {
      this.input.keyboard?.on("keydown-SPACE", () => this._retry(), this);
      this.input.keyboard?.on("keydown-ESC", () => this._mainMenu(), this);
    });

    // Cleanup on shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => { this.scanlineTimer?.destroy(); });
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

  private _buildButton(x: number, y: number, label: string, borderCol: number, borderHex: string, hoverHex: string, delay: number, onClick: () => void): void {
    const W = label.length * 14 + 64, H = 48;
    const bg = this.add.graphics().setAlpha(0).setDepth(10);
    const drawBg = (hover: boolean): void => {
      bg.clear();
      bg.fillStyle(hover ? borderCol : 0x160000, hover ? 0.25 : 0.92);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 4);
      bg.lineStyle(2, borderCol, hover ? 1 : 0.7);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 4);
      const ct = 8;
      bg.lineStyle(2, borderCol, 1);
      [[x - W / 2, y - H / 2], [x + W / 2 - ct, y - H / 2], [x - W / 2, y + H / 2 - ct], [x + W / 2 - ct, y + H / 2 - ct]]
        .forEach(([bx, by]) => bg.strokeRect(bx, by, ct, ct));
    };
    drawBg(false);

    const txt = this.add.text(x, y, label, {
      fontFamily: "monospace", fontSize: "18px", color: borderHex, fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0).setDepth(11);

    const hit = this.add.rectangle(x, y, W, H).setAlpha(0.001).setInteractive({ useHandCursor: true }).setDepth(12);
    hit.on("pointerover", () => { drawBg(true); txt.setColor(hoverHex); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(borderHex); });
    hit.on("pointerdown", onClick);

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
    if (this.restarting) return;
    this.restarting = true;
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("MainScene");
    });
  }

  private _mainMenu(): void {
    if (this.restarting) return;
    this.restarting = true;
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("TitleScene");
    });
  }
}
