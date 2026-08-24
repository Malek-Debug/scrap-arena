import Phaser from "phaser";
import { UI_FONT, UI_MONO, UI_ORBITRON, C, FS, drawBrackets } from "../../rendering/UITheme";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const PANEL_W = 800;
const PANEL_H = 360;
const ROW_H = 52;
const HEADER_H = 44;

export interface ScoreboardPlayer {
  name: string;
  character: string;
  kills: number;
  deaths: number;
  score: number;
  color: number;
  isLocal: boolean;
}

export class Scoreboard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(players: ScoreboardPlayer[]): void {
    if (this.visible) {
      this.update(players);
      return;
    }
    this.visible = true;
    this._build(players);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.container) {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 120,
        onComplete: () => {
          this.container?.destroy(true);
          this.container = null;
        },
      });
    }
  }

  update(players: ScoreboardPlayer[]): void {
    if (!this.visible) return;
    this.container?.destroy(true);
    this.container = null;
    this._build(players);
  }

  private _build(players: ScoreboardPlayer[]): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const px = cx - PANEL_W / 2;
    const py = cy - PANEL_H / 2;

    const sorted = [...players].sort((a, b) => b.score - a.score);

    this.container = this.scene.add.container(0, 0)
      .setDepth(280).setScrollFactor(0).setAlpha(0);

    // Backdrop overlay
    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55);
    this.container.add(overlay);

    // Panel background
    const panelGfx = this.scene.add.graphics();
    panelGfx.fillStyle(C.ink, 0.94);
    panelGfx.fillRoundedRect(px, py, PANEL_W, PANEL_H, 10);
    panelGfx.lineStyle(2, C.cyan, 0.6);
    panelGfx.strokeRoundedRect(px, py, PANEL_W, PANEL_H, 10);
    // Top accent bar
    panelGfx.fillStyle(C.cyan, 0.06);
    panelGfx.fillRoundedRect(px, py, PANEL_W, HEADER_H, { tl: 10, tr: 10, bl: 0, br: 0 });
    // Header separator
    panelGfx.lineStyle(1, C.cyan, 0.3);
    panelGfx.lineBetween(px + 16, py + HEADER_H, px + PANEL_W - 16, py + HEADER_H);
    drawBrackets(panelGfx, px, py, PANEL_W, PANEL_H, C.cyan, 0.5, 14);
    this.container.add(panelGfx);

    // Title
    const title = this.scene.add.text(cx, py + HEADER_H / 2, "SCOREBOARD", {
      fontFamily: UI_ORBITRON,
      fontSize: FS.lg,
      color: C.cyanH,
      fontStyle: "bold",
    }).setOrigin(0.5).setShadow(0, 0, C.cyanH, 8, true, true);
    this.container.add(title);

    // Column headers
    const colX = {
      rank: px + 30,
      name: px + 70,
      char: px + 280,
      kills: px + 460,
      deaths: px + 560,
      score: px + 680,
    };
    const headerY = py + HEADER_H + 16;
    const headers = [
      { x: colX.rank, label: "#" },
      { x: colX.name, label: "PLAYER" },
      { x: colX.char, label: "CHARACTER" },
      { x: colX.kills, label: "KILLS" },
      { x: colX.deaths, label: "DEATHS" },
      { x: colX.score, label: "SCORE" },
    ];
    for (const h of headers) {
      const txt = this.scene.add.text(h.x, headerY, h.label, {
        fontFamily: UI_MONO, fontSize: FS.xs, color: C.mutedH,
        fontStyle: "bold",
      }).setOrigin(0, 0.5);
      this.container.add(txt);
    }

    // Header line below column names
    const hdrLineGfx = this.scene.add.graphics();
    hdrLineGfx.lineStyle(1, C.cyan, 0.15);
    hdrLineGfx.lineBetween(px + 16, headerY + 12, px + PANEL_W - 16, headerY + 12);
    this.container.add(hdrLineGfx);

    // Player rows
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const rowY = headerY + 28 + i * ROW_H;

      // Row background
      const rowGfx = this.scene.add.graphics();
      if (p.isLocal) {
        rowGfx.fillStyle(p.color, 0.08);
        rowGfx.fillRoundedRect(px + 12, rowY - 8, PANEL_W - 24, ROW_H - 4, 4);
        rowGfx.lineStyle(1, p.color, 0.35);
        rowGfx.strokeRoundedRect(px + 12, rowY - 8, PANEL_W - 24, ROW_H - 4, 4);
      }
      // Left color accent bar
      rowGfx.fillStyle(p.color, 0.9);
      rowGfx.fillRect(px + 14, rowY - 4, 4, ROW_H - 12);
      this.container.add(rowGfx);

      // Rank
      const rankStr = `${i + 1}`;
      const rankTxt = this.scene.add.text(colX.rank + 8, rowY + ROW_H / 2 - 12, rankStr, {
        fontFamily: UI_MONO, fontSize: FS.md, color: i === 0 ? "#ffcc00" : C.softH,
        fontStyle: "bold",
      }).setOrigin(0, 0.5);
      this.container.add(rankTxt);

      // Name
      const nameColor = Phaser.Display.Color.IntegerToColor(p.color).rgba;
      const nameTxt = this.scene.add.text(colX.name, rowY + ROW_H / 2 - 12, p.name, {
        fontFamily: UI_FONT, fontSize: FS.md, color: p.isLocal ? "#ffffff" : nameColor,
        fontStyle: p.isLocal ? "bold" : "normal",
      }).setOrigin(0, 0.5);
      this.container.add(nameTxt);

      // Character
      const charTxt = this.scene.add.text(colX.char, rowY + ROW_H / 2 - 12, p.character, {
        fontFamily: UI_MONO, fontSize: FS.sm, color: C.mutedH,
      }).setOrigin(0, 0.5);
      this.container.add(charTxt);

      // Kills
      const killsTxt = this.scene.add.text(colX.kills + 16, rowY + ROW_H / 2 - 12, `${p.kills}`, {
        fontFamily: UI_MONO, fontSize: FS.md, color: C.greenH,
        fontStyle: "bold",
      }).setOrigin(0, 0.5);
      this.container.add(killsTxt);

      // Deaths
      const deathsTxt = this.scene.add.text(colX.deaths + 16, rowY + ROW_H / 2 - 12, `${p.deaths}`, {
        fontFamily: UI_MONO, fontSize: FS.md, color: C.redH,
      }).setOrigin(0, 0.5);
      this.container.add(deathsTxt);

      // Score
      const scoreTxt = this.scene.add.text(colX.score + 8, rowY + ROW_H / 2 - 12, `${p.score}`, {
        fontFamily: UI_MONO, fontSize: FS.md, color: C.amberH,
        fontStyle: "bold",
      }).setOrigin(0, 0.5);
      this.container.add(scoreTxt);
    }

    // Bottom hint
    const hint = this.scene.add.text(cx, py + PANEL_H - 18, "[ TAB ] to close", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.mutedH,
    }).setOrigin(0.5);
    this.container.add(hint);

    // Animate in
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 150,
      ease: "Quad.easeOut",
    });
  }

  destroy(): void {
    this.container?.destroy(true);
    this.container = null;
    this.visible = false;
  }
}
