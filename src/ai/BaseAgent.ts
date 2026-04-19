import Phaser from "phaser";
import { Reasoner } from "./Reasoner";
import type { Action } from "./Action";
import { ContextSnapshot } from "./ContextSnapshot";
import { Memory } from "./Memory";
import { ObjectPool } from "../core/ObjectPool";

// Shared context pool across all agents — allocated once
const contextPool = new ObjectPool<ContextSnapshot>(
  () => new ContextSnapshot(),
  (c) => c.reset(),
  64,
  1024,
);

/**
 * Abstract base for all AI-driven entities.
 * Subclass and implement `populateContext` + provide actions to the Reasoner.
 *
 * Runs on a fixed-timestep AI clock independent of render framerate.
 * The sprite/body is optional — AI can run headless.
 */
export abstract class BaseAgent {
  readonly reasoner: Reasoner;
  readonly memory: Memory;
  readonly id: number;

  /** Phaser sprite — null in headless mode */
  sprite: Phaser.Physics.Arcade.Sprite | null = null;

  /** Data store for entity properties (HP, speed, etc.) */
  data: Phaser.Data.DataManager | null = null;

  // ── Combat state (owned by agent, not by scene) ──────────────────────────
  /** Stagger gauge — fills as the agent takes hits. Threshold = 100. */
  staggerGauge = 0;
  /** Countdown (ms) while the agent is in the staggered state. */
  staggerTimer = 0;
  /** Countdown (ms) while the agent is fleeing (fear state). */
  fearTimer = 0;
  /** True while the stagger timer is active. */
  isStaggered = false;
  /** True while the fear timer is active — agent flees the player. */
  isFearing = false;

  private static nextId = 0;

  constructor(actions: Action[], switchThreshold = 0.05) {
    this.id = BaseAgent.nextId++;
    this.reasoner = new Reasoner(actions, switchThreshold);
    this.memory = new Memory();
  }

  /**
   * Called by the fixed-timestep loop. Acquires a pooled context,
   * populates it, runs the Reasoner, and releases the context.
   */
  tick(delta: number): void {
    const ctx = contextPool.acquire();
    try {
      this.populateContext(ctx);
      this.reasoner.evaluate(ctx);
      this.reasoner.execute(ctx, delta);
    } finally {
      contextPool.release(ctx);
    }
    this.memory.prune();
  }

  /**
   * Fill the context snapshot with current world state relative to this agent.
   * Subclasses MUST implement — this is where sensor data flows in.
   */
  protected abstract populateContext(ctx: ContextSnapshot): void;

  /** Bind to a Phaser sprite + DataManager for rendering mode */
  bindSprite(sprite: Phaser.Physics.Arcade.Sprite): void {
    this.sprite = sprite;
    this.data = sprite.getData("__dm") as Phaser.Data.DataManager ?? new Phaser.Data.DataManager(sprite);
    sprite.setData("agentId", this.id);
  }

  /** Convenience: get position (works headless or with sprite) */
  abstract getPosition(): { x: number; y: number };

  destroy(): void {
    this.memory.clear();
    this.sprite?.destroy();
    this.sprite = null;
    this.data = null;
  }
}
