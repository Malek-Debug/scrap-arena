import Phaser from 'phaser';

const ARENA_W = 2400;
const ARENA_H = 1600;
const BOUNDARY = 24;
const CX = ARENA_W / 2;
const CY = ARENA_H / 2;

const COL_WALL       = 0x1a0e2a;
const COL_WALL_EDGE  = 0xff4400;
const COL_COVER      = 0x221408;
const COL_COVER_EDGE = 0xff6600;
const COL_PILLAR     = 0x2a1a0a;
const COL_PILLAR_EDGE= 0xffaa44;
const _COL_FLOOR_GRID: number = 0x0d0818; void _COL_FLOOR_GRID;
const COL_FLOOR_LINE = 0x1a0e2a;
const COL_HAZARD_A   = 0xff6600;
const COL_HAZARD_B   = 0x111111;
const COL_PIPE       = 0x332200;
const COL_PIPE_GLOW  = 0x00ff88;
const COL_ACCENT     = 0x00ff88;
const COL_PLATFORM   = 0x060310;

interface ObstacleRect { x: number; y: number; w: number; h: number }

export class PvPArena {
  static readonly WIDTH = ARENA_W;
  static readonly HEIGHT = ARENA_H;

  private scene!: Phaser.Scene;
  private staticGroup!: Phaser.Physics.Arcade.StaticGroup;
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private obstacles: ObstacleRect[] = [];
  private spawnPoints: { x: number; y: number }[] = [];

  constructor(scene?: Phaser.Scene) {
    if (scene) this.create(scene);
  }

  create(scene: Phaser.Scene): void {
    this.scene = scene;
    this.staticGroup = scene.physics.add.staticGroup();
    this.obstacles = [];
    this.graphics = [];

    this._buildObstacleLayout();
    this._drawFloor();
    this._drawPlatforms();
    this._drawBoundary();
    this._drawObstacles();
    this._drawPipes();
    this._drawCenterAccents();
    this._buildSpawnPoints();
    this._createPhysicsBodies();
  }

  getSpawnPoints(): { x: number; y: number }[] {
    return this.spawnPoints;
  }

  getObstacleData(): ObstacleRect[] {
    return this.obstacles;
  }

  getStaticGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.staticGroup;
  }

  destroy(): void {
    for (const g of this.graphics) g.destroy();
    this.graphics = [];
    this.staticGroup.clear(true, true);
  }

  // ─── Obstacle layout definition ──────────────────────────────────────────────
  private _buildObstacleLayout(): void {
    const obs = this.obstacles;

    // Boundary walls (top, bottom, left, right)
    obs.push({ x: 0, y: 0, w: ARENA_W, h: BOUNDARY });
    obs.push({ x: 0, y: ARENA_H - BOUNDARY, w: ARENA_W, h: BOUNDARY });
    obs.push({ x: 0, y: 0, w: BOUNDARY, h: ARENA_H });
    obs.push({ x: ARENA_W - BOUNDARY, y: 0, w: BOUNDARY, h: ARENA_H });

    // ── Central ring walls (defines the center arena opening) ──────────────
    // North wall of center (with gap in middle)
    obs.push({ x: CX - 340, y: CY - 220, w: 240, h: 20 });
    obs.push({ x: CX + 100, y: CY - 220, w: 240, h: 20 });
    // South wall of center
    obs.push({ x: CX - 340, y: CY + 200, w: 240, h: 20 });
    obs.push({ x: CX + 100, y: CY + 200, w: 240, h: 20 });
    // East wall of center (with gap)
    obs.push({ x: CX + 300, y: CY - 180, w: 20, h: 140 });
    obs.push({ x: CX + 300, y: CY + 40, w: 20, h: 140 });
    // West wall of center (with gap)
    obs.push({ x: CX - 320, y: CY - 180, w: 20, h: 140 });
    obs.push({ x: CX - 320, y: CY + 40, w: 20, h: 140 });

    // ── Quadrant pillars (provide cover near center) ───────────────────────
    // NW pillar cluster
    obs.push({ x: CX - 520, y: CY - 360, w: 60, h: 60 });
    obs.push({ x: CX - 440, y: CY - 310, w: 40, h: 80 });
    // NE pillar cluster
    obs.push({ x: CX + 460, y: CY - 360, w: 60, h: 60 });
    obs.push({ x: CX + 400, y: CY - 310, w: 40, h: 80 });
    // SW pillar cluster
    obs.push({ x: CX - 520, y: CY + 300, w: 60, h: 60 });
    obs.push({ x: CX - 440, y: CY + 230, w: 40, h: 80 });
    // SE pillar cluster
    obs.push({ x: CX + 460, y: CY + 300, w: 60, h: 60 });
    obs.push({ x: CX + 400, y: CY + 230, w: 40, h: 80 });

    // ── Choke point walls (between quadrants) ─────────────────────────────
    // North choke (horizontal wall with gap)
    obs.push({ x: CX - 150, y: CY - 420, w: 120, h: 24 });
    obs.push({ x: CX + 30, y: CY - 420, w: 120, h: 24 });
    // South choke
    obs.push({ x: CX - 150, y: CY + 396, w: 120, h: 24 });
    obs.push({ x: CX + 30, y: CY + 396, w: 120, h: 24 });
    // West choke (vertical wall with gap)
    obs.push({ x: CX - 660, y: CY - 100, w: 24, h: 80 });
    obs.push({ x: CX - 660, y: CY + 20, w: 24, h: 80 });
    // East choke
    obs.push({ x: CX + 636, y: CY - 100, w: 24, h: 80 });
    obs.push({ x: CX + 636, y: CY + 20, w: 24, h: 80 });

    // ── Corner fortress blocks (spawn protection / flanking cover) ─────────
    // Top-left corner
    obs.push({ x: 100, y: 100, w: 160, h: 24 });
    obs.push({ x: 100, y: 100, w: 24, h: 120 });
    obs.push({ x: 320, y: 180, w: 80, h: 24 });
    // Top-right corner
    obs.push({ x: ARENA_W - 260, y: 100, w: 160, h: 24 });
    obs.push({ x: ARENA_W - 124, y: 100, w: 24, h: 120 });
    obs.push({ x: ARENA_W - 400, y: 180, w: 80, h: 24 });
    // Bottom-left corner
    obs.push({ x: 100, y: ARENA_H - 124, w: 160, h: 24 });
    obs.push({ x: 100, y: ARENA_H - 220, w: 24, h: 120 });
    obs.push({ x: 320, y: ARENA_H - 204, w: 80, h: 24 });
    // Bottom-right corner
    obs.push({ x: ARENA_W - 260, y: ARENA_H - 124, w: 160, h: 24 });
    obs.push({ x: ARENA_W - 124, y: ARENA_H - 220, w: 24, h: 120 });
    obs.push({ x: ARENA_W - 400, y: ARENA_H - 204, w: 80, h: 24 });

    // ── Mid-lane cover crates ─────────────────────────────────────────────
    // North lane crates
    obs.push({ x: CX - 80, y: CY - 520, w: 48, h: 48 });
    obs.push({ x: CX + 32, y: CY - 540, w: 48, h: 48 });
    // South lane crates
    obs.push({ x: CX - 80, y: CY + 472, w: 48, h: 48 });
    obs.push({ x: CX + 32, y: CY + 492, w: 48, h: 48 });
    // West lane crates
    obs.push({ x: CX - 780, y: CY - 40, w: 48, h: 48 });
    obs.push({ x: CX - 800, y: CY + 30, w: 48, h: 48 });
    // East lane crates
    obs.push({ x: CX + 732, y: CY - 40, w: 48, h: 48 });
    obs.push({ x: CX + 752, y: CY + 30, w: 48, h: 48 });

    // ── Flanking route partial walls (outer ring) ─────────────────────────
    // NW flank
    obs.push({ x: 260, y: 380, w: 20, h: 120 });
    // NE flank
    obs.push({ x: ARENA_W - 280, y: 380, w: 20, h: 120 });
    // SW flank
    obs.push({ x: 260, y: ARENA_H - 500, w: 20, h: 120 });
    // SE flank
    obs.push({ x: ARENA_W - 280, y: ARENA_H - 500, w: 20, h: 120 });

    // ── Inner cover blocks (small cover for firefights) ───────────────────
    // Inside center arena
    obs.push({ x: CX - 100, y: CY - 60, w: 36, h: 36 });
    obs.push({ x: CX + 64, y: CY + 24, w: 36, h: 36 });
    // Diagonal cross cover near center entrances
    obs.push({ x: CX - 200, y: CY - 140, w: 32, h: 32 });
    obs.push({ x: CX + 168, y: CY - 140, w: 32, h: 32 });
    obs.push({ x: CX - 200, y: CY + 108, w: 32, h: 32 });
    obs.push({ x: CX + 168, y: CY + 108, w: 32, h: 32 });
  }

  // ─── Visual rendering ────────────────────────────────────────────────────────

  private _drawFloor(): void {
    const g = this.scene.add.graphics().setDepth(-10);
    this.graphics.push(g);

    // Base floor
    g.fillStyle(0x080412, 1);
    g.fillRect(0, 0, ARENA_W, ARENA_H);

    // Subtle grid pattern
    g.lineStyle(1, COL_FLOOR_LINE, 0.12);
    const gridSize = 64;
    for (let x = 0; x <= ARENA_W; x += gridSize) {
      g.lineBetween(x, 0, x, ARENA_H);
    }
    for (let y = 0; y <= ARENA_H; y += gridSize) {
      g.lineBetween(0, y, ARENA_W, y);
    }

    // Larger structural grid overlay
    g.lineStyle(1, COL_FLOOR_LINE, 0.06);
    const bigGrid = 256;
    for (let x = 0; x <= ARENA_W; x += bigGrid) {
      g.lineBetween(x, 0, x, ARENA_H);
    }
    for (let y = 0; y <= ARENA_H; y += bigGrid) {
      g.lineBetween(0, y, ARENA_W, y);
    }
  }

  private _drawPlatforms(): void {
    const g = this.scene.add.graphics().setDepth(-8);
    this.graphics.push(g);

    const platforms = [
      { x: CX - 600, y: CY - 440, w: 280, h: 200 },
      { x: CX + 320, y: CY - 440, w: 280, h: 200 },
      { x: CX - 600, y: CY + 240, w: 280, h: 200 },
      { x: CX + 320, y: CY + 240, w: 280, h: 200 },
    ];

    for (const p of platforms) {
      g.fillStyle(COL_PLATFORM, 1);
      g.fillRect(p.x, p.y, p.w, p.h);
      g.lineStyle(1, COL_ACCENT, 0.15);
      g.strokeRect(p.x, p.y, p.w, p.h);
      // Inner detail lines
      g.lineStyle(1, COL_ACCENT, 0.06);
      g.lineBetween(p.x + 10, p.y + 10, p.x + p.w - 10, p.y + 10);
      g.lineBetween(p.x + 10, p.y + p.h - 10, p.x + p.w - 10, p.y + p.h - 10);
    }
  }

  private _drawBoundary(): void {
    const g = this.scene.add.graphics().setDepth(2);
    this.graphics.push(g);

    // Fill boundary walls
    g.fillStyle(COL_WALL, 1);
    g.fillRect(0, 0, ARENA_W, BOUNDARY);
    g.fillRect(0, ARENA_H - BOUNDARY, ARENA_W, BOUNDARY);
    g.fillRect(0, 0, BOUNDARY, ARENA_H);
    g.fillRect(ARENA_W - BOUNDARY, 0, BOUNDARY, ARENA_H);

    // Hazard stripes along inner edge of boundary
    const stripeW = 16;
    for (let sx = 0; sx < ARENA_W; sx += stripeW * 2) {
      g.fillStyle(COL_HAZARD_A, 0.7);
      g.fillRect(sx, BOUNDARY - 4, stripeW, 4);
      g.fillStyle(COL_HAZARD_B, 0.7);
      g.fillRect(sx + stripeW, BOUNDARY - 4, stripeW, 4);

      g.fillStyle(COL_HAZARD_A, 0.7);
      g.fillRect(sx, ARENA_H - BOUNDARY, stripeW, 4);
      g.fillStyle(COL_HAZARD_B, 0.7);
      g.fillRect(sx + stripeW, ARENA_H - BOUNDARY, stripeW, 4);
    }
    for (let sy = 0; sy < ARENA_H; sy += stripeW * 2) {
      g.fillStyle(COL_HAZARD_A, 0.7);
      g.fillRect(BOUNDARY - 4, sy, 4, stripeW);
      g.fillStyle(COL_HAZARD_B, 0.7);
      g.fillRect(BOUNDARY - 4, sy + stripeW, 4, stripeW);

      g.fillStyle(COL_HAZARD_A, 0.7);
      g.fillRect(ARENA_W - BOUNDARY, sy, 4, stripeW);
      g.fillStyle(COL_HAZARD_B, 0.7);
      g.fillRect(ARENA_W - BOUNDARY, sy + stripeW, 4, stripeW);
    }

    // Glow line along inner boundary
    g.lineStyle(2, COL_WALL_EDGE, 0.5);
    g.strokeRect(BOUNDARY, BOUNDARY, ARENA_W - BOUNDARY * 2, ARENA_H - BOUNDARY * 2);
  }

  private _drawObstacles(): void {
    const g = this.scene.add.graphics().setDepth(3);
    this.graphics.push(g);

    // Skip boundary walls (first 4 entries), draw all interior obstacles
    for (let i = 4; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      const isCrate = o.w <= 50 && o.h <= 50;
      const isPillar = o.w === o.h && o.w >= 56;

      if (isPillar) {
        this._drawPillar(g, o);
      } else if (isCrate) {
        this._drawCrate(g, o);
      } else {
        this._drawWall(g, o);
      }
    }
  }

  private _drawWall(g: Phaser.GameObjects.Graphics, o: ObstacleRect): void {
    g.fillStyle(COL_WALL, 1);
    g.fillRect(o.x, o.y, o.w, o.h);
    g.lineStyle(1.5, COL_WALL_EDGE, 0.6);
    g.strokeRect(o.x, o.y, o.w, o.h);
    // Inner highlight line
    g.lineStyle(1, COL_WALL_EDGE, 0.15);
    if (o.w > o.h) {
      g.lineBetween(o.x + 4, o.y + o.h / 2, o.x + o.w - 4, o.y + o.h / 2);
    } else {
      g.lineBetween(o.x + o.w / 2, o.y + 4, o.x + o.w / 2, o.y + o.h - 4);
    }
  }

  private _drawCrate(g: Phaser.GameObjects.Graphics, o: ObstacleRect): void {
    g.fillStyle(COL_COVER, 1);
    g.fillRect(o.x, o.y, o.w, o.h);
    g.lineStyle(1.5, COL_COVER_EDGE, 0.7);
    g.strokeRect(o.x, o.y, o.w, o.h);
    // Cross marking
    g.lineStyle(1, COL_COVER_EDGE, 0.25);
    g.lineBetween(o.x + 4, o.y + 4, o.x + o.w - 4, o.y + o.h - 4);
    g.lineBetween(o.x + o.w - 4, o.y + 4, o.x + 4, o.y + o.h - 4);
    // Corner rivets
    const r = 2;
    g.fillStyle(COL_COVER_EDGE, 0.5);
    g.fillCircle(o.x + 5, o.y + 5, r);
    g.fillCircle(o.x + o.w - 5, o.y + 5, r);
    g.fillCircle(o.x + 5, o.y + o.h - 5, r);
    g.fillCircle(o.x + o.w - 5, o.y + o.h - 5, r);
  }

  private _drawPillar(g: Phaser.GameObjects.Graphics, o: ObstacleRect): void {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const radius = o.w / 2;

    // Outer glow
    g.fillStyle(COL_PILLAR_EDGE, 0.08);
    g.fillCircle(cx, cy, radius + 6);
    // Base
    g.fillStyle(COL_PILLAR, 1);
    g.fillCircle(cx, cy, radius);
    // Edge ring
    g.lineStyle(2, COL_PILLAR_EDGE, 0.6);
    g.strokeCircle(cx, cy, radius);
    // Inner ring
    g.lineStyle(1, COL_PILLAR_EDGE, 0.25);
    g.strokeCircle(cx, cy, radius * 0.6);
    // Center dot
    g.fillStyle(COL_PILLAR_EDGE, 0.4);
    g.fillCircle(cx, cy, 4);
  }

  private _drawPipes(): void {
    const g = this.scene.add.graphics().setDepth(1);
    this.graphics.push(g);

    const pipes: { x1: number; y1: number; x2: number; y2: number }[] = [
      // Horizontal pipes connecting wall clusters
      { x1: 260, y1: 220, x2: 560, y2: 220 },
      { x1: ARENA_W - 560, y1: 220, x2: ARENA_W - 260, y2: 220 },
      { x1: 260, y1: ARENA_H - 220, x2: 560, y2: ARENA_H - 220 },
      { x1: ARENA_W - 560, y1: ARENA_H - 220, x2: ARENA_W - 260, y2: ARENA_H - 220 },
      // Vertical pipes near choke points
      { x1: CX - 660, y1: CY - 200, x2: CX - 660, y2: CY - 100 },
      { x1: CX - 660, y1: CY + 100, x2: CX - 660, y2: CY + 200 },
      { x1: CX + 660, y1: CY - 200, x2: CX + 660, y2: CY - 100 },
      { x1: CX + 660, y1: CY + 100, x2: CX + 660, y2: CY + 200 },
      // Diagonal pipes near corners
      { x1: 140, y1: 320, x2: 260, y2: 380 },
      { x1: ARENA_W - 140, y1: 320, x2: ARENA_W - 260, y2: 380 },
      { x1: 140, y1: ARENA_H - 320, x2: 260, y2: ARENA_H - 380 },
      { x1: ARENA_W - 140, y1: ARENA_H - 320, x2: ARENA_W - 260, y2: ARENA_H - 380 },
    ];

    for (const p of pipes) {
      // Pipe body
      g.lineStyle(6, COL_PIPE, 0.6);
      g.lineBetween(p.x1, p.y1, p.x2, p.y2);
      // Pipe highlight
      g.lineStyle(2, COL_PIPE_GLOW, 0.15);
      g.lineBetween(p.x1, p.y1 - 2, p.x2, p.y2 - 2);
      // Junction nodes
      g.fillStyle(COL_PIPE_GLOW, 0.3);
      g.fillCircle(p.x1, p.y1, 5);
      g.fillCircle(p.x2, p.y2, 5);
      g.lineStyle(1, COL_PIPE_GLOW, 0.5);
      g.strokeCircle(p.x1, p.y1, 5);
      g.strokeCircle(p.x2, p.y2, 5);
    }
  }

  private _drawCenterAccents(): void {
    const g = this.scene.add.graphics().setDepth(-5).setBlendMode(Phaser.BlendModes.ADD);
    this.graphics.push(g);

    // Glowing accent lines radiating from center
    const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
    for (const a of angles) {
      const innerR = 80;
      const outerR = 260;
      g.lineStyle(2, COL_ACCENT, 0.12);
      g.lineBetween(
        CX + Math.cos(a) * innerR, CY + Math.sin(a) * innerR,
        CX + Math.cos(a) * outerR, CY + Math.sin(a) * outerR,
      );
    }

    // Center ring accent
    g.lineStyle(2, COL_ACCENT, 0.18);
    g.strokeCircle(CX, CY, 100);
    g.lineStyle(1, COL_ACCENT, 0.08);
    g.strokeCircle(CX, CY, 160);
    g.strokeCircle(CX, CY, 50);

    // Corner zone markers
    const zoneMarkers = [
      { x: 200, y: 200 },
      { x: ARENA_W - 200, y: 200 },
      { x: 200, y: ARENA_H - 200 },
      { x: ARENA_W - 200, y: ARENA_H - 200 },
    ];
    for (const m of zoneMarkers) {
      g.lineStyle(1, COL_HAZARD_A, 0.2);
      g.strokeCircle(m.x, m.y, 40);
      g.fillStyle(COL_HAZARD_A, 0.04);
      g.fillCircle(m.x, m.y, 40);
    }

    // Floor arrows pointing toward center (orientation guidance)
    const arrowDist = 500;
    const arrowAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    g.lineStyle(2, COL_ACCENT, 0.08);
    for (const a of arrowAngles) {
      const ax = CX + Math.cos(a) * arrowDist;
      const ay = CY + Math.sin(a) * arrowDist;
      const tipX = CX + Math.cos(a) * (arrowDist - 30);
      const tipY = CY + Math.sin(a) * (arrowDist - 30);
      g.lineBetween(ax, ay, tipX, tipY);
      // Arrow head
      const perp = a + Math.PI / 2;
      g.lineBetween(tipX, tipY, tipX + Math.cos(a) * 10 + Math.cos(perp) * 8, tipY + Math.sin(a) * 10 + Math.sin(perp) * 8);
      g.lineBetween(tipX, tipY, tipX + Math.cos(a) * 10 - Math.cos(perp) * 8, tipY + Math.sin(a) * 10 - Math.sin(perp) * 8);
    }
  }

  private _buildSpawnPoints(): void {
    this.spawnPoints = [
      // NW quadrant
      { x: 200, y: 200 },
      { x: 440, y: 360 },
      // NE quadrant
      { x: ARENA_W - 200, y: 200 },
      { x: ARENA_W - 440, y: 360 },
      // SW quadrant
      { x: 200, y: ARENA_H - 200 },
      { x: 440, y: ARENA_H - 360 },
      // SE quadrant
      { x: ARENA_W - 200, y: ARENA_H - 200 },
      { x: ARENA_W - 440, y: ARENA_H - 360 },
    ];
  }

  private _createPhysicsBodies(): void {
    for (const o of this.obstacles) {
      const body = this.scene.add.rectangle(
        o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, 0x000000, 0,
      );
      this.staticGroup.add(body);
      (body.body as Phaser.Physics.Arcade.StaticBody).setSize(o.w, o.h);
      body.setDepth(-100); // invisible
    }
  }
}
