import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { SteeringBehaviors, SteeredAgent } from "../ai/SteeringBehaviors";
import type { PlayerPredictor } from "../ai/PlayerPredictor";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

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
    const dx = this.playerRef.x - this.posX;
    const dy = this.playerRef.y - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    ctx.distanceToPlayer = Math.min(dist / 600, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    ctx.danger = Math.max(0, 1 - dist / 400);
    ctx.health = this.hp / this.maxHp;
    ctx.targetVisible = dist < 420;
    ctx.ammo = this.shootSkill.normalizedCooldown;
    ctx.resource = 0;
    ctx.goalProgress = 1 - ctx.distanceToPlayer;

    if (ctx.targetVisible) {
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
        // Move to assigned flank position around predicted position
        const flankPos = SteeringBehaviors.flankTarget(targetX, targetY, this.flankAngle, 140);
        this.setTarget(flankPos.x, flankPos.y);
        break;
      }

      case "Strafe":
      case "Attack": {
        // Strafe: orbit player while shooting
        const orbitRadius = 140 + Math.sin(this._strafeTime * 0.3) * 30; // slight radius variance
        const strafePos = SteeringBehaviors.strafeTarget(
          this.posX, this.posY,
          this.playerRef.x, this.playerRef.y,
          orbitRadius, this.strafeDir, 1.2, delta * 1000,
        );
        this.setTarget(strafePos.x, strafePos.y);

        // Shoot with predictive intercept
        if (this.shootSkill.canUse && this._scene && dist < 360) {
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
          this.shootSkill.tryUse(this.posX, this.posY, aimAngle);
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
        if (Math.random() < 0.04) {
          this.setTarget(
            this.posX + Phaser.Math.Between(-180, 180),
            this.posY + Phaser.Math.Between(-180, 180),
          );
        }
        break;
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

    const step = this.speed * (deltaMs / 1000);
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

