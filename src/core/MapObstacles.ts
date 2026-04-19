import Phaser from "phaser";
import { WORLD_WIDTH, WORLD_HEIGHT, CELL_W as CFG_CELL_W, CELL_H as CFG_CELL_H, ROOM_COLS, ROOM_ROWS } from "./GameConfig";

// ─────────────────────────────────────────────────────────────
// MapObstacles — room-based machine city generation system
// Builds grid of themed rooms with walls, doorways, props, and
// floor decorations that scale with wave progression.
// ─────────────────────────────────────────────────────────────

export type ObstacleKind =
  | "wall" | "crate" | "pipe_h" | "pipe_v" | "generator" | "barrel"
  | "pillar" | "server_rack" | "terminal" | "reactor" | "cooling"
  | "workbench" | "antenna"
  | "conveyor_belt" | "tesla_coil" | "data_core" | "ventilation_fan"
  | "hologram_table" | "fuel_cell" | "shield_pylon"
  | "centrifuge" | "specimen_jar" | "lab_table" | "bio_reactor" | "chem_hood" | "scanner"
  | "plasma_conduit" | "blast_furnace" | "ammo_rack" | "containment_tank";

export interface ObstacleData {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  destructible: boolean;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite;
  hpBar?: Phaser.GameObjects.Graphics;
  glow?: Phaser.GameObjects.Arc;
  corruption: number;     // 0 = healthy, 100 = fully corrupted
  maxCorruption: number;  // always 100
  corruptionGfx?: Phaser.GameObjects.Graphics;
  // Active prop metadata
  beltDir?: { x: number; y: number };       // conveyor direction
  teslaTimer?: number;                       // ms until next arc
  fanCenterX?: number;                       // ventilation fan center
  fanCenterY?: number;
}

// ─── Room Physics ─────────────────────────────────────────

export interface RoomPhysicsZone {
  col: number;
  row: number;
  theme: RoomTheme;
  speedMultiplier: number;
  friction: number;
  gravityPull?: { x: number; y: number; strength: number };
  damagePerSec: number;
  healPerSec: number;
  bulletSpeedMod: number;
  visibilityRadius: number;
  enemySpeedMod?: number;
  // ── New physics modifiers ──────────────────────────────────
  invertY?: boolean;              // Vertical movement axis flipped (up-down)
  invertControls?: boolean;       // All movement reversed (walking backward)
  windForce?: { x: number; y: number }; // Constant wind — deflects bullets & entities
  gravityDown?: number;           // Downward gravity strength (px/s added to vy)
  physicsLabel?: string;          // HUD display name for this zone's physics
}

const ROOM_PHYSICS: Record<RoomTheme, Omit<RoomPhysicsZone, "col" | "row" | "theme" | "gravityPull">> = {
  hub:         { speedMultiplier: 1.0,  friction: 1,    damagePerSec: 0,   healPerSec: 2,   bulletSpeedMod: 1.0,  visibilityRadius: 0,   physicsLabel: "HUB — SAFE ZONE" },
  factory:     { speedMultiplier: 1.1,  friction: 0.92, damagePerSec: 0,   healPerSec: 0,   bulletSpeedMod: 1.0,  visibilityRadius: 0,   physicsLabel: "FACTORY FLOOR" },
  server:      { speedMultiplier: 0.85, friction: 1,    damagePerSec: 0,   healPerSec: 0,   bulletSpeedMod: 1.3,  visibilityRadius: 0,   physicsLabel: "SERVER CORE — SIGNAL BOOST" },
  power:       { speedMultiplier: 1.0,  friction: 1,    damagePerSec: 0,   healPerSec: 1,   bulletSpeedMod: 1.0,  visibilityRadius: 0,   physicsLabel: "REACTOR CORE — SAFE ZONE" },
  control:     { speedMultiplier: 1.0,  friction: 1,    damagePerSec: 0,   healPerSec: 0,   bulletSpeedMod: 1.0,  visibilityRadius: 320, physicsLabel: "CONTROL — CAMERA STATIC" },
  maintenance: { speedMultiplier: 0.9,  friction: 0.7,  damagePerSec: 0,   healPerSec: 0,   bulletSpeedMod: 0.9,  visibilityRadius: 0,   physicsLabel: "MAINTENANCE — SLICK FLOOR" },
  armory:      { speedMultiplier: 1.0,  friction: 1,    damagePerSec: 0,   healPerSec: 1,   bulletSpeedMod: 1.0,  visibilityRadius: 0,   physicsLabel: "ARMORY — SAFE ZONE" },
  quarantine:  { speedMultiplier: 0.7,  friction: 0.8,  damagePerSec: 3.5, healPerSec: 0,   bulletSpeedMod: 0.8,  visibilityRadius: 260, physicsLabel: "QUARANTINE — BIOHAZARD", windForce: { x: 22, y: 8 } },
  vault:       { speedMultiplier: 1.0,  friction: 1,    damagePerSec: 0,   healPerSec: 0,   bulletSpeedMod: 1.4,  visibilityRadius: 0,   physicsLabel: "VAULT — PRECISION CORE" },
};

// ─── Prop Definitions ────────────────────────────────────────

interface PropDef {
  tex: string;
  w: number;
  h: number;
  hp: number;
  destructible: boolean;
  glow?: number;
  glowR?: number;
}

const PROPS: Record<string, PropDef> = {
  crate:       { tex: "obs_crate",       w: 77,  h: 77,  hp: 9999, destructible: false },
  barrel:      { tex: "obs_barrel",      w: 58,  h: 58,  hp: 30,   destructible: true },
  pillar:      { tex: "obs_pillar",      w: 62,  h: 62,  hp: 9999, destructible: false },
  generator:   { tex: "obs_generator",   w: 91,  h: 91,  hp: 80,   destructible: true,  glow: 0xff6600, glowR: 77 },
  pipe_h:      { tex: "obs_pipe_h",      w: 178, h: 34,  hp: 9999, destructible: false },
  pipe_v:      { tex: "obs_pipe_v",      w: 34,  h: 178, hp: 9999, destructible: false },
  server_rack: { tex: "env_server_rack", w: 62,  h: 115, hp: 9999, destructible: false, glow: 0x2288ff, glowR: 43 },
  terminal:    { tex: "env_terminal",    w: 72,  h: 62,  hp: 9999, destructible: false, glow: 0x00ffaa, glowR: 60 },
  reactor:     { tex: "env_reactor",     w: 106, h: 106, hp: 120,  destructible: true,  glow: 0x44ff88, glowR: 91 },
  cooling:     { tex: "env_cooling",     w: 82,  h: 82,  hp: 9999, destructible: false },
  workbench:   { tex: "env_workbench",   w: 91,  h: 53,  hp: 60,   destructible: true },
  antenna:     { tex: "env_antenna",     w: 48,  h: 67,  hp: 40,   destructible: true,  glow: 0x4488ff, glowR: 53 },
  // Active props
  conveyor_belt:    { tex: "env_conveyor_belt",    w: 130, h: 38,  hp: 9999, destructible: false },
  tesla_coil:       { tex: "env_tesla_coil",       w: 53,  h: 77,  hp: 60,   destructible: true,  glow: 0x4488ff, glowR: 67 },
  data_core:        { tex: "env_data_core",        w: 67,  h: 67,  hp: 100,  destructible: true,  glow: 0x00ffff, glowR: 72 },
  ventilation_fan:  { tex: "env_ventilation_fan",  w: 72,  h: 72,  hp: 9999, destructible: false },
  hologram_table:   { tex: "env_hologram_table",   w: 91,  h: 67,  hp: 9999, destructible: false, glow: 0x00ffcc, glowR: 67 },
  fuel_cell:        { tex: "env_fuel_cell",        w: 48,  h: 62,  hp: 20,   destructible: true,  glow: 0xff6600, glowR: 43 },
  shield_pylon:     { tex: "env_shield_pylon",     w: 53,  h: 77,  hp: 9999, destructible: false, glow: 0x4488ff, glowR: 82 },
  // Lab equipment
  centrifuge:       { tex: "lab_centrifuge",        w: 62,  h: 62,  hp: 60,   destructible: true,  glow: 0x00ffcc, glowR: 48 },
  specimen_jar:     { tex: "lab_specimen_jar",      w: 48,  h: 62,  hp: 9999, destructible: false, glow: 0x44ff88, glowR: 36 },
  lab_table:        { tex: "lab_table",             w: 134, h: 53,  hp: 9999, destructible: false },
  bio_reactor:      { tex: "lab_bio_reactor",       w: 91,  h: 106, hp: 120,  destructible: true,  glow: 0x00ff88, glowR: 91 },
  chem_hood:        { tex: "lab_chem_hood",         w: 106, h: 67,  hp: 9999, destructible: false, glow: 0x44ffcc, glowR: 58 },
  scanner:          { tex: "lab_scanner",           w: 72,  h: 72,  hp: 60,   destructible: true,  glow: 0x4488ff, glowR: 58 },
  // ── New Heavy Industrial Props ─────────────────────────────────────────────
  plasma_conduit:   { tex: "env_plasma_conduit",    w: 125, h: 48,  hp: 9999, destructible: false, glow: 0xff8800, glowR: 62 },
  blast_furnace:    { tex: "env_blast_furnace",     w: 115, h: 106, hp: 150,  destructible: true,  glow: 0xff4400, glowR: 96 },
  ammo_rack:        { tex: "env_ammo_rack",         w: 96,  h: 77,  hp: 9999, destructible: false, glow: 0xffcc00, glowR: 53 },
  containment_tank: { tex: "lab_containment_tank",  w: 62,  h: 96,  hp: 9999, destructible: false, glow: 0x00ff88, glowR: 62 },
};

// ─── Room Themes ─────────────────────────────────────────────

type RoomTheme = "factory" | "server" | "power" | "control" | "maintenance" | "hub"
               | "armory" | "quarantine" | "vault";

interface ThemeDef {
  pool: string[];
  minCount: number;
  maxCount: number;
}

const THEMES: Record<RoomTheme, ThemeDef> = {
  factory:     { pool: ["lab_table","centrifuge","specimen_jar","bio_reactor","chem_hood","barrel","cooling","blast_furnace","plasma_conduit"], minCount: 5, maxCount: 9 },
  server:      { pool: ["server_rack","server_rack","terminal","data_core","scanner","hologram_table","containment_tank"],                     minCount: 5, maxCount: 9 },
  power:       { pool: ["bio_reactor","reactor","generator","pillar","tesla_coil","fuel_cell","plasma_conduit"],                               minCount: 4, maxCount: 7 },
  control:     { pool: ["terminal","terminal","scanner","antenna","hologram_table","shield_pylon"],                                            minCount: 4, maxCount: 7 },
  maintenance: { pool: ["crate","barrel","lab_table","cooling","ventilation_fan","specimen_jar","ammo_rack"],                                  minCount: 4, maxCount: 7 },
  hub:         { pool: ["lab_table","pillar","shield_pylon","crate","specimen_jar"],                                                           minCount: 2, maxCount: 5 },
  // ── New rooms ─────────────────────────────────────────────────────────────
  armory:      { pool: ["pillar","shield_pylon","crate","barrel","fuel_cell","tesla_coil","workbench","ammo_rack","blast_furnace"], minCount: 5, maxCount: 8 },
  quarantine:  { pool: ["specimen_jar","bio_reactor","chem_hood","barrel","lab_table","centrifuge","cooling","containment_tank"],  minCount: 5, maxCount: 8 },
  vault:       { pool: ["server_rack","data_core","terminal","hologram_table","shield_pylon","pillar","containment_tank"],         minCount: 4, maxCount: 7 },
};

const THEME_CYCLE: RoomTheme[] = ["factory", "server", "power", "control", "maintenance"];

const FLOOR_COLORS: Record<RoomTheme, { base: number; grid: number; accent: number; border: number }> = {
  factory:     { base: 0x0e1612, grid: 0x1a2a1e, accent: 0x00ee66, border: 0x00ff88 },  // Bio Lab: neon green
  server:      { base: 0x0c1018, grid: 0x152030, accent: 0x2288ff, border: 0x44aaff },  // Data Lab: electric blue
  power:       { base: 0x14100a, grid: 0x281c0e, accent: 0xff8800, border: 0xffaa44 },  // Reactor: deep orange
  control:     { base: 0x131108, grid: 0x221e0c, accent: 0xffcc00, border: 0xffee44 },  // Command: gold
  maintenance: { base: 0x0e1014, grid: 0x1c2028, accent: 0x6699aa, border: 0x88bbcc },  // Supply: steel teal
  hub:         { base: 0x0c0e18, grid: 0x141826, accent: 0x4488ff, border: 0x66aaff },  // Hub: cool blue
  armory:      { base: 0x140c0a, grid: 0x261410, accent: 0xff4422, border: 0xff7744 },  // Armory: crimson
  quarantine:  { base: 0x0c1408, grid: 0x162008, accent: 0x88dd00, border: 0xbbff22 },  // Quarantine: toxic green
  vault:       { base: 0x0e0c16, grid: 0x1a1428, accent: 0xaa44ff, border: 0xcc77ff },  // Vault: violet
};

const ROOM_DISPLAY_NAMES: Record<RoomTheme, string> = {
  factory:     "BIO LAB",
  server:      "DATA LAB",
  power:       "REACTOR CORE",
  control:     "CMD CENTER",
  maintenance: "SUPPLY DEPOT",
  hub:         "LAB HUB",
  armory:      "ARMORY",
  quarantine:  "QUARANTINE",
  vault:       "SECURE VAULT",
};

// ─── Grid Constants ──────────────────────────────────────────
//
// 3 × 3 room grid  — each cell is one screen (1280 × 720)
//
//   Col →     0            1              2
//  Row 0  [ HUB ]      [ BIO LAB ]   [ ARMORY ]
//  Row 1  [ DATA LAB ] [ REACTOR  ]  [ QUARANTINE ]
//  Row 2  [ CMD CTR  ] [ SUPPLY   ]  [ VAULT ]
//
const GRID_COLS = ROOM_COLS;
const GRID_ROWS = ROOM_ROWS;
const CELL_W = CFG_CELL_W;
const CELL_H = CFG_CELL_H;
const WALL_T = 24;
const DOOR_W = 300;
const SPAWN_CLEAR = 220;

// ─────────────────────────────────────────────────────────────

export class MapObstacles {
  private scene: Phaser.Scene;
  private obstacles: ObstacleData[] = [];
  private nextId = 1;
  private decorations: Phaser.GameObjects.GameObject[] = [];
  private glows: Phaser.GameObjects.Arc[] = [];
  private activeCells: boolean[][] = [];
  private cellThemes: RoomTheme[][] = [];
  private laserHazards: { x: number; y: number; horiz: boolean; length: number; isOn: () => boolean }[] = [];
  private accessBarriers: {
    gfxObjects: Phaser.GameObjects.GameObject[];
    physicsBody: Phaser.GameObjects.Rectangle;
    theme: string; doorX: number; doorY: number; horiz: boolean;
  }[] = [];
  private roomPhysicsZones: RoomPhysicsZone[] = [];
  private activePropsGfx!: Phaser.GameObjects.Graphics;
  // ── Interaction points (set during room build) ──────────
  public shopTerminalPos: { x: number; y: number } | null = null;
  public reactorMachinePos: { x: number; y: number } | null = null;
  // ── Boss arena wind state ───────────────────────────────
  public  bossWindForce = { x: 0, y: 0 };
  private _bossWindAngle = 0;
  private _bossWindTimer = 0;
  private _bossWindHudGfx?: Phaser.GameObjects.Graphics;
  private _bossWindHudText?: Phaser.GameObjects.Text;
  public  isBossArena = false;

  staticGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.staticGroup = scene.physics.add.staticGroup();
    this.activePropsGfx = scene.add.graphics().setDepth(52);
  }

  // ─── Public API ──────────────────────────────────────────

  setupForWave(wave: number, unlockedThemes: Set<string> = new Set(["hub", "power", "armory"])): void {
    this.clearAll();
    this.isBossArena = false;
    this.bossWindForce = { x: 0, y: 0 };
    this._bossWindAngle = 0;
    this._bossWindTimer = 0;

    if (wave % 5 === 0) {
      this.isBossArena = true;
      this._layoutBossArena(wave);
      return;
    }

    // ALL waves use room-grid city
    const active = this._computeActiveCells(wave);
    this.activeCells = active;
    const themes = this._assignThemes(active);
    this.cellThemes = themes;
    this._drawRoomFloors(active, themes);
    this._buildWalls(active);
    this._buildMiniRoomInnerWalls(active, themes);
    this._addWallLights(active);
    this._addAccessBarriers(active, themes, unlockedThemes);
    this._populateRooms(active, themes, wave);
    this._addFloorDecorations(active, themes);
    this._buildRoomPhysicsZones(active, themes);
    this._addAnimatedFloorElements(active, themes);
  }

  /** Called from MainScene.update() — advances rotating boss wind each frame */
  updateBossPhysics(deltaMs: number): void {
    if (!this.isBossArena) return;
    this._bossWindTimer += deltaMs;
    // Rotate wind direction every 3 s
    if (this._bossWindTimer >= 3000) {
      this._bossWindTimer -= 3000;
      this._bossWindAngle += (Math.PI / 4) + (Math.random() - 0.5) * (Math.PI / 6);
    }
    const strength = 180;
    this.bossWindForce.x = Math.cos(this._bossWindAngle) * strength;
    this.bossWindForce.y = Math.sin(this._bossWindAngle) * strength;
    // Update HUD arrow
    if (this._bossWindHudGfx && this._bossWindHudGfx.scene) {
      const cam = this.scene.cameras.main;
      const hx = cam.scrollX + cam.width  - 80;
      const hy = cam.scrollY + cam.height - 80;
      this._bossWindHudGfx.clear();
      this._bossWindHudGfx.lineStyle(3, 0xff8800, 0.9);
      const len = 36;
      const ex = hx + Math.cos(this._bossWindAngle) * len;
      const ey = hy + Math.sin(this._bossWindAngle) * len;
      this._bossWindHudGfx.lineBetween(hx, hy, ex, ey);
      // Arrowhead
      const ah = 10, aw = 6;
      const ax = this._bossWindAngle + Math.PI * 0.85;
      const bx2 = this._bossWindAngle - Math.PI * 0.85;
      this._bossWindHudGfx.lineBetween(ex, ey, ex + Math.cos(ax)*ah, ey + Math.sin(ax)*ah);
      this._bossWindHudGfx.lineBetween(ex, ey, ex + Math.cos(bx2)*aw, ey + Math.sin(bx2)*aw);
      this._bossWindHudGfx.strokePath();
      if (this._bossWindHudText && this._bossWindHudText.scene) {
        this._bossWindHudText.setPosition(cam.scrollX + cam.width - 130, cam.scrollY + cam.height - 106);
      }
    }
  }

  isBlocked(x: number, y: number, radius: number): boolean {
    for (const obs of this.obstacles) {
      if (obs.hp <= 0) continue;
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      const halfW = obs.w / 2 + radius;
      const halfH = obs.h / 2 + radius;
      if (Math.abs(x - cx) < halfW && Math.abs(y - cy) < halfH) return true;
    }
    return false;
  }

  resolveCollision(x: number, y: number, radius: number): { x: number; y: number } {
    let rx = x, ry = y;
    for (const obs of this.obstacles) {
      if (obs.hp <= 0) continue;
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      const halfW = obs.w / 2 + radius;
      const halfH = obs.h / 2 + radius;
      const dx = rx - cx;
      const dy = ry - cy;
      if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
        const overlapX = halfW - Math.abs(dx);
        const overlapY = halfH - Math.abs(dy);
        if (overlapX < overlapY) {
          rx += dx > 0 ? overlapX : -overlapX;
        } else {
          ry += dy > 0 ? overlapY : -overlapY;
        }
      }
    }
    return { x: rx, y: ry };
  }

  bulletHit(bx: number, by: number, damage: number): boolean {
    for (const obs of this.obstacles) {
      if (obs.hp <= 0) continue;
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      if (Math.abs(bx - cx) < obs.w / 2 + 4 && Math.abs(by - cy) < obs.h / 2 + 4) {
        if (obs.destructible) {
          obs.hp -= damage;
          if (obs.sprite && obs.sprite.active) {
            (obs.sprite as Phaser.GameObjects.Sprite).setTint?.(0xffffff);
            this.scene.time.delayedCall(60, () => {
              if (obs.sprite?.active) (obs.sprite as Phaser.GameObjects.Sprite).clearTint?.();
            });
          }
          if (obs.hp <= 0) {
            this._destroyObstacle(obs);
          }
        }
        return true;
      }
    }
    return false;
  }

  update(): void {
    for (const obs of this.obstacles) {
      if (obs.hp <= 0 || !obs.destructible || !obs.hpBar) continue;
      if (obs.hp >= obs.maxHp) { obs.hpBar.setVisible(false); continue; }
      obs.hpBar.setVisible(true);
      obs.hpBar.clear();
      const barW = obs.w;
      const barH = 4;
      const bx = obs.x;
      const by = obs.y - 6;
      obs.hpBar.fillStyle(0x333333, 0.8);
      obs.hpBar.fillRect(bx, by, barW, barH);
      obs.hpBar.fillStyle(0x00ff44, 0.9);
      obs.hpBar.fillRect(bx, by, barW * (obs.hp / obs.maxHp), barH);
    }

    // Corruption visual feedback
    for (const obs of this.obstacles) {
      if (obs.kind === "wall" || obs.hp <= 0) continue;
      if (obs.corruption > 0 && obs.sprite?.active) {
        const tintR = Math.min(255, Math.floor(obs.corruption * 2.55));
        const tint = (tintR << 16) | (Math.max(0, 100 - tintR) << 8) | Math.max(0, 100 - tintR);
        (obs.sprite as any).setTint?.(tint);

        if (!obs.corruptionGfx) {
          obs.corruptionGfx = this.scene.add.graphics().setDepth(11);
          this.decorations.push(obs.corruptionGfx);
        }
        obs.corruptionGfx.clear();
        if (obs.corruption > 5) {
          const cBarW = obs.w;
          const cBarH = 3;
          const cbx = obs.x;
          const cby = obs.y + obs.h + 2;
          obs.corruptionGfx.fillStyle(0x220000, 0.8);
          obs.corruptionGfx.fillRect(cbx, cby, cBarW, cBarH);
          obs.corruptionGfx.fillStyle(0xff0044, 0.9);
          obs.corruptionGfx.fillRect(cbx, cby, cBarW * (obs.corruption / 100), cBarH);
        }
      } else if (obs.corruption <= 0 && obs.sprite?.active) {
        (obs.sprite as any).clearTint?.();
        if (obs.corruptionGfx) {
          obs.corruptionGfx.clear();
        }
      }
    }
  }

  getObstacles(): readonly ObstacleData[] {
    return this.obstacles;
  }

  getCorruptibleMachines(): { id: number; x: number; y: number; w: number; h: number; corruption: number }[] {
    return this.obstacles
      .filter(o => o.kind !== "wall" && o.hp > 0 && o.corruption < 100)
      .map(o => ({ id: o.id, x: o.x + o.w / 2, y: o.y + o.h / 2, w: o.w, h: o.h, corruption: o.corruption }));
  }

  corruptMachine(id: number, amount: number): void {
    const obs = this.obstacles.find(o => o.id === id);
    if (!obs || obs.kind === "wall" || obs.hp <= 0) return;
    obs.corruption = Math.min(100, obs.corruption + amount);
  }

  repairNearby(px: number, py: number, repairRadius: number = 80, repairAmount: number = 25): boolean {
    let bestDist = Infinity;
    let bestObs: ObstacleData | null = null;
    for (const obs of this.obstacles) {
      if (obs.kind === "wall" || obs.hp <= 0 || obs.corruption <= 0) continue;
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (dist < repairRadius && dist < bestDist) {
        bestDist = dist;
        bestObs = obs;
      }
    }
    if (bestObs) {
      bestObs.corruption = Math.max(0, bestObs.corruption - repairAmount);
      return true;
    }
    return false;
  }

  getCorruptionStats(): { total: number; corrupted: number; avgCorruption: number } {
    let total = 0;
    let corrupted = 0;
    let sum = 0;
    for (const obs of this.obstacles) {
      if (obs.kind === "wall" || obs.hp <= 0) continue;
      total++;
      sum += obs.corruption;
      if (obs.corruption >= 50) corrupted++;
    }
    return { total, corrupted, avgCorruption: total > 0 ? sum / total : 0 };
  }

  getRoomPhysicsAt(x: number, y: number): RoomPhysicsZone | null {
    const col = Math.floor(x / CELL_W);
    const row = Math.floor(y / CELL_H);
    return this.roomPhysicsZones.find(z => z.col === col && z.row === row) ?? null;
  }

  getRoomThemeAtCell(col: number, row: number): RoomTheme | null {
    if (!this.cellThemes) return null;
    if (row < 0 || row >= this.cellThemes.length) return null;
    if (col < 0 || col >= this.cellThemes[row].length) return null;
    return this.cellThemes[row][col] ?? null;
  }

  updateActiveProps(
    px: number, py: number, deltaMs: number,
    enemies: { posX: number; posY: number; hp: number; takeDamage(n: number): void }[],
  ): { playerVelocityMod: { x: number; y: number }; playerShielded: boolean } {
    let vx = 0, vy = 0;
    let shielded = false;
    this.activePropsGfx.clear();

    for (const obs of this.obstacles) {
      if (obs.hp <= 0) continue;
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;

      switch (obs.kind) {
        case "conveyor_belt": {
          const dir = obs.beltDir ?? { x: 1, y: 0 };
          const force = 80 * (deltaMs / 1000);
          // Player overlap
          if (px > obs.x && px < obs.x + obs.w && py > obs.y && py < obs.y + obs.h) {
            vx += dir.x * force;
            vy += dir.y * force;
          }
          // Enemy overlap
          for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (e.posX > obs.x && e.posX < obs.x + obs.w &&
                e.posY > obs.y && e.posY < obs.y + obs.h) {
              e.posX += dir.x * force;
              e.posY += dir.y * force;
            }
          }
          break;
        }

        case "tesla_coil": {
          if (obs.corruption > 50) break;
          obs.teslaTimer = (obs.teslaTimer ?? Phaser.Math.Between(2000, 4000)) - deltaMs;
          if (obs.teslaTimer <= 0) {
            obs.teslaTimer = Phaser.Math.Between(3000, 4000);
            // Find nearest enemy within 200px
            let bestDist = 200 * 200;
            let target: typeof enemies[0] | null = null;
            for (const e of enemies) {
              if (e.hp <= 0) continue;
              const dx = e.posX - cx, dy = e.posY - cy;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestDist) { bestDist = d2; target = e; }
            }
            if (target) {
              target.takeDamage(15);
              // Visual: electric arc line
              this.activePropsGfx.lineStyle(2, 0xffffff, 0.9);
              this.activePropsGfx.lineBetween(cx, cy, target.posX, target.posY);
              this.activePropsGfx.lineStyle(4, 0x4488ff, 0.4);
              this.activePropsGfx.lineBetween(cx, cy, target.posX, target.posY);
              // Blue flash at coil
              const flash = this.scene.add.circle(cx, cy, 20, 0x4488ff, 0.5)
                .setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
              this.scene.tweens.add({
                targets: flash, alpha: 0, scaleX: 2, scaleY: 2,
                duration: 200, onComplete: () => flash.destroy(),
              });
            }
          }
          break;
        }

        case "ventilation_fan": {
          const fanCx = obs.fanCenterX ?? cx;
          const fanCy = obs.fanCenterY ?? cy;
          const pushR = 120;
          const pushStrength = 40 * (deltaMs / 1000);
          // Player push
          const pdx = px - fanCx, pdy = py - fanCy;
          const pdist2 = pdx * pdx + pdy * pdy;
          if (pdist2 < pushR * pushR && pdist2 > 100) {
            const pdist = Math.sqrt(pdist2);
            const f = pushStrength / pdist;
            vx += pdx * f;
            vy += pdy * f;
          }
          // Enemy push
          for (const e of enemies) {
            if (e.hp <= 0) continue;
            const edx = e.posX - fanCx, edy = e.posY - fanCy;
            const ed2 = edx * edx + edy * edy;
            if (ed2 < pushR * pushR && ed2 > 100) {
              const edist = Math.sqrt(ed2);
              const ef = pushStrength / edist;
              e.posX += edx * ef;
              e.posY += edy * ef;
            }
          }
          break;
        }

        case "shield_pylon": {
          const shDx = px - cx, shDy = py - cy;
          if (shDx * shDx + shDy * shDy < 100 * 100) {
            shielded = true;
          }
          break;
        }

        default:
          break;
      }
    }

    return { playerVelocityMod: { x: vx, y: vy }, playerShielded: shielded };
  }

  /** Returns a random position inside an active room, avoiding obstacles and the spawn clear zone */
  /** Returns a spawn position inside the same room the player is standing in. */
  private static SAFE_THEMES: Set<string> = new Set(["power", "armory", "hub"]);

  getSpawnPositionInPlayerRoom(playerX: number, playerY: number, minDist: number = 200): { x: number; y: number } {
    // Determine which grid cell the player is in
    let r = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(playerY / CELL_H)));
    let c = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(playerX / CELL_W)));

    // Never spawn enemies in safe-zone rooms (Reactor / Armory / HUB).
    // If player is in one of those, find the nearest active combat room instead.
    const theme = this.cellThemes?.[r]?.[c];
    if (!this.activeCells[r]?.[c] || !theme || MapObstacles.SAFE_THEMES.has(theme)) {
      const combat = this._findNearestCombatCell(r, c);
      r = combat.r;
      c = combat.c;
    }

    const rx = c * CELL_W + WALL_T + 50;
    const ry = r * CELL_H + WALL_T + 50;
    const rw = CELL_W - (WALL_T + 50) * 2;
    const rh = CELL_H - (WALL_T + 50) * 2;

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = rx + Phaser.Math.Between(0, rw);
      const y = ry + Phaser.Math.Between(0, rh);
      const dx = x - playerX;
      const dy = y - playerY;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) continue;
      if (this.isBlocked(x, y, 20)) continue;
      return { x, y };
    }
    return { x: rx + rw / 2, y: ry + rh / 2 };
  }

  /** Find the nearest active combat cell (not a safe zone). Falls back to HUB [1,0]. */
  private _findNearestCombatCell(fromR: number, fromC: number): { r: number; c: number } {
    let bestR = 1, bestC = 0, bestDist = Infinity;
    for (let rr = 0; rr < GRID_ROWS; rr++) {
      for (let cc = 0; cc < GRID_COLS; cc++) {
        if (!this.activeCells[rr]?.[cc]) continue;
        const t = this.cellThemes?.[rr]?.[cc];
        if (!t || MapObstacles.SAFE_THEMES.has(t)) continue;
        const dist = Math.abs(rr - fromR) + Math.abs(cc - fromC);
        if (dist < bestDist) { bestDist = dist; bestR = rr; bestC = cc; }
      }
    }
    return { r: bestR, c: bestC };
  }

  getRandomRoomPosition(playerX: number, playerY: number, minDist: number = 200, unlockedThemes?: Set<string>): { x: number; y: number } {
    const rooms: { rx: number; ry: number; rw: number; rh: number }[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!this.activeCells[r]?.[c]) continue;
        const theme = this.cellThemes[r]?.[c];
        // Skip safe zones — enemies should never spawn there
        if (theme && MapObstacles.SAFE_THEMES.has(theme)) continue;
        if (unlockedThemes) {
          if (theme && !unlockedThemes.has(theme)) continue;
        }
        rooms.push({
          rx: c * CELL_W + WALL_T + 40,
          ry: r * CELL_H + WALL_T + 40,
          rw: CELL_W - (WALL_T + 40) * 2,
          rh: CELL_H - (WALL_T + 40) * 2,
        });
      }
    }

    if (rooms.length === 0) {
      return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    }

    for (let attempt = 0; attempt < 50; attempt++) {
      const room = rooms[Phaser.Math.Between(0, rooms.length - 1)];
      const x = room.rx + Phaser.Math.Between(20, room.rw - 20);
      const y = room.ry + Phaser.Math.Between(20, room.rh - 20);
      
      const dx = x - playerX;
      const dy = y - playerY;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) continue;
      if (this.isBlocked(x, y, 20)) continue;
      
      return { x, y };
    }

    const room = rooms[Phaser.Math.Between(0, rooms.length - 1)];
    return { x: room.rx + room.rw / 2, y: room.ry + room.rh / 2 };
  }

  /** Check if position is touching an active laser. Returns damage (0 if not) */
  checkLaserDamage(px: number, py: number, radius: number): number {
    for (const laser of this.laserHazards) {
      if (!laser.isOn()) continue;
      if (laser.horiz) {
        const lx1 = laser.x - laser.length / 2;
        const lx2 = laser.x + laser.length / 2;
        if (px + radius > lx1 && px - radius < lx2 && Math.abs(py - laser.y) < radius + 4) {
          return 8;
        }
      } else {
        const ly1 = laser.y - laser.length / 2;
        const ly2 = laser.y + laser.length / 2;
        if (py + radius > ly1 && py - radius < ly2 && Math.abs(px - laser.x) < radius + 4) {
          return 8;
        }
      }
    }
    return 0;
  }

  /** Returns damage if player is touching a locked access barrier (0 if clear). */
  checkAccessBarrierDamage(_px: number, _py: number, _radius: number): number {
    // Barriers are now solid physics walls — no damage needed, physics handles blocking.
    return 0;
  }

  /** Permanently open all access barriers for a given room theme (removes physics wall). */
  unlockTheme(theme: string): void {
    const toRemove = this.accessBarriers.filter(b => b.theme === theme);
    for (const b of toRemove) {
      for (const obj of b.gfxObjects) obj.destroy();
      this.staticGroup.remove(b.physicsBody, true, true);
    }
    this.accessBarriers = this.accessBarriers.filter(b => b.theme !== theme);
  }

  clearAll(): void {
    this.shopTerminalPos = null;
    this.reactorMachinePos = null;
    for (const obs of this.obstacles) {
      obs.sprite?.destroy();
      obs.hpBar?.destroy();
      obs.glow?.destroy();
    }
    for (const d of this.decorations) d.destroy();
    for (const g of this.glows) g.destroy();
    for (const b of this.accessBarriers) {
      for (const obj of b.gfxObjects) obj.destroy();
    }
    this._bossWindHudGfx = undefined;
    this._bossWindHudText = undefined;
    this.isBossArena = false;
    this.obstacles = [];
    this.decorations = [];
    this.glows = [];
    this.laserHazards = [];
    this.accessBarriers = [];
    this.roomPhysicsZones = [];
    this.staticGroup.clear(true, true);
    this.activePropsGfx.clear();
  }

  destroy(): void {
    this.clearAll();
  }

  // ─── Grid Helpers ────────────────────────────────────────

  private _computeActiveCells(wave: number): boolean[][] {
    const grid: boolean[][] = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(false),
    );

    // Hub [1,0] is the player's starting room — always active.
    // Reactor Core [0,0] and Armory [0,1] are always accessible mini-rooms.
    grid[1][0] = true;
    grid[0][0] = true;
    grid[0][1] = true;
    if (wave <= 2) return grid;

    // Wave 3: CMD CENTER [2,0] — directly below hub
    grid[2][0] = true;
    if (wave <= 3) return grid;

    // Wave 4–5: BIO LAB [2,1] + DATA LAB [2,2]
    grid[2][1] = true;
    grid[2][2] = true;
    if (wave <= 6) return grid;

    // Wave 7–9: QUARANTINE [3,0] + SUPPLY DEPOT [3,1]
    grid[3][0] = true;
    grid[3][1] = true;
    if (wave <= 9) return grid;

    // Wave 10+: VAULT [3,2]
    grid[3][2] = true;
    return grid;
  }

  private _assignThemes(active: boolean[][]): RoomTheme[][] {
    // 4 × 3 layout — row 0 is the mini-room strip above the hub
    //
    //  Row 0  [REACTOR]  [ARMORY]   (empty)          ← small utility rooms above hub
    //  Row 1  [HUB]      (empty)    (empty)          ← main safe zone
    //  Row 2  [CMD CTR]  [BIO LAB]  [DATA LAB]       ← combat tier 1
    //  Row 3  [QUARANTINE] [SUPPLY] [VAULT]           ← combat tier 2
    const LAYOUT: RoomTheme[][] = [
      ["power",       "armory",      "hub"        ],  // Row 0: mini-rooms
      ["hub",         "hub",         "hub"        ],  // Row 1: hub area
      ["control",     "factory",     "server"     ],  // Row 2: first combat tier
      ["quarantine",  "maintenance", "vault"      ],  // Row 3: deep combat tier
    ];
    return Array.from({ length: GRID_ROWS }, (_, r) =>
      Array.from({ length: GRID_COLS }, (_, c) =>
        active[r][c] ? LAYOUT[r][c] : ("hub" as RoomTheme),
      ),
    );
  }

  // ─── Mini-room Ceiling Walls (row 0) ─────────────────────
  // Reactor Core and Armory occupy only the BOTTOM HALF of their row-0 cell.
  // A horizontal divider wall with a door gap is added at y = CELL_H / 2.
  private _buildMiniRoomInnerWalls(active: boolean[][], themes: RoomTheme[][]): void {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!active[0][c]) continue;
      if (themes[0][c] !== "power" && themes[0][c] !== "armory") continue;

      const cellX = c * CELL_W;
      const midY = Math.floor(CELL_H / 2);  // 360

      // Solid wall across the top half — no door gap. Player can only be in bottom half.
      this._placeWall(cellX, midY - WALL_T / 2, CELL_W, WALL_T);

      // Visual: tint the "dead zone" above the inner wall dark grey
      const deadZone = this.scene.add.rectangle(
        cellX + CELL_W / 2, midY / 2,
        CELL_W, midY,
        0x050508, 0.92,
      ).setDepth(1);
      this.decorations.push(deadZone);

      // Label in the dead zone
      const theme = themes[0][c];
      const labelColor = theme === "power" ? "#00ff88" : "#ff8844";
      const subLabel = this.scene.add.text(
        cellX + CELL_W / 2, midY / 2,
        theme === "power" ? "▲  REACTOR CORE  ▲" : "▲  ARMORY  ▲",
        { fontFamily: "monospace", fontSize: "13px", color: labelColor },
      ).setOrigin(0.5).setDepth(2).setAlpha(0.4);
      this.decorations.push(subLabel);
    }
  }

  // ─── Wall Construction ───────────────────────────────────

  private _buildWalls(active: boolean[][]): void {
    // Horizontal internal walls (between row r and row r+1)
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const top = active[r][c];
        const bot = active[r + 1][c];
        if (!top && !bot) continue;
        const wx = c * CELL_W;
        const wy = (r + 1) * CELL_H;
        if (top && bot) {
          // Two doorway gaps (1/3 and 2/3 of wall)
          const door1Center = wx + CELL_W * 0.3;
          const door2Center = wx + CELL_W * 0.7;
          const halfDoor = DOOR_W / 2;
          // Segment 1: left edge to first door
          const s1End = door1Center - halfDoor;
          if (s1End > wx) this._placeWall(wx, wy - WALL_T / 2, s1End - wx, WALL_T);
          // Segment 2: between doors
          const s2Start = door1Center + halfDoor;
          const s2End = door2Center - halfDoor;
          if (s2End > s2Start) this._placeWall(s2Start, wy - WALL_T / 2, s2End - s2Start, WALL_T);
          // Segment 3: after second door to right edge
          const s3Start = door2Center + halfDoor;
          if (wx + CELL_W > s3Start) this._placeWall(s3Start, wy - WALL_T / 2, wx + CELL_W - s3Start, WALL_T);
          this._placeDoorMarker(door1Center - halfDoor, wy - WALL_T / 2, DOOR_W, WALL_T);
          this._placeDoorMarker(door2Center - halfDoor, wy - WALL_T / 2, DOOR_W, WALL_T);
        } else {
          this._placeWall(wx, wy - WALL_T / 2, CELL_W, WALL_T);
        }
      }
    }

    // Vertical internal walls (between col c and col c+1)
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS - 1; c++) {
        const left = active[r][c];
        const right = active[r][c + 1];
        if (!left && !right) continue;
        const wx = (c + 1) * CELL_W;
        const wy = r * CELL_H;
        if (left && right) {
          const door1Center = wy + CELL_H * 0.3;
          const door2Center = wy + CELL_H * 0.7;
          const halfDoor = DOOR_W / 2;
          const s1End = door1Center - halfDoor;
          if (s1End > wy) this._placeWall(wx - WALL_T / 2, wy, WALL_T, s1End - wy);
          const s2Start = door1Center + halfDoor;
          const s2End = door2Center - halfDoor;
          if (s2End > s2Start) this._placeWall(wx - WALL_T / 2, s2Start, WALL_T, s2End - s2Start);
          const s3Start = door2Center + halfDoor;
          if (wy + CELL_H > s3Start) this._placeWall(wx - WALL_T / 2, s3Start, WALL_T, wy + CELL_H - s3Start);
          this._placeDoorMarker(wx - WALL_T / 2, door1Center - halfDoor, WALL_T, DOOR_W);
          this._placeDoorMarker(wx - WALL_T / 2, door2Center - halfDoor, WALL_T, DOOR_W);
        } else {
          this._placeWall(wx - WALL_T / 2, wy, WALL_T, CELL_H);
        }
      }
    }

    // Outer boundary walls
    for (let c = 0; c < GRID_COLS; c++) {
      if (active[0][c]) this._placeWall(c * CELL_W, 0, CELL_W, WALL_T);
      if (active[GRID_ROWS - 1][c]) this._placeWall(c * CELL_W, WORLD_HEIGHT - WALL_T, CELL_W, WALL_T);
    }
    for (let r = 0; r < GRID_ROWS; r++) {
      if (active[r][0]) this._placeWall(0, r * CELL_H, WALL_T, CELL_H);
      if (active[r][GRID_COLS - 1]) this._placeWall(WORLD_WIDTH - WALL_T, r * CELL_H, WALL_T, CELL_H);
    }
  }

  private _placeWall(x: number, y: number, w: number, h: number): void {
    // Main wall body - visible metal panel
    let sprite: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Rectangle;
    if (this.scene.textures.exists("env_wall_tile")) {
      sprite = this.scene.add.tileSprite(x + w / 2, y + h / 2, w, h, "env_wall_tile").setDepth(10);
    } else {
      sprite = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x2a3040, 1).setDepth(10);
    }

    // Bright edge highlights
    const isHoriz = w > h;
    const edgeGfx = this.scene.add.graphics().setDepth(11);
    // Outer border line (vivid teal)
    edgeGfx.lineStyle(3, 0x00ccaa, 0.7);
    if (isHoriz) {
      edgeGfx.moveTo(x, y); edgeGfx.lineTo(x + w, y);
      edgeGfx.moveTo(x, y + h); edgeGfx.lineTo(x + w, y + h);
    } else {
      edgeGfx.moveTo(x, y); edgeGfx.lineTo(x, y + h);
      edgeGfx.moveTo(x + w, y); edgeGfx.lineTo(x + w, y + h);
    }
    edgeGfx.strokePath();
    // Inner highlight stripe
    edgeGfx.lineStyle(1, 0x88ddcc, 0.5);
    if (isHoriz) {
      edgeGfx.moveTo(x, y + h / 2); edgeGfx.lineTo(x + w, y + h / 2);
    } else {
      edgeGfx.moveTo(x + w / 2, y); edgeGfx.lineTo(x + w / 2, y + h);
    }
    edgeGfx.strokePath();
    this.decorations.push(edgeGfx);

    this.scene.physics.add.existing(sprite, true);
    const body = (sprite as any).body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(w, h);
    body.setOffset(Math.round((sprite.displayWidth - w) / 2), Math.round((sprite.displayHeight - h) / 2));
    this.staticGroup.add(sprite);

    this.obstacles.push({
      id: this.nextId++,
      kind: "wall",
      x, y, w, h,
      hp: 9999, maxHp: 9999,
      destructible: false,
      sprite,
      corruption: 0, maxCorruption: 100,
    });
  }

  private _placeDoorMarker(x: number, y: number, w: number, h: number): void {
    const isHoriz = w > h;
    const floorW = isHoriz ? w : w + 20;
    const floorH = isHoriz ? h + 20 : h;
    // Floor strip at doorway — brighter
    const floor = this.scene.add.rectangle(x + w / 2, y + h / 2, floorW, floorH, 0x1a2a22, 0.95).setDepth(-2);
    this.decorations.push(floor);
    // Hazard stripes
    const stripe = this.scene.add.rectangle(x + w / 2, y + h / 2, floorW, floorH, 0xffaa00, 0.25).setDepth(-1.5);
    this.decorations.push(stripe);
    // Bright threshold lights on each side
    const lightColor = 0x44ff88;
    if (isHoriz) {
      const l1 = this.scene.add.circle(x + 6, y + h / 2, 4, lightColor, 0.9).setDepth(11);
      const l2 = this.scene.add.circle(x + w - 6, y + h / 2, 4, lightColor, 0.9).setDepth(11);
      this.decorations.push(l1, l2);
      // Arrow indicator pointing through door
      const arrow = this.scene.add.text(x + w / 2, y + h / 2, "▼", {
        fontFamily: "monospace", fontSize: "14px", color: "#44ff88",
      }).setOrigin(0.5).setDepth(12).setAlpha(0.6);
      this.decorations.push(arrow);
    } else {
      const l1 = this.scene.add.circle(x + w / 2, y + 6, 4, lightColor, 0.9).setDepth(11);
      const l2 = this.scene.add.circle(x + w / 2, y + h - 6, 4, lightColor, 0.9).setDepth(11);
      this.decorations.push(l1, l2);
      const arrow = this.scene.add.text(x + w / 2, y + h / 2, "▶", {
        fontFamily: "monospace", fontSize: "14px", color: "#44ff88",
      }).setOrigin(0.5).setDepth(12).setAlpha(0.6);
      this.decorations.push(arrow);
    }
  }

  // ─── Wall Lights ──────────────────────────────────────────

  private _addWallLights(active: boolean[][]): void {
    const lightSpacing = 200;
    const lightColor = 0x88aaff;

    // Place lights along horizontal walls
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c] && !active[r + 1]?.[c]) continue;
        const wx = c * CELL_W;
        const wy = (r + 1) * CELL_H;
        const count = Math.floor(CELL_W / lightSpacing);
        for (let i = 1; i < count; i++) {
          const lx = wx + i * lightSpacing;
          const light = this.scene.add.circle(lx, wy, 3, lightColor, 0.6).setDepth(11);
          this.decorations.push(light);
          const glow = this.scene.add.circle(lx, wy, 30, lightColor, 0.04)
            .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
          this.scene.tweens.add({
            targets: glow,
            alpha: { from: 0.02, to: 0.06 },
            duration: Phaser.Math.Between(2000, 3500),
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
          this.decorations.push(glow);
        }
      }
    }

    // Place lights along vertical walls
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS - 1; c++) {
        if (!active[r][c] && !active[r]?.[c + 1]) continue;
        const wx = (c + 1) * CELL_W;
        const wy = r * CELL_H;
        const count = Math.floor(CELL_H / lightSpacing);
        for (let i = 1; i < count; i++) {
          const ly = wy + i * lightSpacing;
          const light = this.scene.add.circle(wx, ly, 3, lightColor, 0.6).setDepth(11);
          this.decorations.push(light);
          const glow = this.scene.add.circle(wx, ly, 30, lightColor, 0.04)
            .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
          this.scene.tweens.add({
            targets: glow,
            alpha: { from: 0.02, to: 0.06 },
            duration: Phaser.Math.Between(2000, 3500),
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
          this.decorations.push(glow);
        }
      }
    }

    // Outer boundary lights
    for (let c = 0; c < GRID_COLS; c++) {
      if (active[0][c]) {
        // Top edge lights
        for (let i = 1; i < Math.floor(CELL_W / lightSpacing); i++) {
          const lx = c * CELL_W + i * lightSpacing;
          const l = this.scene.add.circle(lx, 0, 3, lightColor, 0.5).setDepth(11);
          this.decorations.push(l);
        }
      }
      if (active[GRID_ROWS - 1][c]) {
        // Bottom edge lights
        for (let i = 1; i < Math.floor(CELL_W / lightSpacing); i++) {
          const lx = c * CELL_W + i * lightSpacing;
          const l = this.scene.add.circle(lx, WORLD_HEIGHT, 3, lightColor, 0.5).setDepth(11);
          this.decorations.push(l);
        }
      }
    }
    for (let r = 0; r < GRID_ROWS; r++) {
      if (active[r][0]) {
        for (let i = 1; i < Math.floor(CELL_H / lightSpacing); i++) {
          const ly = r * CELL_H + i * lightSpacing;
          const l = this.scene.add.circle(0, ly, 3, lightColor, 0.5).setDepth(11);
          this.decorations.push(l);
        }
      }
      if (active[r][GRID_COLS - 1]) {
        for (let i = 1; i < Math.floor(CELL_H / lightSpacing); i++) {
          const ly = r * CELL_H + i * lightSpacing;
          const l = this.scene.add.circle(WORLD_WIDTH, ly, 3, lightColor, 0.5).setDepth(11);
          this.decorations.push(l);
        }
      }
    }
  }

  // ─── Room Laser Hazards ───────────────────────────────────

  private _addAccessBarriers(active: boolean[][], themes: RoomTheme[][], unlockedThemes: Set<string>): void {
    // Horizontal walls (between row r and r+1)
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c] || !active[r + 1][c]) continue;
        const wallY = (r + 1) * CELL_H;
        const topTheme = themes[r][c];
        const botTheme = themes[r + 1][c];
        // Barrier is needed if either adjacent room is locked
        const topLocked = topTheme !== "hub" && !unlockedThemes.has(topTheme);
        const botLocked = botTheme !== "hub" && !unlockedThemes.has(botTheme);
        if (!topLocked && !botLocked) continue;
        const barrierTheme = topLocked ? topTheme : botTheme;
        for (const frac of [0.3, 0.7]) {
          this._createAccessBarrier(c * CELL_W + CELL_W * frac, wallY, true, barrierTheme);
        }
      }
    }
    // Vertical walls (between col c and c+1)
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS - 1; c++) {
        if (!active[r][c] || !active[r][c + 1]) continue;
        const wallX = (c + 1) * CELL_W;
        const leftTheme = themes[r][c];
        const rightTheme = themes[r][c + 1];
        const leftLocked = leftTheme !== "hub" && !unlockedThemes.has(leftTheme);
        const rightLocked = rightTheme !== "hub" && !unlockedThemes.has(rightTheme);
        if (!leftLocked && !rightLocked) continue;
        const barrierTheme = rightLocked ? rightTheme : leftTheme;
        for (const frac of [0.3, 0.7]) {
          this._createAccessBarrier(wallX, r * CELL_H + CELL_H * frac, false, barrierTheme);
        }
      }
    }
  }

  private _createAccessBarrier(doorX: number, doorY: number, horiz: boolean, theme: string): void {
    const BARRIER_COLORS: Partial<Record<RoomTheme, number>> = {
      factory:     0x00ff88,
      server:      0x44aaff,
      power:       0x00ffcc,
      control:     0xffcc44,
      maintenance: 0xaaaaaa,
      armory:      0xff6600,
      quarantine:  0xccff00,
      vault:       0xff0066,
    };
    const color = BARRIER_COLORS[theme as RoomTheme] ?? 0xff4444;
    const displayName = ROOM_DISPLAY_NAMES[theme as RoomTheme] ?? theme.toUpperCase();
    const len = DOOR_W - 10;
    const gfxObjects: Phaser.GameObjects.GameObject[] = [];

    // ── Invisible physics wall that actually blocks movement ──
    const bw = horiz ? DOOR_W : WALL_T + 2;
    const bh = horiz ? WALL_T + 2 : DOOR_W;
    const physicsBody = this.scene.add.rectangle(doorX, doorY, bw, bh, 0x000000, 0);
    this.scene.physics.add.existing(physicsBody, true);
    const pbody = physicsBody.body as Phaser.Physics.Arcade.StaticBody;
    pbody.setSize(bw, bh);
    pbody.reset();
    this.staticGroup.add(physicsBody);

    // ── Visual door panel ──
    const gfx = this.scene.add.graphics().setDepth(13);
    gfxObjects.push(gfx);

    if (horiz) {
      const lx = doorX - len / 2;
      const ly = doorY;
      // Door panel background (dark navy)
      gfx.fillStyle(0x111122, 0.96);
      gfx.fillRect(lx - 6, ly - 10, len + 12, 20);
      // Colored accent stripe
      gfx.fillStyle(color, 0.7);
      gfx.fillRect(lx - 6, ly - 3, len + 12, 6);
      // Bright center line
      gfx.fillStyle(0xffffff, 0.6);
      gfx.fillRect(lx - 6, ly - 1, len + 12, 2);
      // Warning corners
      gfx.fillStyle(0xff4400, 1);
      gfx.fillRect(lx - 6, ly - 10, 8, 20);
      gfx.fillRect(lx + len - 2, ly - 10, 8, 20);
    } else {
      const lx = doorX;
      const ly = doorY - len / 2;
      gfx.fillStyle(0x111122, 0.96);
      gfx.fillRect(lx - 10, ly - 6, 20, len + 12);
      gfx.fillStyle(color, 0.6);
      gfx.fillRect(lx - 3, ly - 6, 6, len + 12);
      gfx.fillStyle(0xffffff, 0.4);
      gfx.fillRect(lx - 1, ly - 6, 2, len + 12);
      gfx.fillStyle(0xff4400, 1);
      gfx.fillRect(lx - 10, ly - 6, 20, 8);
      gfx.fillRect(lx - 10, ly + len - 2, 20, 8);
    }

    // ── Lock label ──
    const hexStr = "#" + color.toString(16).padStart(6, "0");
    const labelX = horiz ? doorX : doorX + 30;
    const labelY = horiz ? doorY - 24 : doorY;
    const labelText = this.scene.add.text(labelX, labelY, `[LOCKED]\n${displayName}`, {
      fontSize: "9px",
      color: hexStr,
      align: "center",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(15);
    if (!horiz) labelText.setRotation(-Math.PI / 2);
    gfxObjects.push(labelText);

    // ── Gentle pulse on the gfx ──
    this.scene.tweens.add({
      targets: gfx,
      alpha: { from: 0.8, to: 1.0 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.accessBarriers.push({ gfxObjects, physicsBody, theme, doorX, doorY, horiz });
  }

  // ─── Room Population ─────────────────────────────────────

  private _populateRooms(active: boolean[][], themes: RoomTheme[][], wave: number): void {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c]) continue;
        const theme = themes[r][c];
        this._populateRoom(c, r, theme, wave);

        // Room name plate banner
        const lx = c * CELL_W + CELL_W / 2;
        const ly = r * CELL_H + WALL_T + 14;
        const colors = FLOOR_COLORS[theme];
        const bannerW = 160;
        const bannerH = 22;
        const bannerGfx = this.scene.add.graphics().setDepth(12);
        bannerGfx.fillStyle(0x000000, 0.7);
        bannerGfx.fillRoundedRect(lx - bannerW / 2, ly - 2, bannerW, bannerH, 4);
        bannerGfx.lineStyle(2, colors.accent, 0.8);
        bannerGfx.strokeRoundedRect(lx - bannerW / 2, ly - 2, bannerW, bannerH, 4);
        // Small accent diamond icon
        bannerGfx.fillStyle(colors.accent, 0.9);
        const ix = lx - bannerW / 2 + 14;
        const iy = ly + bannerH / 2 - 2;
        bannerGfx.fillTriangle(ix, iy - 5, ix - 5, iy, ix, iy + 5);
        bannerGfx.fillTriangle(ix, iy - 5, ix + 5, iy, ix, iy + 5);
        this.decorations.push(bannerGfx);
        const label = this.scene.add.text(lx + 8, ly + bannerH / 2 - 2, ROOM_DISPLAY_NAMES[theme] ?? theme.toUpperCase(), {
          fontFamily: "monospace", fontSize: "11px",
          color: `#${colors.accent.toString(16).padStart(6, "0")}`,
          fontStyle: "bold",
        }).setOrigin(0.5, 0.5).setDepth(13);
        this.decorations.push(label);
      }
    }
  }

  private _populateRoom(col: number, row: number, theme: RoomTheme, wave: number): void {
    const def = THEMES[theme];
    const count = Math.min(def.maxCount, def.minCount + Math.floor(wave / 2));
    // Mini-rooms (row 0) only use the bottom half of the cell
    const isMiniRoom = row === 0;
    const cellOriginY = row * CELL_H;
    const roomOriginY = isMiniRoom ? cellOriginY + Math.floor(CELL_H / 2) : cellOriginY;
    const roomHeight  = isMiniRoom ? Math.floor(CELL_H / 2) : CELL_H;
    const margin = WALL_T + 30;
    const rx = col * CELL_W + margin;
    const ry = roomOriginY + margin;
    const rw = CELL_W - margin * 2;
    const rh = roomHeight - margin * 2;
    // Keep a clear zone only for the hub room where the player spawns
    const isHubRoom = col === 0 && row === 1;
    const wcx = CELL_W / 2;
    const wcy = CELL_H + CELL_H / 2;  // hub center (row 1)
    // Room center for fixed interaction props (bottom half for mini-rooms)
    const roomCx = col * CELL_W + CELL_W / 2;
    const roomCy = roomOriginY + roomHeight / 2;

    // ── ARMORY: fixed shop terminal at room center-right ─────────────────────
    if (theme === "armory") {
      const termX = roomCx + 240;
      const termY = roomCy;
      this.shopTerminalPos = { x: termX, y: termY };
      // Draw glowing shop console marker
      const tGfx = this.scene.add.graphics().setDepth(4);
      tGfx.fillStyle(0xff4422, 0.9);
      tGfx.fillRect(termX - 30, termY - 22, 60, 44);
      tGfx.lineStyle(3, 0xff8844, 1);
      tGfx.strokeRect(termX - 30, termY - 22, 60, 44);
      tGfx.fillStyle(0xff6600, 0.5);
      tGfx.fillCircle(termX, termY, 14);
      this.decorations.push(tGfx);
      const shopLabel = this.scene.add.text(termX, termY - 32, "SHOP", {
        fontFamily: "monospace", fontSize: "11px", color: "#ff8844",
        stroke: "#000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(15);
      this.decorations.push(shopLabel);
      this.scene.tweens.add({
        targets: tGfx,
        alpha: { from: 0.7, to: 1 },
        duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    }

    // ── REACTOR CORE: fixed big reactor machine at room center ───────────────
    if (theme === "power") {
      const reactX = roomCx;
      const reactY = roomCy;
      this.reactorMachinePos = { x: reactX, y: reactY };
      // Draw big reactor machine marker
      const rGfx = this.scene.add.graphics().setDepth(4);
      rGfx.fillStyle(0x001a00, 0.95);
      rGfx.fillCircle(reactX, reactY, 55);
      rGfx.lineStyle(4, 0x00ff88, 0.9);
      rGfx.strokeCircle(reactX, reactY, 55);
      rGfx.lineStyle(2, 0x00ff44, 0.5);
      rGfx.strokeCircle(reactX, reactY, 40);
      rGfx.lineStyle(2, 0x00ff44, 0.3);
      rGfx.strokeCircle(reactX, reactY, 28);
      // Spoke lines
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2;
        rGfx.lineStyle(1, 0x00ff88, 0.35);
        rGfx.moveTo(reactX + Math.cos(a) * 20, reactY + Math.sin(a) * 20);
        rGfx.lineTo(reactX + Math.cos(a) * 50, reactY + Math.sin(a) * 50);
      }
      rGfx.strokePath();
      rGfx.fillStyle(0x00ff88, 0.6);
      rGfx.fillCircle(reactX, reactY, 10);
      this.decorations.push(rGfx);
      const reactLabel = this.scene.add.text(reactX, reactY - 68, "REACTOR CORE", {
        fontFamily: "monospace", fontSize: "11px", color: "#00ff88",
        stroke: "#000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(15);
      this.decorations.push(reactLabel);
      this.scene.tweens.add({
        targets: rGfx,
        alpha: { from: 0.7, to: 1 },
        duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    }

    for (let i = 0; i < count; i++) {
      const propName = def.pool[i % def.pool.length];
      const prop = PROPS[propName];
      if (!prop) continue;

      let placed = false;
      for (let attempt = 0; attempt < 25; attempt++) {
        const px = rx + Phaser.Math.Between(0, rw - prop.w);
        const py = ry + Phaser.Math.Between(0, rh - prop.h);
        const pcx = px + prop.w / 2;
        const pcy = py + prop.h / 2;

        // Spawn safe zone (hub room only)
        if (isHubRoom && Math.abs(pcx - wcx) < SPAWN_CLEAR && Math.abs(pcy - wcy) < SPAWN_CLEAR) continue;

        // Keep shop terminal and reactor machine clear of random props
        if (this.shopTerminalPos && Math.abs(pcx - this.shopTerminalPos.x) < 80 && Math.abs(pcy - this.shopTerminalPos.y) < 80) continue;
        if (this.reactorMachinePos && Math.abs(pcx - this.reactorMachinePos.x) < 90 && Math.abs(pcy - this.reactorMachinePos.y) < 90) continue;

        // Overlap check
        const checkR = Math.max(prop.w, prop.h) / 2 + 10;
        if (this.isBlocked(pcx, pcy, checkR)) continue;

        this._placeProp(propName as ObstacleKind, px, py, prop);
        placed = true;
        break;
      }
      // If can't place, skip silently
    }
  }

  private _placeProp(kind: ObstacleKind, x: number, y: number, prop: PropDef): void {
    let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
    if (this.scene.textures.exists(prop.tex)) {
      sprite = this.scene.add.sprite(x + prop.w / 2, y + prop.h / 2, prop.tex)
        .setDisplaySize(prop.w, prop.h)  // ← force visual size to match prop dimensions
        .setDepth(10);
    } else {
      const colors: Record<string, number> = {
        crate: 0x665533, barrel: 0x886633, pillar: 0x778899, generator: 0x338855,
        pipe_h: 0x556677, pipe_v: 0x556677, server_rack: 0x1a2233, terminal: 0x223322,
        reactor: 0x1a2a1a, cooling: 0x334455, workbench: 0x554433, antenna: 0x445566,
        conveyor_belt: 0x444455, tesla_coil: 0x335577, data_core: 0x006688,
        ventilation_fan: 0x556666, hologram_table: 0x224444, fuel_cell: 0x884422,
        shield_pylon: 0x334488,
        centrifuge: 0x0d4433, specimen_jar: 0x0d3322, lab_table: 0x1a3333,
        bio_reactor: 0x0a2e1a, chem_hood: 0x133322, scanner: 0x112244,
        plasma_conduit: 0x552200, blast_furnace: 0x331100, ammo_rack: 0x223300,
        containment_tank: 0x002211,
      };
      sprite = this.scene.add.rectangle(
        x + prop.w / 2, y + prop.h / 2, prop.w, prop.h,
        colors[kind] ?? 0x555555, 0.9,
      ).setDepth(10);
      (sprite as Phaser.GameObjects.Rectangle).setStrokeStyle(2, 0xaaaaaa, 0.6);
    }

    this.scene.physics.add.existing(sprite, true);
    const body = (sprite as any).body as Phaser.Physics.Arcade.StaticBody;
    const shrink = 0.7; // 30% smaller colliders for better movement
    const bw = Math.round(prop.w * shrink);
    const bh = Math.round(prop.h * shrink);
    body.setSize(bw, bh);
    body.setOffset(Math.round((sprite.displayWidth - bw) / 2), Math.round((sprite.displayHeight - bh) / 2));
    this.staticGroup.add(sprite);

    let hpBar: Phaser.GameObjects.Graphics | undefined;
    if (prop.destructible) {
      hpBar = this.scene.add.graphics().setDepth(11);
    }

    let glowObj: Phaser.GameObjects.Arc | undefined;
    if (prop.glow && prop.glowR) {
      glowObj = this.scene.add.circle(
        x + prop.w / 2, y + prop.h / 2, prop.glowR, prop.glow, 0.12,
      ).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: glowObj,
        alpha: { from: 0.06, to: 0.18 },
        duration: Phaser.Math.Between(1500, 2500),
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
      this.glows.push(glowObj);
    }

    // Active prop metadata
    let beltDir: { x: number; y: number } | undefined;
    if (kind === "conveyor_belt") {
      beltDir = Phaser.Math.Between(0, 1) === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
    }

    this.obstacles.push({
      id: this.nextId++,
      kind, x, y, w: prop.w, h: prop.h,
      hp: prop.hp, maxHp: prop.hp,
      destructible: prop.destructible,
      sprite, hpBar, glow: glowObj,
      corruption: 0, maxCorruption: 100,
      beltDir,
      teslaTimer: kind === "tesla_coil" ? Phaser.Math.Between(2000, 4000) : undefined,
      fanCenterX: kind === "ventilation_fan" ? x + prop.w / 2 : undefined,
      fanCenterY: kind === "ventilation_fan" ? y + prop.h / 2 : undefined,
    });
  }

  // ─── Room Floors ──────────────────────────────────────────

  private _drawRoomFloors(active: boolean[][], themes: RoomTheme[][]): void {
    const worldBg = this.scene.add.rectangle(
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH + 200, WORLD_HEIGHT + 200,
      0x06080e, 1
    ).setDepth(-6);
    this.decorations.push(worldBg);

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (active[r][c]) continue;
        const rx = c * CELL_W; const ry = r * CELL_H;
        const deadCell = this.scene.add.rectangle(
          rx + CELL_W / 2, ry + CELL_H / 2, CELL_W - 2, CELL_H - 2, 0x0a0c14, 1
        ).setDepth(-5);
        this.decorations.push(deadCell);
        const deadGfx = this.scene.add.graphics().setDepth(-4.5);
        deadGfx.lineStyle(1, 0x14182a, 0.7);
        for (let dx = 0; dx < CELL_W; dx += 64) {
          deadGfx.moveTo(rx + dx, ry); deadGfx.lineTo(rx + dx, ry + CELL_H);
          deadGfx.moveTo(rx, ry + dx * CELL_H / CELL_W); deadGfx.lineTo(rx + CELL_W, ry + dx * CELL_H / CELL_W);
        }
        deadGfx.lineStyle(1, 0x0e1020, 0.5);
        for (let ci = 0; ci < 4; ci++) {
          const cx2 = rx + 100 + ci * 260; const cy2 = ry + 100 + (ci % 2) * 400;
          deadGfx.moveTo(cx2, cy2); deadGfx.lineTo(cx2 + Math.floor(Math.random() * 81 + 40), cy2 + Math.floor(Math.random() * 121 - 60));
        }
        deadGfx.strokePath();
        this.decorations.push(deadGfx);
      }
    }

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c]) continue;
        const theme = themes[r][c];
        const colors = FLOOR_COLORS[theme];
        const rx = c * CELL_W;
        // Mini-rooms (row 0) — floor only in bottom half of cell
        const isMiniRoom = r === 0;
        const floorOriginY = isMiniRoom ? r * CELL_H + Math.floor(CELL_H / 2) : r * CELL_H;
        const floorHeight  = isMiniRoom ? Math.floor(CELL_H / 2) : CELL_H;
        const ry = floorOriginY;
        const mx = rx + CELL_W / 2;
        const my = ry + floorHeight / 2;

        // ── 1. TILED FLOOR ──────────────────────────────────────────
        const floorKey = `floor_${theme}`;
        const innerX = rx + WALL_T; const innerY = ry + WALL_T;
        const innerW = CELL_W - WALL_T * 2; const innerH = floorHeight - WALL_T * 2;
        if (this.scene.textures.exists(floorKey)) {
          const ts = this.scene.add.tileSprite(
            innerX + innerW / 2, innerY + innerH / 2, innerW, innerH, floorKey
          ).setDepth(-3.5);
          this.decorations.push(ts);
        } else {
          const fb = this.scene.add.rectangle(mx, my, CELL_W, floorHeight, colors.base, 0.9).setDepth(-3.5);
          this.decorations.push(fb);
        }

        // ── 2. WALL PANELS ───────────────────────────────────────────
        const wallKey = "wall_panel";
        if (this.scene.textures.exists(wallKey)) {
          const tw = this.scene.add.tileSprite(mx, ry + WALL_T / 2, CELL_W, WALL_T, wallKey).setDepth(-2.5);
          const bw = this.scene.add.tileSprite(mx, ry + floorHeight - WALL_T / 2, CELL_W, WALL_T, wallKey).setDepth(-2.5);
          const lw = this.scene.add.tileSprite(rx + WALL_T / 2, my, WALL_T, floorHeight, wallKey).setDepth(-2.5);
          const rw2 = this.scene.add.tileSprite(rx + CELL_W - WALL_T / 2, my, WALL_T, floorHeight, wallKey).setDepth(-2.5);
          this.decorations.push(tw, bw, lw, rw2);
        }

        // ── 3. WALL TRIM ─────────────────────────────────────────────
        const wallGfx = this.scene.add.graphics().setDepth(-2);
        wallGfx.lineStyle(3, colors.accent, 0.75);
        wallGfx.strokeRect(rx + WALL_T + 1, ry + WALL_T + 1, CELL_W - WALL_T * 2 - 2, floorHeight - WALL_T * 2 - 2);
        const dashW = 24, dashGap = 12;
        wallGfx.lineStyle(5, colors.accent, 0.45);
        for (let dx = rx + WALL_T + 30; dx < rx + CELL_W - WALL_T - 30; dx += dashW + dashGap) {
          wallGfx.moveTo(dx, ry + WALL_T + 5); wallGfx.lineTo(Math.min(dx + dashW, rx + CELL_W - WALL_T - 30), ry + WALL_T + 5);
        }
        for (let dx = rx + WALL_T + 30; dx < rx + CELL_W - WALL_T - 30; dx += dashW + dashGap) {
          wallGfx.moveTo(dx, ry + floorHeight - WALL_T - 5); wallGfx.lineTo(Math.min(dx + dashW, rx + CELL_W - WALL_T - 30), ry + floorHeight - WALL_T - 5);
        }
        wallGfx.strokePath();
        this.decorations.push(wallGfx);

        // ── 4. WALL PIPES ─────────────────────────────────────────────
        const pipeGfx = this.scene.add.graphics().setDepth(-2.2);
        // Main pipe body — dark steel
        pipeGfx.fillStyle(0x2a3040, 1);
        pipeGfx.fillRect(rx + WALL_T + 20, ry + WALL_T + 8, CELL_W - WALL_T * 2 - 40, 8);
        // Pipe highlight (bright top edge)
        pipeGfx.fillStyle(0x4a5870, 1);
        pipeGfx.fillRect(rx + WALL_T + 20, ry + WALL_T + 9, CELL_W - WALL_T * 2 - 40, 3);
        // Pipe shadow (dark bottom edge)
        pipeGfx.fillStyle(0x141820, 1);
        pipeGfx.fillRect(rx + WALL_T + 20, ry + WALL_T + 14, CELL_W - WALL_T * 2 - 40, 2);
        for (let px2 = rx + WALL_T + 60; px2 < rx + CELL_W - WALL_T - 60; px2 += 120) {
          // Pipe collar (darker ring)
          pipeGfx.fillStyle(0x1e2430, 1);
          pipeGfx.fillRect(px2 - 2, ry + WALL_T + 6, 4, 12);
          // Junction box (dark square)
          pipeGfx.fillStyle(0x222c3c, 1);
          pipeGfx.fillRect(px2 - 6, ry + WALL_T + 7, 12, 10);
          // Colored LED on junction — vivid glow
          pipeGfx.fillStyle(colors.accent, 0.95);
          pipeGfx.fillCircle(px2, ry + WALL_T + 12, 3);
          pipeGfx.fillStyle(0xffffff, 0.6);
          pipeGfx.fillCircle(px2 - 1, ry + WALL_T + 11, 1);
        }
        // Second thinner pipe
        pipeGfx.fillStyle(0x1e2430, 1);
        pipeGfx.fillRect(rx + WALL_T + 40, ry + WALL_T + 19, CELL_W - WALL_T * 2 - 80, 4);
        pipeGfx.fillStyle(0x303c50, 1);
        pipeGfx.fillRect(rx + WALL_T + 40, ry + WALL_T + 19, CELL_W - WALL_T * 2 - 80, 2);
        // Vertical drop pipes
        for (let px2 = rx + WALL_T + 80; px2 < rx + CELL_W - WALL_T - 80; px2 += 200) {
          pipeGfx.fillStyle(0x28303e, 1);
          pipeGfx.fillRect(px2 - 3, ry + WALL_T + 8, 6, 32);
          pipeGfx.fillStyle(colors.accent, 0.18);
          pipeGfx.fillRect(px2 - 2, ry + WALL_T + 10, 4, 26);
        }
        this.decorations.push(pipeGfx);

        // ── 5. CORNER DETAILS ─────────────────────────────────────────
        const inset = WALL_T + 22;
        const corners: [number, number][] = [
          [rx + inset, ry + inset],
          [rx + CELL_W - inset, ry + inset],
          [rx + inset, ry + floorHeight - inset],
          [rx + CELL_W - inset, ry + floorHeight - inset],
        ];
        for (const [lx, ly] of corners) {
          const cGfx = this.scene.add.graphics().setDepth(-1.5);
          cGfx.lineStyle(2, colors.accent, 0.8);
          const hr = 18;
          const hexPts: { x: number; y: number }[] = [];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            hexPts.push({ x: lx + Math.cos(a) * hr, y: ly + Math.sin(a) * hr });
          }
          cGfx.beginPath();
          cGfx.moveTo(hexPts[0].x, hexPts[0].y);
          for (let i = 1; i < 6; i++) cGfx.lineTo(hexPts[i].x, hexPts[i].y);
          cGfx.closePath();
          cGfx.strokePath();
          cGfx.fillStyle(colors.accent, 0.18);
          cGfx.fillPoints(hexPts, true);
          cGfx.fillStyle(colors.accent, 0.85);
          cGfx.fillCircle(lx, ly, 5);
          cGfx.fillStyle(0x000000, 0.9);
          cGfx.fillCircle(lx, ly, 2.5);
          this.decorations.push(cGfx);
          const halo = this.scene.add.circle(lx, ly, 28, colors.accent, 0.1)
            .setDepth(-2).setBlendMode(Phaser.BlendModes.ADD);
          this.decorations.push(halo);
          this.scene.tweens.add({
            targets: halo, alpha: { from: 0.05, to: 0.20 },
            duration: 1800 + Math.random() * 1200, yoyo: true, repeat: -1,
          });
        }

        // ── 6. ROOM NAME TAG ──────────────────────────────────────────
        const nameText = ROOM_DISPLAY_NAMES[theme] ?? theme.toUpperCase();
        const roomLabel = this.scene.add.text(mx, ry + WALL_T + 38, nameText, {
          fontSize: "13px",
          color: '#' + colors.accent.toString(16).padStart(6, '0'),
          fontFamily: "monospace",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 4,
        }).setOrigin(0.5, 0.5).setDepth(-1).setAlpha(0.80);
        this.decorations.push(roomLabel);

        // ── 7. THEME-SPECIFIC LARGE FLOOR DECAL ──────────────────────
        const tGfx = this.scene.add.graphics().setDepth(-3);

        if (theme === "factory") {
          tGfx.lineStyle(4, 0x00ff88, 0.45);
          tGfx.strokeCircle(mx, my, 60);
          tGfx.lineStyle(3, 0x00ff88, 0.35);
          tGfx.strokeCircle(mx, my, 110);
          tGfx.lineStyle(2, 0x00ff88, 0.22);
          tGfx.strokeCircle(mx, my, 165);
          tGfx.lineStyle(2, 0x00ff88, 0.35);
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
            tGfx.moveTo(mx + Math.cos(a) * 45, my + Math.sin(a) * 45);
            tGfx.lineTo(mx + Math.cos(a) * 155, my + Math.sin(a) * 155);
          }
          tGfx.strokePath();
          tGfx.fillStyle(0x00ff88, 0.40); tGfx.fillCircle(mx, my, 14);
          tGfx.fillStyle(0x001a0c, 1); tGfx.fillCircle(mx, my, 8);

        } else if (theme === "server") {
          tGfx.lineStyle(3, 0x44aaff, 0.50);
          tGfx.moveTo(rx + WALL_T + 40, my); tGfx.lineTo(rx + CELL_W - WALL_T - 40, my);
          tGfx.moveTo(mx, ry + WALL_T + 40); tGfx.lineTo(mx, ry + CELL_H - WALL_T - 40);
          tGfx.strokePath();
          tGfx.lineStyle(2, 0x44aaff, 0.35);
          for (const off of [-180, -90, 90, 180]) {
            tGfx.moveTo(rx + WALL_T + 40, my + off); tGfx.lineTo(rx + CELL_W - WALL_T - 40, my + off);
            tGfx.moveTo(mx + off, ry + WALL_T + 40); tGfx.lineTo(mx + off, ry + CELL_H - WALL_T - 40);
          }
          tGfx.strokePath();
          tGfx.lineStyle(2, 0x0099ff, 0.55);
          for (const ox of [-180, -90, 0, 90, 180]) {
            for (const oy of [-180, -90, 0, 90, 180]) {
              if (Math.abs(ox) + Math.abs(oy) <= 270) {
                tGfx.strokeCircle(mx + ox, my + oy, 5);
                tGfx.fillStyle(0x4488dd, 0.55); tGfx.fillCircle(mx + ox, my + oy, 2.5);
              }
            }
          }
          tGfx.lineStyle(3, 0x0099ff, 0.70); tGfx.strokeCircle(mx, my, 22);
          tGfx.fillStyle(0x2277ee, 0.70); tGfx.fillCircle(mx, my, 12);

        } else if (theme === "power") {
          tGfx.fillStyle(0xff8800, 0.15);
          for (let w = 0; w < 6; w += 2) {
            const startA = (w / 6) * Math.PI * 2 - Math.PI / 6;
            const endA = startA + Math.PI / 3;
            tGfx.beginPath(); tGfx.moveTo(mx, my);
            for (let a = startA; a <= endA; a += 0.05) {
              tGfx.lineTo(mx + Math.cos(a) * 165, my + Math.sin(a) * 165);
            }
            tGfx.closePath(); tGfx.fillPath();
          }
          tGfx.lineStyle(4, 0xff8800, 0.60); tGfx.strokeCircle(mx, my, 55);
          tGfx.lineStyle(3, 0xff8800, 0.50); tGfx.strokeCircle(mx, my, 110);
          tGfx.lineStyle(2, 0xff8800, 0.30); tGfx.strokeCircle(mx, my, 165);
          tGfx.lineStyle(2, 0xff8800, 0.45);
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            tGfx.moveTo(mx + Math.cos(a) * 35, my + Math.sin(a) * 35);
            tGfx.lineTo(mx + Math.cos(a) * 160, my + Math.sin(a) * 160);
          }
          tGfx.strokePath();
          tGfx.fillStyle(0xff8800, 0.50); tGfx.fillCircle(mx, my, 18);
          tGfx.fillStyle(0x0a0600, 1); tGfx.fillCircle(mx, my, 10);

        } else if (theme === "control") {
          tGfx.lineStyle(4, 0xffbb00, 0.55); tGfx.strokeCircle(mx, my, 50);
          tGfx.lineStyle(3, 0xffbb00, 0.45); tGfx.strokeCircle(mx, my, 100);
          tGfx.lineStyle(2, 0xffbb00, 0.32); tGfx.strokeCircle(mx, my, 165);
          tGfx.lineStyle(2, 0xffbb00, 0.50);
          tGfx.moveTo(rx + WALL_T + 40, my); tGfx.lineTo(rx + CELL_W - WALL_T - 40, my);
          tGfx.moveTo(mx, ry + WALL_T + 40); tGfx.lineTo(mx, ry + CELL_H - WALL_T - 40);
          tGfx.strokePath();
          tGfx.lineStyle(3, 0xffbb00, 0.60);
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            tGfx.moveTo(mx + Math.cos(a) * 158, my + Math.sin(a) * 158);
            tGfx.lineTo(mx + Math.cos(a) * 174, my + Math.sin(a) * 174);
          }
          tGfx.strokePath();
          tGfx.fillStyle(0xffbb00, 0.75); tGfx.fillCircle(mx, my, 9);
          tGfx.fillStyle(0x0a0800, 1); tGfx.fillCircle(mx, my, 5);

        } else if (theme === "maintenance") {
          tGfx.lineStyle(4, 0x888888, 0.55);
          const bays: [number, number][] = [[rx + CELL_W * 0.28, my], [rx + CELL_W * 0.72, my]];
          for (const [bx, by] of bays) {
            const bw2 = 220, bh2 = 130;
            tGfx.strokeRect(bx - bw2 / 2, by - bh2 / 2, bw2, bh2);
            tGfx.lineStyle(3, 0x888888, 0.35);
            for (let off = 0; off < bw2; off += 22) {
              tGfx.moveTo(bx - bw2 / 2 + off, by + bh2 / 2);
              tGfx.lineTo(bx - bw2 / 2 + off + 11, by - bh2 / 2);
            }
            tGfx.strokePath();
          }

        } else if (theme === "hub") {
          tGfx.lineStyle(4, 0x4455aa, 0.55); tGfx.strokeCircle(mx, my, 70);
          tGfx.lineStyle(3, 0x4455aa, 0.40); tGfx.strokeCircle(mx, my, 125);
          tGfx.lineStyle(2, 0x4455aa, 0.25); tGfx.strokeCircle(mx, my, 185);
          tGfx.lineStyle(4, 0x4455aa, 0.60);
          tGfx.moveTo(mx, my - 90); tGfx.lineTo(mx + 90, my);
          tGfx.lineTo(mx, my + 90); tGfx.lineTo(mx - 90, my); tGfx.lineTo(mx, my - 90);
          tGfx.strokePath();
          tGfx.fillStyle(0x4455aa, 0.55); tGfx.fillCircle(mx, my, 12);
          tGfx.fillStyle(0x04050e, 1); tGfx.fillCircle(mx, my, 6);

        } else if (theme === "armory") {
          tGfx.lineStyle(4, 0xdd5500, 0.60); tGfx.strokeCircle(mx, my, 55);
          tGfx.lineStyle(3, 0xdd5500, 0.45); tGfx.strokeCircle(mx, my, 105);
          tGfx.lineStyle(2, 0xdd5500, 0.30); tGfx.strokeCircle(mx, my, 165);
          tGfx.lineStyle(3, 0xdd5500, 0.55);
          tGfx.moveTo(rx + WALL_T + 40, my); tGfx.lineTo(mx - 70, my);
          tGfx.moveTo(mx + 70, my); tGfx.lineTo(rx + CELL_W - WALL_T - 40, my);
          tGfx.moveTo(mx, ry + WALL_T + 40); tGfx.lineTo(mx, my - 70);
          tGfx.moveTo(mx, my + 70); tGfx.lineTo(mx, ry + CELL_H - WALL_T - 40);
          tGfx.strokePath();
          tGfx.fillStyle(0xdd5500, 0.75); tGfx.fillCircle(mx, my, 10);
          tGfx.fillStyle(0x0a0200, 1); tGfx.fillCircle(mx, my, 5);

        } else if (theme === "quarantine") {
          tGfx.lineStyle(4, 0xbbff00, 0.55); tGfx.strokeCircle(mx, my, 55);
          tGfx.lineStyle(3, 0xbbff00, 0.45); tGfx.strokeCircle(mx, my, 105);
          tGfx.lineStyle(2, 0xbbff00, 0.30); tGfx.strokeCircle(mx, my, 165);
          tGfx.lineStyle(3, 0xbbff00, 0.50);
          for (const a of [Math.PI/2, Math.PI/2 + 2*Math.PI/3, Math.PI/2 + 4*Math.PI/3]) {
            tGfx.moveTo(mx + Math.cos(a) * 38, my + Math.sin(a) * 38);
            tGfx.lineTo(mx + Math.cos(a) * 155, my + Math.sin(a) * 155);
          }
          tGfx.strokePath();
          tGfx.fillStyle(0xbbff00, 0.65); tGfx.fillCircle(mx, my, 12);
          tGfx.fillStyle(0x060a00, 1); tGfx.fillCircle(mx, my, 6);

        } else if (theme === "vault") {
          tGfx.lineStyle(4, 0xaa00ff, 0.55); tGfx.strokeRect(mx - 60, my - 35, 120, 70);
          tGfx.lineStyle(3, 0xaa00ff, 0.40); tGfx.strokeRect(mx - 100, my - 58, 200, 116);
          tGfx.lineStyle(2, 0xaa00ff, 0.25); tGfx.strokeRect(mx - 150, my - 87, 300, 174);
          tGfx.lineStyle(3, 0xaa00ff, 0.55);
          tGfx.moveTo(mx, my - 75); tGfx.lineTo(mx + 75, my);
          tGfx.lineTo(mx, my + 75); tGfx.lineTo(mx - 75, my); tGfx.lineTo(mx, my - 75);
          tGfx.strokePath();
          tGfx.fillStyle(0xaa00ff, 0.55); tGfx.fillCircle(mx, my, 12);
          tGfx.fillStyle(0x060010, 1); tGfx.fillCircle(mx, my, 6);
        }

        this.decorations.push(tGfx);
      }
    }
  }

  // ─── Floor Decorations ───────────────────────────────────

  private _addFloorDecorations(active: boolean[][], themes: RoomTheme[][]): void {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c]) continue;
        const theme = themes[r][c];
        // Mini-rooms use bottom half only
        const isMiniRoom = r === 0;
        const originY = isMiniRoom ? r * CELL_H + Math.floor(CELL_H / 2) : r * CELL_H;
        const roomH   = isMiniRoom ? Math.floor(CELL_H / 2) : CELL_H;
        const rx = c * CELL_W + WALL_T + 40;
        const ry = originY + WALL_T + 40;
        const rw = CELL_W - (WALL_T + 40) * 2;
        const rh = roomH - (WALL_T + 40) * 2;

        // Floor grates
        const grateCount = Phaser.Math.Between(1, 3);
        for (let i = 0; i < grateCount; i++) {
          const gx = rx + Phaser.Math.Between(0, rw - 48);
          const gy = ry + Phaser.Math.Between(0, rh - 48);
          if (this.scene.textures.exists("env_floor_grate")) {
            const grate = this.scene.add.sprite(gx + 24, gy + 24, "env_floor_grate")
              .setDepth(2).setAlpha(0.5);
            this.decorations.push(grate);
          } else {
            const grate = this.scene.add.rectangle(gx + 24, gy + 24, 48, 48, 0x333344, 0.2)
              .setDepth(2);
            this.decorations.push(grate);
          }
        }

        // Cables
        const cableCount = Phaser.Math.Between(1, 2);
        for (let i = 0; i < cableCount; i++) {
          const horiz = Phaser.Math.Between(0, 1) === 0;
          const cx = rx + Phaser.Math.Between(0, rw - (horiz ? 80 : 6));
          const cy = ry + Phaser.Math.Between(0, rh - (horiz ? 6 : 80));
          const key = horiz ? "env_cable_h" : "env_cable_v";
          const cw = horiz ? 80 : 6;
          const ch = horiz ? 6 : 80;
          if (this.scene.textures.exists(key)) {
            const cable = this.scene.add.sprite(cx + cw / 2, cy + ch / 2, key)
              .setDepth(2).setAlpha(0.5);
            this.decorations.push(cable);
          } else {
            const cable = this.scene.add.rectangle(cx + cw / 2, cy + ch / 2, cw, ch, 0x334455, 0.3)
              .setDepth(2);
            this.decorations.push(cable);
          }
        }

        // Bio-hazard markings for bio lab / reactor warning stripe
        if (theme === "factory") {
          const bx = rx + Phaser.Math.Between(60, rw - 60);
          const by = ry + Phaser.Math.Between(60, rh - 60);
          const bioGfx = this.scene.add.graphics().setDepth(2);
          bioGfx.lineStyle(2, 0x00ff88, 0.25);
          bioGfx.strokeCircle(bx, by, 18);
          bioGfx.strokeCircle(bx, by, 10);
          bioGfx.strokePath();
          this.decorations.push(bioGfx);
        } else if (theme === "power") {
          const sx = rx + Phaser.Math.Between(0, rw - 96);
          const sy = ry + Phaser.Math.Between(0, rh - 8);
          const stripe = this.scene.add.rectangle(sx + 48, sy + 4, 96, 8, 0x00ffcc, 0.25).setDepth(2);
          this.decorations.push(stripe);
        } else if (theme === "armory") {
          // Blast-damage scorch circles
          const bx = rx + Phaser.Math.Between(60, rw - 60);
          const by = ry + Phaser.Math.Between(60, rh - 60);
          const scorchGfx = this.scene.add.graphics().setDepth(2);
          scorchGfx.lineStyle(2, 0xff6600, 0.22);
          scorchGfx.strokeCircle(bx, by, 22);
          scorchGfx.lineStyle(1, 0xff6600, 0.12);
          scorchGfx.strokeCircle(bx, by, 36);
          scorchGfx.strokePath();
          this.decorations.push(scorchGfx);
        } else if (theme === "quarantine") {
          // Warning triangle floor marker
          const bx = rx + Phaser.Math.Between(60, rw - 60);
          const by = ry + Phaser.Math.Between(60, rh - 40);
          const warnGfx = this.scene.add.graphics().setDepth(2);
          warnGfx.lineStyle(2, 0xccff00, 0.28);
          warnGfx.strokeTriangle(bx, by - 22, bx - 19, by + 11, bx + 19, by + 11);
          warnGfx.fillStyle(0xccff00, 0.3);
          warnGfx.fillCircle(bx, by + 5, 3);
          warnGfx.strokePath();
          this.decorations.push(warnGfx);
        } else if (theme === "vault") {
          // Security laser tripwire cross
          const lx = rx + Phaser.Math.Between(40, rw - 40);
          const ly = ry + Phaser.Math.Between(40, rh - 20);
          const laserGfx = this.scene.add.graphics().setDepth(2);
          laserGfx.lineStyle(1, 0xff0066, 0.22);
          laserGfx.moveTo(lx - 30, ly); laserGfx.lineTo(lx + 30, ly);
          laserGfx.moveTo(lx, ly - 16); laserGfx.lineTo(lx, ly + 16);
          laserGfx.strokePath();
          this.decorations.push(laserGfx);
        }
      }
    }
  }

  // ─── Room Physics Zones ─────────────────────────────────

  private _buildRoomPhysicsZones(active: boolean[][], themes: RoomTheme[][]): void {
    this.roomPhysicsZones = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c]) continue;
        const theme = themes[r][c];
        const base = ROOM_PHYSICS[theme];
        const zone: RoomPhysicsZone = {
          col: c,
          row: r,
          theme,
          ...base,
        };
        // Power room: add gravity pull toward reactor center (bottom half of mini-room for row=0)
        if (theme === "power") {
          const isMini = r === 0;
          zone.gravityPull = {
            x: c * CELL_W + CELL_W / 2,
            y: isMini ? r * CELL_H + CELL_H * 0.75 : r * CELL_H + CELL_H / 2,
            strength: 15,
          };
        }
        this.roomPhysicsZones.push(zone);
      }
    }
  }

  // ─── Animated Floor Elements ───────────────────────────

  private _addAnimatedFloorElements(active: boolean[][], themes: RoomTheme[][]): void {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!active[r][c]) continue;
        const theme = themes[r][c];
        const isMiniRoom = r === 0;
        const originY = isMiniRoom ? r * CELL_H + Math.floor(CELL_H / 2) : r * CELL_H;
        const roomH   = isMiniRoom ? Math.floor(CELL_H / 2) : CELL_H;
        const rx = c * CELL_W;
        const ry = originY;
        const cx = rx + CELL_W / 2;
        const cy = ry + roomH / 2;

        switch (theme) {
          case "factory": {
            // Bio Lab: pulsing specimen scan rings at staggered positions
            for (let i = 0; i < 3; i++) {
              const scanX = rx + 240 + i * 280;
              const scanY = ry + roomH / 2;
              const ring = this.scene.add.graphics().setDepth(-1.8);
              ring.lineStyle(1, 0x00ff88, 0.18);
              ring.strokeCircle(scanX, scanY, 30 + i * 10);
              ring.strokePath();
              this.decorations.push(ring);
              this.scene.tweens.add({
                targets: ring,
                alpha: { from: 0.05, to: 0.3 },
                scaleX: { from: 0.85, to: 1.15 },
                scaleY: { from: 0.85, to: 1.15 },
                duration: 1200 + i * 400,
                ease: "Sine.easeInOut",
                yoyo: true,
                repeat: -1,
                delay: i * 350,
              });
            }
            break;
          }
          case "server": {
            // Blinking LED rows along top and bottom walls
            const ledColors = [0x00ff44, 0x4499ff, 0xff2244];
            for (let i = 0; i < 12; i++) {
              const lx = rx + WALL_T + 40 + i * 95;
              const ly = i % 2 === 0 ? ry + WALL_T + 8 : ry + CELL_H - WALL_T - 8;
              const led = this.scene.add.circle(lx, ly, 2, ledColors[i % 3], 0.7).setDepth(-1);
              this.decorations.push(led);
              this.scene.tweens.add({
                targets: led, alpha: { from: 0.2, to: 0.8 },
                duration: Phaser.Math.Between(400, 1200), yoyo: true, repeat: -1,
                delay: Phaser.Math.Between(0, 1500),
              });
            }
            break;
          }
          case "power": {
            // Pulsing energy rings on floor around room center
            for (let ring = 1; ring <= 3; ring++) {
              const ringGfx = this.scene.add.graphics().setDepth(-1.5);
              ringGfx.lineStyle(1, 0x00ffcc, 0.15);
              ringGfx.strokeCircle(cx, cy, ring * 80);
              ringGfx.strokePath();
              this.decorations.push(ringGfx);
              this.scene.tweens.add({
                targets: ringGfx, alpha: { from: 0.05, to: 0.25 },
                duration: 1500 + ring * 500, yoyo: true, repeat: -1,
                ease: "Sine.easeInOut",
              });
            }
            break;
          }
          case "control": {
            // Rotating radar sweep line on floor
            const sweepLine = this.scene.add.graphics().setDepth(-1.5);
            this.decorations.push(sweepLine);
            let sweepAngle = 0;
            this.scene.time.addEvent({
              delay: 50, loop: true,
              callback: () => {
                if (!sweepLine.scene) return;
                sweepLine.clear();
                sweepLine.lineStyle(1, 0x22ffcc, 0.2);
                const len = 200;
                sweepLine.lineBetween(
                  cx, cy,
                  cx + Math.cos(sweepAngle) * len,
                  cy + Math.sin(sweepAngle) * len,
                );
                sweepLine.strokePath();
                // Fading trail
                sweepLine.lineStyle(1, 0x22ffcc, 0.08);
                const trail = sweepAngle - 0.3;
                sweepLine.lineBetween(
                  cx, cy,
                  cx + Math.cos(trail) * len,
                  cy + Math.sin(trail) * len,
                );
                sweepLine.strokePath();
                sweepAngle += 0.05;
              },
            });
            break;
          }
          case "maintenance": {
            // Supply Depot: blinking status LEDs on floor (equipment indicators)
            const ledColors2 = [0xaabbaa, 0x88ffaa, 0xffcc44];
            for (let i = 0; i < 8; i++) {
              const lx2 = rx + WALL_T + 60 + Phaser.Math.Between(0, CELL_W - WALL_T * 2 - 120);
              const ly2 = ry + WALL_T + 60 + Phaser.Math.Between(0, CELL_H - WALL_T * 2 - 120);
              const led2 = this.scene.add.circle(lx2, ly2, 3, ledColors2[i % 3], 0.5).setDepth(-1);
              this.decorations.push(led2);
              this.scene.tweens.add({
                targets: led2, alpha: { from: 0.1, to: 0.6 },
                duration: Phaser.Math.Between(800, 2500), yoyo: true, repeat: -1,
                delay: Phaser.Math.Between(0, 1800),
              });
            }
            break;
          }
          case "hub": {
            // Gentle healing glow pulse on floor at center
            const healGlow = this.scene.add.circle(cx, cy, 120, 0x44ff88, 0.04)
              .setDepth(-1.5).setBlendMode(Phaser.BlendModes.ADD);
            this.decorations.push(healGlow);
            this.scene.tweens.add({
              targets: healGlow,
              alpha: { from: 0.02, to: 0.08 },
              scaleX: { from: 0.9, to: 1.1 }, scaleY: { from: 0.9, to: 1.1 },
              duration: 2500, yoyo: true, repeat: -1,
              ease: "Sine.easeInOut",
            });
            break;
          }
          case "armory": {
            // Rotating targeting sweep (faster, orange) — signals active combat zone
            const arSweep = this.scene.add.graphics().setDepth(-1.5);
            this.decorations.push(arSweep);
            let arAngle = 0;
            this.scene.time.addEvent({
              delay: 40, loop: true,
              callback: () => {
                if (!arSweep.scene) return;
                arSweep.clear();
                const len = 130;
                arSweep.lineStyle(1, 0xff6600, 0.22);
                arSweep.lineBetween(cx, cy,
                  cx + Math.cos(arAngle) * len,
                  cy + Math.sin(arAngle) * len,
                );
                arSweep.strokePath();
                arSweep.lineStyle(1, 0xff6600, 0.08);
                const trail = arAngle - 0.45;
                arSweep.lineBetween(cx, cy,
                  cx + Math.cos(trail) * len,
                  cy + Math.sin(trail) * len,
                );
                arSweep.strokePath();
                arAngle += 0.07;
              },
            });
            break;
          }
          case "quarantine": {
            // Pulsing toxic-spill puddles at scattered floor positions
            const toxicPositions: [number, number][] = [
              [rx + 300, ry + 200], [rx + 900, ry + 420],
              [rx + 420, ry + 500], [rx + 980, ry + 250],
            ];
            for (let ti = 0; ti < toxicPositions.length; ti++) {
              const [tx, ty] = toxicPositions[ti];
              const puddle = this.scene.add.circle(tx, ty, 32, 0x99cc00, 0.07)
                .setDepth(-1.5).setBlendMode(Phaser.BlendModes.ADD);
              this.decorations.push(puddle);
              this.scene.tweens.add({
                targets: puddle,
                alpha: { from: 0.03, to: 0.16 },
                scaleX: { from: 0.7, to: 1.3 }, scaleY: { from: 0.7, to: 1.3 },
                duration: Phaser.Math.Between(1800, 3000),
                yoyo: true, repeat: -1,
                ease: "Sine.easeInOut",
                delay: ti * 400,
              });
            }
            break;
          }
          case "vault": {
            // Flashing red alert pulses — the vault is on high alert
            for (let sv = 0; sv < 3; sv++) {
              const sx = rx + 240 + sv * 380;
              const sy = ry + CELL_H / 2;
              const pulse = this.scene.add.circle(sx, sy, 7, 0xff0066, 0.6).setDepth(-1);
              this.decorations.push(pulse);
              this.scene.tweens.add({
                targets: pulse,
                alpha: { from: 0.08, to: 0.85 },
                scaleX: { from: 0.6, to: 1.4 }, scaleY: { from: 0.6, to: 1.4 },
                duration: 650 + sv * 200,
                yoyo: true, repeat: -1,
                delay: sv * 280,
              });
            }
            break;
          }
        }
      }
    }
  }

  // ─── Special Layouts ─────────────────────────────────────

  private _layoutBossArena(wave: number): void {
    // Boss arena is centered in the REACTOR CORE room [1][1] of the 3×3 grid.
    // That room occupies x: 1280–2560, y: 720–1440, so its center is (1920, 1080).
    const cx = WORLD_WIDTH / 2;   // 1920
    const cy = WORLD_HEIGHT / 2;  // 1080
    const arenaR = 520;

    // ── Arena floor ──────────────────────────────────────────
    const floorGfx = this.scene.add.graphics().setDepth(-3);
    floorGfx.fillStyle(0x1a0010, 1);
    floorGfx.fillCircle(cx, cy, arenaR + 30);
    this.decorations.push(floorGfx);

    // Hazard checkerboard overlay
    const checkGfx = this.scene.add.graphics().setDepth(-2.8);
    for (let gx = -18; gx <= 18; gx++) {
      for (let gy = -14; gy <= 14; gy++) {
        const wx = cx + gx * 56; const wy = cy + gy * 56;
        const dx = wx - cx; const dy = wy - cy;
        if (dx*dx + dy*dy > (arenaR+30)*(arenaR+30)) continue;
        if ((gx + gy) % 2 === 0) {
          checkGfx.fillStyle(0x220014, 0.35);
          checkGfx.fillRect(wx - 28, wy - 28, 56, 56);
        }
      }
    }
    this.decorations.push(checkGfx);

    // Concentric danger rings
    const ringGfx = this.scene.add.graphics().setDepth(-2);
    ringGfx.lineStyle(4, 0xff0066, 0.5);
    ringGfx.strokeCircle(cx, cy, arenaR);
    ringGfx.lineStyle(2, 0xff0066, 0.28);
    ringGfx.strokeCircle(cx, cy, arenaR * 0.68);
    ringGfx.strokeCircle(cx, cy, arenaR * 0.38);
    // Warning triangle ring (outer ring tick marks)
    for (let t = 0; t < 16; t++) {
      const a = (t / 16) * Math.PI * 2;
      const ir = arenaR - 6; const or = arenaR + 6;
      ringGfx.lineBetween(cx + Math.cos(a)*ir, cy + Math.sin(a)*ir,
                          cx + Math.cos(a)*or, cy + Math.sin(a)*or);
    }
    ringGfx.strokePath();
    this.decorations.push(ringGfx);
    this.scene.tweens.add({ targets: ringGfx, alpha: {from:0.5, to:0.9}, duration: 900, yoyo:true, repeat:-1 });

    // 8-spoke floor mandala
    const spokeGfx = this.scene.add.graphics().setDepth(-1.8);
    spokeGfx.lineStyle(2, 0xff0066, 0.2);
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      spokeGfx.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
      spokeGfx.lineTo(cx + Math.cos(a) * (arenaR - 20), cy + Math.sin(a) * (arenaR - 20));
    }
    // Outer ring double-line
    spokeGfx.lineStyle(1, 0xff4488, 0.1);
    spokeGfx.strokeCircle(cx, cy, arenaR - 12);
    spokeGfx.strokePath();
    this.decorations.push(spokeGfx);

    // Boss portal — pulsing crimson vortex at arena center
    const portalOuter = this.scene.add.circle(cx, cy, 110, 0x440022, 0.7)
      .setDepth(-1.5);
    const portalGlow = this.scene.add.circle(cx, cy, 70, 0xff0066, 0.22)
      .setDepth(-1).setBlendMode(Phaser.BlendModes.ADD);
    const portalCore = this.scene.add.circle(cx, cy, 30, 0xff66aa, 0.5)
      .setDepth(-0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.decorations.push(portalOuter, portalGlow, portalCore);
    this.scene.tweens.add({
      targets: portalGlow,
      alpha: { from: 0.1, to: 0.5 },
      scaleX: { from: 0.7, to: 1.3 }, scaleY: { from: 0.7, to: 1.3 },
      duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
    this.scene.tweens.add({
      targets: portalCore,
      alpha: { from: 0.3, to: 0.9 },
      scaleX: { from: 0.6, to: 1.5 }, scaleY: { from: 0.6, to: 1.5 },
      duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
    // Rotating vortex arms
    const vortexGfx = this.scene.add.graphics().setDepth(-0.8).setBlendMode(Phaser.BlendModes.ADD);
    this.decorations.push(vortexGfx);
    let vortexAngle = 0;
    this.scene.time.addEvent({ delay: 33, loop: true, callback: () => {
      if (!vortexGfx.scene) return;
      vortexGfx.clear();
      for (let arm = 0; arm < 4; arm++) {
        const a = vortexAngle + (arm / 4) * Math.PI * 2;
        vortexGfx.lineStyle(2, 0xff0066, 0.3);
        vortexGfx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
        vortexGfx.lineTo(cx + Math.cos(a + 0.8) * 80, cy + Math.sin(a + 0.8) * 80);
        vortexGfx.strokePath();
      }
      vortexAngle += 0.04;
    }});

    // ── Arena boundary walls ────────────────────────────────
    const aW = 900; const aH = 500;
    this._placeWall(cx - aW - WALL_T, cy - aH - WALL_T, aW * 2 + WALL_T * 2, WALL_T); // top
    this._placeWall(cx - aW - WALL_T, cy + aH,          aW * 2 + WALL_T * 2, WALL_T); // bottom
    this._placeWall(cx - aW - WALL_T, cy - aH - WALL_T, WALL_T, aH * 2 + WALL_T * 2); // left
    this._placeWall(cx + aW,          cy - aH - WALL_T, WALL_T, aH * 2 + WALL_T * 2); // right

    // ── 4 BLAST FURNACES at diagonal corners ────────────────
    for (const [ox, oy] of [[-520, -320], [520, -320], [-520, 320], [520, 320]] as [number,number][]) {
      this._placeProp("blast_furnace", cx + ox - 44, cy + oy - 40, PROPS.blast_furnace);
    }

    // ── 6 PLASMA CONDUITS along top & bottom walls ──────────
    for (const [ox, oy] of [[-300,-420],[0,-420],[300,-420],[-300,400],[0,400],[300,400]] as [number,number][]) {
      this._placeProp("plasma_conduit", cx + ox - 52, cy + oy - 20, PROPS.plasma_conduit);
    }

    // ── Pillar ring — fewer pillars pushed to outer edge ──
    const pillarCount = Math.min(6, 4 + Math.floor(wave / 6));
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2;
      this._placeProp("pillar", cx + Math.cos(angle) * 480 - 26, cy + Math.sin(angle) * 340 - 26, PROPS.pillar);
    }

    // ── Corner crate clusters ──
    for (const [ox, oy] of [[-680,-420],[680,-420],[-680,420],[680,420]] as [number,number][]) {
      this._placeProp("crate",  cx + ox - 32, cy + oy - 32, PROPS.crate);
      this._placeProp("barrel", cx + ox + 44, cy + oy - 24, PROPS.barrel);
      this._placeProp("fuel_cell", cx + ox - 60, cy + oy - 26, PROPS.fuel_cell);
    }

    // ── FALLING DEBRIS RAIN (purely visual — tweened rectangles) ───────────
    const debrisColors = [0xff2200, 0xaa4400, 0x884422, 0xff6600, 0xff0066];
    const spawnDebris = () => {
      if (!this.scene || !this.isBossArena) return;
      const dx = cx - aW + Math.random() * aW * 2;
      const dy = cy - aH;
      const sz = 3 + Math.random() * 7;
      const col = debrisColors[Math.floor(Math.random() * debrisColors.length)];
      const d = this.scene.add.rectangle(dx, dy, sz, sz, col, 0.9)
        .setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
      this.decorations.push(d);
      const fallDist = aH * 2 + 100;
      const dur = 700 + Math.random() * 1200;
      this.scene.tweens.add({
        targets: d,
        y: dy + fallDist,
        x: dx + (Math.random() - 0.5) * 200,
        angle: Math.random() * 720,
        alpha: 0,
        duration: dur,
        ease: "Quad.easeIn",
        onComplete: () => {
          d.destroy();
          const idx = this.decorations.indexOf(d);
          if (idx >= 0) this.decorations.splice(idx, 1);
        },
      });
    };
    const debrisTimer = this.scene.time.addEvent({ delay: 160, loop: true, callback: spawnDebris });

    // ── WIND HUD indicator ───────────────────────────────────
    this._bossWindHudGfx = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
    this._bossWindHudText = this.scene.add.text(
      this.scene.cameras.main.width - 130,
      this.scene.cameras.main.height - 106,
      "💨 VORTEX WIND", {
        fontSize: "11px", color: "#ff8800",
        stroke: "#000", strokeThickness: 2,
      },
    ).setDepth(200).setScrollFactor(0).setOrigin(0.5);
    this.decorations.push(this._bossWindHudGfx, this._bossWindHudText as unknown as Phaser.GameObjects.GameObject);
    // Kill debris timer when arena is torn down
    this.scene.events.once("shutdown", () => debrisTimer.remove());

    // ── Boss physics zone — EXTREME: gravity pull + rotating wind applied each frame ──
    this._buildRoomPhysicsZones(
      [[false,false,false],[false,true,false],[false,false,false]],
      [["hub","hub","hub"],["hub","power","hub"],["hub","hub","hub"]],
    );
    // Override the center zone with boss-specific setup (strong vortex pull)
    const bossZone = this.roomPhysicsZones.find(z => z.col === 1 && z.row === 1);
    if (bossZone) {
      bossZone.gravityPull = { x: cx, y: cy, strength: 55 };
      bossZone.speedMultiplier = 1.15;
      bossZone.bulletSpeedMod = 1.3;
      bossZone.physicsLabel = "⚠ VORTEX CORE — ALL PHYSICS EXTREME";
    }
  }

  // ─── Destruction Effects ─────────────────────────────────

  private _destroyObstacle(obs: ObstacleData): void {
    const cx = obs.x + obs.w / 2;
    const cy = obs.y + obs.h / 2;

    // Explosion flash
    const flash = this.scene.add.circle(cx, cy, 40, 0xffaa00, 0.8)
      .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 2.5, scaleY: 2.5, alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });

    // 8 debris particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = Phaser.Math.Between(30, 70);
      const size = Phaser.Math.Between(2, 5);
      const color = i % 2 === 0 ? 0x888888 : 0xffcc00;
      const debris = this.scene.add.rectangle(cx, cy, size, size, color, 1).setDepth(14);
      this.scene.tweens.add({
        targets: debris,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        duration: 500,
        onComplete: () => debris.destroy(),
      });
    }

    // AoE for generators & reactors
    if (obs.kind === "generator") {
      this.scene.events.emit("obstacle_explosion", cx, cy, 80, 25);
    } else if (obs.kind === "reactor") {
      this.scene.events.emit("obstacle_explosion", cx, cy, 100, 35);
    } else if (obs.kind === "fuel_cell") {
      // Fuel cell: big explosion + chain reaction
      this.scene.events.emit("obstacle_explosion", cx, cy, 100, 50);
      // Orange fireball flash
      const fireball = this.scene.add.circle(cx, cy, 60, 0xff6600, 0.7)
        .setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: fireball, scaleX: 3, scaleY: 3, alpha: 0,
        duration: 400, onComplete: () => fireball.destroy(),
      });
      // Chain reaction: damage other fuel cells in blast radius
      for (const other of this.obstacles) {
        if (other === obs || other.hp <= 0 || other.kind !== "fuel_cell") continue;
        const ocx = other.x + other.w / 2;
        const ocy = other.y + other.h / 2;
        const dx = ocx - cx, dy = ocy - cy;
        if (dx * dx + dy * dy < 100 * 100) {
          other.hp = 0;
          this.scene.time.delayedCall(150, () => this._destroyObstacle(other));
        }
      }
    }

    // Remove from static group and destroy
    this.staticGroup.remove(obs.sprite, true, true);
    obs.sprite?.destroy();
    obs.hpBar?.destroy();

    // Find and destroy associated glow
    if (obs.glow) {
      const idx = this.glows.indexOf(obs.glow);
      if (idx >= 0) this.glows.splice(idx, 1);
      obs.glow.destroy();
      obs.glow = undefined;
    }
  }
}
