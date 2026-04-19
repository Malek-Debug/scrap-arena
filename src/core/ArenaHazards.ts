import Phaser from "phaser";

import { WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H } from "./GameConfig";
const GAME_WIDTH = WORLD_WIDTH;
const GAME_HEIGHT = WORLD_HEIGHT;

interface LaserFence {
  gfx: Phaser.GameObjects.Graphics;
  x1: number; y1: number; x2: number; y2: number;
  active: boolean;
  timer: number;
  onDuration: number;
  offDuration: number;
  color: number;
  warningTimer: number;
}

interface ElectricZone {
  gfx: Phaser.GameObjects.Graphics;
  cx: number; cy: number; radius: number;
  pulseTimer: number;
  damageTimer: number;
  color: number;
}

interface CrushingPiston {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; width: number; height: number;
  extended: boolean;
  timer: number;
  extendDuration: number;
  retractDuration: number;
  warningTimer: number;
  color: number;
}

export class ArenaHazards {
  private scene: Phaser.Scene;
  private lasers: LaserFence[] = [];
  private zones: ElectricZone[] = [];
  private pistons: CrushingPiston[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Setup hazards for a given wave number.
   * Wave 1-2: no hazards (learning period)
   * Wave 3: 2 laser fences
   * Wave 4: add 1 electric zone
   * Wave 5+: add more of each, plus crushing pistons
   */
  setupForWave(wave: number): void {
    this.clearAll();

    if (wave < 3) return;

    // Hazards restricted to hub room (top-left cell)
    const HUB_X1 = 80, HUB_X2 = CELL_W - 80;
    const HUB_Y1 = 80, HUB_Y2 = CELL_H - 80;
    const hubCY = CELL_H / 2;

    const safeHubX = () => Phaser.Math.Between(HUB_X1, HUB_X2);
    const safeHubY = () => {
      const y = Phaser.Math.Between(HUB_Y1, HUB_Y2);
      if (Math.abs(y - hubCY) < 80) return y < hubCY ? y - 80 : y + 80;
      return y;
    };

    // Laser fences — horizontal or vertical lines that toggle on/off
    const laserCount = Math.min(wave - 1, 4);
    for (let i = 0; i < laserCount; i++) {
      const isHorizontal = i % 2 === 0;
      let x1: number, y1: number, x2: number, y2: number;
      if (isHorizontal) {
        const y = safeHubY();
        const segLen = Phaser.Math.Between(120, 220);
        x1 = Phaser.Math.Between(HUB_X1, HUB_X2 - segLen);
        x2 = x1 + segLen;
        y1 = y; y2 = y;
      } else {
        const x = safeHubX();
        const segLen = Phaser.Math.Between(100, 180);
        y1 = Phaser.Math.Between(HUB_Y1, HUB_Y2 - segLen);
        y2 = y1 + segLen;
        x1 = x; x2 = x;
      }

      const gfx = this.scene.add.graphics().setDepth(5);
      this.lasers.push({
        gfx, x1, y1, x2, y2,
        active: false,
        timer: Phaser.Math.Between(500, 2000),
        onDuration: 2000 + wave * 200,
        offDuration: 2500 - Math.min(wave * 100, 1500),
        color: 0xff0033,
        warningTimer: 0,
      });
    }

    // Electric zones — only in hub room
    if (wave >= 4) {
      const zoneCount = Math.min(wave - 3, 3);
      for (let i = 0; i < zoneCount; i++) {
        const cx = safeHubX();
        const cy = safeHubY();
        const radius = Math.min(40 + wave * 2, 80);
        const gfx = this.scene.add.graphics().setDepth(5);
        this.zones.push({
          gfx, cx, cy, radius,
          pulseTimer: 0,
          damageTimer: 0,
          color: 0x4488ff,
        });
      }
    }

    // Crushing pistons — disabled (they covered doorways and blocked rooms)
  }

  private safeX(): number {
    const x = Phaser.Math.Between(120, GAME_WIDTH - 120);
    if (Math.abs(x - GAME_WIDTH / 2) < 100) return x < GAME_WIDTH / 2 ? x - 100 : x + 100;
    return x;
  }

  private safeY(): number {
    const y = Phaser.Math.Between(100, GAME_HEIGHT - 100);
    if (Math.abs(y - GAME_HEIGHT / 2) < 80) return y < GAME_HEIGHT / 2 ? y - 80 : y + 80;
    return y;
  }

  /**
   * Returns total damage to apply to player this frame.
   * Call in update loop with player position.
   */
  update(deltaMs: number, playerX: number, playerY: number): number {
    let damage = 0;

    // --- Lasers ---
    for (const l of this.lasers) {
      l.timer -= deltaMs;

      if (l.timer <= 0) {
        l.active = !l.active;
        l.timer = l.active ? l.onDuration : l.offDuration;
        if (!l.active) l.warningTimer = 0;
      }

      // Warning flicker 500ms before activation
      if (!l.active && l.timer < 500) {
        l.warningTimer += deltaMs;
      }

      l.gfx.clear();
      if (l.active) {
        // Active laser — bright glowing line
        l.gfx.lineStyle(6, l.color, 0.3);
        l.gfx.lineBetween(l.x1, l.y1, l.x2, l.y2);
        l.gfx.lineStyle(2, 0xffffff, 0.9);
        l.gfx.lineBetween(l.x1, l.y1, l.x2, l.y2);

        if (this.pointToSegmentDist(playerX, playerY, l.x1, l.y1, l.x2, l.y2) < 15) {
          damage += 0.3;
        }
      } else if (l.warningTimer > 0) {
        const flicker = Math.sin(l.warningTimer * 0.02) > 0 ? 0.4 : 0.1;
        l.gfx.lineStyle(3, l.color, flicker);
        l.gfx.lineBetween(l.x1, l.y1, l.x2, l.y2);
      } else {
        l.gfx.lineStyle(1, l.color, 0.15);
        l.gfx.lineBetween(l.x1, l.y1, l.x2, l.y2);
      }
    }

    // --- Electric zones ---
    for (const z of this.zones) {
      z.pulseTimer += deltaMs;
      const pulse = 0.5 + Math.sin(z.pulseTimer * 0.004) * 0.3;
      const visualRadius = z.radius * (0.9 + Math.sin(z.pulseTimer * 0.003) * 0.1);

      z.gfx.clear();
      z.gfx.fillStyle(z.color, 0.05 * pulse);
      z.gfx.fillCircle(z.cx, z.cy, visualRadius);
      z.gfx.lineStyle(2, z.color, 0.3 * pulse);
      z.gfx.strokeCircle(z.cx, z.cy, visualRadius);
      // Inner crackle lines
      z.gfx.lineStyle(1, 0xffffff, 0.15 * pulse);
      for (let i = 0; i < 4; i++) {
        const a = (z.pulseTimer * 0.002 + i * Math.PI / 2);
        const r = visualRadius * 0.6;
        z.gfx.lineBetween(
          z.cx + Math.cos(a) * r * 0.3, z.cy + Math.sin(a) * r * 0.3,
          z.cx + Math.cos(a + 0.5) * r, z.cy + Math.sin(a + 0.5) * r,
        );
      }

      const dx = playerX - z.cx;
      const dy = playerY - z.cy;
      if (dx * dx + dy * dy < z.radius * z.radius) {
        z.damageTimer += deltaMs;
        if (z.damageTimer > 300) {
          damage += 3;
          z.damageTimer = 0;
        }
      } else {
        z.damageTimer = 0;
      }
    }

    // --- Crushing pistons ---
    for (const p of this.pistons) {
      p.timer -= deltaMs;
      if (p.timer <= 0) {
        p.extended = !p.extended;
        p.timer = p.extended ? p.extendDuration : p.retractDuration;
        if (!p.extended) p.warningTimer = 0;
      }

      if (!p.extended && p.timer < 600) {
        p.warningTimer += deltaMs;
      }

      p.gfx.clear();
      if (p.extended) {
        p.gfx.fillStyle(p.color, 0.5);
        p.gfx.fillRect(p.x, p.y, p.width, p.height);
        p.gfx.lineStyle(2, 0xffffff, 0.6);
        p.gfx.strokeRect(p.x, p.y, p.width, p.height);
        // Danger stripes
        p.gfx.lineStyle(2, 0x000000, 0.4);
        for (let sx = p.x; sx < p.x + p.width; sx += 12) {
          p.gfx.lineBetween(sx, p.y, sx + 6, p.y + p.height);
        }

        if (playerX > p.x && playerX < p.x + p.width &&
            playerY > p.y && playerY < p.y + p.height) {
          damage += 0.5;
        }
      } else if (p.warningTimer > 0) {
        const flicker = Math.sin(p.warningTimer * 0.015) > 0 ? 0.3 : 0.08;
        p.gfx.fillStyle(p.color, flicker);
        p.gfx.fillRect(p.x, p.y, p.width, p.height);
      } else {
        p.gfx.lineStyle(1, p.color, 0.1);
        p.gfx.strokeRect(p.x, p.y, p.width, p.height);
      }
    }

    return damage;
  }

  private pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  clearAll(): void {
    for (const l of this.lasers) l.gfx.destroy();
    for (const z of this.zones) z.gfx.destroy();
    for (const p of this.pistons) p.gfx.destroy();
    this.lasers = [];
    this.zones = [];
    this.pistons = [];
  }

  destroy(): void {
    this.clearAll();
  }
}
