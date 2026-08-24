import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from "../core";
import { UI_MONO, C, FS, O } from "./UITheme";

// ---------------------------------------------------------------------------
// EnemyRadar — bottom-right radar disc  cx=1196, cy=646, r=50
// Features: rotating sweep line, pulsing enemy dots, player facing arrow,
//           animated grid, clean cardinal ticks, threat label, count label.
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, number> = {
  enemy:    C.red,
  guard:    0xcc44ff,
  collector:C.cyan,
  turret:   C.amber,
  sawblade: 0xa9c4cf,
  welder:   C.amber,
  boss:     0xff0000,
};

const ARROW_SIZE    = 8;
const EDGE_MARGIN   = 22;
const FADE_DISTANCE = 600;
const MIN_ALPHA     = 0.35;

const RCX = 1196;
const RCY = 646;
const R   = 50;

const SCALE_X = (R * 2) / WORLD_WIDTH;
const SCALE_Y = (R * 2) / WORLD_HEIGHT;

interface EnemyInfo {
  posX: number; posY: number; type: string; isDead?: boolean;
}

export class EnemyRadar {
  private arrowGfx:   Phaser.GameObjects.Graphics;
  private radarGfx:   Phaser.GameObjects.Graphics;
  private labelText:  Phaser.GameObjects.Text;
  private threatLabel: Phaser.GameObjects.Text;
  private countLabel:  Phaser.GameObjects.Text;

  // Sweep angle — incremented each frame
  private _sweepAngle = 0;
  // Per-enemy pulse phase for blinking dots
  private _dotPhase: number[] = [];

  constructor(scene: Phaser.Scene) {
    this.arrowGfx = scene.add.graphics().setScrollFactor(0).setDepth(200);
    this.radarGfx = scene.add.graphics().setScrollFactor(0).setDepth(201);

    this.labelText = scene.add.text(RCX, RCY - R - 7, "RADAR", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(201).setAlpha(0.3);

    // Threat level — right of disc
    this.threatLabel = scene.add.text(RCX + R + 8, RCY - 10, "THREAT\nNORMAL", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
      align: "left", lineSpacing: 2,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(201).setAlpha(O.dimText);

    this.countLabel = scene.add.text(RCX, RCY + R + 7, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.mutedH,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);
  }

  update(
    playerX: number,
    playerY: number,
    camera: Phaser.Cameras.Scene2D.Camera,
    enemies: EnemyInfo[],
    enemyCount: number = enemies.length,
    reactorPos?: { x: number; y: number } | null,
    reactorHpRatio = 1,
    playerAngle = 0,
  ): void {
    this.arrowGfx.clear();
    this.radarGfx.clear();

    // Advance sweep
    this._sweepAngle = (this._sweepAngle + 0.018) % (Math.PI * 2);

    const camLeft   = camera.scrollX, camTop   = camera.scrollY;
    const camRight  = camLeft + GAME_WIDTH, camBottom = camTop + GAME_HEIGHT;
    const centerX   = GAME_WIDTH * 0.5, centerY = GAME_HEIGHT * 0.5;

    // ── Edge arrows for offscreen enemies ────────────────────────────────────
    for (let i = 0; i < enemyCount; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      const inView = e.posX >= camLeft && e.posX <= camRight && e.posY >= camTop && e.posY <= camBottom;
      if (inView) continue;
      const sx = e.posX - camLeft, sy = e.posY - camTop;
      const dx = sx - centerX,     dy = sy - centerY;
      const angle = Math.atan2(dy, dx);
      const edge  = this._clampEdge(centerX, centerY, angle, EDGE_MARGIN);
      const distSq = dx * dx + dy * dy;
      const alpha = Math.max(MIN_ALPHA, Math.min(1, 1 - (Math.sqrt(distSq) - GAME_WIDTH * 0.5) / FADE_DISTANCE));
      this._drawArrow(edge.x, edge.y, angle, TYPE_COLORS[e.type] ?? 0xffffff, alpha);
    }

    // Reactor offscreen arrow
    if (reactorPos && reactorHpRatio < 1) {
      const rsx = reactorPos.x - camLeft, rsy = reactorPos.y - camTop;
      if (!(rsx >= 0 && rsx <= GAME_WIDTH && rsy >= 0 && rsy <= GAME_HEIGHT)) {
        const rdx = rsx - centerX, rdy = rsy - centerY;
        const rAngle = Math.atan2(rdy, rdx);
        const rEdge  = this._clampEdge(centerX, centerY, rAngle, EDGE_MARGIN + 10);
        const pulse  = 0.6 + 0.4 * Math.sin(performance.now() * 0.01);
        const rColor = reactorHpRatio < 0.25 ? C.red : C.amber;
        const as = ARROW_SIZE + 4;
        this.arrowGfx.fillStyle(rColor, pulse);
        this.arrowGfx.fillTriangle(
          rEdge.x + Math.cos(rAngle) * as,              rEdge.y + Math.sin(rAngle) * as,
          rEdge.x + Math.cos(rAngle + Math.PI * 0.75) * as, rEdge.y + Math.sin(rAngle + Math.PI * 0.75) * as,
          rEdge.x + Math.cos(rAngle - Math.PI * 0.75) * as, rEdge.y + Math.sin(rAngle - Math.PI * 0.75) * as,
        );
      }
    }

    // ── Radar disc ───────────────────────────────────────────────────────────
    this._drawDisc(playerX, playerY, enemies, enemyCount, reactorPos, reactorHpRatio, playerAngle);

    // ── Threat labels — no allocation (count live inline) ───────────────────
    let liveCount = 0, hasBoss = false;
    for (let i = 0; i < enemyCount; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      liveCount++;
      if (e.type === "boss") hasBoss = true;
    }
    let threatStr: string, threatColor: string;
    if (hasBoss || reactorHpRatio < 0.25) {
      threatStr = "THREAT\nCRITICAL"; threatColor = C.redH;
    } else if (liveCount > 12 || reactorHpRatio < 0.5) {
      threatStr = "THREAT\nHIGH";    threatColor = C.amberH;
    } else if (liveCount > 5) {
      threatStr = "THREAT\nMED";     threatColor = C.cyanH;
    } else {
      threatStr = "THREAT\nNORMAL";  threatColor = C.mutedH;
    }
    this.threatLabel.setText(threatStr).setColor(threatColor);
    this.countLabel.setText(liveCount > 0 ? `${liveCount} ACTIVE` : "CLEAR");
    this.countLabel.setColor(liveCount > 0 ? C.redH : C.greenH).setAlpha(0.65);
  }

  setVisible(visible: boolean): void {
    this.arrowGfx.setVisible(visible);
    this.radarGfx.setVisible(visible);
    this.labelText.setVisible(visible);
    this.threatLabel.setVisible(visible);
    this.countLabel.setVisible(visible);
  }

  destroy(): void {
    this.arrowGfx.destroy();
    this.radarGfx.destroy();
    this.labelText.destroy();
    this.threatLabel.destroy();
    this.countLabel.destroy();
  }

  // ─── Disc ────────────────────────────────────────────────────────────────────

  private _drawDisc(
    playerX: number, playerY: number,
    enemies: EnemyInfo[], enemyCount: number,
    reactorPos: { x: number; y: number } | null | undefined,
    reactorHpRatio: number,
    playerAngle: number,
  ): void {
    const gfx = this.radarGfx;
    const now = performance.now();

    // Panel backdrop
    gfx.fillStyle(C.ink, 0.55);
    gfx.fillCircle(RCX, RCY, R + 6);
    gfx.lineStyle(1, C.cyan, 0.20);
    gfx.strokeCircle(RCX, RCY, R + 6);

    // Disc fill
    gfx.fillStyle(0x020d18, 0.90);
    gfx.fillCircle(RCX, RCY, R);

    // ── Animated grid — two rings ─────────────────────────────────────────
    gfx.lineStyle(1, C.cyan, 0.06);
    gfx.strokeCircle(RCX, RCY, R * 0.5);
    gfx.lineStyle(1, C.cyan, 0.04);
    gfx.lineBetween(RCX - R, RCY, RCX + R, RCY);
    gfx.lineBetween(RCX, RCY - R, RCX, RCY + R);

    // ── Rotating sweep ────────────────────────────────────────────────────
    const sweepEnd = this._sweepAngle;
    const sweepStart = sweepEnd - 0.7;
    // Gradient trail: 3 arcs of decreasing alpha
    for (let s = 0; s < 3; s++) {
      const a0 = sweepStart + s * 0.23;
      const a1 = sweepStart + (s + 1) * 0.23;
      gfx.lineStyle(1, C.cyan, 0.04 + s * 0.06);
      gfx.beginPath();
      gfx.arc(RCX, RCY, R - 1, a0, a1, false);
      gfx.strokePath();
    }
    // Sweep line
    gfx.lineStyle(1, C.cyan, 0.35);
    gfx.lineBetween(RCX, RCY, RCX + Math.cos(sweepEnd) * R, RCY + Math.sin(sweepEnd) * R);

    // ── Outer ring — threatened pulse ────────────────────────────────────
    const threatened    = reactorHpRatio < 0.5;
    const borderPulse   = threatened ? 0.5 + 0.5 * Math.sin(now * 0.01) : 0;
    gfx.lineStyle(1, threatened ? C.red : C.cyan, threatened ? 0.35 + borderPulse * 0.35 : 0.3);
    gfx.strokeCircle(RCX, RCY, R);

    // World → radar helpers
    const wCX = WORLD_WIDTH / 2, wCY = WORLD_HEIGHT / 2;
    const toRX = (wx: number) => RCX + (wx - wCX) * SCALE_X;
    const toRY = (wy: number) => RCY + (wy - wCY) * SCALE_Y;

    // ── Reactor marker ───────────────────────────────────────────────────
    if (reactorPos) {
      const rdx = toRX(reactorPos.x), rdy = toRY(reactorPos.y);
      if (this._inDisc(rdx, rdy)) {
        const rColor = reactorHpRatio < 0.25 ? C.red : C.amber;
        const rA     = reactorHpRatio < 0.5 ? 0.55 + 0.45 * Math.sin(now * 0.008) : 0.85;
        // Diamond marker
        gfx.fillStyle(rColor, rA);
        gfx.fillTriangle(rdx, rdy - 5, rdx + 4, rdy, rdx, rdy + 5);
        gfx.fillTriangle(rdx, rdy - 5, rdx - 4, rdy, rdx, rdy + 5);
        if (reactorHpRatio < 1) {
          gfx.lineStyle(1, rColor, rA * 0.5);
          gfx.strokeCircle(rdx, rdy, 7 + (reactorHpRatio < 0.5 ? 2 * Math.sin(now * 0.009) : 0));
        }
      } else {
        const angle = Math.atan2(rdy - RCY, rdx - RCX);
        const ex = RCX + Math.cos(angle) * (R - 5);
        const ey = RCY + Math.sin(angle) * (R - 5);
        gfx.fillStyle(reactorHpRatio < 0.25 ? C.red : C.amber, 0.85 + 0.15 * Math.sin(now * 0.01));
        gfx.fillTriangle(
          ex + Math.cos(angle) * 4, ey + Math.sin(angle) * 4,
          ex + Math.cos(angle + 2.4) * 4, ey + Math.sin(angle + 2.4) * 4,
          ex + Math.cos(angle - 2.4) * 4, ey + Math.sin(angle - 2.4) * 4,
        );
      }
    }

    // ── Enemy dots — pulsing ─────────────────────────────────────────────
    let dotIdx = 0;
    for (let i = 0; i < enemyCount; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      const dx = toRX(e.posX), dy = toRY(e.posY);
      if (!this._inDisc(dx, dy)) continue;
      const color = TYPE_COLORS[e.type] ?? 0xffffff;
      // Staggered pulse per dot
      if (this._dotPhase.length <= dotIdx) this._dotPhase.push(Math.random() * Math.PI * 2);
      this._dotPhase[dotIdx] = (this._dotPhase[dotIdx] + 0.04) % (Math.PI * 2);
      const pulse = 0.65 + 0.35 * Math.sin(this._dotPhase[dotIdx]);
      gfx.fillStyle(color, pulse);
      gfx.fillCircle(dx, dy, e.type === "boss" ? 4 : 2);
      dotIdx++;
    }

    // ── Player dot — directional arrow ───────────────────────────────────
    const px = toRX(playerX), py = toRY(playerY);
    // Facing arrow (small triangle)
    const arrowLen = 7;
    const pa = playerAngle - Math.PI / 2; // Phaser angle 0 = right; we offset so 0 = up
    gfx.fillStyle(C.cyan, 0.95);
    gfx.fillTriangle(
      px + Math.cos(pa) * arrowLen,           py + Math.sin(pa) * arrowLen,
      px + Math.cos(pa + 2.3) * (arrowLen - 3), py + Math.sin(pa + 2.3) * (arrowLen - 3),
      px + Math.cos(pa - 2.3) * (arrowLen - 3), py + Math.sin(pa - 2.3) * (arrowLen - 3),
    );
    // Dot at position
    gfx.fillStyle(C.cyan, 1);
    gfx.fillCircle(px, py, 2);

    // ── Cardinal ticks ───────────────────────────────────────────────────
    gfx.lineStyle(1, C.cyan, 0.3);
    for (let t = 0; t < 4; t++) {
      const a = t * Math.PI / 2;
      gfx.lineBetween(
        RCX + Math.cos(a) * (R - 5), RCY + Math.sin(a) * (R - 5),
        RCX + Math.cos(a) * R,       RCY + Math.sin(a) * R,
      );
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private _inDisc(x: number, y: number): boolean {
    const dx = x - RCX, dy = y - RCY;
    return dx * dx + dy * dy <= R * R;
  }

  private _clampEdge(cx: number, cy: number, angle: number, margin: number): { x: number; y: number } {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const minX = margin, maxX = GAME_WIDTH - margin;
    const minY = margin, maxY = GAME_HEIGHT - margin;
    let t = 1;
    if (cosA !== 0) {
      const tR = (maxX - cx) / cosA, tL = (minX - cx) / cosA;
      if (cosA > 0 && tR > 0) t = Math.min(t, tR);
      if (cosA < 0 && tL > 0) t = Math.min(t, tL);
    }
    if (sinA !== 0) {
      const tB = (maxY - cy) / sinA, tT = (minY - cy) / sinA;
      if (sinA > 0 && tB > 0) t = Math.min(t, tB);
      if (sinA < 0 && tT > 0) t = Math.min(t, tT);
    }
    return {
      x: Phaser.Math.Clamp(cx + cosA * t, minX, maxX),
      y: Phaser.Math.Clamp(cy + sinA * t, minY, maxY),
    };
  }

  private _drawArrow(x: number, y: number, angle: number, color: number, alpha: number): void {
    const a = ARROW_SIZE;
    this.arrowGfx.fillStyle(color, alpha);
    this.arrowGfx.fillTriangle(
      x + Math.cos(angle) * a,              y + Math.sin(angle) * a,
      x + Math.cos(angle + Math.PI * 0.75) * a, y + Math.sin(angle + Math.PI * 0.75) * a,
      x + Math.cos(angle - Math.PI * 0.75) * a, y + Math.sin(angle - Math.PI * 0.75) * a,
    );
  }
}
