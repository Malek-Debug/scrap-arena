import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { ShootSkill } from "../ai/skills/ShootSkill";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

/**
 * TurretAgent — stationary defense turret with rapid fire.
 *
 * Action set:
 *   Track  — always active, tracks player angle
 *   Attack — shoots when player is in range + weapon ready
 *
 * Does NOT move; stays at its spawn position.
 */
export class TurretAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  readonly shootSkill: ShootSkill;

  private playerRef: { x: number; y: number };
  private _scene: Phaser.Scene | null = null;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 120,
    speed = 0,
  ) {
    super(TurretAgent._buildActions(), 0.08);
    this.posX = x;
    this.posY = y;
    this.targetX = x;
    this.targetY = y;
    this.playerRef = playerRef;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.shootSkill = new ShootSkill(this.id, { damage: 6, range: 400, tint: 0xff6600 }, 600);
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
    ctx.targetVisible = dist < 400;
    ctx.ammo = this.shootSkill.normalizedCooldown;
    ctx.resource = 0;
    ctx.goalProgress = 1 - ctx.distanceToPlayer;

    if (ctx.targetVisible) {
      this.memory.lastKnownPlayerPos = { x: this.playerRef.x, y: this.playerRef.y };
    }
  }

  override tick(delta: number): void {
    this.shootSkill.tick();
    super.tick(delta);

    const current = this.reasoner.current;
    if (!current) return;

    switch (current.name) {
      case "Track": {
        // Track player position for aiming — turret does not move
        const pos = this.memory.lastKnownPlayerPos;
        if (pos) this.setTarget(pos.x, pos.y);
        break;
      }
      case "Attack": {
        const pos = this.memory.lastKnownPlayerPos;
        if (pos) this.setTarget(pos.x, pos.y);

        if (this.shootSkill.canUse && this._scene) {
          const angle = Math.atan2(
            this.playerRef.y - this.posY,
            this.playerRef.x - this.posX,
          );
          this.shootSkill.tryUse(this.posX, this.posY, angle);
        }
        break;
      }
    }
  }

  /** No-op — turret is stationary */
  updateMovement(_deltaMs: number): void {}

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
    const track = new Action(
      "Track",
      [
        new Consideration("always_on", CurveType.Linear, 1, () => 0.8),
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 0.9 : 0.5),
      ],
      () => {},
      1.0, 0.2,
    );

    const attack = new Action(
      "Attack",
      [
        new Consideration("in_range", CurveType.Exponential, 3, (c) => 1 - c.distanceToPlayer),
        new Consideration("weapon_ready", CurveType.Linear, 1, (c) => c.ammo),
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0),
      ],
      () => {},
      1.4, 0.1,
    );

    return [track, attack];
  }
}
