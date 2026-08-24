import Phaser from "phaser";

// ── Typography hierarchy ──────────────────────────────────────────────────────
// Orbitron   → major titles, boss names, wave announcements
// Oxanium    → HUD bars, stats, ability labels, status text
// Rajdhani   → dialogue, lore text, descriptions
// Monospace  → debug overlays only
export const UI_ORBITRON = '"Orbitron", "Courier New", monospace';
export const UI_OXANIUM  = '"Oxanium", "Consolas", "Courier New", monospace';
export const UI_RAJDHANI = '"Rajdhani", "Segoe UI", Arial, sans-serif';
export const UI_FONT     = UI_RAJDHANI;
export const UI_MONO     = UI_OXANIUM;

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  // numerical
  cyan:    0x38d8ff,
  amber:   0xffbd55,
  red:     0xff4c3f,
  green:   0x00ff88,
  muted:   0x6f8990,
  ink:     0x020810,

  // hex strings
  cyanH:   "#38d8ff",
  amberH:  "#ffbd55",
  redH:    "#ff4c3f",
  greenH:  "#00ff88",
  mutedH:  "#6f8990",
  softH:   "#a9c4cf",
  inkH:    "#020810",
} as const;

// ── Font sizes (three levels + tiny) ─────────────────────────────────────────
export const FS = {
  xl:    "32px",  // major announce
  lg:    "18px",  // wave, boss name
  md:    "13px",  // score, primary values
  sm:    "11px",  // body, ability labels
  xs:    "9px",   // metadata, sub-labels
} as const;

// ── Opacity tokens ────────────────────────────────────────────────────────────
export const O = {
  glass:   0.22,   // panel fill
  border:  0.32,   // panel border
  accent:  0.42,   // accent glow
  dimText: 0.45,   // inactive text
} as const;

// ── Shared bracket corners ────────────────────────────────────────────────────
export function drawBrackets(
  gfx: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number, alpha: number, size = 10,
): void {
  gfx.lineStyle(1, color, alpha);
  // top-left
  gfx.lineBetween(x, y, x + size, y);
  gfx.lineBetween(x, y, x, y + size);
  // top-right
  gfx.lineBetween(x + w - size, y, x + w, y);
  gfx.lineBetween(x + w, y, x + w, y + size);
  // bottom-left
  gfx.lineBetween(x, y + h - size, x, y + h);
  gfx.lineBetween(x, y + h, x + size, y + h);
  // bottom-right
  gfx.lineBetween(x + w - size, y + h, x + w, y + h);
  gfx.lineBetween(x + w, y + h, x + w, y + h - size);
}

// ── Holographic glass panel ───────────────────────────────────────────────────
export function drawGlass(
  gfx: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  accent: number = C.cyan, radius = 4,
): void {
  gfx.clear();
  // fill
  gfx.fillStyle(C.ink, O.glass);
  gfx.fillRoundedRect(x, y, w, h, radius);
  // border
  gfx.lineStyle(1, accent, O.border);
  gfx.strokeRoundedRect(x, y, w, h, radius);
  // top accent line
  gfx.lineStyle(1, accent, 0.75);
  gfx.lineBetween(x + radius + 2, y, x + w - radius - 2, y);
  // corner brackets
  drawBrackets(gfx, x, y, w, h, accent, 0.65, 10);
}

// ── Text helpers ──────────────────────────────────────────────────────────────
export function fitTextWidth(
  text: Phaser.GameObjects.Text,
  maxWidth: number,
  minFontSize = 9,
): Phaser.GameObjects.Text {
  const rawSize = String(text.style.fontSize ?? "12px");
  let size = Number.parseFloat(rawSize.replace("px", "")) || 12;
  while (text.width > maxWidth && size > minFontSize) {
    size -= 1;
    text.setFontSize(`${size}px`);
  }
  return text;
}

export function constrainTextBlock(
  text: Phaser.GameObjects.Text,
  maxWidth: number,
  maxLines = 2,
  minFontSize = 10,
): Phaser.GameObjects.Text {
  text.setWordWrapWidth(maxWidth, true);
  text.setMaxLines(maxLines);
  return fitTextWidth(text, maxWidth, minFontSize);
}

// ── Tween helpers ─────────────────────────────────────────────────────────────
export function fadeIn(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration = 200): void {
  scene.tweens.add({ targets: target, alpha: { from: 0, to: 1 }, duration, ease: "Sine.easeOut" });
}

export function slideIn(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
  dx: number, dy: number,
  duration = 220,
): void {
  const tx = (target as Phaser.GameObjects.Text).x ?? 0;
  const ty = (target as Phaser.GameObjects.Text).y ?? 0;
  (target as Phaser.GameObjects.Text).setPosition(tx + dx, ty + dy);
  scene.tweens.add({
    targets: target,
    x: tx, y: ty,
    alpha: { from: 0, to: 1 },
    duration, ease: "Back.easeOut",
  });
}

// Legacy compat
export function drawPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number, y: number, width: number, height: number,
  accent: number = C.cyan, fill: number = C.ink, alpha: number = O.glass, radius = 8,
): void {
  drawGlass(graphics, x, y, width, height, accent, radius);
  void fill; void alpha;
}
