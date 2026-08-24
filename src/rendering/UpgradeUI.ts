import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { UI_FONT, UI_MONO, UI_ORBITRON, UI_RAJDHANI, constrainTextBlock, drawPanel, fitTextWidth } from "./UITheme";

interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  cost: number;
  maxLevel: number;
  currentLevel: number;
}

const DEPTH = 620;
const FONT = UI_FONT;

const COL = {
  green: "#00ff88",
  cyan: "#00ccff",
  dimGreen: "#336644",
  bg: 0x111111,
  cardBg: 0x1a1a2e,
  cardAffordable: 0x00ff88,
  cardLocked: 0x555555,
  dimText: "#666666",
  white: "#ffffff",
  scrap: "#ffcc00",
  skip: "#ff6655",
};

const UPGRADE_ICONS: Record<string, string> = {
  speed: "▶", damage: "✦", maxHp: "♥", fireRate: "◎",
  pickupRange: "◉", multiShot: "∷", armor: "◈", phaseMastery: "⬡", rapidFire: "►",
  riftsync: "⬡", mirror_plating: "◇",
  card_factory: "⊟", card_server: "⊟", card_power: "⊟", card_control: "⊟", card_maintenance: "⊟",
  card_armory: "⊟", card_quarantine: "⊟", card_vault: "⊟",
};

const UPGRADE_COLORS: Record<string, number> = {
  speed: 0x00ccff, damage: 0xff4444, maxHp: 0x00ff88, fireRate: 0xffcc00,
  pickupRange: 0xaa44ff, multiShot: 0xff6600, armor: 0x44ff88, phaseMastery: 0xcc44ff, rapidFire: 0xff2244,
  riftsync: 0xcc44ff, mirror_plating: 0x88ccff,
  card_factory: 0x00ff88, card_server: 0x44aaff, card_power: 0x00ffcc, card_control: 0xffcc44, card_maintenance: 0xaaaaaa,
  card_armory: 0xff6600, card_quarantine: 0xccff00, card_vault: 0xff0066,
};

const UPGRADE_COLOR_HEX: Record<string, string> = {
  speed: "#00ccff", damage: "#ff4444", maxHp: "#00ff88", fireRate: "#ffcc00",
  pickupRange: "#aa44ff", multiShot: "#ff6600", armor: "#44ff88", phaseMastery: "#cc44ff", rapidFire: "#ff2244",
  riftsync: "#cc44ff", mirror_plating: "#88ccff",
  card_factory: "#00ff88", card_server: "#44aaff", card_power: "#00ffcc", card_control: "#ffcc44", card_maintenance: "#aaaaaa",
  card_armory: "#ff6600", card_quarantine: "#ccff00", card_vault: "#ff0066",
};

export class UpgradeUI {
  private scene: Phaser.Scene;
  private elements: Phaser.GameObjects.GameObject[] = [];
  private keyHandler?: (e: KeyboardEvent) => void;
  isVisible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(
    upgrades: UpgradeOption[],
    scrap: number,
    onSelect: (id: string) => void,
    onSkip: () => void,
  ): void {
    this.hide();
    this.isVisible = true;

    const capped = upgrades.slice(0, 5);

    // ── Full-screen dark overlay ──────────────────────────────────────────────
    const overlay = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setDepth(DEPTH - 2).setScrollFactor(0)
      .setInteractive();
    this.elements.push(overlay);
    this.scene.tweens.add({ targets: overlay, alpha: 0.94, duration: 220 });

    // ── Centered panel backdrop ───────────────────────────────────────────────
    const panelW = 1120;
    const panelH = 580;
    const panelX = (GAME_WIDTH - panelW) / 2;
    const panelY = GAME_HEIGHT / 2;
    const panelTop = panelY - panelH / 2;
    const panelBg = this.scene.add.graphics()
      .setDepth(DEPTH - 1).setScrollFactor(0).setAlpha(0);
    drawPanel(panelBg, panelX, panelTop, panelW, panelH, 0x00ff88, 0x030711, 0.99, 10);
    this.elements.push(panelBg);
    this.scene.tweens.add({ targets: panelBg, alpha: 0.97, duration: 260 });

    // Top accent line
    const topAccent = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1).setAlpha(0.6);
    topAccent.lineStyle(2, 0x00ff88, 0.55);
    topAccent.lineBetween(panelX + 26, panelTop + 2, panelX + panelW - 26, panelTop + 2);
    this.elements.push(topAccent);

    // Corner brackets
    const corners = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1).setAlpha(0.5);
    corners.lineStyle(2, 0x00ff88, 0.7);
    const cLen = 18;
    // Top-left
    corners.lineBetween(panelX, panelTop + 2, panelX + cLen, panelTop + 2);
    corners.lineBetween(panelX, panelTop + 2, panelX, panelTop + 2 + cLen);
    // Top-right
    corners.lineBetween(panelX + panelW, panelTop + 2, panelX + panelW - cLen, panelTop + 2);
    corners.lineBetween(panelX + panelW, panelTop + 2, panelX + panelW, panelTop + 2 + cLen);
    // Bottom-left
    const panelBot = panelY + panelH / 2;
    corners.lineBetween(panelX, panelBot - 2, panelX + cLen, panelBot - 2);
    corners.lineBetween(panelX, panelBot - 2, panelX, panelBot - 2 - cLen);
    // Bottom-right
    corners.lineBetween(panelX + panelW, panelBot - 2, panelX + panelW - cLen, panelBot - 2);
    corners.lineBetween(panelX + panelW, panelBot - 2, panelX + panelW, panelBot - 2 - cLen);
    this.elements.push(corners);

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleY = panelTop + 48;
    const title = this.scene.add
      .text(GAME_WIDTH / 2, titleY, "UPGRADE SYSTEMS", {
        fontFamily: UI_ORBITRON, fontSize: "34px", color: COL.green,
        fontStyle: "bold", stroke: "#002211", strokeThickness: 6,
      })
      .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
    title.setShadow(0, 0, "#00ff88", 18, true, true);
    this.elements.push(title);
    this.scene.tweens.add({ targets: title, alpha: 1, duration: 300, delay: 80 });

    // ── Scrap display (gold pill) ─────────────────────────────────────────────
    const scrapY = titleY + 52;
    const scrapPill = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1).setAlpha(0);
    scrapPill.fillStyle(0x1a1000, 0.92);
    scrapPill.fillRoundedRect(GAME_WIDTH / 2 - 96, scrapY - 16, 192, 32, 8);
    scrapPill.lineStyle(1, 0xffcc00, 0.40);
    scrapPill.strokeRoundedRect(GAME_WIDTH / 2 - 96, scrapY - 16, 192, 32, 8);
    this.elements.push(scrapPill);

    const scrapText = this.scene.add
      .text(GAME_WIDTH / 2, scrapY, `⬡  SCRAP: ${scrap}`, {
        fontFamily: FONT, fontSize: "18px", color: COL.scrap, fontStyle: "bold",
      })
      .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
    scrapText.setShadow(0, 0, "#ffcc00", 8, true, true);
    this.elements.push(scrapText);
    this.scene.tweens.add({ targets: [scrapPill, scrapText], alpha: 1, duration: 300, delay: 120 });

    // ── Instruction hint ─────────────────────────────────────────────────────
    const hintY = scrapY + 36;
    const hintText = this.scene.add
      .text(GAME_WIDTH / 2, hintY, "Choose one upgrade. Press 1-5, click a card, or Esc to skip.", {
        fontFamily: UI_MONO, fontSize: "12px", color: "#a5c8b9",
      })
      .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
    this.elements.push(hintText);
    this.scene.tweens.add({ targets: hintText, alpha: 1, duration: 300, delay: 150 });

    // ── Header separator ─────────────────────────────────────────────────────
    const sepY = hintY + 22;
    const sepLine = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1).setAlpha(0.45);
    sepLine.lineStyle(1, 0x00ff88, 0.20);
    sepLine.lineBetween(panelX + 34, sepY, panelX + panelW - 34, sepY);
    this.elements.push(sepLine);

    // ── Cards ─────────────────────────────────────────────────────────────────
    const cardW = 198;
    const cardH = 286;
    const gap = 14;
    const count = capped.length;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const cardY = sepY + 24 + cardH / 2; // top-of-card = sepY+24

    capped.forEach((upgrade, i) => {
      const cx = startX + i * (cardW + gap);
      const affordable = scrap >= upgrade.cost && upgrade.currentLevel < upgrade.maxLevel;
      const maxed = upgrade.currentLevel >= upgrade.maxLevel;
      const typeColor = UPGRADE_COLORS[upgrade.id] ?? 0x00ff88;
      const typeColorHex = UPGRADE_COLOR_HEX[upgrade.id] ?? COL.green;
      const icon = UPGRADE_ICONS[upgrade.id] ?? "◈";
      const borderColor = maxed ? 0x333333 : affordable ? typeColor : 0x444444;
      const stagger = 180 + i * 80;

      // Outer glow for affordable cards
      if (affordable) {
        const glowRect = this.scene.add
          .rectangle(cx, cardY, cardW + 10, cardH + 10, typeColor, 0.09)
          .setDepth(DEPTH - 1).setScrollFactor(0).setAlpha(0);
        this.elements.push(glowRect);
        this.scene.tweens.add({ targets: glowRect, alpha: 1, duration: 300, delay: stagger });
      }

      // Card background
      const cardBg = this.scene.add
        .rectangle(cx, cardY, cardW, cardH, affordable ? 0x101426 : 0x11131e)
        .setDepth(DEPTH).setScrollFactor(0).setStrokeStyle(2, borderColor).setAlpha(0);
      this.elements.push(cardBg);

      // Number key hint
      const keyHint = this.scene.add
        .text(cx, cardY - cardH / 2 + 17, `[${i + 1}]`, {
          fontFamily: UI_MONO, fontSize: "13px",
          color: affordable ? COL.cyan : COL.dimText,
        })
        .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      this.elements.push(keyHint);

      // Icon
      const iconText = this.scene.add
        .text(cx, cardY - cardH / 2 + 52, icon, {
          fontFamily: UI_MONO, fontSize: "28px",
          color: affordable ? typeColorHex : COL.dimText,
        })
        .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      this.elements.push(iconText);

      // Name
      const nameText = this.scene.add
        .text(cx, cardY - cardH / 2 + 87, upgrade.name, {
          fontFamily: FONT, fontSize: "15px",
          color: affordable ? typeColorHex : COL.dimText,
          fontStyle: "bold", wordWrap: { width: cardW - 20 }, align: "center",
        })
        .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      constrainTextBlock(nameText, cardW - 24, 2, 11);
      this.elements.push(nameText);

      // Description
      const descText = this.scene.add
        .text(cx, cardY - cardH / 2 + 122, upgrade.description, {
          fontFamily: UI_RAJDHANI, fontSize: "13px",
          color: affordable ? "#e8f8f2" : "#777c84",
          wordWrap: { width: cardW - 28 }, align: "center", lineSpacing: 4,
        })
        .setOrigin(0.5, 0).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      constrainTextBlock(descText, cardW - 28, 5, 10);
      this.elements.push(descText);

      // Inner card separator
      const innerSep = this.scene.add
        .rectangle(cx, cardY + cardH / 2 - 68, cardW - 32, 1, borderColor, 0.35)
        .setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      this.elements.push(innerSep);

      // Level
      const levelStr = maxed ? "MAX LEVEL" : `Lv ${upgrade.currentLevel} → ${upgrade.currentLevel + 1}`;
      const levelText = this.scene.add
        .text(cx, cardY + cardH / 2 - 50, levelStr, {
          fontFamily: UI_MONO, fontSize: "12px",
          color: maxed ? COL.scrap : affordable ? COL.cyan : COL.dimText,
        })
        .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      this.elements.push(levelText);

      // Cost
      const shortBy = Math.max(0, upgrade.cost - scrap);
      const costStr = maxed ? "MAXED" : affordable ? `⬡ ${upgrade.cost}` : `NEED ${shortBy}`;
      const costText = this.scene.add
        .text(cx, cardY + cardH / 2 - 28, costStr, {
          fontFamily: UI_MONO, fontSize: "16px",
          color: maxed ? COL.scrap : affordable ? COL.scrap : "#9da0a8",
          fontStyle: "bold",
        })
        .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
      fitTextWidth(costText, cardW - 28, 11);
      this.elements.push(costText);

      // Staggered fade-in for all card elements
      const cardGroup = [cardBg, keyHint, iconText, nameText, descText, innerSep, levelText, costText];
      this.scene.tweens.add({ targets: cardGroup, alpha: 1, duration: 300, delay: stagger, ease: "Power2" });

      // Interactivity (affordable only)
      if (affordable) {
        const cardHit = this.scene.add.zone(cx, cardY, cardW, cardH)
          .setScrollFactor(0).setDepth(DEPTH + 1).setInteractive({ useHandCursor: true });
        this.elements.push(cardHit);
        cardHit.on("pointerover", () => {
          cardBg.setFillStyle(0x17203a);
          cardBg.setStrokeStyle(3, typeColor);
          cardBg.setScale(1.04);
          iconText.setScale(1.1);
        });
        cardHit.on("pointerout", () => {
          cardBg.setFillStyle(0x101426);
          cardBg.setStrokeStyle(2, borderColor);
          cardBg.setScale(1.0);
          iconText.setScale(1.0);
        });
        cardHit.on("pointerdown", () => {
          cardHit.disableInteractive();
          onSelect(upgrade.id);
        });
      }
    });

    // ── Footer separator ─────────────────────────────────────────────────────
    const botSepY = cardY + cardH / 2 + 18;
    const botSep = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1).setAlpha(0.4);
    botSep.lineStyle(1, 0x00ff88, 0.20);
    botSep.lineBetween(panelX + 34, botSepY, panelX + panelW - 34, botSepY);
    this.elements.push(botSep);

    // ── Skip button (below cards, well clear of HUD) ──────────────────────────
    const skipH = 40;
    const skipY = botSepY + skipH / 2 + 14;
    const skipBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, skipY, 188, skipH, 0x150505)
      .setDepth(DEPTH).setScrollFactor(0)
      .setStrokeStyle(2, 0xff4433)
      .setAlpha(0);
    this.elements.push(skipBg);

    const skipHit = this.scene.add.zone(GAME_WIDTH / 2, skipY, 188, skipH)
      .setDepth(DEPTH + 1).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this.elements.push(skipHit);

    const skipLabel = this.scene.add
      .text(GAME_WIDTH / 2, skipY, "SKIP  [ESC]", {
        fontFamily: FONT, fontSize: "15px", color: COL.skip, fontStyle: "bold",
      })
      .setOrigin(0.5).setDepth(DEPTH).setScrollFactor(0).setAlpha(0);
    this.elements.push(skipLabel);
    this.scene.tweens.add({ targets: [skipBg, skipLabel], alpha: 1, duration: 300, delay: 420 });

    skipHit.on("pointerover", () => { skipBg.setFillStyle(0x3a1010); skipBg.setStrokeStyle(2, 0xff6655); });
    skipHit.on("pointerout", () => { skipBg.setFillStyle(0x150505); skipBg.setStrokeStyle(2, 0xff4433); });
    skipHit.on("pointerdown", () => {
      skipHit.disableInteractive();
      onSkip();
    });

    // ── Keyboard support ──────────────────────────────────────────────────────
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.isVisible) return;
      const key = e.key;

      if (key === "Escape" || key === " ") {
        onSkip();
        return;
      }

      const num = parseInt(key, 10);
      if (num >= 1 && num <= capped.length) {
        const upgrade = capped[num - 1];
        const affordable = scrap >= upgrade.cost && upgrade.currentLevel < upgrade.maxLevel;
        if (affordable) onSelect(upgrade.id);
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  hide(): void {
    for (const el of this.elements) {
      el.destroy();
    }
    this.elements = [];
    this.isVisible = false;

    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = undefined;
    }
  }
}
