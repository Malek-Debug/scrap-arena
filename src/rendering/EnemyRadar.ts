import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from "../core";

const TYPE_COLORS: Record<string, number> = {
  enemy: 0xff4444,
  guard: 0xaa44ff,
  collector: 0x44ffcc,
  turret: 0xff6600,
  sawblade: 0xcccccc,
  welder: 0xffcc00,
  boss: 0xff0000,
};

const ARROW_SIZE = 8;
const EDGE_MARGIN = 20;
const FADE_DISTANCE = 600;
const MIN_ALPHA = 0.4;

const MINIMAP_W = 120;
const MINIMAP_H = 68;
const MINIMAP_PADDING = 10;
const MINIMAP_BOTTOM_MARGIN = 82; // clearance above ability strip (which starts at y=GAME_HEIGHT-68)
const MINIMAP_SCALE_X = MINIMAP_W / WORLD_WIDTH;
const MINIMAP_SCALE_Y = MINIMAP_H / WORLD_HEIGHT;

interface EnemyInfo {
  posX: number;
  posY: number;
  type: string;
  isDead?: boolean;
}

export class EnemyRadar {
  private scene: Phaser.Scene;
  private arrowGfx: Phaser.GameObjects.Graphics;
  private minimapGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.arrowGfx = scene.add.graphics();
    this.arrowGfx.setScrollFactor(0);
    this.arrowGfx.setDepth(200);

    this.minimapGfx = scene.add.graphics();
    this.minimapGfx.setScrollFactor(0);
    this.minimapGfx.setDepth(201);

    // Static "MAP" label rendered once above the bottom-right minimap
    const mapX = GAME_WIDTH - MINIMAP_W - MINIMAP_PADDING;
    const mapLabelY = GAME_HEIGHT - MINIMAP_H - MINIMAP_BOTTOM_MARGIN - 13;
    scene.add.text(mapX, mapLabelY, "▣  RADAR MAP", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#33ff9966",
      letterSpacing: 1,
    }).setScrollFactor(0).setDepth(200);
  }

  update(
    playerX: number,
    playerY: number,
    camera: Phaser.Cameras.Scene2D.Camera,
    enemies: EnemyInfo[],
    enemyCount: number = enemies.length,
  ): void {
    this.arrowGfx.clear();
    this.minimapGfx.clear();

    const camLeft = camera.scrollX;
    const camTop = camera.scrollY;
    const camRight = camLeft + GAME_WIDTH;
    const camBottom = camTop + GAME_HEIGHT;

    const centerX = GAME_WIDTH * 0.5;
    const centerY = GAME_HEIGHT * 0.5;

    // --- Directional arrows for offscreen enemies (inline alive filter — no alloc) ---
    for (let i = 0; i < enemyCount; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      const inView =
        e.posX >= camLeft &&
        e.posX <= camRight &&
        e.posY >= camTop &&
        e.posY <= camBottom;
      if (inView) continue;

      // Enemy position in screen space
      const sx = e.posX - camLeft;
      const sy = e.posY - camTop;

      const dx = sx - centerX;
      const dy = sy - centerY;
      const angle = Math.atan2(dy, dx);

      // Find edge intersection
      const edgeX = this.clampEdge(centerX, centerY, angle, EDGE_MARGIN);
      const color = TYPE_COLORS[e.type] ?? 0xffffff;

      // Distance-based alpha
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.max(
        MIN_ALPHA,
        Math.min(1.0, 1.0 - (dist - GAME_WIDTH * 0.5) / FADE_DISTANCE)
      );

      this.drawArrow(edgeX.x, edgeX.y, angle, color, alpha);
    }

    // --- Minimap ---
    this.drawMinimap(playerX, playerY, enemies, enemyCount);
  }

  destroy(): void {
    this.arrowGfx.destroy();
    this.minimapGfx.destroy();
  }

  /** Clamp a ray from center along `angle` to the viewport edges with margin. */
  private clampEdge(
    cx: number,
    cy: number,
    angle: number,
    margin: number
  ): { x: number; y: number } {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const minX = margin;
    const maxX = GAME_WIDTH - margin;
    const minY = margin;
    const maxY = GAME_HEIGHT - margin;

    // Walk along the ray until we hit an edge
    let t = 1;
    if (cosA !== 0) {
      const tRight = (maxX - cx) / cosA;
      const tLeft = (minX - cx) / cosA;
      if (cosA > 0 && tRight > 0) t = Math.min(t, tRight);
      if (cosA < 0 && tLeft > 0) t = Math.min(t, tLeft);
    }
    if (sinA !== 0) {
      const tBottom = (maxY - cy) / sinA;
      const tTop = (minY - cy) / sinA;
      if (sinA > 0 && tBottom > 0) t = Math.min(t, tBottom);
      if (sinA < 0 && tTop > 0) t = Math.min(t, tTop);
    }

    return {
      x: Phaser.Math.Clamp(cx + cosA * t, minX, maxX),
      y: Phaser.Math.Clamp(cy + sinA * t, minY, maxY),
    };
  }

  /** Draw a small filled triangle pointing along `angle`. */
  private drawArrow(
    x: number,
    y: number,
    angle: number,
    color: number,
    alpha: number
  ): void {
    const tipX = x + Math.cos(angle) * ARROW_SIZE;
    const tipY = y + Math.sin(angle) * ARROW_SIZE;

    const backAngle1 = angle + Math.PI * 0.75;
    const backAngle2 = angle - Math.PI * 0.75;

    const b1x = x + Math.cos(backAngle1) * ARROW_SIZE;
    const b1y = y + Math.sin(backAngle1) * ARROW_SIZE;
    const b2x = x + Math.cos(backAngle2) * ARROW_SIZE;
    const b2y = y + Math.sin(backAngle2) * ARROW_SIZE;

    this.arrowGfx.fillStyle(color, alpha);
    this.arrowGfx.fillTriangle(tipX, tipY, b1x, b1y, b2x, b2y);
  }

  /** Draw the minimap in the bottom-right corner (above ability strip). */
  private drawMinimap(
    playerX: number,
    playerY: number,
    enemies: EnemyInfo[],
    enemyCount: number,
  ): void {
    const mx = GAME_WIDTH - MINIMAP_W - MINIMAP_PADDING;
    const my = GAME_HEIGHT - MINIMAP_H - MINIMAP_BOTTOM_MARGIN;

    // Background
    this.minimapGfx.fillStyle(0x030810, 0.78);
    this.minimapGfx.fillRect(mx, my, MINIMAP_W, MINIMAP_H);

    // Border — accent green to match HUD palette
    this.minimapGfx.lineStyle(1, 0x00ff88, 0.45);
    this.minimapGfx.strokeRect(mx, my, MINIMAP_W, MINIMAP_H);

    // Enemy dots (skip dead inline)
    for (let i = 0; i < enemyCount; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      const dotX = mx + e.posX * MINIMAP_SCALE_X;
      const dotY = my + e.posY * MINIMAP_SCALE_Y;
      const color = TYPE_COLORS[e.type] ?? 0xffffff;
      this.minimapGfx.fillStyle(color, 0.9);
      this.minimapGfx.fillCircle(dotX, dotY, 2);
    }

    // Player dot (on top)
    const px = mx + playerX * MINIMAP_SCALE_X;
    const py = my + playerY * MINIMAP_SCALE_Y;
    this.minimapGfx.fillStyle(0x44ff44, 1);
    this.minimapGfx.fillCircle(px, py, 3);
  }
}
