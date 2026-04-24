import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { ResourceSystem } from "../core/ResourceSystem";
import { SystemsBus } from "../core/SystemsBus";
import { DimensionBreach } from "../ai/DimensionBreach";
import { WorldType } from "../core/WorldManager";
import { WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H, WALL_T, DOOR_W } from "../core";

/**
 * CollectorAgent — resource-seeking unit.
 *
 * Action set:
 *   Seek    — moves toward nearest active resource
 *   Harvest — collects when adjacent
 *   Flee    — retreats when threatened
 *   Idle    — rests when no resources available
 *
 * Emits "collector:deposited" when returning value to base.
 * Has DimensionBreach ability — phases into player's world after 6s in ghost state.
 */
export class CollectorAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;
  carriedValue = 0;

  /** Dimension breach ability — Collectors are FOUNDRY world, breach into CIRCUIT */
  readonly breach = new DimensionBreach(WorldType.FOUNDRY);
  /** Set by MainScene each tick — current player world */
  playerWorld: WorldType = WorldType.FOUNDRY;

  private playerRef: { x: number; y: number };
  private targetResourceId = -1;
  /** When set, collector ignores resources and rushes directly to destroy the reactor. */
  reactorTarget: { x: number; y: number } | null = null;

  private _stuckTimer = 0;
  private _lastPosX = 0;
  private _lastPosY = 0;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 40,
    speed = 110,
  ) {
    super(CollectorAgent._buildActions(), 0.1);
    this.posX = x;
    this.posY = y;
    this.targetX = x;
    this.targetY = y;
    this.playerRef = playerRef;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  protected populateContext(ctx: ContextSnapshot): void {
    const dxPlayer = this.playerRef.x - this.posX;
    const dyPlayer = this.playerRef.y - this.posY;
    const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dyPlayer * dyPlayer);

    const nearest = ResourceSystem.instance.nearestActive(this.posX, this.posY, 1);
    const hasResource = nearest.length > 0;
    const distResource = hasResource
      ? Math.sqrt((nearest[0].x - this.posX) ** 2 + (nearest[0].y - this.posY) ** 2)
      : 9999;

    ctx.distanceToPlayer = Math.min(distPlayer / 600, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    ctx.danger = distPlayer < 180 ? 1 : distPlayer < 320 ? 0.4 : 0;
    ctx.health = this.hp / this.maxHp;
    ctx.resource = hasResource ? Math.max(0, 1 - distResource / 400) : 0;
    ctx.goalProgress = Math.min(distResource / 30, 1) < 1 ? 1 : 0; // 1 when adjacent
    ctx.targetVisible = distPlayer < 250;

    if (hasResource) {
      this.targetResourceId = nearest[0].id;
      this.memory.store("target_resource", nearest[0], { x: nearest[0].x, y: nearest[0].y }, 3000);
    }
  }

  override tick(delta: number): void {
    // Update breach — Collectors are FOUNDRY world, breach into CIRCUIT
    const justBreached = this.breach.update(delta, WorldType.FOUNDRY, this.playerWorld);
    if (justBreached) {
      SystemsBus.instance.emit("collector:breach", this.id, this.posX, this.posY);
    }

    // Reactor rush: route through doors, skip resource gathering
    if (this.reactorTarget) {
      const dx = this.reactorTarget.x - this.posX;
      const dy = this.reactorTarget.y - this.posY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 50) {
        this.setTarget(
          this.reactorTarget.x + Phaser.Math.Between(-28, 28),
          this.reactorTarget.y + Phaser.Math.Between(-28, 28),
        );
      } else {
        const ec = Math.floor(this.posX / CELL_W);
        const er = Math.floor(this.posY / CELL_H);
        const rc = Math.floor(this.reactorTarget.x / CELL_W);
        const rr = Math.floor(this.reactorTarget.y / CELL_H);
        let tx = this.reactorTarget.x, ty = this.reactorTarget.y;
        let throughDoor = false;
        if (ec !== rc || er !== rr) {
          const wp = this._doorWaypoint(ec, er, rc, rr);
          tx = wp.x; ty = wp.y;
          throughDoor = true;
        }
        this._stuckTimer += delta;
        if (this._stuckTimer > 1500) {
          const moved = Math.hypot(this.posX - this._lastPosX, this.posY - this._lastPosY);
          if (moved < 20 && throughDoor) {
            // Jitter only the perpendicular axis so enemy searches for the door gap
            if (ec === rc) {
              tx += Phaser.Math.Between(-220, 220); // vertical nav → jitter X
            } else {
              ty += Phaser.Math.Between(-220, 220); // horizontal nav → jitter Y
            }
          }
          this._lastPosX = this.posX;
          this._lastPosY = this.posY;
          this._stuckTimer = 0;
        }
        this.setTarget(tx, ty);
      }
      return;
    }

    super.tick(delta);
    const current = this.reasoner.current;
    if (!current) return;

    const res = ResourceSystem.instance.nearestActive(this.posX, this.posY, 1)[0];

    switch (current.name) {
      case "Seek":
        if (res) {
          this.setTarget(res.x, res.y);
          this.targetResourceId = res.id;
        }
        break;
      case "Harvest": {
        if (this.targetResourceId >= 0) {
          const harvested = ResourceSystem.instance.harvest(this.targetResourceId);
          if (harvested > 0) {
            this.carriedValue += harvested;
            this.targetResourceId = -1;
            SystemsBus.instance.emit("collector:deposited", this.id, harvested);
          }
        }
        break;
      }
      case "Flee": {
        const dx = this.posX - this.playerRef.x;
        const dy = this.posY - this.playerRef.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this.setTarget(this.posX + (dx / len) * 200, this.posY + (dy / len) * 200);
        break;
      }
    }
  }

  updateMovement(deltaMs: number): void {
    if (!this.sprite) return;
    // Sync logical position from physics-resolved sprite so cell calculations
    // always reflect the true post-collision position.
    this.posX = this.sprite.x;
    this.posY = this.sprite.y;
    const dx = this.targetX - this.posX;
    const dy = this.targetY - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;
    const rushSpeed = this.reactorTarget ? this.speed * 1.2 : this.speed;
    const step = rushSpeed * (deltaMs / 1000);
    const ratio = Math.min(step / dist, 1);
    this.posX += dx * ratio;
    this.posY += dy * ratio;
    this.sprite.setPosition(this.posX, this.posY);
  }

  setTarget(x: number, y: number): void {
    this.targetX = Phaser.Math.Clamp(x, 20, WORLD_WIDTH - 20);
    this.targetY = Phaser.Math.Clamp(y, 20, WORLD_HEIGHT - 20);
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  private _doorWaypoint(
    ec: number, er: number,
    tc: number, tr: number,
  ): { x: number; y: number } {
    const PASS = WALL_T + 30;
    const halfDoor = DOOR_W / 2;
    if (tc !== ec) {
      // Crossing a vertical wall
      const dirX = Math.sign(tc - ec);
      const wallX = (Math.min(ec, ec + dirX) + 1) * CELL_W;
      const passX = wallX + dirX * PASS;
      const door1Y = er * CELL_H + CELL_H * 0.3;
      const door2Y = er * CELL_H + CELL_H * 0.7;
      // Compute where straight-line path to each door crosses the wall.
      // Pick the door whose gap actually contains that crossing point.
      const tWall = Math.abs(passX - this.posX) > 1 ? (wallX - this.posX) / (passX - this.posX) : 0.5;
      const cross1Y = this.posY + (door1Y - this.posY) * tWall;
      const cross2Y = this.posY + (door2Y - this.posY) * tWall;
      const d1ok = Math.abs(cross1Y - door1Y) < halfDoor;
      const d2ok = Math.abs(cross2Y - door2Y) < halfDoor;
      let doorY: number;
      if (d1ok && d2ok) doorY = Math.abs(this.posY - door1Y) <= Math.abs(this.posY - door2Y) ? door1Y : door2Y;
      else if (d1ok) doorY = door1Y;
      else if (d2ok) doorY = door2Y;
      else doorY = Math.abs(this.posY - door1Y) <= Math.abs(this.posY - door2Y) ? door1Y : door2Y;
      return { x: passX, y: doorY };
    } else {
      // Crossing a horizontal wall
      const dirY = Math.sign(tr - er);
      const wallY = (Math.min(er, er + dirY) + 1) * CELL_H;
      const passY = wallY + dirY * PASS;
      const door1X = ec * CELL_W + CELL_W * 0.3;
      const door2X = ec * CELL_W + CELL_W * 0.7;
      // Compute where straight-line path to each door crosses the wall.
      const tWall = Math.abs(passY - this.posY) > 1 ? (wallY - this.posY) / (passY - this.posY) : 0.5;
      const cross1X = this.posX + (door1X - this.posX) * tWall;
      const cross2X = this.posX + (door2X - this.posX) * tWall;
      const d1ok = Math.abs(cross1X - door1X) < halfDoor;
      const d2ok = Math.abs(cross2X - door2X) < halfDoor;
      let doorX: number;
      if (d1ok && d2ok) doorX = Math.abs(this.posX - door1X) <= Math.abs(this.posX - door2X) ? door1X : door2X;
      else if (d1ok) doorX = door1X;
      else if (d2ok) doorX = door2X;
      else doorX = Math.abs(this.posX - door1X) <= Math.abs(this.posX - door2X) ? door1X : door2X;
      return { x: doorX, y: passY };
    }
  }

  private static _buildActions(): Action[] {
    const seek = new Action(
      "Seek",
      [
        new Consideration("resource_available", CurveType.Linear, 1, (c) => c.resource),
        new Consideration("not_adjacent", CurveType.Linear, 1, (c) => 1 - c.goalProgress),
        new Consideration("safe", CurveType.Quadratic, 2, (c) => 1 - c.danger),
      ],
      () => {},
      1.2, 0.2,
    );

    const harvest = new Action(
      "Harvest",
      [
        new Consideration("adjacent_resource", CurveType.Exponential, 4, (c) => c.goalProgress),
        new Consideration("safe_enough", CurveType.Linear, 1, (c) => 1 - c.danger * 0.8),
      ],
      () => {},
      1.5, 0.0,
    );

    const flee = new Action(
      "Flee",
      [
        new Consideration("threatened", CurveType.Exponential, 3, (c) => c.danger),
        new Consideration("low_hp", CurveType.Quadratic, 2, (c) => 1 - c.health),
      ],
      () => {},
      1.1, 0.3,
    );

    const idle = new Action(
      "Idle",
      [new Consideration("no_resources", CurveType.Linear, 1, (c) => 1 - c.resource)],
      () => {},
      0.4, 0.4,
    );

    return [seek, harvest, flee, idle];
  }
}
