import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { SystemsBus } from "../core/SystemsBus";
import { DimensionBreach } from "../ai/DimensionBreach";
import { WorldType } from "../core/WorldManager";
import { WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H, WALL_T, DOOR_W } from "../core";

/**
 * GuardAgent — holds a post position. Transitions through:
 *   Guard   — idles near post, scans
 *   Alert   — approaches threat with raised alertness
 *   Chase   — full pursuit when player detected
 *   Return  — walks back to post when player lost
 *
 * Broadcasts "guard:alert" and "guard:allClear" on bus.
 * Has DimensionBreach ability — phases into player's world after 6s in ghost state.
 */
export class GuardAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  /** Dimension breach ability — set homeWorld after spawn */
  readonly breach = new DimensionBreach(WorldType.CIRCUIT);
  /** Set by MainScene each tick — current player world */
  playerWorld: WorldType = WorldType.FOUNDRY;

  private readonly postX: number;
  private readonly postY: number;
  private playerRef: { x: number; y: number };
  private alertLevel = 0;

  /** When true, positions between player and reactor to block access */
  blockerMode = false;
  /** Reactor position for blocker intercept — set via setBlockerMode() */
  reactorPos: { x: number; y: number } | null = null;
  /** Delay (ms) before this guard starts moving — used for staggered blocker spawning */
  activationDelay = 0;
  /** When set, guard ignores player and rushes directly to destroy the reactor. */
  reactorTarget: { x: number; y: number } | null = null;

  private _stuckTimer = 0;
  private _lastPosX = 0;
  private _lastPosY = 0;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 100,
    speed = 70,
  ) {
    super(GuardAgent._buildActions(), 0.06);
    this.posX = x;
    this.posY = y;
    this.postX = x;
    this.postY = y;
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

  /** Activate blocker mode: guard intercepts player path to reactor after a delay */
  setBlockerMode(reactorPos: { x: number; y: number }, delay = 1500): void {
    this.blockerMode = true;
    this.reactorPos = reactorPos;
    this.activationDelay = delay;
  }

  protected populateContext(ctx: ContextSnapshot): void {
    // When rushing the reactor, measure distance to reactor instead of player
    const refX = this.reactorTarget?.x ?? this.playerRef.x;
    const refY = this.reactorTarget?.y ?? this.playerRef.y;

    const dxPlayer = this.playerRef.x - this.posX;
    const dyPlayer = this.playerRef.y - this.posY;
    const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dyPlayer * dyPlayer);

    const dxRef = refX - this.posX;
    const dyRef = refY - this.posY;
    const distRef = Math.sqrt(dxRef * dxRef + dyRef * dyRef);

    const dxPost = this.postX - this.posX;
    const dyPost = this.postY - this.posY;
    const distPost = Math.sqrt(dxPost * dxPost + dyPost * dyPost);

    ctx.distanceToPlayer = Math.min(distRef / 500, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    ctx.health = this.hp / this.maxHp;
    ctx.danger = this.reactorTarget ? 0 : (distPlayer < 200 ? 1 : distPlayer < 350 ? 0.5 : 0);
    // Reactor rushers always "see" their target
    ctx.targetVisible = this.reactorTarget ? true : distRef < 300;
    ctx.goalProgress = 1 - Math.min(distPost / 200, 1);
    ctx.resource = this.alertLevel;

    if (!this.reactorTarget) {
      if (ctx.targetVisible) {
        this.alertLevel = Math.min(1, this.alertLevel + 0.4);
        this.memory.lastKnownPlayerPos = { x: this.playerRef.x, y: this.playerRef.y };
        SystemsBus.instance.emit("guard:alert", this.id, this.alertLevel);
      } else {
        this.alertLevel = Math.max(0, this.alertLevel - 0.1);
        if (this.alertLevel < 0.05) {
          SystemsBus.instance.emit("guard:allClear", this.id);
        }
      }
    } else {
      // Reactor rusher — max alert so Chase/Alert always wins the utility score
      this.alertLevel = 1;
    }
  }

  override tick(delta: number): void {
    // Stagger activation for blocker reinforcements
    if (this.activationDelay > 0) {
      this.activationDelay -= delta;
      return;
    }

    // Update breach — Guards are CIRCUIT world, breach into FOUNDRY
    const justBreached = this.breach.update(delta, WorldType.CIRCUIT, this.playerWorld);
    if (justBreached) {
      SystemsBus.instance.emit("guard:breach", this.id, this.posX, this.posY);
    }

    // Reactor rush: skip normal AI, route through doors to reactor
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
        // Stuck detection: if barely moved in 1.5s, kick sideways
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

    switch (current.name) {
      case "Guard":
        // Slow patrol around post
        if (Math.random() < 0.02) {
          const angle = Math.random() * Math.PI * 2;
          this.setTarget(
            this.postX + Math.cos(angle) * 60,
            this.postY + Math.sin(angle) * 60,
          );
        }
        break;
      case "Alert":
      case "Chase": {
        if (this.blockerMode && this.reactorPos) {
          const px = this.playerRef.x, py = this.playerRef.y;
          const rx = this.reactorPos.x, ry = this.reactorPos.y;
          const dxToPlayer = this.posX - px;
          const dyToPlayer = this.posY - py;
          const distToPlayer = Math.sqrt(dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer);
          if (distToPlayer < 160) {
            const pos = this.memory.lastKnownPlayerPos;
            if (pos) this.setTarget(pos.x, pos.y);
          } else {
            this.setTarget(px + (rx - px) * 0.38, py + (ry - py) * 0.38);
          }
        } else {
          const pos = this.memory.lastKnownPlayerPos;
          if (pos) this.setTarget(pos.x, pos.y);
        }
        break;
      }
      case "Return":
        this.setTarget(this.postX, this.postY);
        break;
    }
  }

  updateMovement(deltaMs: number): void {
    if (!this.sprite) return;
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
    this.alertLevel = 1;
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
      const dirX = Math.sign(tc - ec);
      const wallX = (Math.min(ec, ec + dirX) + 1) * CELL_W;
      const passX = wallX + dirX * PASS;
      const door1Y = er * CELL_H + CELL_H * 0.3;
      const door2Y = er * CELL_H + CELL_H * 0.7;
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
      const dirY = Math.sign(tr - er);
      const wallY = (Math.min(er, er + dirY) + 1) * CELL_H;
      const passY = wallY + dirY * PASS;
      const door1X = ec * CELL_W + CELL_W * 0.3;
      const door2X = ec * CELL_W + CELL_W * 0.7;
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
    const guard = new Action(
      "Guard",
      [
        new Consideration("at_post", CurveType.Logistic, 10, (c) => c.goalProgress),
        new Consideration("no_threat", CurveType.Linear, 1, (c) => 1 - c.danger),
        new Consideration("low_alert", CurveType.Quadratic, 2, (c) => 1 - c.resource),
      ],
      () => {},
      1.0, 0.3,
    );

    const alertAction = new Action(
      "Alert",
      [
        new Consideration("medium_alert", CurveType.Linear, 1, (c) => c.resource * (1 - c.danger)),
        new Consideration("detects_threat", CurveType.Linear, 1, (c) => c.distanceToThreat < 0.6 ? 0.8 : 0.2),
      ],
      () => {},
      1.1, 0.1,
    );

    const chase = new Action(
      "Chase",
      [
        new Consideration("high_alert", CurveType.Exponential, 3, (c) => c.resource),
        new Consideration("threat_close", CurveType.Logistic, 10, (c) => 1 - c.danger),
        new Consideration("sees_target", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0.2),
      ],
      () => {},
      1.3, 0.2,
    );

    const returnAction = new Action(
      "Return",
      [
        new Consideration("no_alert", CurveType.Quadratic, 3, (c) => 1 - c.resource),
        new Consideration("away_from_post", CurveType.Linear, 1, (c) => 1 - c.goalProgress),
      ],
      () => {},
      0.9, 0.2,
    );

    return [guard, alertAction, chase, returnAction];
  }
}
