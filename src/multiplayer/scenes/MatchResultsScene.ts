import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../core";
import { UI_FONT, UI_MONO, UI_ORBITRON, UI_OXANIUM, drawPanel } from "../../rendering/UITheme";
import { AudioManager } from "../../audio/AudioManager";

const BG = 0x080412;
const ACCENT = 0xff6600;
const TEAL = 0x00ff88;
const TEAL_HEX = "#00ff88";

interface RankingEntry {
  id: string;
  name: string;
  characterId: string;
  kills: number;
  deaths: number;
  score: number;
}

const CHARACTER_COLORS: Record<string, string> = {
  assault: "#ff6600",
  sentinel: "#3388ff",
  phantom: "#cc44ff",
  engineer: "#00ff88",
};

const CHARACTER_NAMES: Record<string, string> = {
  assault: "WRECKER",
  sentinel: "BASTION",
  phantom: "SPECTRE",
  engineer: "FORGE",
};

export class MatchResultsScene extends Phaser.Scene {
  private winner = "";
  private rankings: RankingEntry[] = [];
  private localPlayerId = "";

  constructor() {
    super({ key: "MatchResults" });
  }

  init(data: { winner: string; rankings: RankingEntry[]; localPlayerId: string }): void {
    this.winner = data?.winner ?? "";
    this.rankings = data?.rankings ?? [];
    this.localPlayerId = data?.localPlayerId ?? "";
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.fadeIn(600, 0, 0, 0);
    AudioManager.instance.setScene(this);

    const cx = GAME_WIDTH / 2;
    const isWinner = this.winner === this.localPlayerId;

    this._drawBackground(cx);
    this._drawVictoryBanner(cx, isWinner);
    this._drawRankings(cx);
    this._drawStats(cx);
    this._drawButtons(cx);
  }

  private _drawBackground(cx: number): void {
    const bg = this.add.graphics().setDepth(-10);
    bg.fillStyle(BG, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Radial glow
    const glow = this.add.graphics().setDepth(-9).setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(ACCENT, 0.04);
    glow.fillCircle(cx, 120, 250);

    // Frame
    const frame = this.add.graphics().setDepth(0);
    frame.lineStyle(2, ACCENT, 0.3);
    frame.strokeRect(14, 14, GAME_WIDTH - 28, GAME_HEIGHT - 28);
  }

  private _drawVictoryBanner(cx: number, isWinner: boolean): void {
    const bannerColor = isWinner ? TEAL : 0xff4444;
    const bannerHex = isWinner ? TEAL_HEX : "#ff4444";
    const bannerText = isWinner ? "VICTORY" : "DEFEAT";
    const subtitleText = isWinner ? "MACHINE SUPREMACY ACHIEVED" : "SYSTEMS TERMINATED";

    // Glow behind title
    const titleGlow = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    titleGlow.fillStyle(bannerColor, 0.06);
    titleGlow.fillCircle(cx, 70, 140);

    const title = this.add.text(cx, 60, bannerText, {
      fontFamily: UI_ORBITRON, fontSize: "54px", color: bannerHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 4, color: bannerHex, blur: 24, fill: true },
    }).setOrigin(0.5).setDepth(10).setAlpha(0).setScale(0.5);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 800, ease: "Back.easeOut" });

    const subtitle = this.add.text(cx, 104, subtitleText, {
      fontFamily: UI_OXANIUM, fontSize: "13px", color: "#888877",
      letterSpacing: 4,
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 500, delay: 400 });

    // Separator
    const sep = this.add.graphics().setDepth(10).setAlpha(0);
    sep.lineStyle(1, bannerColor, 0.5);
    sep.lineBetween(cx - 250, 128, cx + 250, 128);
    sep.fillStyle(bannerColor, 0.8);
    sep.fillCircle(cx, 128, 3);
    this.tweens.add({ targets: sep, alpha: 1, duration: 400, delay: 500 });
  }

  private _drawRankings(cx: number): void {
    const panelX = cx - 350;
    const panelY = 148;
    const panelW = 700;
    const panelH = 240;

    const panel = this.add.graphics().setDepth(9);
    drawPanel(panel, panelX, panelY, panelW, panelH, ACCENT);

    // Header
    this.add.text(panelX + 20, panelY + 12, "FINAL STANDINGS", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#888866", letterSpacing: 2,
    }).setDepth(10);

    // Column headers
    const headerY = panelY + 36;
    const cols = [panelX + 50, panelX + 150, panelX + 320, panelX + 430, panelX + 520, panelX + 620];
    const headers = ["#", "PLAYER", "CHARACTER", "KILLS", "DEATHS", "SCORE"];
    headers.forEach((h, i) => {
      this.add.text(cols[i], headerY, h, {
        fontFamily: UI_MONO, fontSize: "10px", color: "#666655",
      }).setDepth(10);
    });

    // Divider
    const divGfx = this.add.graphics().setDepth(10);
    divGfx.lineStyle(1, ACCENT, 0.3);
    divGfx.lineBetween(panelX + 16, headerY + 18, panelX + panelW - 16, headerY + 18);

    // Rankings
    this.rankings.forEach((entry, i) => {
      const rowY = headerY + 30 + i * 44;
      const isLocal = entry.id === this.localPlayerId;
      const isFirst = i === 0;
      const delay = 600 + i * 150;

      // Row highlight
      if (isLocal || isFirst) {
        const rowBg = this.add.graphics().setDepth(9).setAlpha(0);
        rowBg.fillStyle(isFirst ? TEAL : ACCENT, 0.08);
        rowBg.fillRoundedRect(panelX + 10, rowY - 8, panelW - 20, 38, 4);
        if (isFirst) {
          rowBg.lineStyle(1, TEAL, 0.4);
          rowBg.strokeRoundedRect(panelX + 10, rowY - 8, panelW - 20, 38, 4);
        }
        this.tweens.add({ targets: rowBg, alpha: 1, duration: 300, delay });
      }

      const posColor = i === 0 ? "#ffdd44" : i === 1 ? "#cccccc" : i === 2 ? "#cc8844" : "#888877";
      const nameColor = isLocal ? "#ffffff" : "#ccccaa";
      const charColor = CHARACTER_COLORS[entry.characterId] || "#888877";

      const posText = this.add.text(cols[0], rowY + 8, `${i + 1}`, {
        fontFamily: UI_OXANIUM, fontSize: "18px", color: posColor, fontStyle: "bold",
      }).setDepth(10).setAlpha(0);

      const nameText = this.add.text(cols[1], rowY + 8, entry.name || `PLAYER ${i + 1}`, {
        fontFamily: UI_FONT, fontSize: "15px", color: nameColor, fontStyle: isLocal ? "bold" : "normal",
        stroke: "#000000", strokeThickness: 2,
      }).setDepth(10).setAlpha(0);

      const charText = this.add.text(cols[2], rowY + 8, CHARACTER_NAMES[entry.characterId] || "---", {
        fontFamily: UI_MONO, fontSize: "11px", color: charColor,
      }).setDepth(10).setAlpha(0);

      const killsText = this.add.text(cols[3], rowY + 8, `${entry.kills}`, {
        fontFamily: UI_OXANIUM, fontSize: "16px", color: TEAL_HEX, fontStyle: "bold",
      }).setDepth(10).setAlpha(0);

      const deathsText = this.add.text(cols[4], rowY + 8, `${entry.deaths}`, {
        fontFamily: UI_OXANIUM, fontSize: "16px", color: "#ff4444",
      }).setDepth(10).setAlpha(0);

      const scoreText = this.add.text(cols[5], rowY + 8, `${entry.score}`, {
        fontFamily: UI_OXANIUM, fontSize: "16px", color: "#ffffff", fontStyle: "bold",
      }).setDepth(10).setAlpha(0);

      this.tweens.add({ targets: [posText, nameText, charText, killsText, deathsText, scoreText], alpha: 1, duration: 300, delay });
    });
  }

  private _drawStats(cx: number): void {
    const statsY = 410;
    const totalKills = this.rankings.reduce((sum, r) => sum + r.kills, 0);

    const statsPanel = this.add.graphics().setDepth(9);
    drawPanel(statsPanel, cx - 200, statsY, 400, 50, 0xff6600);

    this.add.text(cx, statsY + 25, `TOTAL ELIMINATIONS: ${totalKills}  •  DEATHMATCH  •  THE FRACTURE`, {
      fontFamily: UI_MONO, fontSize: "11px", color: "#888877",
    }).setOrigin(0.5).setDepth(10);
  }

  private _drawButtons(cx: number): void {
    const btnY = 500;

    // Play Again
    this._createButton(cx - 130, btnY, 220, 48, "PLAY AGAIN", TEAL, TEAL_HEX, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("LobbyScene");
      });
    });

    // Main Menu
    this._createButton(cx + 130, btnY, 220, 48, "MAIN MENU", ACCENT, "#ff7a18", () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("MultiplayerMenu");
      });
    });

    // Back to title
    this._createButton(cx, btnY + 70, 160, 36, "EXIT", 0xff4444, "#ff4444", () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("TitleScene");
      });
    });
  }

  private _createButton(x: number, y: number, w: number, h: number, label: string, color: number, colorHex: string, onClick: () => void): void {
    const bg = this.add.graphics().setDepth(15);
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? color : 0x0a0518, hover ? 0.2 : 0.8);
      bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      bg.lineStyle(2, color, hover ? 1 : 0.6);
      bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    };
    drawBg(false);

    const txt = this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: "15px", color: colorHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(16);

    const hit = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(17);
    hit.on("pointerover", () => { drawBg(true); txt.setColor("#ffffff"); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(colorHex); });
    hit.on("pointerdown", onClick);
  }
}
