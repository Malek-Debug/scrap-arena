import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";

interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  cost: number;
  maxLevel: number;
  currentLevel: number;
}

const DEPTH = 200;
const FONT = "monospace";

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
  card_factory: "⊞", card_server: "⊞", card_power: "⊞", card_control: "⊞", card_maintenance: "⊞",
};

const UPGRADE_COLORS: Record<string, number> = {
  speed: 0x00ccff, damage: 0xff4444, maxHp: 0x00ff88, fireRate: 0xffcc00,
  pickupRange: 0xaa44ff, multiShot: 0xff6600, armor: 0x44ff88, phaseMastery: 0xcc44ff, rapidFire: 0xff2244,
  card_factory: 0x00ff88, card_server: 0x44aaff, card_power: 0x00ffcc, card_control: 0xffcc44, card_maintenance: 0xaaaaaa,
};

const UPGRADE_COLOR_HEX: Record<string, string> = {
  speed: "#00ccff", damage: "#ff4444", maxHp: "#00ff88", fireRate: "#ffcc00",
  pickupRange: "#aa44ff", multiShot: "#ff6600", armor: "#44ff88", phaseMastery: "#cc44ff", rapidFire: "#ff2244",
  card_factory: "#00ff88", card_server: "#44aaff", card_power: "#00ffcc", card_control: "#ffcc44", card_maintenance: "#aaaaaa",
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

    // Dark overlay
    const overlay = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85)
      .setDepth(DEPTH)
      .setScrollFactor(0);
    this.elements.push(overlay);

    // Title
    const title = this.scene.add
      .text(GAME_WIDTH / 2, 50, "⚙ UPGRADE SYSTEMS ⚙", {
        fontFamily: FONT,
        fontSize: "32px",
        color: COL.green,
        fontStyle: "bold",
        stroke: "#003322",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setScrollFactor(0);
    this.elements.push(title);

    // Scrap display
    const scrapText = this.scene.add
      .text(GAME_WIDTH / 2, 95, `⬡ SCRAP: ${scrap}`, {
        fontFamily: FONT,
        fontSize: "20px",
        color: COL.scrap,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setScrollFactor(0);
    this.elements.push(scrapText);

    // Card layout
    const cardW = 210;
    const cardH = 260;
    const gap = 16;
    const count = capped.length;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const cardY = GAME_HEIGHT / 2 - 10;

    capped.forEach((upgrade, i) => {
      const cx = startX + i * (cardW + gap);
      const affordable = scrap >= upgrade.cost && upgrade.currentLevel < upgrade.maxLevel;
      const maxed = upgrade.currentLevel >= upgrade.maxLevel;
      const typeColor = UPGRADE_COLORS[upgrade.id] ?? 0x00ff88;
      const typeColorHex = UPGRADE_COLOR_HEX[upgrade.id] ?? COL.green;
      const icon = UPGRADE_ICONS[upgrade.id] ?? "◈";
      const borderColor = maxed ? 0x555555 : affordable ? typeColor : 0x555555;

      // Card background
      const cardBg = this.scene.add
        .rectangle(cx, cardY, cardW, cardH, COL.cardBg)
        .setDepth(DEPTH)
        .setScrollFactor(0)
        .setStrokeStyle(2, borderColor);
      this.elements.push(cardBg);

      // Number key hint
      const keyHint = this.scene.add
        .text(cx, cardY - cardH / 2 + 18, `[${i + 1}]`, {
          fontFamily: FONT,
          fontSize: "14px",
          color: affordable ? COL.cyan : COL.dimText,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setScrollFactor(0);
      this.elements.push(keyHint);

      // Icon
      const iconText = this.scene.add
        .text(cx, cardY - cardH / 2 + 55, icon, {
          fontFamily: FONT,
          fontSize: "26px",
          color: affordable ? typeColorHex : COL.dimText,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setScrollFactor(0);
      this.elements.push(iconText);

      // Name
      const nameText = this.scene.add
        .text(cx, cardY - cardH / 2 + 90, upgrade.name, {
          fontFamily: FONT,
          fontSize: "16px",
          color: affordable ? typeColorHex : COL.dimText,
          fontStyle: "bold",
          wordWrap: { width: cardW - 20 },
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setScrollFactor(0);
      this.elements.push(nameText);

      // Description
      const descText = this.scene.add
        .text(cx, cardY - 10, upgrade.description, {
          fontFamily: FONT,
          fontSize: "12px",
          color: affordable ? COL.white : COL.dimText,
          wordWrap: { width: cardW - 24 },
          align: "center",
          lineSpacing: 4,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setScrollFactor(0);
      this.elements.push(descText);

      // Level
      const levelStr = maxed
        ? "MAX LEVEL"
        : `Lv ${upgrade.currentLevel} → ${upgrade.currentLevel + 1}`;
      const levelText = this.scene.add
        .text(cx, cardY + cardH / 2 - 55, levelStr, {
          fontFamily: FONT,
          fontSize: "13px",
          color: maxed ? COL.scrap : affordable ? COL.cyan : COL.dimText,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setScrollFactor(0);
      this.elements.push(levelText);

      // Cost
      const costStr = maxed ? "---" : `⬡ ${upgrade.cost}`;
      const costText = this.scene.add
        .text(cx, cardY + cardH / 2 - 30, costStr, {
          fontFamily: FONT,
          fontSize: "14px",
          color: affordable ? COL.scrap : COL.dimText,
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setScrollFactor(0);
      this.elements.push(costText);

      // Interactivity
      if (affordable) {
        cardBg.setInteractive({ useHandCursor: true });
        cardBg.on("pointerover", () => {
          cardBg.setFillStyle(0x2a2a4e);
          cardBg.setScale(1.05);
        });
        cardBg.on("pointerout", () => {
          cardBg.setFillStyle(COL.cardBg);
          cardBg.setScale(1.0);
        });
        cardBg.on("pointerdown", () => {
          onSelect(upgrade.id);
        });
      }
    });

    // Skip button
    const skipW = 160;
    const skipH = 44;
    const skipY = GAME_HEIGHT - 60;
    const skipBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, skipY, skipW, skipH, 0x332222)
      .setDepth(DEPTH)
      .setScrollFactor(0)
      .setStrokeStyle(2, 0xff6655)
      .setInteractive({ useHandCursor: true });
    this.elements.push(skipBg);

    const skipLabel = this.scene.add
      .text(GAME_WIDTH / 2, skipY, "SKIP  [ESC]", {
        fontFamily: FONT,
        fontSize: "18px",
        color: COL.skip,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setScrollFactor(0);
    this.elements.push(skipLabel);

    skipBg.on("pointerover", () => { skipBg.setFillStyle(0x552233); skipBg.setScale(1.05); });
    skipBg.on("pointerout", () => { skipBg.setFillStyle(0x332222); skipBg.setScale(1.0); });
    skipBg.on("pointerdown", () => onSkip());

    // Keyboard support
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
        if (affordable) {
          onSelect(upgrade.id);
        }
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
