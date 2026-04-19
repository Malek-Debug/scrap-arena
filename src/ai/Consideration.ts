import { CurveType, type IConsideration } from "./interfaces";
import type { ContextSnapshot } from "./ContextSnapshot";

/**
 * Concrete consideration — evaluates a single axis via a response curve.
 * The `inputFn` extracts raw [0,1] from the snapshot; the curve shapes the score.
 */
export class Consideration implements IConsideration {
  readonly name: string;
  readonly curve: CurveType;
  readonly k: number;
  private readonly inputFn: (ctx: ContextSnapshot) => number;

  constructor(
    name: string,
    curve: CurveType,
    k: number,
    inputFn: (ctx: ContextSnapshot) => number,
  ) {
    this.name = name;
    this.curve = curve;
    this.k = k;
    this.inputFn = inputFn;
  }

  evaluate(ctx: ContextSnapshot): number {
    const raw = Math.max(0, Math.min(1, this.inputFn(ctx)));
    return Consideration.applyCurve(raw, this.curve, this.k);
  }

  /**
   * Static curve evaluation — no allocation, branch-minimal.
   * All outputs clamped [0,1].
   *
   * Curve reference:
   *   Linear     — identity, slope = 1
   *   Quadratic  — x^k, concave/convex power curve
   *   Logistic   — S-curve centered at 0.5; k = steepness (6–12 typical)
   *   Exponential — fast acceleration; e^(kx) normalized to [0,1]
   *   InverseLog  — fast initial rise, plateau; 1 - e^(-kx) normalized
   */
  static applyCurve(x: number, curve: CurveType, k: number): number {
    switch (curve) {
      case CurveType.Linear:
        return x;
      case CurveType.Quadratic:
        return Math.pow(x, k);
      case CurveType.Logistic:
        return 1 / (1 + Math.exp(-k * (x - 0.5)));
      case CurveType.Exponential:
        return (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
      case CurveType.InverseLog: {
        // Normalize: (1 - e^(-kx)) / (1 - e^(-k))
        const denom = 1 - Math.exp(-k);
        return denom === 0 ? x : (1 - Math.exp(-k * x)) / denom;
      }
      default:
        return x;
    }
  }
}
