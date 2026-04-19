import type { ContextSnapshot } from "../ContextSnapshot";

export const enum CurveType {
  Linear,
  Quadratic,
  /** S-curve — steep transition around midpoint; k controls steepness (default 8) */
  Logistic,
  /** Accelerating growth; normalized e^(kx) → [0,1] */
  Exponential,
  /** Decelerating growth — fast initial rise, diminishing returns; 1 - e^(-kx) normalized */
  InverseLog,
}

/**
 * A single axis of evaluation for an Action.
 * Maps a normalized input [0,1] to a score [0,1] via a response curve.
 */
export interface IConsideration {
  readonly name: string;
  readonly curve: CurveType;
  /** Exponent / steepness parameter for non-linear curves */
  readonly k: number;
  /** Extract the raw input value [0,1] from the snapshot */
  evaluate(ctx: ContextSnapshot): number;
}
