/**
 * Immutable snapshot of the world state relevant to a single agent's decision.
 * Pooled — never allocate in the hot loop.
 */
export class ContextSnapshot {
  /** Normalized [0,1] distance to nearest threat */
  distanceToThreat = 0;
  /** Normalized [0,1] danger level (composite of nearby hostiles, low HP, etc.) */
  danger = 0;
  /** Normalized [0,1] nearest resource availability */
  resource = 0;
  /** Normalized [0,1] progress toward current goal */
  goalProgress = 0;
  /** Normalized [0,1] agent's current health ratio */
  health = 0;
  /** Normalized [0,1] ammo / energy ratio */
  ammo = 0;
  /** Normalized [0,1] distance to last known player position */
  distanceToPlayer = 0;
  /** Is the target currently visible? */
  targetVisible = false;
  /** Number of allies in proximity (raw, not normalized — consider normalizing in Consideration) */
  alliesNearby = 0;
  /** Custom axes — keyed for extensibility without subclassing */
  custom: Map<string, number> = new Map();

  reset(): void {
    this.distanceToThreat = 0;
    this.danger = 0;
    this.resource = 0;
    this.goalProgress = 0;
    this.health = 0;
    this.ammo = 0;
    this.distanceToPlayer = 0;
    this.targetVisible = false;
    this.alliesNearby = 0;
    this.custom.clear();
  }
}
