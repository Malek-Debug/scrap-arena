import type { ContextSnapshot } from "../ContextSnapshot";

/**
 * Represents a discrete behavior an agent can execute.
 * Scored by the Reasoner via its attached Considerations.
 */
export interface IAction {
  readonly name: string;
  /** Base weight multiplier — used to bias certain actions */
  readonly weight: number;
  /** Momentum bonus — score boost if this action is already active */
  readonly inertia: number;
  execute(ctx: ContextSnapshot, delta: number): void;
  /** Optional abort hook when the Reasoner switches away */
  abort?(): void;
}
