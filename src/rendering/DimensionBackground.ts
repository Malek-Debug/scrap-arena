import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from "../core";
import { WorldType, WORLD_PALETTES } from "../core/WorldManager";

interface VoidParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  baseAlpha: number;
}

interface FloatingShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  sides: number;
  color: number;
  baseAlpha: number;
}

interface DimensionCrack {
  x: number;
  y: number;
  segments: { angle: number; length: number }[];
  age: number;
  maxAge: number;
  particles: { x: number; y: number; vx: number; vy: number; color: number; life: number }[];
}

export class DimensionBackground {
  private scene: Phaser.Scene;

  // Current world theme
  private currentWorld: WorldType = WorldType.FOUNDRY;
  private gridPrimary = 0xff6600;
  private gridSecondary = 0xff4400;
  private borderFrom = { r: 0xff, g: 0x66, b: 0x00 };
  private borderTo = { r: 0xff, g: 0x44, b: 0x00 };

  // Layer 0
  private voidRect!: Phaser.GameObjects.Rectangle;
  private voidPulseTime = 0;

  // Layer 1
  private particleGfx!: Phaser.GameObjects.Graphics;
  private particles: VoidParticle[] = [];

  // Layer 1.5: Static floor pattern
  private floorGfx!: Phaser.GameObjects.Graphics;

  // Layer 2
  private gridGfx!: Phaser.GameObjects.Graphics;
  private gridTime = 0;

  // Layer 3
  private shardGfx!: Phaser.GameObjects.Graphics;
  private shards: FloatingShard[] = [];

  // Layer 4
  private crackGfx!: Phaser.GameObjects.Graphics;
  private cracks: DimensionCrack[] = [];

  // Layer 5
  private borderGfx!: Phaser.GameObjects.Graphics;
  private dimensionPhase = 0;

  // Layer 6: Combat reactivity
  private combatGfx!: Phaser.GameObjects.Graphics;
  private _enemyCount = 0;
  private _breachCount = 0;
  private _pulseTime = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.initVoid();
    this.initParticles();
    this.initFloor();
    this.initGrid();
    this.initShards();
    this.initCracks();
    this.initBorder();
    this.combatGfx = scene.add.graphics().setDepth(2).setScrollFactor(0);

    // Apply initial theme
    this.setWorld(WorldType.FOUNDRY);
  }

  /** Call each frame with current enemy and breach counts */
  setReactivity(enemyCount: number, breachCount: number): void {
    this._enemyCount = enemyCount;
    this._breachCount = breachCount;
  }

  /* ── World Theme Switch ─────────────────────────── */

  setWorld(world: WorldType): void {
    this.currentWorld = world;
    const pal = WORLD_PALETTES[world];

    // Void background color
    this.voidRect.setFillStyle(pal.voidColor, 1);

    // Floor pattern
    if (world === WorldType.FOUNDRY) {
      this.drawFoundryFloor();
    } else {
      this.drawCircuitFloor();
    }

    // Particles — assign new colors
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].color = pal.particles[i % pal.particles.length];
    }

    // Grid colors
    this.gridPrimary = pal.gridPrimary;
    this.gridSecondary = pal.gridSecondary;

    // Shard colors
    for (let i = 0; i < this.shards.length; i++) {
      this.shards[i].color = pal.shardColors[i % pal.shardColors.length];
    }

    // Border
    this.borderFrom = { ...pal.borderFrom };
    this.borderTo = { ...pal.borderTo };
  }

  /* ── Layer 0: Deep Void ─────────────────────────── */

  private initVoid(): void {
    this.voidRect = this.scene.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x2d2035)
      .setDepth(-10)
      .setAlpha(1);
  }

  /* ── Layer 1: Void Particles ────────────────────── */

  private initParticles(): void {
    const count = Phaser.Math.Between(30, 40); // Reduced from 50-70
    const colors = [0xff6600, 0xff4400, 0xffaa00, 0xff8800, 0xcc4400];

    for (let i = 0; i < count; i++) {
      const speed = Phaser.Math.FloatBetween(8, 30);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.particles.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Phaser.Math.FloatBetween(1.5, 4),
        color: Phaser.Utils.Array.GetRandom(colors),
        baseAlpha: Phaser.Math.FloatBetween(0.55, 0.90),
      });
    }

    this.particleGfx = this.scene.add.graphics().setDepth(-9);
  }

  /* ── Layer 1.5: Floor Pattern ───────────────────── */

  private initFloor(): void {
    this.floorGfx = this.scene.add.graphics().setDepth(-3.5);
  }

  private drawFoundryFloor(): void {
    this.floorGfx.clear();

    // ── Ambient edge molten glow ──────────────────────────────
    this.floorGfx.fillStyle(0xff4400, 0.14);
    this.floorGfx.fillRect(0, 0, 150, WORLD_HEIGHT);
    this.floorGfx.fillRect(WORLD_WIDTH - 150, 0, 150, WORLD_HEIGHT);
    this.floorGfx.fillRect(0, 0, WORLD_WIDTH, 120);
    this.floorGfx.fillRect(0, WORLD_HEIGHT - 120, WORLD_WIDTH, 120);
    this.floorGfx.fillStyle(0xff6600, 0.06);
    this.floorGfx.fillRect(0, 0, 80, WORLD_HEIGHT);
    this.floorGfx.fillRect(WORLD_WIDTH - 80, 0, 80, WORLD_HEIGHT);

    // ── Giant gear silhouettes at world edges ─────────────────
    const gearDefs: [number, number, number, number][] = [
      // [cx, cy, radius, teeth]
      [50,  240,  130, 10], [50,  720,  100,  8], [50, 1200, 150, 12],
      [WORLD_WIDTH - 50,  360,  110,  9], [WORLD_WIDTH - 50,  900, 140, 11],
      [WORLD_WIDTH - 50, 1350,   90,  8],
      [400,   50,  100,  8], [1000,  50,  130, 10], [1600,  50,  110,  9],
      [2200,  50,  100,  8],
      [600,  WORLD_HEIGHT - 50,  130, 10], [1400, WORLD_HEIGHT - 50, 100,  8],
      [2000, WORLD_HEIGHT - 50, 150, 12],
    ];
    for (const [gcx, gcy, gr, teeth] of gearDefs) {
      // Glow halo
      this.floorGfx.fillStyle(0xff4400, 0.05);
      this.floorGfx.fillCircle(gcx, gcy, gr * 1.6);
      // Gear body shadow
      this.floorGfx.fillStyle(0x1a0800, 0.95);
      this.floorGfx.fillCircle(gcx, gcy, gr);
      // Gear body
      this.floorGfx.fillStyle(0x3a1a06, 0.90);
      this.floorGfx.fillCircle(gcx, gcy, gr - 8);
      // Gear teeth
      this.floorGfx.fillStyle(0x2a1204, 0.92);
      for (let t = 0; t < teeth; t++) {
        const a = (t / teeth) * Math.PI * 2;
        const tx = gcx + Math.cos(a) * gr;
        const ty = gcy + Math.sin(a) * gr;
        this.floorGfx.fillRect(tx - 7, ty - 7, 14, 14);
      }
      // Inner ring
      this.floorGfx.lineStyle(2, 0x662200, 0.75);
      this.floorGfx.strokeCircle(gcx, gcy, gr * 0.5);
      this.floorGfx.lineStyle(1, 0x441100, 0.5);
      this.floorGfx.strokeCircle(gcx, gcy, gr * 0.3);
      // Center bolt
      this.floorGfx.fillStyle(0x441a00, 0.95);
      this.floorGfx.fillCircle(gcx, gcy, 10);
      this.floorGfx.fillStyle(0x884400, 0.80);
      this.floorGfx.fillCircle(gcx, gcy, 6);
      this.floorGfx.fillStyle(0xcc7700, 0.50);
      this.floorGfx.fillCircle(gcx - 2, gcy - 2, 2);
    }

    // ── Furnace / smelter openings at side edges ──────────────
    const furnaceGlows = [0xff2200, 0xff4400, 0xff6600, 0xff8800];
    for (let fy = 130; fy < WORLD_HEIGHT; fy += 370) {
      const fh = 52 + (fy * 7) % 44;
      // LEFT furnace casing
      this.floorGfx.fillStyle(0x3a1000, 1);
      this.floorGfx.fillRect(0, fy - fh / 2, 90, fh);
      this.floorGfx.fillStyle(0x5a2200, 1);
      this.floorGfx.fillRect(2, fy - fh / 2 + 3, 86, fh - 6);
      // Opening
      this.floorGfx.fillStyle(0x0a0400, 1);
      this.floorGfx.fillRect(12, fy - fh / 3, 52, (fh * 2) / 3);
      // Molten glow interior
      this.floorGfx.fillStyle(furnaceGlows[Math.floor(fy / 100) % 4], 0.55);
      this.floorGfx.fillRect(14, fy - fh / 4, 32, fh / 2);
      this.floorGfx.fillStyle(0xffcc44, 0.35);
      this.floorGfx.fillRect(16, fy - fh / 6, 16, fh / 3);
      // Cast glow spilling out
      this.floorGfx.fillStyle(0xff4400, 0.09);
      this.floorGfx.fillRect(0, fy - fh, 110, fh / 2);
      this.floorGfx.fillRect(0, fy + fh / 2, 110, fh / 2);
      // Rivet border
      this.floorGfx.lineStyle(1, 0x884422, 0.6);
      this.floorGfx.strokeRect(0, fy - fh / 2, 90, fh);

      // RIGHT furnace mirror
      const rh = 52 + (fy * 11) % 44;
      this.floorGfx.fillStyle(0x3a1000, 1);
      this.floorGfx.fillRect(WORLD_WIDTH - 90, fy - rh / 2, 90, rh);
      this.floorGfx.fillStyle(0x5a2200, 1);
      this.floorGfx.fillRect(WORLD_WIDTH - 88, fy - rh / 2 + 3, 86, rh - 6);
      this.floorGfx.fillStyle(0x0a0400, 1);
      this.floorGfx.fillRect(WORLD_WIDTH - 64, fy - rh / 3, 52, (rh * 2) / 3);
      this.floorGfx.fillStyle(furnaceGlows[(Math.floor(fy / 100) + 1) % 4], 0.55);
      this.floorGfx.fillRect(WORLD_WIDTH - 46, fy - rh / 4, 32, rh / 2);
      this.floorGfx.fillStyle(0xffcc44, 0.35);
      this.floorGfx.fillRect(WORLD_WIDTH - 32, fy - rh / 6, 16, rh / 3);
      this.floorGfx.fillStyle(0xff4400, 0.09);
      this.floorGfx.fillRect(WORLD_WIDTH - 110, fy - rh, 110, rh / 2);
      this.floorGfx.fillRect(WORLD_WIDTH - 110, fy + rh / 2, 110, rh / 2);
      this.floorGfx.lineStyle(1, 0x884422, 0.6);
      this.floorGfx.strokeRect(WORLD_WIDTH - 90, fy - rh / 2, 90, rh);
    }

    // ── Lava crack veins from edges ───────────────────────────
    const cracks: [number, number, number, number, number, number][] = [
      [0, 280, 160, 320, 90, 480],
      [280, 0, 320, 180, 480, 90],
      [WORLD_WIDTH, WORLD_HEIGHT - 280, WORLD_WIDTH - 160, WORLD_HEIGHT - 330, WORLD_WIDTH - 90, WORLD_HEIGHT - 470],
      [WORLD_WIDTH - 300, WORLD_HEIGHT, WORLD_WIDTH - 330, WORLD_HEIGHT - 170, WORLD_WIDTH - 490, WORLD_HEIGHT - 85],
      [0, 900, 120, 940, 60, 1100],
      [WORLD_WIDTH, 600, WORLD_WIDTH - 140, 640, WORLD_WIDTH - 70, 780],
    ];
    // Glow layer
    this.floorGfx.lineStyle(6, 0xff2200, 0.20);
    for (const [x1, y1, mx, my, x2, y2] of cracks) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(x1, y1); this.floorGfx.lineTo(mx, my); this.floorGfx.lineTo(x2, y2);
      this.floorGfx.strokePath();
    }
    // Bright center crack
    this.floorGfx.lineStyle(2, 0xff8800, 0.55);
    for (const [x1, y1, mx, my, x2, y2] of cracks) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(x1, y1); this.floorGfx.lineTo(mx, my); this.floorGfx.lineTo(x2, y2);
      this.floorGfx.strokePath();
    }
    // Hot center
    this.floorGfx.lineStyle(1, 0xffcc44, 0.40);
    for (const [x1, y1, mx, my, x2, y2] of cracks) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(x1, y1); this.floorGfx.lineTo(mx, my); this.floorGfx.lineTo(x2, y2);
      this.floorGfx.strokePath();
    }

    // ── Horizontal pipe runs at key rows ─────────────────────
    const pipeRows = [200, 600, 1000, 1340];
    for (const py of pipeRows) {
      this.floorGfx.fillStyle(0x331200, 0.40);
      this.floorGfx.fillRect(0, py - 11, WORLD_WIDTH, 22);
      this.floorGfx.fillStyle(0x4a1e00, 0.40);
      this.floorGfx.fillRect(0, py - 9, WORLD_WIDTH, 18);
      this.floorGfx.fillStyle(0x773300, 0.25);
      this.floorGfx.fillRect(0, py - 9, WORLD_WIDTH, 5); // highlight
      // Joint bolts every 240px
      for (let bx = 120; bx < WORLD_WIDTH; bx += 240) {
        this.floorGfx.fillStyle(0x4a1e00, 0.55);
        this.floorGfx.fillRect(bx - 9, py - 13, 18, 26);
        this.floorGfx.fillStyle(0x884422, 0.45);
        this.floorGfx.fillCircle(bx, py - 9, 3);
        this.floorGfx.fillCircle(bx, py + 9, 3);
      }
    }

    // ── Steel plate beams (main grid) ─────────────────────────
    this.floorGfx.lineStyle(2, 0xff4400, 0.42);
    for (let y = 0; y <= WORLD_HEIGHT; y += 120) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(0, y); this.floorGfx.lineTo(WORLD_WIDTH, y);
      this.floorGfx.strokePath();
    }
    this.floorGfx.lineStyle(2, 0xff4400, 0.35);
    for (let x = 0; x <= WORLD_WIDTH; x += 120) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(x, 0); this.floorGfx.lineTo(x, WORLD_HEIGHT);
      this.floorGfx.strokePath();
    }

    // ── Rivet dots at intersections ───────────────────────────
    for (let x = 0; x <= WORLD_WIDTH; x += 120) {
      for (let y = 0; y <= WORLD_HEIGHT; y += 120) {
        this.floorGfx.fillStyle(0xff6600, 0.78);
        this.floorGfx.fillCircle(x, y, 4);
        this.floorGfx.fillStyle(0xffaa44, 0.45);
        this.floorGfx.fillCircle(x - 1, y - 1, 1.5);
      }
    }

    // ── Glowing floor vents ────────────────────────────────────
    for (let vx = 320; vx < WORLD_WIDTH; vx += 320) {
      for (let vy = 320; vy < WORLD_HEIGHT; vy += 320) {
        this.floorGfx.fillStyle(0xff6600, 0.07);
        this.floorGfx.fillCircle(vx, vy, 28);
        this.floorGfx.lineStyle(2, 0xff8800, 0.62);
        this.floorGfx.beginPath();
        for (let off = -4; off <= 4; off += 4) {
          this.floorGfx.moveTo(vx - 18, vy + off);
          this.floorGfx.lineTo(vx + 18, vy + off);
        }
        this.floorGfx.strokePath();
        this.floorGfx.lineStyle(1, 0xaa4400, 0.55);
        this.floorGfx.strokeRect(vx - 20, vy - 10, 40, 20);
      }
    }
  }

  private drawCircuitFloor(): void {
    this.floorGfx.clear();

    // ── Ambient edge glow (circuit = blue) ───────────────────
    this.floorGfx.fillStyle(0x0033cc, 0.10);
    this.floorGfx.fillRect(0, 0, 130, WORLD_HEIGHT);
    this.floorGfx.fillRect(WORLD_WIDTH - 130, 0, 130, WORLD_HEIGHT);
    this.floorGfx.fillRect(0, 0, WORLD_WIDTH, 110);
    this.floorGfx.fillRect(0, WORLD_HEIGHT - 110, WORLD_WIDTH, 110);

    // ── PCB trunk lines (wide power/ground traces) ────────────
    const trunkYs = [120, 360, 600, 840, 1080, 1320];
    const trunkXs = [160, 480, 800, 1120, 1440, 1760, 2080, 2400];
    this.floorGfx.lineStyle(3, 0x003366, 0.48);
    for (const ty of trunkYs) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(0, ty); this.floorGfx.lineTo(WORLD_WIDTH, ty);
      this.floorGfx.strokePath();
    }
    for (const tx of trunkXs) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(tx, 0); this.floorGfx.lineTo(tx, WORLD_HEIGHT);
      this.floorGfx.strokePath();
    }
    // Bright centre of trunks
    this.floorGfx.lineStyle(1, 0x0066bb, 0.38);
    for (const ty of trunkYs) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(0, ty); this.floorGfx.lineTo(WORLD_WIDTH, ty);
      this.floorGfx.strokePath();
    }
    for (const tx of trunkXs) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(tx, 0); this.floorGfx.lineTo(tx, WORLD_HEIGHT);
      this.floorGfx.strokePath();
    }

    // ── L-shaped branch traces ────────────────────────────────
    const traceRoutes: [number, number, number, number, number, number][] = [
      [160, 120,  320, 120,  320, 360],
      [480, 120,  480, 240,  800, 240],
      [800, 360,  640, 360,  640, 600],
      [1120, 120, 1120, 240, 1280, 240],
      [1440, 360, 1600, 360, 1600, 120],
      [1760, 600, 1760, 480, 2080, 480],
      [2080, 840, 2240, 840, 2240, 600],
      [480,  840,  480, 720,  800, 720],
      [1120, 1080, 960, 1080, 960, 840],
      [160,  1080, 320, 1080, 320, 840],
      [1440, 1080, 1440, 960, 1760, 960],
      [2400, 360, 2240, 360, 2240, 120],
      [160,  600,  320, 600,  320, 840],
      [800, 1320,  640, 1320,  640, 1080],
      [1760, 1320, 1920, 1320, 1920, 1080],
      [2080, 1080, 2240, 1080, 2240, 1320],
      [640,  360,  640, 240, 800, 240],
      [1280, 600, 1440, 600, 1440, 840],
      [960,  360,  960, 600, 1120, 600],
    ];
    this.floorGfx.lineStyle(2, 0x004499, 0.42);
    for (const [sx, sy, mx, my, ex, ey] of traceRoutes) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(sx, sy); this.floorGfx.lineTo(mx, my); this.floorGfx.lineTo(ex, ey);
      this.floorGfx.strokePath();
    }
    this.floorGfx.lineStyle(1, 0x0099cc, 0.32);
    for (const [sx, sy, mx, my, ex, ey] of traceRoutes) {
      this.floorGfx.beginPath();
      this.floorGfx.moveTo(sx, sy); this.floorGfx.lineTo(mx, my); this.floorGfx.lineTo(ex, ey);
      this.floorGfx.strokePath();
    }

    // ── Solder pads at trunk intersections ────────────────────
    for (const ty of trunkYs) {
      for (const tx of trunkXs) {
        this.floorGfx.fillStyle(0x001133, 0.85);
        this.floorGfx.fillCircle(tx, ty, 5);
        this.floorGfx.lineStyle(1, 0x0066aa, 0.55);
        this.floorGfx.strokeCircle(tx, ty, 5);
        this.floorGfx.fillStyle(0x0055aa, 0.50);
        this.floorGfx.fillCircle(tx, ty, 3);
        this.floorGfx.fillStyle(0x88bbff, 0.35);
        this.floorGfx.fillCircle(tx - 1, ty - 1, 1);
      }
    }
    // Pads at trace midpoints
    for (const [, , mx, my] of traceRoutes) {
      this.floorGfx.fillStyle(0x001133, 0.85);
      this.floorGfx.fillCircle(mx, my, 4);
      this.floorGfx.lineStyle(1, 0x004488, 0.50);
      this.floorGfx.strokeCircle(mx, my, 4);
      this.floorGfx.fillStyle(0x0044aa, 0.45);
      this.floorGfx.fillCircle(mx, my, 2);
    }

    // ── Data cluster nodes (larger glowing) ───────────────────
    const clusters: [number, number][] = [
      [640, 720], [1280, 360], [1920, 840], [480, 1080],
      [2080, 480], [320, 240], [1600, 1200], [800, 600],
      [1120, 840], [1760, 360],
    ];
    for (const [ncx, ncy] of clusters) {
      this.floorGfx.fillStyle(0x0044ff, 0.05);
      this.floorGfx.fillCircle(ncx, ncy, 55);
      this.floorGfx.fillStyle(0x0066ff, 0.09);
      this.floorGfx.fillCircle(ncx, ncy, 32);
      this.floorGfx.lineStyle(2, 0x0088ff, 0.40);
      this.floorGfx.strokeCircle(ncx, ncy, 20);
      this.floorGfx.lineStyle(1, 0x00aaff, 0.50);
      this.floorGfx.strokeCircle(ncx, ncy, 13);
      this.floorGfx.fillStyle(0x0055aa, 0.65);
      this.floorGfx.fillCircle(ncx, ncy, 8);
      this.floorGfx.fillStyle(0x0099cc, 0.80);
      this.floorGfx.fillCircle(ncx, ncy, 5);
      this.floorGfx.fillStyle(0x44bbff, 0.65);
      this.floorGfx.fillCircle(ncx, ncy, 3);
      this.floorGfx.lineStyle(1, 0x0066aa, 0.30);
      this.floorGfx.lineBetween(ncx - 38, ncy, ncx + 38, ncy);
      this.floorGfx.lineBetween(ncx, ncy - 38, ncx, ncy + 38);
    }

    // ── Hexagonal grid overlay ────────────────────────────────
    const r = 60;
    const colSpacing = r * 1.5;
    const rowSpacing = r * Math.sqrt(3);
    for (let col = -1; col * colSpacing < WORLD_WIDTH + r; col++) {
      const hcx = col * colSpacing;
      const colOffset = col % 2 !== 0 ? rowSpacing / 2 : 0;
      for (let row = -1; ; row++) {
        const hcy = row * rowSpacing + colOffset;
        if (hcy > WORLD_HEIGHT + r) break;
        this.floorGfx.lineStyle(1, 0x00ccff, 0.28);
        this.floorGfx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const angle = (i * Math.PI) / 3;
          const vx = hcx + r * Math.cos(angle);
          const vy = hcy + r * Math.sin(angle);
          if (i === 0) this.floorGfx.moveTo(vx, vy);
          else this.floorGfx.lineTo(vx, vy);
        }
        this.floorGfx.strokePath();
        this.floorGfx.fillStyle(0x00ccff, 0.50);
        this.floorGfx.fillCircle(hcx, hcy, 2);
      }
    }

    // ── IC chip silhouettes at world edges ────────────────────
    type PinSide = "right" | "left" | "bottom" | "top";
    const chips: { x: number; y: number; w: number; h: number; side: PinSide }[] = [
      { x: 0,                   y: 180,  w: 64, h: 44, side: "right"  },
      { x: 0,                   y: 580,  w: 64, h: 44, side: "right"  },
      { x: 0,                   y: 980,  w: 64, h: 44, side: "right"  },
      { x: WORLD_WIDTH - 64,    y: 380,  w: 64, h: 44, side: "left"   },
      { x: WORLD_WIDTH - 64,    y: 780,  w: 64, h: 44, side: "left"   },
      { x: WORLD_WIDTH - 64,    y: 1180, w: 64, h: 44, side: "left"   },
      { x: 200,                 y: 0,    w: 44, h: 64, side: "bottom" },
      { x: 840,                 y: 0,    w: 44, h: 64, side: "bottom" },
      { x: 1560,                y: 0,    w: 44, h: 64, side: "bottom" },
      { x: 2200,                y: 0,    w: 44, h: 64, side: "bottom" },
      { x: 420,  y: WORLD_HEIGHT - 64,   w: 44, h: 64, side: "top"    },
      { x: 1160, y: WORLD_HEIGHT - 64,   w: 44, h: 64, side: "top"    },
      { x: 1960, y: WORLD_HEIGHT - 64,   w: 44, h: 64, side: "top"    },
    ];
    for (const chip of chips) {
      this.floorGfx.fillStyle(0x00112a, 0.92);
      this.floorGfx.fillRect(chip.x, chip.y, chip.w, chip.h);
      this.floorGfx.fillStyle(0x001f3a, 0.85);
      this.floorGfx.fillRect(chip.x + 4, chip.y + 4, chip.w - 8, chip.h - 8);
      // Chip label dot
      this.floorGfx.fillStyle(0x003366, 0.75);
      this.floorGfx.fillCircle(chip.x + chip.w / 2, chip.y + chip.h / 2, Math.min(chip.w, chip.h) / 4);
      // Notch indicator
      this.floorGfx.fillStyle(0x0066aa, 0.5);
      this.floorGfx.fillCircle(chip.x + 8, chip.y + 8, 3);
      // Pins
      const pinCount = chip.side === "left" || chip.side === "right"
        ? Math.floor(chip.h / 9) : Math.floor(chip.w / 9);
      this.floorGfx.lineStyle(1, 0x0077bb, 0.70);
      for (let p = 1; p <= pinCount; p++) {
        const frac = (p / (pinCount + 1));
        if (chip.side === "right") {
          const py = chip.y + frac * chip.h;
          this.floorGfx.lineBetween(chip.x + chip.w, py, chip.x + chip.w + 12, py);
        } else if (chip.side === "left") {
          const py = chip.y + frac * chip.h;
          this.floorGfx.lineBetween(chip.x, py, chip.x - 12, py);
        } else if (chip.side === "bottom") {
          const px = chip.x + frac * chip.w;
          this.floorGfx.lineBetween(px, chip.y + chip.h, px, chip.y + chip.h + 12);
        } else {
          const px = chip.x + frac * chip.w;
          this.floorGfx.lineBetween(px, chip.y, px, chip.y - 12);
        }
      }
      this.floorGfx.lineStyle(1, 0x0066aa, 0.50);
      this.floorGfx.strokeRect(chip.x, chip.y, chip.w, chip.h);
    }
  }

  /* ── Layer 2: Energy Grid ───────────────────────── */

  private initGrid(): void {
    this.gridGfx = this.scene.add.graphics().setDepth(-8);
  }

  /* ── Layer 3: Floating Geometric Shards ─────────── */

  private initShards(): void {
    const count = Phaser.Math.Between(8, 12);
    const types = [3, 4, 6];

    for (let i = 0; i < count; i++) {
      const speed = Phaser.Math.FloatBetween(3, 10);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.shards.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: Phaser.Math.FloatBetween(0.1, 0.5) * (Math.random() > 0.5 ? 1 : -1),
        size: Phaser.Math.FloatBetween(20, 60),
        sides: Phaser.Utils.Array.GetRandom(types),
        color: 0xff6600, // Will be overridden by setWorld()
        baseAlpha: 0.32,
      });
    }

    this.shardGfx = this.scene.add.graphics().setDepth(-7);
  }

  /* ── Layer 4: Dimension Cracks ──────────────────── */

  private initCracks(): void {
    this.crackGfx = this.scene.add.graphics().setDepth(-6);
  }

  /* ── Layer 5: Pulsing Border ────────────────────── */

  private initBorder(): void {
    this.borderGfx = this.scene.add.graphics().setDepth(-5);
  }

  /* ══════════════════════════════════════════════════
     UPDATE
     ══════════════════════════════════════════════════ */

  update(deltaMs: number, intensity: number): void {
    const dt = deltaMs / 1000;
    intensity = Phaser.Math.Clamp(intensity, 0, 1);

    this.updateVoid(deltaMs);
    this.updateParticles(dt, intensity);
    this.updateGrid(deltaMs, intensity);
    this.updateShards(dt, intensity);
    this.updateCracks(dt);
    this.updateBorder(dt, intensity);
    this.updateCombatReactivity(deltaMs);
  }

  private updateCombatReactivity(deltaMs: number): void {
    this._pulseTime += deltaMs;
    this.combatGfx.clear();

    const enemies = Math.min(this._enemyCount, 20);
    if (enemies === 0 && this._breachCount === 0) return;

    const t = this._pulseTime * 0.001;
    const combatIntensity = enemies / 20;

    if (this.currentWorld === WorldType.FOUNDRY) {
      // Simple lava glow at bottom — just 1 rect instead of 2 + streaks
      const glowH = 40 + combatIntensity * 50;
      const pulse = 0.06 + 0.08 * combatIntensity * Math.abs(Math.sin(t * 2));
      this.combatGfx.fillStyle(0xff4400, pulse);
      this.combatGfx.fillRect(0, GAME_HEIGHT - glowH, GAME_WIDTH, glowH);
    } else {
      // Circuit world — simplified data pulse lines
      const lineCount = 3 + Math.floor(combatIntensity * 4);
      const lineSpeed = 1 + combatIntensity * 1.5;
      for (let i = 0; i < lineCount; i++) {
        const yOffset = ((t * lineSpeed * 60 + (i / lineCount) * GAME_HEIGHT) % GAME_HEIGHT);
        const y = GAME_HEIGHT - yOffset;
        const alpha = 0.04 + 0.08 * combatIntensity;
        this.combatGfx.lineStyle(1, 0x00ccff, alpha);
        this.combatGfx.beginPath();
        this.combatGfx.moveTo(0, y);
        this.combatGfx.lineTo(GAME_WIDTH, y);
        this.combatGfx.strokePath();
      }
      // Breach flicker
      if (this._breachCount > 0) {
        const flashAlpha = 0.03 * this._breachCount * Math.abs(Math.sin(t * 6));
        this.combatGfx.fillStyle(0xcc44ff, flashAlpha);
        this.combatGfx.fillRect(0, 0, 6, GAME_HEIGHT);
        this.combatGfx.fillRect(GAME_WIDTH - 6, 0, 6, GAME_HEIGHT);
      }
    }
  }

  /* ── Void pulse ─────────────────────────────────── */

  private updateVoid(deltaMs: number): void {
    this.voidPulseTime += deltaMs;
    // Keep alpha at 1 — no darkening pulse
  }

  /* ── Void Particles ─────────────────────────────── */

  private updateParticles(dt: number, intensity: number): void {
    const speedMult = intensity > 0.5 ? 1 + (intensity - 0.5) * 2 : 1;
    const alphaMult = intensity > 0.5 ? 1 + (intensity - 0.5) : 1;

    // Viewport culling — only draw particles near camera
    const cam = this.scene.cameras.main;
    const cx = cam.scrollX - 100;
    const cy = cam.scrollY - 100;
    const cr = cx + cam.width + 200;
    const cb = cy + cam.height + 200;

    this.particleGfx.clear();

    for (const p of this.particles) {
      p.x += p.vx * speedMult * dt;
      p.y += p.vy * speedMult * dt;

      // Wrap edges
      if (p.x < -5) p.x += WORLD_WIDTH + 10;
      else if (p.x > WORLD_WIDTH + 5) p.x -= WORLD_WIDTH + 10;
      if (p.y < -5) p.y += WORLD_HEIGHT + 10;
      else if (p.y > WORLD_HEIGHT + 5) p.y -= WORLD_HEIGHT + 10;

      // Skip drawing if outside viewport
      if (p.x < cx || p.x > cr || p.y < cy || p.y > cb) continue;

      const alpha = Math.min(p.baseAlpha * alphaMult, 1);
      this.particleGfx.fillStyle(p.color, alpha);
      this.particleGfx.fillCircle(p.x, p.y, p.radius);
    }
  }

  /* ── Energy Grid ────────────────────────────────── */

  private updateGrid(deltaMs: number, intensity: number): void {
    this.gridTime += deltaMs;
    const t = this.gridTime;
    const amplitude = intensity * 1.5;
    const spacing = 120; // Increased from 80

    this.gridGfx.clear();

    const primaryAlpha = 0.50 + intensity * 0.15;

    // Single grid only (removed secondary for performance)
    this.gridGfx.lineStyle(1.5, this.gridPrimary, primaryAlpha);
    this.drawWarpedGrid(t, amplitude, spacing, 0, 0);
  }

  private drawWarpedGrid(
    time: number,
    amplitude: number,
    spacing: number,
    offsetX: number,
    offsetY: number,
  ): void {
    const step = 20; // Increased from 8 — 2.5× fewer line segments
    const cam = this.scene.cameras.main;
    const cx = cam.scrollX;
    const cy = cam.scrollY;
    const cw = cam.width;
    const ch = cam.height;
    const margin = spacing;

    // Vertical lines (only within camera viewport + margin)
    const startGx = Math.floor((cx - margin - offsetX) / spacing) * spacing + offsetX;
    for (let gx = startGx; gx <= cx + cw + margin; gx += spacing) {
      this.gridGfx.beginPath();
      let first = true;
      for (let y = cy - margin; y <= cy + ch + margin; y += step) {
        const xOff = Math.sin(y * 0.02 + time * 0.001) * amplitude;
        if (first) {
          this.gridGfx.moveTo(gx + xOff, y);
          first = false;
        } else {
          this.gridGfx.lineTo(gx + xOff, y);
        }
      }
      this.gridGfx.strokePath();
    }

    // Horizontal lines (only within camera viewport + margin)
    const startGy = Math.floor((cy - margin - offsetY) / spacing) * spacing + offsetY;
    for (let gy = startGy; gy <= cy + ch + margin; gy += spacing) {
      this.gridGfx.beginPath();
      let first = true;
      for (let x = cx - margin; x <= cx + cw + margin; x += step) {
        const yOff = Math.sin(x * 0.02 + time * 0.0008) * amplitude;
        if (first) {
          this.gridGfx.moveTo(x, gy + yOff);
          first = false;
        } else {
          this.gridGfx.lineTo(x, gy + yOff);
        }
      }
      this.gridGfx.strokePath();
    }
  }

  /* ── Floating Shards ────────────────────────────── */

  private updateShards(dt: number, intensity: number): void {
    this.shardGfx.clear();

    // Viewport culling
    const cam = this.scene.cameras.main;
    const cx = cam.scrollX - 80;
    const cy = cam.scrollY - 80;
    const cr = cx + cam.width + 160;
    const cb = cy + cam.height + 160;

    for (const s of this.shards) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rotation += s.rotationSpeed * dt;

      if (s.x < -s.size) s.x += WORLD_WIDTH + s.size * 2;
      else if (s.x > WORLD_WIDTH + s.size) s.x -= WORLD_WIDTH + s.size * 2;
      if (s.y < -s.size) s.y += WORLD_HEIGHT + s.size * 2;
      else if (s.y > WORLD_HEIGHT + s.size) s.y -= WORLD_HEIGHT + s.size * 2;

      // Skip drawing if outside viewport
      if (s.x < cx || s.x > cr || s.y < cy || s.y > cb) continue;

      const flashAlpha = intensity > 0.7 ? s.baseAlpha * 4 : s.baseAlpha;
      const alpha = Math.min(flashAlpha, 1);

      this.shardGfx.lineStyle(2, s.color, alpha);
      this.drawPolygon(s.x, s.y, s.size / 2, s.sides, s.rotation);
    }
  }

  private drawPolygon(cx: number, cy: number, r: number, sides: number, rot: number): void {
    this.shardGfx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = rot + (i * Math.PI * 2) / sides;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) {
        this.shardGfx.moveTo(px, py);
      } else {
        this.shardGfx.lineTo(px, py);
      }
    }
    this.shardGfx.closePath();
    this.shardGfx.strokePath();
  }

  /* ── Dimension Cracks ───────────────────────────── */

  spawnCrack(x: number, y: number): void {
    const segCount = Phaser.Math.Between(3, 5);
    const segments: { angle: number; length: number }[] = [];
    for (let i = 0; i < segCount; i++) {
      segments.push({
        angle: Phaser.Math.FloatBetween(0, Math.PI * 2),
        length: Phaser.Math.FloatBetween(30, 80),
      });
    }

    const crackParticles: DimensionCrack["particles"] = [];
    const pCount = Phaser.Math.Between(6, 12);
    const crackColors = [0xaa44ff, 0x00ff88];
    for (let i = 0; i < pCount; i++) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.FloatBetween(15, 40);
      crackParticles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        color: Phaser.Utils.Array.GetRandom(crackColors),
        life: Phaser.Math.FloatBetween(1.2, 2),
      });
    }

    this.cracks.push({ x, y, segments, age: 0, maxAge: 3, particles: crackParticles });

    // Remove oldest if exceeding max
    while (this.cracks.length > 10) {
      this.cracks.shift();
    }
  }

  private updateCracks(dt: number): void {
    this.crackGfx.clear();

    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const c = this.cracks[i];
      c.age += dt;

      if (c.age >= c.maxAge) {
        this.cracks.splice(i, 1);
        continue;
      }

      const fadeAlpha = Math.max(0, 1 - c.age / c.maxAge);

      // Draw jagged line segments
      this.crackGfx.lineStyle(3, 0xffffff, 0.85 * fadeAlpha);
      for (const seg of c.segments) {
        const ex = c.x + Math.cos(seg.angle) * seg.length;
        const ey = c.y + Math.sin(seg.angle) * seg.length;

        // Jagged: add a midpoint offset
        const mx = (c.x + ex) / 2 + Phaser.Math.FloatBetween(-8, 8);
        const my = (c.y + ey) / 2 + Phaser.Math.FloatBetween(-8, 8);

        this.crackGfx.beginPath();
        this.crackGfx.moveTo(c.x, c.y);
        this.crackGfx.lineTo(mx, my);
        this.crackGfx.lineTo(ex, ey);
        this.crackGfx.strokePath();
      }

      // Bleed particles (active for first 2 seconds)
      for (const p of c.particles) {
        if (c.age < 2 && p.life > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          const pAlpha = Math.max(0, p.life / 2) * 0.6;
          this.crackGfx.fillStyle(p.color, pAlpha);
          this.crackGfx.fillCircle(p.x, p.y, 2);
        }
      }
    }
  }

  /* ── Pulsing Border ─────────────────────────────── */

  private updateBorder(dt: number, intensity: number): void {
    this.dimensionPhase += dt / 12;
    if (this.dimensionPhase > 1) this.dimensionPhase -= 1;

    const t = this.dimensionPhase;
    const r = Math.round(Phaser.Math.Linear(this.borderFrom.r, this.borderTo.r, t));
    const g = Math.round(Phaser.Math.Linear(this.borderFrom.g, this.borderTo.g, t));
    const b = Math.round(Phaser.Math.Linear(this.borderFrom.b, this.borderTo.b, t));
    const color = (r << 16) | (g << 8) | b;
    const alpha = 0.55 + intensity * 0.25;

    this.borderGfx.clear();
    // Single border line (removed inner glow for perf)
    this.borderGfx.lineStyle(4, color, alpha);
    this.borderGfx.strokeRect(2, 2, WORLD_WIDTH - 4, WORLD_HEIGHT - 4);
  }

  /* ══════════════════════════════════════════════════
     DESTROY
     ══════════════════════════════════════════════════ */

  destroy(): void {
    this.voidRect.destroy();
    this.particleGfx.destroy();
    this.floorGfx.destroy();
    this.gridGfx.destroy();
    this.shardGfx.destroy();
    this.crackGfx.destroy();
    this.borderGfx.destroy();
    this.particles.length = 0;
    this.shards.length = 0;
    this.cracks.length = 0;
  }
}
