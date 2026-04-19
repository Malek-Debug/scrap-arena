import type { Action } from "./Action";
import type { ContextSnapshot } from "./ContextSnapshot";

interface ScoreEntry {
  name: string;
  score: number;
  active: boolean;
}

/**
 * Utility AI Reasoner — evaluates all registered actions and selects
 * the highest-scoring one each tick. O(n) per action set.
 *
 * Anti-oscillation: a challenger must exceed the active action's score by
 * `switchThreshold` to trigger a switch. Combine with per-action `inertia`
 * bonus for finer hysteresis control.
 *
 * Scoreboard is pre-allocated — zero heap allocations per tick.
 */
export class Reasoner {
  private readonly actions: Action[];
  private currentAction: Action | null = null;
  private _currentIndex = -1;
  private readonly switchThreshold: number;

  /** Pre-allocated scoreboard — reused across getScoreboard() calls */
  private readonly _scoreboard: ScoreEntry[];

  constructor(actions: Action[], switchThreshold = 0.05) {
    this.actions = actions;
    this.switchThreshold = switchThreshold;
    this._scoreboard = actions.map((a) => ({ name: a.name, score: 0, active: false }));
  }

  /**
   * Evaluate all actions. On the very first call (_currentIndex === -1)
   * unconditionally selects the winner — switch threshold only applies
   * to subsequent transitions to avoid null-action on tick 0.
   */
  evaluate(ctx: ContextSnapshot): Action {
    let bestScore = -1;
    let bestIndex = 0;

    for (let i = 0; i < this.actions.length; i++) {
      const isActive = i === this._currentIndex;
      const score = this.actions[i].score(ctx, isActive);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const isInitial = this._currentIndex === -1;
    const currentScore = this.currentAction?.lastScore ?? -Infinity;
    const shouldSwitch = bestScore - currentScore > this.switchThreshold;

    if (isInitial || (this._currentIndex !== bestIndex && shouldSwitch)) {
      this.currentAction?.abort();
      this._currentIndex = bestIndex;
      this.currentAction = this.actions[bestIndex];
    }

    return this.currentAction!;
  }

  execute(ctx: ContextSnapshot, delta: number): void {
    this.currentAction?.execute(ctx, delta);
  }

  get current(): Action | null {
    return this.currentAction;
  }

  get actionCount(): number {
    return this.actions.length;
  }

  /**
   * Returns the pre-allocated scoreboard array.
   * Mutates in place — do not cache the returned reference across ticks.
   */
  getScoreboard(): ScoreEntry[] {
    for (let i = 0; i < this.actions.length; i++) {
      this._scoreboard[i].name = this.actions[i].name;
      this._scoreboard[i].score = this.actions[i].lastScore;
      this._scoreboard[i].active = i === this._currentIndex;
    }
    return this._scoreboard;
  }
}
