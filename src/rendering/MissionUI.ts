import Phaser from "phaser";
import type { Mission } from "../core/MissionSystem";
import { GAME_WIDTH } from "../core";

// ---------------------------------------------------------------------------
// MissionUI — Right-side mission tracker panel
// ---------------------------------------------------------------------------

const PANEL_X = GAME_WIDTH - 180;
const PANEL_Y = 200;
const PANEL_W = 168;
const ROW_H = 52;
const BAR_W = 148;
const BAR_H = 6;
const DEPTH = 100;

interface MissionSlot {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  progressText: Phaser.GameObjects.Text;
  missionId: string | null;
}

export class MissionUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private slots: MissionSlot[] = [];
  private completeTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);

    // Header label above mission slots
    const header = scene.add.text(PANEL_X + 4, PANEL_Y - 16, "▸ OBJECTIVES", {
      fontFamily: "monospace", fontSize: "10px",
      color: "#ff8800cc", fontStyle: "bold", letterSpacing: 1,
    }).setOrigin(0, 0);
    const headerLine = scene.add.rectangle(PANEL_X, PANEL_Y - 3, PANEL_W, 1, 0xff880044, 1).setOrigin(0, 0);
    this.container.add([header, headerLine]);

    for (let i = 0; i < 3; i++) {
      const y = PANEL_Y + i * (ROW_H + 4);

      const bg = scene.add.rectangle(PANEL_X, y, PANEL_W, ROW_H, 0x111111, 0.75)
        .setOrigin(0, 0).setStrokeStyle(1, 0x333333);

      const title = scene.add.text(PANEL_X + 6, y + 4, "", {
        fontFamily: "monospace", fontSize: "11px",
        color: "#ff8800", fontStyle: "bold",
      }).setOrigin(0, 0);

      const barBg = scene.add.rectangle(PANEL_X + 10, y + 22, BAR_W, BAR_H, 0x222222, 0.9)
        .setOrigin(0, 0);

      const barFill = scene.add.rectangle(PANEL_X + 10, y + 22, 0, BAR_H, 0xff6600, 1)
        .setOrigin(0, 0);

      const progressText = scene.add.text(PANEL_X + 10, y + 32, "", {
        fontFamily: "monospace", fontSize: "10px",
        color: "#aaaaaa",
      }).setOrigin(0, 0);

      this.container.add([bg, title, barBg, barFill, progressText]);
      this.slots.push({ bg, title, barBg, barFill, progressText, missionId: null });
    }
  }

  update(missions: readonly Mission[]): void {
    for (let i = 0; i < 3; i++) {
      const slot = this.slots[i];
      const m = missions[i];
      if (!m) {
        slot.bg.setVisible(false);
        slot.title.setVisible(false);
        slot.barBg.setVisible(false);
        slot.barFill.setVisible(false);
        slot.progressText.setVisible(false);
        slot.missionId = null;
        continue;
      }

      slot.bg.setVisible(true);
      slot.title.setVisible(true);
      slot.barBg.setVisible(true);
      slot.barFill.setVisible(true);
      slot.progressText.setVisible(true);

      slot.title.setText(m.title);
      const ratio = Math.min(1, m.progress / m.target);
      slot.barFill.width = BAR_W * ratio;

      const displayed = Math.min(m.progress, m.target);
      slot.progressText.setText(`${displayed}/${m.target}`);

      // Color based on progress
      if (ratio >= 1) {
        slot.barFill.setFillStyle(0x00ff88, 1);
        slot.title.setColor("#00ff88");
      } else if (ratio > 0.6) {
        slot.barFill.setFillStyle(0x44ccff, 1);
        slot.title.setColor("#44ccff");
      } else {
        slot.barFill.setFillStyle(0xff6600, 1);
        slot.title.setColor("#ff8800");
      }

      slot.missionId = m.id;
    }
  }

  showCompletion(mission: Mission): void {
    const txt = this.scene.add.text(
      PANEL_X + PANEL_W / 2, PANEL_Y - 10,
      `✓ ${mission.title}\n+${mission.reward.scrap}⬡  +${mission.reward.scoreBonus}pts`,
      {
        fontFamily: "monospace", fontSize: "12px",
        color: "#00ff88", fontStyle: "bold",
        align: "center",
        backgroundColor: "#111111cc",
        padding: { x: 6, y: 4 },
      }
    ).setOrigin(0.5, 1).setDepth(DEPTH + 1).setScrollFactor(0);

    this.completeTexts.push(txt);

    this.scene.tweens.add({
      targets: txt,
      y: txt.y - 30,
      alpha: 0,
      duration: 2000,
      delay: 800,
      ease: "Power2",
      onComplete: () => {
        const idx = this.completeTexts.indexOf(txt);
        if (idx >= 0) this.completeTexts.splice(idx, 1);
        txt.destroy();
      },
    });
  }

  destroy(): void {
    for (const t of this.completeTexts) t.destroy();
    this.completeTexts.length = 0;
    this.container.destroy(true);
  }
}
