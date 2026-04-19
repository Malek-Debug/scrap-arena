import type { IAction, IConsideration } from "./interfaces";
import type { ContextSnapshot } from "./ContextSnapshot";

/**
 * A scored action: ties a behavior to N considerations.
 * The Reasoner evaluates all actions and picks the highest composite score.
 */
export class Action implements IAction {
  readonly name: string;
  readonly weight: number;
  readonly inertia: number;
  private readonly considerations: IConsideration[];
  private readonly executeFn: (ctx: ContextSnapshot, delta: number) => void;
  private readonly abortFn?: () => void;

  /** Cache last computed score to avoid re-evaluation */
  lastScore = 0;

  constructor(
    name: string,
    considerations: IConsideration[],
    executeFn: (ctx: ContextSnapshot, delta: number) => void,
    weight = 1.0,
    inertia = 0.0,
    abortFn?: () => void,
  ) {
    this.name = name;
    this.considerations = considerations;
    this.executeFn = executeFn;
    this.weight = weight;
    this.inertia = inertia;
    this.abortFn = abortFn;
  }

  /**
   * Compute composite score using the Compensation Factor formula.
   * Geometric mean with modification factor to avoid single-axis zeroing.
   */
  score(ctx: ContextSnapshot, isCurrentAction: boolean): number {
    const count = this.considerations.length;
    if (count === 0) {
      this.lastScore = this.weight;
      return this.lastScore;
    }

    let product = 1.0;
    const modFactor = 1 - (1 / count); // compensation factor

    for (let i = 0; i < count; i++) {
      const raw = this.considerations[i].evaluate(ctx);
      // Compensation: prevents a single 0 from zeroing the entire score
      const modified = raw + (1 - raw) * modFactor * raw;
      product *= modified;
    }

    // Geometric mean approximation
    let finalScore = product * this.weight;

    if (isCurrentAction) {
      finalScore += this.inertia;
    }

    this.lastScore = Math.max(0, Math.min(1, finalScore));
    return this.lastScore;
  }

  execute(ctx: ContextSnapshot, delta: number): void {
    this.executeFn(ctx, delta);
  }

  abort(): void {
    this.abortFn?.();
  }
}
