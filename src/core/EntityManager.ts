import type { EnemyAgent } from "../agents/EnemyAgent";
import type { GuardAgent } from "../agents/GuardAgent";
import type { CollectorAgent } from "../agents/CollectorAgent";
import type { TurretAgent } from "../agents/TurretAgent";
import type { SawbladeAgent } from "../agents/SawbladeAgent";
import type { WelderAgent } from "../agents/WelderAgent";
import type { BaseAgent } from "../ai/BaseAgent";

export type AnyAgent =
  | EnemyAgent | GuardAgent | CollectorAgent
  | TurretAgent | SawbladeAgent | WelderAgent;

/**
 * EntityManager — replaces 7 fragmented agent arrays.
 *
 * Before:
 *   private enemies: EnemyAgent[] = [];
 *   private guards:  GuardAgent[]  = [];
 *   private allAgents: AnyAgent[]  = [];  // manually kept in sync
 *   ...4 more arrays
 *
 * After:
 *   private em = new EntityManager();
 *   em.add(agent);         → appears in em.all AND em.enemies etc.
 *   em.remove(agent);
 *   em.enemies             → typed view
 *   em.all                 → unified array for iteration
 */
export class EntityManager {
  // Typed views
  readonly enemies:    EnemyAgent[]    = [];
  readonly guards:     GuardAgent[]    = [];
  readonly collectors: CollectorAgent[] = [];
  readonly turrets:    TurretAgent[]   = [];
  readonly sawblades:  SawbladeAgent[] = [];
  readonly welders:    WelderAgent[]   = [];

  /** Unified array — every living agent regardless of type. */
  readonly all: AnyAgent[] = [];

  add(agent: AnyAgent): void {
    this.all.push(agent);
    if (this._isEnemy(agent))     this.enemies.push(agent as EnemyAgent);
    else if (this._isGuard(agent))     this.guards.push(agent as GuardAgent);
    else if (this._isCollector(agent)) this.collectors.push(agent as CollectorAgent);
    else if (this._isTurret(agent))    this.turrets.push(agent as TurretAgent);
    else if (this._isSawblade(agent))  this.sawblades.push(agent as SawbladeAgent);
    else if (this._isWelder(agent))    this.welders.push(agent as WelderAgent);
  }

  remove(agent: AnyAgent): void {
    this._spliceOut(this.all, agent);
    if (this._isEnemy(agent))          this._spliceOut(this.enemies, agent);
    else if (this._isGuard(agent))     this._spliceOut(this.guards, agent);
    else if (this._isCollector(agent)) this._spliceOut(this.collectors, agent);
    else if (this._isTurret(agent))    this._spliceOut(this.turrets, agent);
    else if (this._isSawblade(agent))  this._spliceOut(this.sawblades, agent);
    else if (this._isWelder(agent))    this._spliceOut(this.welders, agent);
  }

  /** Total living agent count (all types combined). */
  get count(): number { return this.all.length; }

  /**
   * Count of agents that are relevant for wave-cleared check.
   * (Excludes collectors — they don't block wave completion.)
   */
  get combatCount(): number {
    return (
      this.enemies.length +
      this.guards.length +
      this.turrets.length +
      this.sawblades.length +
      this.welders.length
    );
  }

  /** Wipe all arrays — used on wave reset / game restart. */
  clear(): void {
    this.all.length = 0;
    this.enemies.length = 0;
    this.guards.length = 0;
    this.collectors.length = 0;
    this.turrets.length = 0;
    this.sawblades.length = 0;
    this.welders.length = 0;
  }

  // ── Type guards (duck-typed on constructor name for zero-import overhead) ──

  private _isEnemy(a: AnyAgent): boolean     { return a.constructor.name === "EnemyAgent"; }
  private _isGuard(a: AnyAgent): boolean     { return a.constructor.name === "GuardAgent"; }
  private _isCollector(a: AnyAgent): boolean { return a.constructor.name === "CollectorAgent"; }
  private _isTurret(a: AnyAgent): boolean    { return a.constructor.name === "TurretAgent"; }
  private _isSawblade(a: AnyAgent): boolean  { return a.constructor.name === "SawbladeAgent"; }
  private _isWelder(a: AnyAgent): boolean    { return a.constructor.name === "WelderAgent"; }

  private _spliceOut<T>(arr: T[], item: T): void {
    const idx = arr.indexOf(item);
    if (idx !== -1) arr.splice(idx, 1);
  }
}
