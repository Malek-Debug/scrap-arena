import Phaser from "phaser";
import { UI_MONO, FS } from "../../rendering/UITheme";

const GAME_WIDTH = 1280;
const MAX_ENTRIES = 5;
const ENTRY_HEIGHT = 22;
const ENTRY_HOLD_MS = 5000;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 400;
const SLIDE_OFFSET = 80;

interface KillEntry {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  age: number;
  fading: boolean;
}

export class KillFeed {
  private scene: Phaser.Scene;
  private entries: KillEntry[] = [];
  private readonly startX = GAME_WIDTH - 16;
  private readonly startY = 60;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  addKill(killerName: string, victimName: string, killerColor: number, victimColor: number): void {
    const killerHex = Phaser.Display.Color.IntegerToColor(killerColor).rgba;
    const victimHex = Phaser.Display.Color.IntegerToColor(victimColor).rgba;

    const container = this.scene.add.container(this.startX + SLIDE_OFFSET, this.startY)
      .setDepth(220).setScrollFactor(0).setAlpha(0);

    const text = this.scene.add.text(0, 0, "", {
      fontFamily: UI_MONO,
      fontSize: FS.xs,
      color: "#ffffff",
    }).setOrigin(1, 0);

    // Rich text via setColor workaround: we draw two text objects
    const killerText = this.scene.add.text(0, 3, killerName, {
      fontFamily: UI_MONO, fontSize: FS.xs, color: killerHex,
      fontStyle: "bold",
    }).setOrigin(1, 0);

    const arrowText = this.scene.add.text(0, 3, " ► ", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: "#888888",
    }).setOrigin(1, 0);

    const victimText = this.scene.add.text(0, 3, victimName, {
      fontFamily: UI_MONO, fontSize: FS.xs, color: victimHex,
      fontStyle: "bold",
    }).setOrigin(1, 0);

    // Position from right: victim | arrow | killer
    victimText.setX(0);
    arrowText.setX(-victimText.width);
    killerText.setX(-victimText.width - arrowText.width);

    const totalW = killerText.width + arrowText.width + victimText.width;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x020810, 0.75);
    bg.fillRoundedRect(-totalW - 12, 0, totalW + 20, ENTRY_HEIGHT - 2, 3);
    bg.lineStyle(1, killerColor, 0.4);
    bg.strokeRoundedRect(-totalW - 12, 0, totalW + 20, ENTRY_HEIGHT - 2, 3);

    container.add([bg, killerText, arrowText, victimText]);
    text.destroy();

    const entry: KillEntry = { container, bg, text: killerText, age: 0, fading: false };

    // Push existing entries up
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      const removed = this.entries.pop()!;
      removed.container.destroy(true);
    }

    this._repositionEntries();

    // Animate in
    this.scene.tweens.add({
      targets: container,
      x: this.startX,
      alpha: 1,
      duration: FADE_IN_MS,
      ease: "Back.easeOut",
    });
  }

  update(delta: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.age += delta;

      if (!entry.fading && entry.age >= ENTRY_HOLD_MS) {
        entry.fading = true;
        this.scene.tweens.add({
          targets: entry.container,
          alpha: 0,
          y: entry.container.y - 10,
          duration: FADE_OUT_MS,
          ease: "Quad.easeIn",
          onComplete: () => {
            entry.container.destroy(true);
          },
        });
        this.entries.splice(i, 1);
      }
    }
  }

  private _repositionEntries(): void {
    for (let i = 0; i < this.entries.length; i++) {
      const targetY = this.startY + i * ENTRY_HEIGHT;
      const entry = this.entries[i];
      if (entry.container.y !== targetY) {
        this.scene.tweens.add({
          targets: entry.container,
          y: targetY,
          duration: 150,
          ease: "Quad.easeOut",
        });
      }
    }
  }

  destroy(): void {
    for (const entry of this.entries) {
      entry.container.destroy(true);
    }
    this.entries = [];
  }
}
