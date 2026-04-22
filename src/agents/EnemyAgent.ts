import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { SteeringBehaviors, SteeredAgent } from "../ai/SteeringBehaviors";
import type { PlayerPredictor } from "../ai/PlayerPredictor";
import { WORLD_WIDTH, WORLD_HEIGHT, CELL_W, CELL_H } from "../core";

/**
 * EnemyAgent — aggressive pursuer with ranged attack.
 *
 * Action set:
 *   Patrol  — wanders when player is far/invisible
 *   Chase   — closes to flank position
 *   Strafe  — orbits player while shooting (in-range behavior)
 *   Attack  — shoots from flank position when in range
 *   Flee    — retreats at critical HP
 *
 * Flanking: each agent is assigned a flankAngle slot. Rather than
 * all rushing the same point, they converge from different directions.
 *
 * Separation: nearbyAgents list is pushed by MainScene each AI tick.
 * The separation force is blended into movement to prevent pile-ups.
 */
export class EnemyAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  /** Assigned by MainScene after spawn — angle slot for encirclement */
  flankAngle = 0;
  /** Strafe direction: +1 CCW, -1 CW — randomised at construction */
  strafeDir: 1 | -1;
  /** Nearby agents for separation — set each AI tick by MainScene */
  nearbyAgents: SteeredAgent[] = [];
  /** Shared player predictor — injected by MainScene */
  predictor: PlayerPredictor | null = null;

  /** Set true by EMP/stun systems — disables ranged fire and movement boost. */
  _suppressed = false;

  /** When set, this enemy ignores the player and marches to destroy the reactor. */
  reactorTarget: { x: number; y: number } | null = null;

  readonly shootSkill: ShootSkill;

  private playerRef: { x: number; y: number };
  private _scene: Phaser.Scene | null = null;
  /** Accumulates elapsed time for strafe orbit angle calculation */
  private _strafeTime = 0;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 60,
    speed = 90,
  ) {
    super(EnemyAgent._buildActions(), 0.08);
    this.posX = x;
    this.posY = y;
    this.targetX = x;
    this.targetY = y;
    this.playerRef = playerRef;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.shootSkill = new ShootSkill(this.id, { damage: 8, range: 320, tint: 0xff3300 }, 1200);
  }

  bindScene(scene: Phaser.Scene): void {
    this._scene = scene;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  protected populateContext(ctx: ContextSnapshot): void {
    // Reactor assaulters measure distance to the reactor instead of the player.
    const refX = this.reactorTarget?.x ?? this.playerRef.x;
    const refY = this.reactorTarget?.y ?? this.playerRef.y;
    const dx = refX - this.posX;
    const dy = refY - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    ctx.distanceToPlayer = Math.min(dist / 600, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    // Reactor assaulters ignore the player as a threat — they're on a mission
    ctx.danger = this.reactorTarget ? 0 : Math.max(0, 1 - dist / 400);
    ctx.health = this.hp / this.maxHp;
    // Assaulters always "see" the reactor (no sight-range limit)
    ctx.targetVisible = dist < (this.reactorTarget ? 1400 : 950);
    ctx.ammo = this.shootSkill.normalizedCooldown;
    ctx.resource = 0;
    ctx.goalProgress = 1 - ctx.distanceToPlayer;

    if (ctx.targetVisible && !this.reactorTarget) {
      this.memory.lastKnownPlayerPos = { x: this.playerRef.x, y: this.playerRef.y };
    }
  }

  override tick(delta: number): void {
    this.shootSkill.tick();
    this._strafeTime += delta;
    super.tick(delta);

    const current = this.reasoner.current;
    if (!current) return;

    const dx = this.playerRef.x - this.posX;
    const dy = this.playerRef.y - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (current.name) {
      case "Chase": {
        if (this.reactorTarget) {
          // Reactor assaulter: navigate straight to the reactor via door routing.
          let tx = this.reactorTarget.x;
          let ty = this.reactorTarget.y;
          const ec = Math.floor(this.posX / CELL_W);
          const er = Math.floor(this.posY / CELL_H);
          const rc = Math.floor(tx / CELL_W);
          const rr = Math.floor(ty / CELL_H);
          if (ec !== rc || er !== rr) {
            const wp = this._doorWaypoint(ec, er, rc, rr);
            tx = wp.x; ty = wp.y;
          }
          this.setTarget(tx, ty);
          break;
        }
        // Use predicted player position when confidence is high (low entropy)
        let targetX = this.playerRef.x;
        let targetY = this.playerRef.y;
        if (this.predictor) {
          const pred = this.predictor.predictedPosition(400); // 400ms lookahead
          // Blend predicted vs current based on entropy (chaotic player → less prediction)
          const confidence = Math.max(0.2, 1 - this.predictor.movementEntropy);
          targetX = this.playerRef.x + (pred.x - this.playerRef.x) * confidence;
          targetY = this.playerRef.y + (pred.y - this.playerRef.y) * confidence;
        }

        // Door-routing: if enemy is in a different room than the player,
        // navigate through the nearest door opening instead of walking into walls.
        const ec = Math.floor(this.posX / CELL_W);
        const er = Math.floor(this.posY / CELL_H);
        const pc = Math.floor(targetX / CELL_W);
        const pr = Math.floor(targetY / CELL_H);
        if (ec !== pc || er !== pr) {
          const wp = this._doorWaypoint(ec, er, pc, pr);
          targetX = wp.x;
          targetY = wp.y;
        }

        // Move to assigned flank position around predicted position
        const flankPos = SteeringBehaviors.flankTarget(targetX, targetY, this.flankAngle, 140);
        this.setTarget(flankPos.x, flankPos.y);
        break;
      }

      case "Strafe":
      case "Attack": {
        if (this.reactorTarget) {
          // At the reactor: jitter around it — simulates contact attack
          this.setTarget(
            this.reactorTarget.x + Phaser.Math.Between(-28, 28),
            this.reactorTarget.y + Phaser.Math.Between(-28, 28),
          );
          break;
        }
        const orbitRadius = 140 + Math.sin(this._strafeTime * 0.3) * 30; // slight radius variance
        const strafePos = SteeringBehaviors.strafeTarget(
          this.posX, this.posY,
          this.playerRef.x, this.playerRef.y,
          orbitRadius, this.strafeDir, 1.2, delta * 1000,
        );
        this.setTarget(strafePos.x, strafePos.y);

        // Shoot with predictive intercept — 3-round burst pattern (machine-gun feel)
        if (this.shootSkill.canUse && this._scene && dist < 360 && !this._suppressed) {
          let aimX = this.playerRef.x;
          let aimY = this.playerRef.y;
          if (this.predictor) {
            const pred = this.predictor.predictedPosition(200);
            aimX = pred.x;
            aimY = pred.y;
          } else {
            const playerBody = (this.playerRef as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body | null;
            const pVx = playerBody?.velocity.x ?? 0;
            const pVy = playerBody?.velocity.y ?? 0;
            const intercept = SteeringBehaviors.interceptAngle(
              this.posX, this.posY, this.playerRef.x, this.playerRef.y, pVx, pVy, 320,
            );
            aimX = this.playerRef.x + Math.cos(intercept) * 50;
            aimY = this.playerRef.y + Math.sin(intercept) * 50;
          }
          const aimAngle = Math.atan2(aimY - this.posY, aimX - this.posX);
          // Fire 3-round burst with tight jitter
          this.shootSkill.tryUse(this.posX, this.posY, aimAngle);
          for (let i = 1; i <= 2; i++) {
            this._scene.time.delayedCall(70 * i, () => {
              if (this.isDead || this._suppressed) return;
              const a2 = aimAngle + (Math.random() - 0.5) * 0.08;
              this.shootSkill.reset(); // bypass per-shot cooldown for burst
              this.shootSkill.tryUse(this.posX, this.posY, a2);
            });
          }
        }
        break;
      }

      case "Flee": {
        const len = dist || 1;
        this.setTarget(
          this.posX + (-dx / len) * 200,
          this.posY + (-dy / len) * 200,
        );
        break;
      }

      case "Patrol":
        // Actively hunt toward last known player position if we have it
        if (this.memory.lastKnownPlayerPos) {
          const lx = this.memory.lastKnownPlayerPos.x;
          const ly = this.memory.lastKnownPlayerPos.y;
          const ldx = lx - this.posX;
          const ldy = ly - this.posY;
          if (ldx * ldx + ldy * ldy > 80 * 80) {
            // Route through door if in different room
            const ec = Math.floor(this.posX / CELL_W);
            const er = Math.floor(this.posY / CELL_H);
            const lc = Math.floor(lx / CELL_W);
            const lr = Math.floor(ly / CELL_H);
            if (ec !== lc || er !== lr) {
              const wp = this._doorWaypoint(ec, er, lc, lr);
              this.setTarget(wp.x, wp.y);
            } else {
              this.setTarget(lx, ly);
            }
            break;
          }
          // Reached last known position — clear memory and resume random patrol
          this.memory.lastKnownPlayerPos = null;
        }
        if (Math.random() < 0.04) {
          this.setTarget(
            this.posX + Phaser.Math.Between(-180, 180),
            this.posY + Phaser.Math.Between(-180, 180),
          );
        }
        break;
    }
  }

  /** Compute a waypoint through the nearest door opening toward the target room. */
  private _doorWaypoint(
    ec: number, er: number,
    tc: number, tr: number,
  ): { x: number; y: number } {
    // Move one step toward target room — prefer column difference first
    if (tc !== ec) {
      // Moving horizontally → pass through vertical wall between col ec and ec±1
      const wallX = (Math.min(ec, ec + Math.sign(tc - ec)) + 1) * CELL_W;
      // Doors are at 30% and 70% of row height
      const door1Y = er * CELL_H + CELL_H * 0.3;
      const door2Y = er * CELL_H + CELL_H * 0.7;
      const closest = Math.abs(this.posY - door1Y) < Math.abs(this.posY - door2Y) ? door1Y : door2Y;
      return { x: wallX, y: closest };
    } else {
      // Moving vertically → pass through horizontal wall between row er and er±1
      const wallY = (Math.min(er, er + Math.sign(tr - er)) + 1) * CELL_H;
      // Doors are at 30% and 70% of column width
      const door1X = ec * CELL_W + CELL_W * 0.3;
      const door2X = ec * CELL_W + CELL_W * 0.7;
      const closest = Math.abs(this.posX - door1X) < Math.abs(this.posX - door2X) ? door1X : door2X;
      return { x: closest, y: wallY };
    }
  }

  updateMovement(deltaMs: number): void {
    if (!this.sprite) return;
    const dx = this.targetX - this.posX;
    const dy = this.targetY - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;

    // Apply separation force to prevent piling
    const sep = SteeringBehaviors.separation(
      { id: this.id, posX: this.posX, posY: this.posY },
      this.nearbyAgents,
      50,
    );

    // Drones rushing the reactor get a 35% speed bonus — they're on a mission
    const rushSpeed = this.reactorTarget ? this.speed * 1.35 : this.speed;
    const step = rushSpeed * (deltaMs / 1000);
    const ratio = Math.min(step / dist, 1);

    this.posX += dx * ratio + sep.x * (deltaMs / 1000) * this.speed * 0.4;
    this.posY += dy * ratio + sep.y * (deltaMs / 1000) * this.speed * 0.4;

    // Clamp to arena
    this.posX = Phaser.Math.Clamp(this.posX, 20, WORLD_WIDTH - 20);
    this.posY = Phaser.Math.Clamp(this.posY, 20, WORLD_HEIGHT - 20);

    this.sprite.setPosition(this.posX, this.posY);

    // Rotate sprite to face movement direction
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      this.sprite.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
    }
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

  private static _buildActions(): Action[] {
    const patrol = new Action(
      "Patrol",
      [
        new Consideration("safe_distance", CurveType.Quadratic, 2, (c) => c.distanceToPlayer),
        new Consideration("not_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 0.1 : 0.9),
      ],
      () => {},
      1.0, 0.2,
    );

    const chase = new Action(
      "Chase",
      [
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0.3),
        new Consideration("not_in_range", CurveType.Logistic, 8, (c) => c.distanceToPlayer),
        new Consideration("healthy", CurveType.Quadratic, 2, (c) => c.health),
      ],
      () => {},
      1.2, 0.15,
    );

    const strafe = new Action(
      "Strafe",
      [
        new Consideration("close_range", CurveType.Exponential, 3, (c) => 1 - c.distanceToPlayer),
        new Consideration("weapon_ready", CurveType.Linear, 1, (c) => c.ammo),
        new Consideration("sees_target", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0),
        new Consideration("healthy_enough", CurveType.Linear, 1, (c) => c.health > 0.35 ? 1 : 0.3),
      ],
      () => {},
      1.5, 0.12,
    );

    const attack = new Action(
      "Attack",
      [
        new Consideration("close", CurveType.Exponential, 3, (c) => 1 - c.distanceToPlayer),
        new Consideration("weapon_ready", CurveType.Linear, 1, (c) => c.ammo),
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0),
      ],
      () => {},
      1.4, 0.1,
    );

    const flee = new Action(
      "Flee",
      [
        new Consideration("low_hp", CurveType.Exponential, 4, (c) => 1 - c.health),
        new Consideration("threatened", CurveType.Quadratic, 2, (c) => c.danger),
      ],
      () => {},
      1.0, 0.3,
    );

    return [patrol, chase, strafe, attack, flee];
  }
}

