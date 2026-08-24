// ---------------------------------------------------------------------------
// DialogueUI — AI holographic comms panel (bottom-left)
// Lightweight glass strip: no thick borders, minimal decoration.
// x=24, y=GAME_HEIGHT-124 → w=380, h=68
// ---------------------------------------------------------------------------
import Phaser from "phaser";
import { GAME_HEIGHT } from "../core/GameConfig";
import type { DialogueLine, Speaker } from "../core/StoryData";
import { SPEAKER_CONFIG } from "../core/StoryData";
import { UI_MONO, UI_RAJDHANI, C, FS, constrainTextBlock } from "./UITheme";

interface QueuedLine { line: DialogueLine; startTime: number; }

const BOX_W   = 380;
const BOX_H   = 68;
const BOX_X   = 24;
const BOX_Y   = () => GAME_HEIGHT - BOX_H - 120;  // above command bar
const DEPTH   = 250;
const TYPE_MS = 22;

export class DialogueUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  private queue: QueuedLine[] = [];
  private activeIndex = -1;
  private lineStartedAt = 0;
  private typewriterPos = 0;
  private lastTypewriterTick = 0;

  private bodyText:    Phaser.GameObjects.Text | null = null;
  private bodyHomeX = 0;
  private waveGfx:    Phaser.GameObjects.Graphics | null = null;

  private isPlaying = false;
  private _forceHidden = false;

  constructor(scene: Phaser.Scene) { this.scene = scene; }

  enqueue(lines: DialogueLine[]): void {
    if (lines.length === 0) return;
    let cumDelay = 0;
    const items: QueuedLine[] = [];
    for (const line of lines) {
      cumDelay += (line.delay ?? 0);
      items.push({ line, startTime: cumDelay });
      cumDelay += (line.duration ?? 4500);
    }
    if (this.isPlaying && this.queue.length > 0) {
      const last = this.queue[this.queue.length - 1];
      const qEnd = last.startTime + (last.line.duration ?? 4500) + 400;
      for (const it of items) it.startTime += qEnd;
    }
    this.queue.push(...items);
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.lineStartedAt = this.scene.time.now;
      this.activeIndex = -1;
    }
  }

  say(speaker: Speaker, text: string, duration = 4500, emotion?: DialogueLine["emotion"]): void {
    this.enqueue([{ speaker, text, duration, emotion }]);
  }

  update(): void {
    if (!this.isPlaying || this.queue.length === 0) return;
    const elapsed = this.scene.time.now - this.lineStartedAt;

    let targetIndex = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const end = item.startTime + (item.line.duration ?? 4500);
      if (elapsed >= item.startTime && elapsed < end) { targetIndex = i; break; }
    }

    const last = this.queue[this.queue.length - 1];
    if (elapsed >= last.startTime + (last.line.duration ?? 4500)) { this._dismiss(); return; }
    if (targetIndex === -1) { if (this.container) this.container.setAlpha(0); return; }

    if (targetIndex !== this.activeIndex) {
      this.activeIndex = targetIndex;
      this.typewriterPos = 0;
      this.lastTypewriterTick = this.scene.time.now;
      this._build(this.queue[targetIndex].line);
    }

    if (this.container && this.bodyText) {
      const line = this.queue[this.activeIndex].line;
      const now  = this.scene.time.now;

      // Typewriter
      if (this.typewriterPos < line.text.length) {
        const ticks = Math.floor((now - this.lastTypewriterTick) / TYPE_MS);
        if (ticks > 0) {
          this.typewriterPos = Math.min(line.text.length, this.typewriterPos + ticks);
          this.bodyText.setText(line.text.substring(0, this.typewriterPos));
          this.lastTypewriterTick = now;
        }
      }

      // Waveform
      if (this.waveGfx) this._drawWave(this.waveGfx, line);

      // Fade out
      const lineStart   = this.queue[this.activeIndex].startTime;
      const lineDur     = line.duration ?? 4500;
      const lineElapsed = elapsed - lineStart;
      const fadeStart   = lineDur - 500;
      this.container.setAlpha(lineElapsed > fadeStart ? 1 - (lineElapsed - fadeStart) / 500 : 1);

      // Glitch jitter
      if (line.emotion === "glitch" && this.bodyText && Math.random() < 0.025) {
        this.bodyText.setX(this.bodyText.x + Phaser.Math.Between(-2, 2));
        this.scene.time.delayedCall(50, () => { if (this.bodyText) this.bodyText.setX(this.bodyHomeX); });
      }
    }
  }

  get playing(): boolean { return this.isPlaying; }
  clear(): void { this._dismiss(); }
  destroy(): void { this._dismiss(); }

  setVisible(visible: boolean): void {
    this._forceHidden = !visible;
    if (this.container) this.container.setVisible(visible);
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  private _build(line: DialogueLine): void {
    const scene = this.scene;
    const cfg   = SPEAKER_CONFIG[line.speaker];

    if (this.container) { this.container.destroy(true); this.container = null; }

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH).setAlpha(0);
    if (this._forceHidden) this.container.setVisible(false);

    const bx = BOX_X;
    const by = BOX_Y();
    const accentN = Phaser.Display.Color.HexStringToColor(cfg.color).color;

    // ── Glass backing ─────────────────────────────────────────────────────
    const bg = scene.add.graphics();
    bg.fillStyle(C.ink, 0.58);
    bg.fillRoundedRect(bx, by, BOX_W, BOX_H, 4);
    // Single top accent line
    bg.lineStyle(1, accentN, 0.7);
    bg.lineBetween(bx + 4, by, bx + BOX_W - 4, by);
    // Very faint border
    bg.lineStyle(1, accentN, 0.18);
    bg.strokeRoundedRect(bx, by, BOX_W, BOX_H, 4);
    // Left accent strip — 2px
    bg.fillStyle(accentN, 0.5);
    bg.fillRect(bx, by + 4, 2, BOX_H - 8);
    this.container.add(bg);

    // ── Portrait ──────────────────────────────────────────────────────────
    const portGfx = scene.add.graphics();
    portGfx.fillStyle(accentN, 0.08);
    portGfx.fillRoundedRect(bx + 6, by + 6, 38, BOX_H - 12, 3);
    portGfx.lineStyle(1, accentN, 0.25);
    portGfx.strokeRoundedRect(bx + 6, by + 6, 38, BOX_H - 12, 3);
    this.container.add(portGfx);

    const iconTxt = scene.add.text(bx + 25, by + BOX_H / 2 - 5, cfg.icon, {
      fontFamily: UI_MONO, fontSize: FS.md, color: cfg.color,
    }).setOrigin(0.5);
    this.container.add(iconTxt);

    // ── Name + emotion ────────────────────────────────────────────────────
    const emotionStr = this._emotionTag(line.emotion);
    const nameStr    = emotionStr ? `${cfg.label}  ${emotionStr}` : cfg.label;
    const nameTxt = scene.add.text(bx + 52, by + 7, nameStr, {
      fontFamily: UI_MONO, fontSize: FS.xs, color: cfg.color, fontStyle: "bold",
    });
    nameTxt.setAlpha(0.85);
    this.container.add(nameTxt);

    // ── Body ─────────────────────────────────────────────────────────────
    this.bodyHomeX = bx + 52;
    this.bodyText  = scene.add.text(this.bodyHomeX, by + 20, "", {
      fontFamily: UI_RAJDHANI, fontSize: "13px", color: C.softH,
      wordWrap: { width: BOX_W - 60, useAdvancedWrap: true },
      lineSpacing: 2,
    });
    constrainTextBlock(this.bodyText, BOX_W - 60, 2, 9);
    this.container.add(this.bodyText);

    // ── Waveform ─────────────────────────────────────────────────────────
    this.waveGfx = scene.add.graphics();
    this.container.add(this.waveGfx);

    // Slide in from left + fade
    const startX = this.container.x;
    this.container.setX(startX - 12);
    scene.tweens.add({
      targets: this.container,
      x: startX, alpha: 1,
      duration: 220, ease: "Back.easeOut",
    });
  }

  // ─── Waveform ────────────────────────────────────────────────────────────────

  private _drawWave(gfx: Phaser.GameObjects.Graphics, line: DialogueLine): void {
    const cfg    = SPEAKER_CONFIG[line.speaker];
    const accentN = Phaser.Display.Color.HexStringToColor(cfg.color).color;
    const bx = BOX_X, by = BOX_Y();
    const wx = bx + 52, wy = by + BOX_H - 9;
    const ww = BOX_W - 60, wh = 5;

    gfx.clear();
    const bars = 26, bw = Math.floor(ww / bars) - 1;
    for (let i = 0; i < bars; i++) {
      const t   = performance.now() * 0.003 + i * 0.65;
      const amp = line.emotion === "glitch"
        ? (Math.sin(t * 3.2 + i) * 0.5 + 0.5) * (Math.random() < 0.05 ? 1.8 : 1)
        : (Math.sin(t + i * 0.38) * 0.5 + 0.5);
      const bh  = Math.max(1, Math.round(amp * wh));
      gfx.fillStyle(accentN, 0.18 + amp * 0.42);
      gfx.fillRect(wx + i * (bw + 1), wy - bh + 1, bw, bh);
    }
  }

  // ─── Dismiss ─────────────────────────────────────────────────────────────────

  private _dismiss(): void {
    if (this.container) {
      const c = this.container;
      this.scene.tweens.add({
        targets: c, alpha: 0, x: c.x - 10,
        duration: 250, ease: "Sine.easeIn",
        onComplete: () => c.destroy(true),
      });
      this.container = null;
    }
    this.queue = []; this.activeIndex = -1; this.isPlaying = false;
  }

  private _emotionTag(emotion?: string): string {
    switch (emotion) {
      case "angry":  return "[HOSTILE]";
      case "glitch": return "[UNSTABLE]";
      case "warm":   return "[SECURE]";
      case "urgent": return "[PRIORITY]";
      case "cold":   return "[ENCRYPTED]";
      default:       return "";
    }
  }
}
