import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

/**
 * SawbladeAgent — fast melee rusher that charges directly at the player.
 *
 * Action set:
 *   Charge  — rushes toward the player when detected
 *   Patrol  — wanders when player is far away
 *   Retreat — backs off briefly after contact to wind up another charge
 *
 * No ranged attack. Deals high contact damage on reach.
 */
export class SawbladeAgent extends BaseAgent {
  posX: number;
  posY: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  speed: number;

  readonly contactDamage = 15;
  hasHitRecently = false;

  private playerRef: { x: number; y: number };
  private _scene: Phaser.Scene | null = null;
  private _hitCooldownTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    x: number,
    y: number,
    playerRef: { x: number; y: number },
    hp = 50,
    speed = 160,
  ) {
    super(SawbladeAgent._buildActions(), 0.08);
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
    ctx.targetVisible = dist < 380;
    ctx.ammo = 0;
    ctx.resource = 0;
    // goalProgress: 0 = just hit (retreating), 1 = ready to charge
    ctx.goalProgress = this.hasHitRecently ? 0 : 1;

    if (ctx.targetVisible) {
      this.memory.lastKnownPlayerPos = { x: this.playerRef.x, y: this.playerRef.y };
    }
  }

  override tick(delta: number): void {
    super.tick(delta);

    const current = this.reasoner.current;
    if (!current) return;

    switch (current.name) {
      case "Charge": {
        // Rush directly toward the player
        this.setTarget(this.playerRef.x, this.playerRef.y);
        break;
      }
      case "Retreat": {
        // Back away from the player briefly
        const dx = this.posX - this.playerRef.x;
        const dy = this.posY - this.playerRef.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this.setTarget(
          this.posX + (dx / len) * 150,
          this.posY + (dy / len) * 150,
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
    const step = this.speed * (deltaMs / 1000);
    const ratio = Math.min(step / dist, 1);
    this.posX += dx * ratio;
    this.posY += dy * ratio;
    this.sprite.setPosition(this.posX, this.posY);
    // Spin the sawblade
    this.sprite.setRotation(this.sprite.rotation + deltaMs * 0.01);
  }

  setTarget(x: number, y: number): void {
    this.targetX = Phaser.Math.Clamp(x, 20, WORLD_WIDTH - 20);
    this.targetY = Phaser.Math.Clamp(y, 20, WORLD_HEIGHT - 20);
  }

  /**
   * Register a contact hit — sets cooldown so damage isn't applied every frame.
   * Call this from your collision handler after dealing contactDamage.
   */
  registerHit(): void {
    if (this.hasHitRecently) return;
    this.hasHitRecently = true;

    if (this._scene) {
      this._hitCooldownTimer = this._scene.time.delayedCall(800, () => {
        this.hasHitRecently = false;
        this._hitCooldownTimer = null;
      });
    } else {
      // Fallback without scene timer
      setTimeout(() => {
        this.hasHitRecently = false;
      }, 800);
    }
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.data?.set("hp", this.hp);
    this.memory.store("last_damage", amount, { x: this.posX, y: this.posY }, 4000);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  override destroy(): void {
    this._hitCooldownTimer?.destroy();
    this._hitCooldownTimer = null;
    super.destroy();
  }

  private static _buildActions(): Action[] {
    const charge = new Action(
      "Charge",
      [
        new Consideration("target_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 1 : 0.2),
        new Consideration("close_enough", CurveType.Logistic, 8, (c) => 1 - c.distanceToPlayer),
        new Consideration("ready_to_charge", CurveType.Quadratic, 2, (c) => c.goalProgress),
        new Consideration("healthy", CurveType.Linear, 1, (c) => c.health),
      ],
      () => {},
      1.4, 0.15,
    );

    const patrol = new Action(
      "Patrol",
      [
        new Consideration("safe_distance", CurveType.Quadratic, 2, (c) => c.distanceToPlayer),
        new Consideration("not_visible", CurveType.Linear, 1, (c) => c.targetVisible ? 0.1 : 0.9),
      ],
      () => {},
      1.0, 0.2,
    );

    const retreat = new Action(
      "Retreat",
      [
        new Consideration("just_hit", CurveType.Exponential, 3, (c) => 1 - c.goalProgress),
        new Consideration("close_to_player", CurveType.Quadratic, 2, (c) => 1 - c.distanceToPlayer),
      ],
      () => {},
      1.2, 0.1,
    );

    return [charge, patrol, retreat];
  }
}
