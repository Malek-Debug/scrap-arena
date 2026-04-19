import Phaser from "phaser";
import { BaseAgent } from "../ai/BaseAgent";
import { Action } from "../ai/Action";
import { Consideration } from "../ai/Consideration";
import { ContextSnapshot } from "../ai/ContextSnapshot";
import { CurveType } from "../ai/interfaces";
import { SystemsBus } from "../core/SystemsBus";
import { DimensionBreach } from "../ai/DimensionBreach";
import { WorldType } from "../core/WorldManager";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

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

  protected populateContext(ctx: ContextSnapshot): void {
    const dxPlayer = this.playerRef.x - this.posX;
    const dyPlayer = this.playerRef.y - this.posY;
    const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dyPlayer * dyPlayer);

    const dxPost = this.postX - this.posX;
    const dyPost = this.postY - this.posY;
    const distPost = Math.sqrt(dxPost * dxPost + dyPost * dyPost);

    ctx.distanceToPlayer = Math.min(distPlayer / 500, 1);
    ctx.distanceToThreat = ctx.distanceToPlayer;
    ctx.health = this.hp / this.maxHp;
    ctx.danger = distPlayer < 200 ? 1 : distPlayer < 350 ? 0.5 : 0;
    ctx.targetVisible = distPlayer < 300;
    ctx.goalProgress = 1 - Math.min(distPost / 200, 1); // how close to post
    ctx.resource = this.alertLevel;

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
  }

  override tick(delta: number): void {
    // Update breach — Guards are CIRCUIT world, breach into FOUNDRY
    const justBreached = this.breach.update(delta, WorldType.CIRCUIT, this.playerWorld);
    if (justBreached) {
      // Emit event so MainScene can show breach VFX
      SystemsBus.instance.emit("guard:breach", this.id, this.posX, this.posY);
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
        const pos = this.memory.lastKnownPlayerPos;
        if (pos) this.setTarget(pos.x, pos.y);
        break;
      }
      case "Return":
        this.setTarget(this.postX, this.postY);
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
