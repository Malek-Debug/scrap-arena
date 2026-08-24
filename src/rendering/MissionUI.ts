import Phaser from "phaser";
import type { Mission } from "../core/MissionSystem";
import { UI_MONO, C, FS, constrainTextBlock, fitTextWidth } from "./UITheme";

// ---------------------------------------------------------------------------
// MissionUI — left-side compact mission tracker
// x=24, y=160 — floats without heavy backgrounds; stacks up to 3 slots
// ---------------------------------------------------------------------------

const SLOT_W  = 192;
const SLOT_X  = 24;
const FIRST_Y = 160;
const ROW_H   = 52;
const GAP     = 4;
const BAR_W   = SLOT_W - 8;
const BAR_H   = 2;
const DEPTH   = 100;

interface MissionSlot {
  gfx: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  rewardText: Phaser.GameObjects.Text;
  missionId: string | null;
  prevAccent: number;
  visible: boolean;
}

export class MissionUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private slots: MissionSlot[] = [];
  private completeTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);

    // Compact section label — no panel, just dim text
    const header = scene.add.text(SLOT_X, FIRST_Y - 16, "OBJECTIVES", {
      fontFamily: UI_MONO, fontSize: FS.xs,
      color: C.cyanH, fontStyle: "bold",
      letterSpacing: 2,
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(DEPTH).setAlpha(0.3);
    this.container.add(header);

    for (let i = 0; i < 3; i++) {
      const y = FIRST_Y + i * (ROW_H + GAP);

      const gfx = scene.add.graphics();

      const title = scene.add.text(SLOT_X + 10, y + 5, "", {
        fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
        wordWrap: { width: SLOT_W - 14, useAdvancedWrap: true },
      }).setOrigin(0, 0);

      const barBg = scene.add.rectangle(SLOT_X + 4, y + ROW_H - 12, BAR_W, BAR_H, C.ink, 1)
        .setOrigin(0, 0);

      const barFill = scene.add.rectangle(SLOT_X + 4, y + ROW_H - 12, 0, BAR_H, C.cyan, 1)
        .setOrigin(0, 0);

      const rewardText = scene.add.text(SLOT_X + 4, y + ROW_H - 8, "", {
        fontFamily: UI_MONO, fontSize: FS.xs, color: C.mutedH,
      }).setOrigin(0, 0);

      this.container.add([gfx, title, barBg, barFill, rewardText]);
      this.slots.push({
        gfx, title, barBg, barFill, rewardText,
        missionId: null, prevAccent: C.cyan, visible: false,
      });
    }
  }

  update(missions: readonly Mission[]): void {
    for (let i = 0; i < 3; i++) {
      const slot = this.slots[i];
      const m    = missions[i];
      const now  = !!m;

      // Animate visibility transitions
      if (now !== slot.visible) {
        slot.visible = now;
        const objs = [slot.gfx, slot.title, slot.barBg, slot.barFill, slot.rewardText];
        if (now) {
          objs.forEach(o => { o.setVisible(true); (o as Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Graphics).setAlpha(0); });
          this.scene.tweens.add({ targets: objs, alpha: 1, duration: 250, ease: "Sine.easeOut" });
        } else {
          this.scene.tweens.add({
            targets: objs, alpha: 0, duration: 180,
            onComplete: () => objs.forEach(o => o.setVisible(false)),
          });
          slot.missionId = null;
          continue;
        }
      }
      if (!now) continue;

      const y     = FIRST_Y + i * (ROW_H + GAP);
      const ratio = Math.min(1, m!.progress / m!.target);

      // Accent based on progress: amber early → cyan mid → green complete
      const accent = ratio >= 1 ? C.green : ratio > 0.55 ? C.cyan : C.amber;

      if (accent !== slot.prevAccent) {
        slot.prevAccent = accent;
        this._drawSlot(slot.gfx, SLOT_X, y, SLOT_W, ROW_H - 2, accent);
      }
      if (slot.missionId !== m!.id) {
        slot.missionId = m!.id;
        this._drawSlot(slot.gfx, SLOT_X, y, SLOT_W, ROW_H - 2, accent);
      }

      const accentH = `#${accent.toString(16).padStart(6, "0")}`;
      slot.title.setText(m!.title).setColor(accentH);
      constrainTextBlock(slot.title, SLOT_W - 14, 2, 8);

      slot.barFill.width = BAR_W * ratio;
      slot.barFill.setFillStyle(accent, ratio >= 1 ? 0.65 : 0.9);

      slot.rewardText.setText(`${Math.min(m!.progress, m!.target)} / ${m!.target}  +${m!.reward.scrap}⬡`);
      fitTextWidth(slot.rewardText, SLOT_W - 8, 8);
    }
  }

  showCompletion(mission: Mission): void {
    const txt = this.scene.add.text(
      SLOT_X + SLOT_W / 2,
      FIRST_Y,
      `✓  ${mission.title}  +${mission.reward.scrap}⬡`,
      {
        fontFamily: UI_MONO, fontSize: FS.xs,
        color: C.greenH,
        backgroundColor: "#020810bb",
        padding: { x: 8, y: 5 },
      }
    ).setOrigin(0.5, 1).setDepth(DEPTH + 2).setScrollFactor(0).setAlpha(0);

    this.completeTexts.push(txt);
    this.scene.tweens.add({
      targets: txt, alpha: 1, y: txt.y - 4,
      duration: 250, ease: "Sine.easeOut",
      onComplete: () => {
        this.scene.tweens.add({
          targets: txt, alpha: 0, y: txt.y - 24,
          duration: 600, delay: 1200, ease: "Power2",
          onComplete: () => {
            const idx = this.completeTexts.indexOf(txt);
            if (idx >= 0) this.completeTexts.splice(idx, 1);
            txt.destroy();
          },
        });
      },
    });
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    for (const t of this.completeTexts) t.destroy();
    this.completeTexts.length = 0;
    this.container.destroy(true);
  }

  // ─── Slot rendering — minimal glass strip ────────────────────────────────

  private _drawSlot(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    accent: number,
  ): void {
    gfx.clear();

    // Very faint fill — just enough to separate from world
    gfx.fillStyle(C.ink, 0.18);
    gfx.fillRect(x, y, w, h);

    // Single top accent line
    gfx.lineStyle(1, accent, 0.55);
    gfx.lineBetween(x + 4, y, x + w - 4, y);

    // Left accent strip
    gfx.fillStyle(accent, 0.6);
    gfx.fillRect(x, y, 2, h);

    // Bottom right corner bracket only — minimal decoration
    gfx.lineStyle(1, accent, 0.3);
    gfx.lineBetween(x + w - 8, y + h, x + w, y + h);
    gfx.lineBetween(x + w, y + h, x + w, y + h - 8);
  }
}
