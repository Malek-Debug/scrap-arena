// ---------------------------------------------------------------------------
// DialogueUI — Codec-style transmission overlay for narrative dialogue
// ---------------------------------------------------------------------------
import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core/GameConfig";
import type { DialogueLine, Speaker } from "../core/StoryData";
import { SPEAKER_CONFIG } from "../core/StoryData";

interface QueuedLine {
  line: DialogueLine;
  startTime: number;  // when this line should start (cumulative ms from queue start)
}

/**
 * DialogueUI renders a non-blocking codec-style transmission panel.
 * - Bottom-left of screen with speaker icon, name label, and typewriter text
 * - Supports queuing multiple lines that play sequentially
 * - Two visual styles: ARIA (red/amber) and VERA (cyan/green)
 * - Player can still move during dialogues
 */
export class DialogueUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  // Active line state
  private queue: QueuedLine[] = [];
  private activeIndex = -1;
  private lineStartedAt = 0;
  private typewriterPos = 0;
  private lastTypewriterTick = 0;

  // UI elements (recreated per line)
  private bgRect: Phaser.GameObjects.Graphics | null = null;
  private iconText: Phaser.GameObjects.Text | null = null;
  private nameText: Phaser.GameObjects.Text | null = null;
  private bodyText: Phaser.GameObjects.Text | null = null;
  private borderLine: Phaser.GameObjects.Graphics | null = null;
  private scanLine: Phaser.GameObjects.Rectangle | null = null;

  // Config
  private static readonly BOX_W = 490;
  private static readonly BOX_H = 80;
  private static readonly MARGIN = 16;
  private static readonly TYPE_SPEED = 28; // ms per character
  private static readonly DEPTH = 250;

  private isPlaying = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Queue a sequence of dialogue lines to display */
  enqueue(lines: DialogueLine[]): void {
    if (lines.length === 0) return;

    let cumulativeDelay = 0;
    const newItems: QueuedLine[] = [];

    for (const line of lines) {
      cumulativeDelay += (line.delay ?? 0);
      newItems.push({ line, startTime: cumulativeDelay });
      // Next line starts after this one's duration
      cumulativeDelay += (line.duration ?? 4500);
    }

    // If already playing, offset new items to start after current queue
    if (this.isPlaying && this.queue.length > 0) {
      const lastItem = this.queue[this.queue.length - 1];
      const queueEnd = lastItem.startTime + (lastItem.line.duration ?? 4500) + 500; // 500ms gap
      for (const item of newItems) {
        item.startTime += queueEnd;
      }
    }

    this.queue.push(...newItems);

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.lineStartedAt = this.scene.time.now;
      this.activeIndex = -1;
    }
  }

  /** Enqueue a single line */
  say(speaker: Speaker, text: string, duration = 4500, emotion?: DialogueLine["emotion"]): void {
    this.enqueue([{ speaker, text, duration, emotion }]);
  }

  /** Call each frame */
  update(): void {
    if (!this.isPlaying || this.queue.length === 0) return;

    const elapsed = this.scene.time.now - this.lineStartedAt;

    // Find which line should be active based on elapsed time
    let targetIndex = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const lineEnd = item.startTime + (item.line.duration ?? 4500);
      if (elapsed >= item.startTime && elapsed < lineEnd) {
        targetIndex = i;
        break;
      }
    }

    // Check if we're past all lines
    const lastItem = this.queue[this.queue.length - 1];
    const totalEnd = lastItem.startTime + (lastItem.line.duration ?? 4500);
    if (elapsed >= totalEnd) {
      this._dismiss();
      return;
    }

    // No active line right now (in a gap between lines)
    if (targetIndex === -1) {
      if (this.container) {
        this.container.setAlpha(0);
      }
      return;
    }

    // New line activated
    if (targetIndex !== this.activeIndex) {
      this.activeIndex = targetIndex;
      this.typewriterPos = 0;
      this.lastTypewriterTick = this.scene.time.now;
      this._buildLineUI(this.queue[targetIndex].line);
    }

    // Typewriter effect
    if (this.container && this.bodyText) {
      const line = this.queue[this.activeIndex].line;
      const fullText = line.text;
      const now = this.scene.time.now;

      if (this.typewriterPos < fullText.length) {
        const ticksPassed = Math.floor((now - this.lastTypewriterTick) / DialogueUI.TYPE_SPEED);
        if (ticksPassed > 0) {
          this.typewriterPos = Math.min(fullText.length, this.typewriterPos + ticksPassed);
          this.bodyText.setText(fullText.substring(0, this.typewriterPos));
          this.lastTypewriterTick = now;
        }
      }

      // Fade out near end of line duration
      const lineStart = this.queue[this.activeIndex].startTime;
      const lineDur = line.duration ?? 4500;
      const lineElapsed = elapsed - lineStart;
      const fadeStart = lineDur - 600;
      if (lineElapsed > fadeStart) {
        const fadeProgress = (lineElapsed - fadeStart) / 600;
        this.container.setAlpha(1 - fadeProgress);
      } else {
        this.container.setAlpha(1);
      }

      // Glitch effect for "glitch" emotion
      if (line.emotion === "glitch" && this.bodyText) {
        if (Math.random() < 0.03) {
          this.bodyText.setX(this.bodyText.x + Phaser.Math.Between(-2, 2));
          this.scene.time.delayedCall(50, () => {
            if (this.bodyText) this.bodyText.setX(74);
          });
        }
      }
    }
  }

  /** Check if dialogue is currently playing */
  get playing(): boolean {
    return this.isPlaying;
  }

  /** Force clear all dialogue */
  clear(): void {
    this._dismiss();
  }

  destroy(): void {
    this._dismiss();
  }

  // ─── Internal ─────────────────────────────────────────────────

  private _buildLineUI(line: DialogueLine): void {
    const scene = this.scene;
    const cfg = SPEAKER_CONFIG[line.speaker];
    const { BOX_W, BOX_H, MARGIN, DEPTH } = DialogueUI;

    // Destroy previous container
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }

    this.container = scene.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setAlpha(0);

    const x = MARGIN;
    const y = GAME_HEIGHT - BOX_H - MARGIN - 80; // clear of ability strip

    // Background
    this.bgRect = scene.add.graphics();
    this.bgRect.fillStyle(cfg.bgColor, 0.92);
    this.bgRect.fillRoundedRect(x, y, BOX_W, BOX_H, 6);
    this.bgRect.lineStyle(1, Phaser.Display.Color.HexStringToColor(cfg.color).color, 0.7);
    this.bgRect.strokeRoundedRect(x, y, BOX_W, BOX_H, 6);
    this.container.add(this.bgRect);

    // Top accent line
    this.borderLine = scene.add.graphics();
    this.borderLine.fillStyle(Phaser.Display.Color.HexStringToColor(cfg.color).color, 0.8);
    this.borderLine.fillRect(x + 2, y, BOX_W - 4, 2);
    this.container.add(this.borderLine);

    // Speaker icon (left side)
    const iconBg = scene.add.graphics();
    iconBg.fillStyle(Phaser.Display.Color.HexStringToColor(cfg.color).color, 0.15);
    iconBg.fillRoundedRect(x + 8, y + 8, 52, BOX_H - 16, 4);
    iconBg.lineStyle(1, Phaser.Display.Color.HexStringToColor(cfg.color).color, 0.4);
    iconBg.strokeRoundedRect(x + 8, y + 8, 52, BOX_H - 16, 4);
    this.container.add(iconBg);

    this.iconText = scene.add.text(x + 34, y + BOX_H / 2 - 10, cfg.icon, {
      fontFamily: "monospace", fontSize: "20px", color: cfg.color,
    }).setOrigin(0.5);
    this.container.add(this.iconText);

    // Speaker name label
    this.nameText = scene.add.text(x + 74, y + 8, cfg.label, {
      fontFamily: "monospace", fontSize: "10px", color: cfg.color,
      fontStyle: "bold",
    });
    this.container.add(this.nameText);

    // Emotion indicator
    const emotionLabel = this._emotionLabel(line.emotion);
    if (emotionLabel) {
      const emoText = scene.add.text(x + 74 + cfg.label.length * 7 + 12, y + 8, emotionLabel, {
        fontFamily: "monospace", fontSize: "9px", color: cfg.color,
      }).setAlpha(0.5);
      this.container.add(emoText);
    }

    // Body text (typewriter)
    this.bodyText = scene.add.text(x + 74, y + 24, "", {
      fontFamily: "monospace", fontSize: "12px", color: "#cccccc",
      wordWrap: { width: BOX_W - 90 },
      lineSpacing: 3,
    });
    this.container.add(this.bodyText);

    // Scan line effect
    this.scanLine = scene.add.rectangle(x + BOX_W / 2, y, BOX_W - 4, 1,
      Phaser.Display.Color.HexStringToColor(cfg.color).color, 0.15);
    this.container.add(this.scanLine);
    scene.tweens.add({
      targets: this.scanLine,
      y: y + BOX_H,
      duration: 2000,
      repeat: -1,
      ease: "Linear",
    });

    // Fade in
    scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 200,
    });
  }

  private _dismiss(): void {
    if (this.container) {
      const c = this.container;
      this.scene.tweens.add({
        targets: c,
        alpha: 0,
        duration: 300,
        onComplete: () => c.destroy(true),
      });
      this.container = null;
    }
    this.queue = [];
    this.activeIndex = -1;
    this.isPlaying = false;
  }

  private _emotionLabel(emotion?: string): string {
    switch (emotion) {
      case "angry": return "[HOSTILE]";
      case "glitch": return "[SIGNAL UNSTABLE]";
      case "warm": return "[SECURE CHANNEL]";
      case "urgent": return "[PRIORITY]";
      case "cold": return "[ENCRYPTED]";
      default: return "";
    }
  }
}
