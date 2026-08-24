import Phaser from "phaser";
import {
  WORLD_WIDTH, WORLD_HEIGHT,
  CELL_W, CELL_H, ROOM_COLS, ROOM_ROWS,
} from "../core/GameConfig";
import { WorldType } from "../core/WorldManager";

/**
 * World-space environmental overlay that makes FOUNDRY and CIRCUIT look
 * structurally different.  Drawn at depth 6 — above baked floors (-3.5)
 * and MapObstacles decals (-3 to -2), below props/walls (10+).
 *
 * Call setWorld() on world switch.  Call update() every frame.
 */
export class DimensionOverlay {
  private scene: Phaser.Scene;

  // Static geometry layer — cleared + redrawn on setWorld()
  private _staticGfx!: Phaser.GameObjects.Graphics;

  // Animated live layer — cleared every update()
  private _liveGfx!: Phaser.GameObjects.Graphics;

  private _world: WorldType = WorldType.FOUNDRY;
  private _time = 0;

  // Energy node positions for CIRCUIT live animation
  private _energyNodes: { x: number; y: number; phase: number }[] = [];

  // Heat vent positions for FOUNDRY live animation
  private _ventPositions: { x: number; y: number; phase: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._staticGfx = scene.add.graphics().setDepth(6);
    this._liveGfx   = scene.add.graphics().setDepth(6.5);
  }

  /* ── Public API ──────────────────────────────────────── */

  setWorld(world: WorldType): void {
    this._world = world;
    this._staticGfx.clear();
    this._energyNodes = [];
    this._ventPositions = [];

    if (world === WorldType.FOUNDRY) {
      this._drawFoundry();
    } else {
      this._drawCircuit();
    }
  }

  update(deltaMs: number): void {
    this._time += deltaMs;
    const t = this._time * 0.001;
    this._liveGfx.clear();

    if (this._world === WorldType.FOUNDRY) {
      this._updateFoundryLive(t);
    } else {
      this._updateCircuitLive(t);
    }
  }

  destroy(): void {
    this._staticGfx.destroy();
    this._liveGfx.destroy();
  }

  /* ══════════════════════════════════════════════════════
     FOUNDRY — industrial machine world
     ══════════════════════════════════════════════════════ */

  private _drawFoundry(): void {
    const g = this._staticGfx;

    /* ── 1. Overhead pipe runs (horizontal spanning full width) ── */
    // Six heavy pipe bands at strategic Y positions covering all rows
    const pipeYs = [
      CELL_H * 0.18,
      CELL_H * 0.82,
      CELL_H + CELL_H * 0.18,
      CELL_H * 2 + CELL_H * 0.42,
      CELL_H * 2 + CELL_H * 0.82,
      CELL_H * 3 + CELL_H * 0.25,
      CELL_H * 3 + CELL_H * 0.75,
    ];
    for (const py of pipeYs) {
      // Outer shadow band
      g.fillStyle(0x1a0800, 0.70);
      g.fillRect(0, py - 11, WORLD_WIDTH, 22);
      // Main pipe body
      g.fillStyle(0x3d1a06, 0.80);
      g.fillRect(0, py - 8, WORLD_WIDTH, 16);
      // Pipe sheen (top highlight)
      g.fillStyle(0x885533, 0.40);
      g.fillRect(0, py - 8, WORLD_WIDTH, 4);
      // Pipe dark underside
      g.fillStyle(0x0d0400, 0.55);
      g.fillRect(0, py + 6, WORLD_WIDTH, 5);
      // Amber glow under pipe
      g.fillStyle(0xcc4400, 0.06);
      g.fillRect(0, py + 11, WORLD_WIDTH, 20);
      // Coupling bolts every 200px
      for (let bx = 80; bx < WORLD_WIDTH; bx += 200) {
        g.fillStyle(0x2a0e00, 0.90);
        g.fillRect(bx - 10, py - 12, 20, 24);
        g.lineStyle(1, 0x662200, 0.60);
        g.strokeRect(bx - 10, py - 12, 20, 24);
        // Bolt heads
        g.fillStyle(0x884422, 0.80);
        g.fillCircle(bx - 5, py - 9, 2.5);
        g.fillCircle(bx + 5, py - 9, 2.5);
        g.fillCircle(bx - 5, py + 9, 2.5);
        g.fillCircle(bx + 5, py + 9, 2.5);
        // Pressure gauge every second coupling
        if (Math.floor(bx / 200) % 2 === 0) {
          g.fillStyle(0x1a0800, 0.90);
          g.fillCircle(bx, py, 9);
          g.lineStyle(1, 0x882200, 0.70);
          g.strokeCircle(bx, py, 9);
          g.fillStyle(0x662200, 0.60);
          g.fillCircle(bx, py, 5);
          g.fillStyle(0xff4400, 0.40);
          g.fillCircle(bx - 1, py - 1, 2);
        }
      }
    }

    /* ── 2. Vertical cable trays (spanning full height, 3 per column boundary) ── */
    const cableTrayXs = [
      CELL_W * 0.22, CELL_W * 0.78,
      CELL_W + CELL_W * 0.22, CELL_W + CELL_W * 0.78,
      CELL_W * 2 + CELL_W * 0.22, CELL_W * 2 + CELL_W * 0.78,
    ];
    for (const cx of cableTrayXs) {
      // Tray body
      g.fillStyle(0x1e0d04, 0.65);
      g.fillRect(cx - 6, 0, 12, WORLD_HEIGHT);
      // Cable bundle (darker inner)
      g.fillStyle(0x110700, 0.80);
      g.fillRect(cx - 3, 0, 6, WORLD_HEIGHT);
      // Cable highlight
      g.fillStyle(0x442200, 0.35);
      g.fillRect(cx - 3, 0, 2, WORLD_HEIGHT);
      // Conduit clamp brackets every 160px
      for (let cy = 60; cy < WORLD_HEIGHT; cy += 160) {
        g.fillStyle(0x3a1500, 0.85);
        g.fillRect(cx - 10, cy - 4, 20, 8);
        g.lineStyle(1, 0x663300, 0.55);
        g.strokeRect(cx - 10, cy - 4, 20, 8);
      }
    }

    /* ── 3. Industrial warning chevrons at room corners ── */
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const rx = c * CELL_W;
        const ry = r * CELL_H;
        this._drawFoundryChevron(g, rx + 36, ry + 36);
        this._drawFoundryChevron(g, rx + CELL_W - 36, ry + 36);
        this._drawFoundryChevron(g, rx + 36, ry + CELL_H - 36);
        this._drawFoundryChevron(g, rx + CELL_W - 36, ry + CELL_H - 36);
      }
    }

    /* ── 4. Heat zone floor patches (amber rectangle under pipe intersections) ── */
    for (const py of pipeYs) {
      for (const cx of cableTrayXs) {
        // Hot spot at pipe×cable intersection
        g.fillStyle(0xff5500, 0.08);
        g.fillCircle(cx, py, 38);
        g.fillStyle(0xff7700, 0.04);
        g.fillCircle(cx, py, 60);
        // Condensation drip marks below heat zones
        g.lineStyle(1, 0x441100, 0.35);
        g.lineBetween(cx, py + 12, cx - 3 + ((cx * 7) % 7), py + 48);
        // Record vent position for live animation
        this._ventPositions.push({ x: cx, y: py, phase: (cx + py) * 0.01 });
      }
    }

    /* ── 5. Floor-level blast / heat plates in room centres ── */
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const mx = c * CELL_W + CELL_W / 2;
        const my = r * CELL_H + CELL_H / 2;
        // Wide amber heat shimmer plate
        g.fillStyle(0xcc5500, 0.05);
        g.fillRect(mx - 180, my - 120, 360, 240);
        // Inner brighter zone
        g.fillStyle(0xff6600, 0.04);
        g.fillRect(mx - 100, my - 60, 200, 120);
        // Reinforced steel plate border
        g.lineStyle(2, 0x552200, 0.40);
        g.strokeRect(mx - 180, my - 120, 360, 240);
        // Cross-brace rivet pattern
        g.lineStyle(1, 0x442200, 0.35);
        g.lineBetween(mx - 180, my - 120, mx + 180, my + 120);
        g.lineBetween(mx + 180, my - 120, mx - 180, my + 120);
        // Center mounting plate
        g.fillStyle(0x2a0e00, 0.70);
        g.fillRect(mx - 22, my - 22, 44, 44);
        g.lineStyle(2, 0x663300, 0.60);
        g.strokeRect(mx - 22, my - 22, 44, 44);
        // Center bolt
        g.fillStyle(0x884422, 0.80);
        g.fillCircle(mx, my, 8);
        g.fillStyle(0xcc6600, 0.60);
        g.fillCircle(mx - 2, my - 2, 3);
      }
    }

    /* ── 6. Industrial hazard floor markings (diagonal stripes at doors) ── */
    // Horizontal wall positions (between rows)
    for (let r = 0; r < ROOM_ROWS - 1; r++) {
      const wy = (r + 1) * CELL_H;
      for (let c = 0; c < ROOM_COLS; c++) {
        const rx = c * CELL_W;
        // Hazard stripe band
        g.fillStyle(0xffaa00, 0.06);
        g.fillRect(rx + 40, wy - 28, CELL_W - 80, 56);
        // Diagonal warning stripes
        g.lineStyle(3, 0xffaa00, 0.12);
        for (let sx = rx + 40; sx < rx + CELL_W - 40; sx += 24) {
          g.lineBetween(sx, wy - 28, sx + 28, wy + 28);
        }
      }
    }
    // Vertical wall positions (between cols)
    for (let c = 0; c < ROOM_COLS - 1; c++) {
      const wx = (c + 1) * CELL_W;
      for (let r = 0; r < ROOM_ROWS; r++) {
        const ry = r * CELL_H;
        g.fillStyle(0xffaa00, 0.06);
        g.fillRect(wx - 28, ry + 40, 56, CELL_H - 80);
        g.lineStyle(3, 0xffaa00, 0.12);
        for (let sy = ry + 40; sy < ry + CELL_H - 40; sy += 24) {
          g.lineBetween(wx - 28, sy, wx + 28, sy + 28);
        }
      }
    }

    /* ── 7. Rivet rows along room walls ── */
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const rx = c * CELL_W;
        const ry = r * CELL_H;
        const spacing = 40;
        // Top wall rivets
        for (let x = rx + spacing; x < rx + CELL_W - spacing; x += spacing) {
          g.fillStyle(0x773322, 0.65);
          g.fillCircle(x, ry + 30, 3);
          g.fillStyle(0xaa5533, 0.35);
          g.fillCircle(x - 1, ry + 29, 1.5);
        }
        // Left wall rivets
        for (let y = ry + spacing; y < ry + CELL_H - spacing; y += spacing) {
          g.fillStyle(0x773322, 0.65);
          g.fillCircle(rx + 30, y, 3);
          g.fillStyle(0xaa5533, 0.35);
          g.fillCircle(rx + 29, y - 1, 1.5);
        }
      }
    }
  }

  private _drawFoundryChevron(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
  ): void {
    const s = 14;
    // Dark background plate
    g.fillStyle(0x1a0800, 0.75);
    g.fillRect(cx - s, cy - s, s * 2, s * 2);
    // Chevron lines
    g.lineStyle(3, 0xffaa00, 0.55);
    g.beginPath();
    g.moveTo(cx - s + 4, cy - 4);
    g.lineTo(cx, cy - s + 4);
    g.lineTo(cx + s - 4, cy - 4);
    g.strokePath();
    g.lineStyle(3, 0xffaa00, 0.30);
    g.beginPath();
    g.moveTo(cx - s + 4, cy + 4);
    g.lineTo(cx, cy - 4);
    g.lineTo(cx + s - 4, cy + 4);
    g.strokePath();
    // Corner bolt
    g.fillStyle(0x662200, 0.80);
    g.fillCircle(cx, cy, 3);
  }

  private _updateFoundryLive(t: number): void {
    const g = this._liveGfx;
    // Pulsing amber glow at heat vents
    for (const v of this._ventPositions) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.8 + v.phase);
      const alpha = 0.04 + pulse * 0.06;
      g.fillStyle(0xff5500, alpha);
      g.fillCircle(v.x, v.y, 22 + pulse * 10);
    }
    // Slow lava-light flicker along pipe runs (viewport-aware to stay cheap)
    const cam = this.scene.cameras.main;
    const visY0 = cam.scrollY - 80;
    const visY1 = cam.scrollY + cam.height + 80;
    for (let vx = 200; vx < WORLD_WIDTH; vx += 400) {
      const scanY = ((t * 48 + vx * 0.5) % WORLD_HEIGHT);
      if (scanY < visY0 || scanY > visY1) continue;
      const alpha = 0.05 + 0.04 * Math.sin(t * 3.1 + vx * 0.007);
      g.fillStyle(0xff4400, alpha);
      g.fillRect(vx - 30, scanY - 4, 60, 8);
    }
  }

  /* ══════════════════════════════════════════════════════
     CIRCUIT — digital holographic world
     ══════════════════════════════════════════════════════ */

  private _drawCircuit(): void {
    const g = this._staticGfx;

    /* ── 1. Room-scale holographic panel borders (floating frame lines) ── */
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const rx = c * CELL_W;
        const ry = r * CELL_H;
        const pad = 48;
        // Outer hologram frame
        g.lineStyle(2, 0x00ddff, 0.28);
        g.strokeRect(rx + pad, ry + pad, CELL_W - pad * 2, CELL_H - pad * 2);
        // Inner inset frame
        g.lineStyle(1, 0x6622ff, 0.20);
        g.strokeRect(rx + pad + 16, ry + pad + 16, CELL_W - (pad + 16) * 2, CELL_H - (pad + 16) * 2);
        // Corner brackets
        this._drawCircuitCorner(g, rx + pad, ry + pad, 1, 1);
        this._drawCircuitCorner(g, rx + CELL_W - pad, ry + pad, -1, 1);
        this._drawCircuitCorner(g, rx + pad, ry + CELL_H - pad, 1, -1);
        this._drawCircuitCorner(g, rx + CELL_W - pad, ry + CELL_H - pad, -1, -1);
        // Panel scan-line fill (very faint)
        for (let ly = ry + pad + 4; ly < ry + CELL_H - pad; ly += 6) {
          g.lineStyle(1, 0x2200aa, 0.10);
          g.lineBetween(rx + pad + 2, ly, rx + CELL_W - pad - 2, ly);
        }
      }
    }

    /* ── 2. PCB trace overlay — room-spanning L-routes ── */
    const traceColor = 0x0088ff;
    const traceColorBright = 0x00ccff;
    const traceRoutes: [number, number, number, number, number, number][] = [];
    // Generate routes across each room
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const ox = c * CELL_W;
        const oy = r * CELL_H;
        // 4 L-traces per room
        traceRoutes.push(
          [ox + 80,  oy + 100, ox + 240, oy + 100, ox + 240, oy + 260],
          [ox + 440, oy + 80,  ox + 440, oy + 200, ox + 600, oy + 200],
          [ox + 700, oy + 320, ox + 860, oy + 320, ox + 860, oy + 480],
          [ox + 280, oy + 380, ox + 280, oy + 540, ox + 440, oy + 540],
          [ox + 600, oy + 100, ox + 750, oy + 100, ox + 750, oy + 320],
          [ox + 100, oy + 400, ox + 100, oy + 560, ox + 300, oy + 560],
        );
      }
    }
    // Draw shadow layer
    g.lineStyle(3, 0x110033, 0.50);
    for (const [sx, sy, mx, my, ex, ey] of traceRoutes) {
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(mx, my); g.lineTo(ex, ey);
      g.strokePath();
    }
    // Draw primary trace
    g.lineStyle(2, traceColor, 0.35);
    for (const [sx, sy, mx, my, ex, ey] of traceRoutes) {
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(mx, my); g.lineTo(ex, ey);
      g.strokePath();
    }
    // Draw bright centre
    g.lineStyle(1, traceColorBright, 0.22);
    for (const [sx, sy, mx, my, ex, ey] of traceRoutes) {
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(mx, my); g.lineTo(ex, ey);
      g.strokePath();
    }
    // Solder pads at trace corners
    for (const [, , mx, my] of traceRoutes) {
      g.fillStyle(0x050015, 0.90);
      g.fillCircle(mx, my, 5);
      g.lineStyle(1, 0x4422cc, 0.55);
      g.strokeCircle(mx, my, 5);
      g.fillStyle(0x2211aa, 0.55);
      g.fillCircle(mx, my, 3);
      g.fillStyle(0x6633ff, 0.35);
      g.fillCircle(mx - 1, my - 1, 1.5);
    }

    /* ── 3. Energy nodes (larger glowing pads, 1 per room) ── */
    const nodePositions: { x: number; y: number }[] = [];
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const nx = c * CELL_W + CELL_W / 2;
        const ny = r * CELL_H + CELL_H / 2;
        nodePositions.push({ x: nx, y: ny });
        // Outer halo
        g.fillStyle(0x3311bb, 0.07);
        g.fillCircle(nx, ny, 80);
        g.fillStyle(0x5522ff, 0.08);
        g.fillCircle(nx, ny, 50);
        // Ring structure
        g.lineStyle(3, 0x3311bb, 0.42);
        g.strokeCircle(nx, ny, 38);
        g.lineStyle(2, 0x4422dd, 0.38);
        g.strokeCircle(nx, ny, 26);
        g.lineStyle(1, 0x6633ff, 0.48);
        g.strokeCircle(nx, ny, 16);
        // Centre core
        g.fillStyle(0x2200aa, 0.80);
        g.fillCircle(nx, ny, 10);
        g.fillStyle(0x7744ff, 0.70);
        g.fillCircle(nx, ny, 6);
        g.fillStyle(0xaabbff, 0.55);
        g.fillCircle(nx - 2, ny - 2, 2);
        // Crosshair lines
        g.lineStyle(1, 0x4422cc, 0.35);
        g.lineBetween(nx - 55, ny, nx + 55, ny);
        g.lineBetween(nx, ny - 55, nx, ny + 55);
        // Record for live animation
        this._energyNodes.push({ x: nx, y: ny, phase: (nx + ny) * 0.003 });
      }
    }

    /* ── 4. Scan grid (fine cross-hatch every 80px, dimmer than PCB traces) ── */
    g.lineStyle(1, 0x220055, 0.18);
    for (let gx = 80; gx < WORLD_WIDTH; gx += 80) {
      g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, WORLD_HEIGHT); g.strokePath();
    }
    for (let gy = 80; gy < WORLD_HEIGHT; gy += 80) {
      g.beginPath(); g.moveTo(0, gy); g.lineTo(WORLD_WIDTH, gy); g.strokePath();
    }
    // Brighter accent lines at every 4th cell
    g.lineStyle(1, 0x3311aa, 0.28);
    for (let gx = 320; gx < WORLD_WIDTH; gx += 320) {
      g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, WORLD_HEIGHT); g.strokePath();
    }
    for (let gy = 320; gy < WORLD_HEIGHT; gy += 320) {
      g.beginPath(); g.moveTo(0, gy); g.lineTo(WORLD_WIDTH, gy); g.strokePath();
    }
    // Cross-tick marks at grid intersections
    g.lineStyle(1, 0x4422cc, 0.22);
    for (let gx = 320; gx < WORLD_WIDTH; gx += 320) {
      for (let gy = 320; gy < WORLD_HEIGHT; gy += 320) {
        g.lineBetween(gx - 6, gy, gx + 6, gy);
        g.lineBetween(gx, gy - 6, gx, gy + 6);
      }
    }

    /* ── 5. Holographic data stream conduits (vertical cyan channels) ── */
    const streamXs = [
      CELL_W * 0.30, CELL_W * 0.70,
      CELL_W + CELL_W * 0.30, CELL_W + CELL_W * 0.70,
      CELL_W * 2 + CELL_W * 0.30, CELL_W * 2 + CELL_W * 0.70,
    ];
    for (const sx of streamXs) {
      // Outer glow channel
      g.fillStyle(0x001133, 0.35);
      g.fillRect(sx - 5, 0, 10, WORLD_HEIGHT);
      // Inner bright channel
      g.fillStyle(0x003366, 0.30);
      g.fillRect(sx - 2, 0, 4, WORLD_HEIGHT);
      // Edge highlight
      g.lineStyle(1, 0x0066ff, 0.28);
      g.lineBetween(sx - 2, 0, sx - 2, WORLD_HEIGHT);
      g.lineStyle(1, 0x00aaff, 0.15);
      g.lineBetween(sx, 0, sx, WORLD_HEIGHT);
      // Data packet node markers every 200px
      for (let sy = 80; sy < WORLD_HEIGHT; sy += 200) {
        g.fillStyle(0x002244, 0.80);
        g.fillRect(sx - 8, sy - 4, 16, 8);
        g.lineStyle(1, 0x0044aa, 0.60);
        g.strokeRect(sx - 8, sy - 4, 16, 8);
        g.fillStyle(0x0088cc, 0.55);
        g.fillRect(sx - 3, sy - 1, 6, 2);
      }
    }

    /* ── 6. Hexagonal data cluster at room boundaries ── */
    for (let r = 0; r <= ROOM_ROWS; r++) {
      for (let c = 0; c <= ROOM_COLS; c++) {
        const hx = c * CELL_W;
        const hy = r * CELL_H;
        this._drawHexCluster(g, hx, hy, 28, 0x3311bb, 0.40);
      }
    }

    /* ── 7. Digital fragmentation markers at room mid-edges ── */
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const rx = c * CELL_W;
        const ry = r * CELL_H;
        // Top-mid
        this._drawDigitalFragment(g, rx + CELL_W / 2, ry + 36);
        // Bottom-mid
        this._drawDigitalFragment(g, rx + CELL_W / 2, ry + CELL_H - 36);
        // Left-mid
        this._drawDigitalFragment(g, rx + 36, ry + CELL_H / 2);
        // Right-mid
        this._drawDigitalFragment(g, rx + CELL_W - 36, ry + CELL_H / 2);
      }
    }
  }

  private _drawCircuitCorner(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    sx: number, sy: number,
  ): void {
    const len = 24;
    g.lineStyle(2, 0x00ddff, 0.45);
    g.beginPath();
    g.moveTo(x + sx * len, y);
    g.lineTo(x, y);
    g.lineTo(x, y + sy * len);
    g.strokePath();
    // Corner dot
    g.fillStyle(0x00bbff, 0.55);
    g.fillCircle(x, y, 4);
    g.fillStyle(0x00ffff, 0.35);
    g.fillCircle(x, y, 2);
  }

  private _drawHexCluster(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    r: number,
    color: number,
    alpha: number,
  ): void {
    g.lineStyle(2, color, alpha);
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3;
      const vx = cx + r * Math.cos(angle);
      const vy = cy + r * Math.sin(angle);
      if (i === 0) g.moveTo(vx, vy);
      else g.lineTo(vx, vy);
    }
    g.strokePath();
    g.lineStyle(1, color, alpha * 0.5);
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3;
      const vx = cx + r * 0.55 * Math.cos(angle);
      const vy = cy + r * 0.55 * Math.sin(angle);
      if (i === 0) g.moveTo(vx, vy);
      else g.lineTo(vx, vy);
    }
    g.strokePath();
    // Centre node
    g.fillStyle(color, alpha * 0.8);
    g.fillCircle(cx, cy, 5);
  }

  private _drawDigitalFragment(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
  ): void {
    // Three small scattered rectangles — offset from centre
    const offsets: [number, number, number, number][] = [
      [-10, -6, 8, 4],
      [ 4, -2, 12, 4],
      [-6,  4, 6, 3],
    ];
    for (const [ox, oy, w, h] of offsets) {
      g.fillStyle(0x1100aa, 0.65);
      g.fillRect(cx + ox, cy + oy, w, h);
      g.lineStyle(1, 0x4422ff, 0.40);
      g.strokeRect(cx + ox, cy + oy, w, h);
    }
    // Connecting line
    g.lineStyle(1, 0x3311cc, 0.35);
    g.lineBetween(cx - 2, cy - 6, cx + 4, cy + 4);
  }

  private _updateCircuitLive(t: number): void {
    const g = this._liveGfx;
    const cam = this.scene.cameras.main;
    const visX0 = cam.scrollX - 100;
    const visX1 = cam.scrollX + cam.width + 100;
    const visY0 = cam.scrollY - 100;
    const visY1 = cam.scrollY + cam.height + 100;

    // Pulsing energy nodes
    for (const n of this._energyNodes) {
      if (n.x < visX0 || n.x > visX1 || n.y < visY0 || n.y > visY1) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + n.phase);
      const alpha = 0.10 + pulse * 0.14;
      g.fillStyle(0x4422ff, alpha);
      g.fillCircle(n.x, n.y, 18 + pulse * 12);
      g.lineStyle(1, 0x00ddff, 0.20 + pulse * 0.20);
      g.strokeCircle(n.x, n.y, 42 + pulse * 8);
    }

    // Moving data packets along stream conduits
    const streamXs = [
      CELL_W * 0.30, CELL_W * 0.70,
      CELL_W + CELL_W * 0.30, CELL_W + CELL_W * 0.70,
      CELL_W * 2 + CELL_W * 0.30, CELL_W * 2 + CELL_W * 0.70,
    ];
    for (let i = 0; i < streamXs.length; i++) {
      const sx = streamXs[i];
      if (sx < visX0 || sx > visX1) continue;
      const offset = (i % 2 === 0 ? 1 : -1);
      const py = ((t * 80 * offset + i * 300) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      if (py < visY0 || py > visY1) continue;
      // Packet glow
      g.fillStyle(0x0088ff, 0.55);
      g.fillRect(sx - 3, py - 8, 6, 16);
      g.fillStyle(0x00ccff, 0.35);
      g.fillRect(sx - 1, py - 4, 2, 8);
      // Wake trail
      g.fillStyle(0x0044aa, 0.20);
      g.fillRect(sx - 2, py + offset * 8, 4, offset * 24);
    }

    // Horizontal scan lines crossing rooms (faint, slow)
    const scanY = ((t * 24) % WORLD_HEIGHT);
    const scanY2 = ((t * 24 + WORLD_HEIGHT * 0.5) % WORLD_HEIGHT);
    for (const sy of [scanY, scanY2]) {
      if (sy < visY0 || sy > visY1) continue;
      g.lineStyle(1, 0x002244, 0.10);
      g.lineBetween(0, sy, WORLD_WIDTH, sy);
    }
  }
}
