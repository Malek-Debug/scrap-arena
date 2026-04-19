import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

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
    const dx = this.targetX - this.posX;
    const dy = this.targetY - this.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;
    const step = this.speed * (deltaMs / 1000);
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
