import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H, WALL_T, DOOR_W } from "../core";

/** Minimal shape every heal-compatible agent must satisfy. */
export interface HealTarget {
  posX: number;
  posY: number;
  hp: number;
  maxHp: number;
}

/**
 * WelderAgent — support/healer bot that repairs nearby enemy machines.
 *
 * Action set:
 *   Support — moves to nearest injured ally and heals it
 *   Flee    — retreats when the player is too close
 *   Wander  — patrols randomly when no allies need healing
 *
 * Heals 5 HP per AI tick to the nearest injured ally within 120 px.
 */
export class WelderAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  private playerRef: { x: number; y: number };
  private _scene: Phaser.Scene | null = null;
  private allies: HealTarget[] = [];
  /** When set, welder ignores its normal support role and rushes to destroy the reactor. */
  reactorTarget: { x: number; y: number } | null = null;

  private _stuckTimer = 0;
  private _lastPosX = 0;
  private _lastPosY = 0;

  private static readonly HEAL_RANGE = 120;
  private static readonly HEAL_AMOUNT = 5;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 30,
    speed = 80,
  ) {
    super(WelderAgent._buildActions(), 0.08);
    this.posX = x;
    this.posY = y;
    this.targetX = x;
    this.targetY = y;
    this.playerRef = playerRef;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
  }

  bindScene(scene: Phaser.Scene): void {
    this._scene = scene;
  }

  setAllies(allies: HealTarget[]): void {
    this.allies = allies;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  // ── Helpers ──────────────────────────────────────────────

  private distTo(tx: number, ty: number): number {
    const dx = tx - this.posX;
    const dy = ty - this.posY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private findNearestInjuredAlly(): HealTarget | null {
    let best: HealTarget | null = null;
    let bestDist = Infinity;
    for (const a of this.allies) {
      if (a.hp >= a.maxHp) continue;
      const d = this.distTo(a.posX, a.posY);
      if (d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    return best;
  }

  // ── Context ──────────────────────────────────────────────

  protected populateContext(ctx: ContextSnapshot): void {
    const dx = this.playerRef.x - this.posX;
    const dy = this.playerRef.y - this.posY;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    ctx.distanceToPlayer = Math.min(distToPlayer / 600, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    ctx.danger = Math.max(0, 1 - distToPlayer / 400);
    ctx.health = this.hp / this.maxHp;

    // resource: ratio of injured allies (0 = all healthy, 1 = all hurt)
    if (this.allies.length > 0) {
      const injured = this.allies.filter((a) => a.hp < a.maxHp).length;
      ctx.resource = injured / this.allies.length;
    } else {
      ctx.resource = 0;
    }

    // goalProgress: whether near an injured ally
    const nearest = this.findNearestInjuredAlly();
    if (nearest) {
      const d = this.distTo(nearest.posX, nearest.posY);
      ctx.goalProgress = Math.max(0, 1 - d / WelderAgent.HEAL_RANGE);
    } else {
      ctx.goalProgress = 0;
    }

    ctx.ammo = 0;
    ctx.targetVisible = false;
  }

  // ── Tick ─────────────────────────────────────────────────

  override tick(delta: number): void {
    // Reactor rush: route through doors, heal allies en route (teamwork!)
    if (this.reactorTarget) {
      // Even while rushing, heal any nearby injured ally
      if (this.allies.length > 0) {
        for (const ally of this.allies) {
          if (ally.hp < ally.maxHp) {
            const d = Math.hypot(ally.posX - this.posX, ally.posY - this.posY);
            if (d < WelderAgent.HEAL_RANGE) {
              ally.hp = Math.min(ally.hp + WelderAgent.HEAL_AMOUNT, ally.maxHp);
              this.spawnHealEffect(ally.posX, ally.posY);
              break; // heal one ally per tick
            }
          }
        }
      }
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
            if (ec === rc) {
              tx += Phaser.Math.Between(-220, 220);
            } else {
              ty += Phaser.Math.Between(-220, 220);
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
      case "Support": {
        const ally = this.findNearestInjuredAlly();
        if (ally) {
          this.setTarget(ally.posX, ally.posY);
          const d = this.distTo(ally.posX, ally.posY);
          if (d <= WelderAgent.HEAL_RANGE) {
            ally.hp = Math.min(ally.hp + WelderAgent.HEAL_AMOUNT, ally.maxHp);
            this.spawnHealEffect(ally.posX, ally.posY);
            this.spawnRepairArc(ally.posX, ally.posY);
          }
        }
        break;
      }
      case "Flee": {
        const dx = this.posX - this.playerRef.x;
        const dy = this.posY - this.playerRef.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this.setTarget(
          this.posX + (dx / len) * 200,
          this.posY + (dy / len) * 200,
        );
        break;
      }
      case "Wander":
        if (Math.random() < 0.04) {
          this.setTarget(
            this.posX + Phaser.Math.Between(-180, 180),
            this.posY + Phaser.Math.Between(-180, 180),
          );
        }
        break;
    }
  }

  // ── Movement & damage ────────────────────────────────────

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
    this.data?.set("hp", this.hp);
    this.memory.store("last_damage", amount, { x: this.posX, y: this.posY }, 4000);
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

  // ── Visual heal effect ───────────────────────────────────

  private spawnHealEffect(x: number, y: number): void {
    if (!this._scene) return;
    const circle = this._scene.add.circle(x, y, 8, 0x00ffff, 0.7);
    circle.setDepth(100);
    this._scene.tweens.add({
      targets: circle,
      alpha: 0,
      scale: 2,
      duration: 400,
      ease: "Quad.easeOut",
      onComplete: () => circle.destroy(),
    });
  }

  /** Crackling repair-arc beam between welder and ally + brief shield ring on ally. */
  private spawnRepairArc(tx: number, ty: number): void {
    if (!this._scene) return;
    // Jagged welding arc
    const gfx = this._scene.add.graphics().setDepth(99).setBlendMode(Phaser.BlendModes.ADD);
    gfx.lineStyle(2, 0x66ffee, 0.95);
    const segs = 5;
    let cx = this.posX, cy = this.posY;
    gfx.beginPath(); gfx.moveTo(cx, cy);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const lx = this.posX + (tx - this.posX) * t + (Math.random() - 0.5) * 8;
      const ly = this.posY + (ty - this.posY) * t + (Math.random() - 0.5) * 8;
      gfx.lineTo(lx, ly);
      cx = lx; cy = ly;
    }
    gfx.strokePath();
    this._scene.tweens.add({
      targets: gfx, alpha: 0, duration: 180,
      onComplete: () => gfx.destroy(),
    });
    // Shield ring on healed ally
    const ring = this._scene.add.circle(tx, ty, 14, 0, 0)
      .setStrokeStyle(2, 0x88ffee, 0.8)
      .setDepth(99).setBlendMode(Phaser.BlendModes.ADD);
    this._scene.tweens.add({
      targets: ring, scale: 1.6, alpha: 0,
      duration: 320, ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  // ── Action definitions ───────────────────────────────────

  private static _buildActions(): Action[] {
    const support = new Action(
      "Support",
      [
        new Consideration("allies_hurt", CurveType.Quadratic, 2, (c) => c.resource),
        new Consideration("near_ally", CurveType.Linear, 1, (c) => c.goalProgress),
        new Consideration("healthy_enough", CurveType.Linear, 1, (c) => c.health),
      ],
      () => {},
      1.4,
      0.1,
    );

    const flee = new Action(
      "Flee",
      [
        new Consideration("threatened", CurveType.Exponential, 4, (c) => c.danger),
        new Consideration("low_hp", CurveType.Quadratic, 2, (c) => 1 - c.health),
      ],
      () => {},
      1.0,
      0.3,
    );

    const wander = new Action(
      "Wander",
      [
        new Consideration("all_healthy", CurveType.Quadratic, 2, (c) => 1 - c.resource),
        new Consideration("safe_distance", CurveType.Linear, 1, (c) => c.distanceToPlayer),
      ],
      () => {},
      1.0,
      0.2,
    );

    return [support, flee, wander];
  }
}
