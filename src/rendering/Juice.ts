import Phaser from "phaser";

// ─── Priority constants ────────────────────────────────────────────────────
// Higher number wins when two effects overlap.
// "Most-slow" (lowest scale) rule applies within the same priority tier.
const PRIORITY_FRACTURE = 1;   // kill-streak time fracture
const PRIORITY_SLOWMO   = 2;   // gameplay / death slow motion
const PRIORITY_HITSTOP  = 3;   // instantaneous hit freeze

interface TimeEffect {
  id: string;
  scale: number;
  priority: number;
  endTime: number;           // performance.now() expiry — Infinity for manually-cleared effects
  timerId?: Phaser.Time.TimerEvent;
}

/**
 * Static juice effects — call from anywhere, no instantiation.
 *
 * Time-scale ownership: all writes to scene.time.timeScale and
 * scene.physics.world.timeScale are centralised here.  External code
 * must call Juice.requestEffect() / Juice.clearEffect() / Juice.reset()
 * instead of touching those properties directly.
 *
 * Priority rule: highest-priority slot wins.  Within equal priority the
 * most dramatic (lowest scale) wins.  When an effect expires the remaining
 * active slots recompute the effective scale automatically.
 */
export class Juice {
  private static _effects: TimeEffect[] = [];

  // Legacy compat — kept so Juice.reset() callers compile unchanged
  private static _activeShakeIntensity = 0;
  private static _activeShakeEndTime   = 0;

  // ── Internal helpers ────────────────────────────────────────────────────

  private static _apply(scene: Phaser.Scene): void {
    const now = performance.now();
    // Purge expired effects that don't carry a Phaser timer (time-based expiry).
    this._effects = this._effects.filter(e => e.endTime > now || e.endTime === Infinity);

    let scale = 1;
    let winningPriority = 0;

    for (const e of this._effects) {
      if (e.endTime !== Infinity && e.endTime <= now) continue;
      if (
        e.priority > winningPriority ||
        (e.priority === winningPriority && e.scale < scale)
      ) {
        scale = e.scale;
        winningPriority = e.priority;
      }
    }

    // Clamp to safe range to avoid NaN/Infinity in physics
    const clamped = Math.max(0.001, Math.min(scale, 10));
    scene.time.timeScale = clamped;
    scene.tweens.timeScale = clamped;
    if (scene.physics?.world) {
      scene.physics.world.timeScale = clamped === 0 ? Infinity : 1 / clamped;
    }
  }

  private static _removeEffect(id: string): void {
    const idx = this._effects.findIndex(e => e.id === id);
    if (idx !== -1) this._effects.splice(idx, 1);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Request a temporary time-scale effect.
   *
   * @param scene    The active Phaser scene.
   * @param id       Unique key — a second call with the same id replaces the first.
   * @param scale    Target time scale (0 < scale ≤ 1 for slow-mo, >1 for speed-up).
   * @param duration Duration in ms.  Pass Infinity to hold until clearEffect().
   * @param priority PRIORITY_FRACTURE | PRIORITY_SLOWMO | PRIORITY_HITSTOP
   */
  static requestEffect(
    scene: Phaser.Scene,
    id: string,
    scale: number,
    duration: number,
    priority: number,
  ): void {
    // Replace any existing effect with the same id
    this._removeEffect(id);

    const endTime = duration === Infinity ? Infinity : performance.now() + duration;
    const effect: TimeEffect = { id, scale, priority, endTime };

    if (duration !== Infinity) {
      // Use real setTimeout for near-zero timescales (hitStop) since
      // scene.time.delayedCall is affected by timeScale and would never fire.
      if (scale < 0.01) {
        window.setTimeout(() => {
          this._removeEffect(id);
          if (!!scene.sys?.isActive()) this._apply(scene);
        }, duration);
      } else {
        effect.timerId = scene.time.delayedCall(duration, () => {
          this._removeEffect(id);
          if (!!scene.sys.isActive()) this._apply(scene);
        });
      }
    }

    this._effects.push(effect);
    this._apply(scene);
  }

  /** Manually remove a held effect (duration === Infinity) and recompute. */
  static clearEffect(scene: Phaser.Scene, id: string): void {
    const e = this._effects.find(f => f.id === id);
    if (e?.timerId) e.timerId.remove(false);
    this._removeEffect(id);
    this._apply(scene);
  }

  static reset(scene?: Phaser.Scene): void {
    // Cancel all pending Phaser timers
    for (const e of this._effects) {
      e.timerId?.remove(false);
    }
    this._effects = [];
    this._activeShakeIntensity = 0;
    this._activeShakeEndTime   = 0;
    if (scene && !!scene.sys.isActive()) {
      scene.time.timeScale    = 1;
      scene.tweens.timeScale  = 1;
      if (scene.physics?.world) scene.physics.world.timeScale = 1;
    }
  }

  // ── Convenience wrappers (migrate existing callers) ─────────────────────

  /**
   * Ramp time scale down then back up.
   * Uses priority SLOWMO — lower-priority effects (fracture) do not override it.
   */
  static slowMo(scene: Phaser.Scene, timeScale = 0.2, duration = 400): void {
    // If an equal/higher-priority effect is already more dramatic, skip.
    const now = performance.now();
    const rival = this._effects.find(
      e => e.priority >= PRIORITY_SLOWMO && e.scale <= timeScale && (e.endTime > now || e.endTime === Infinity),
    );
    if (rival) return;

    // Use a ramp-up via a counter tween then clear when done
    const id = `slowmo_${performance.now()}`;
    this.requestEffect(scene, id, timeScale, Infinity, PRIORITY_SLOWMO);

    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: "Quad.easeIn",
      onUpdate: (tween) => {
        if (!scene.sys.isActive()) return;
        const progress01 = tween.getValue() as number;
        const scale = Phaser.Math.Linear(timeScale, 1, progress01);
        // Update the held effect's scale so _apply sees the ramp
        const e = this._effects.find(f => f.id === id);
        if (e) { e.scale = scale; }
        this._apply(scene);
      },
      onComplete: () => {
        this.clearEffect(scene, id);
      },
    });
  }

  /**
   * Freeze the game for durationMs then resume — classic hit-stop feel.
   * Highest priority so it always wins.
   */
  static hitStop(scene: Phaser.Scene, durationMs = 80): void {
    this.requestEffect(scene, "hitstop", 0.001, durationMs, PRIORITY_HITSTOP);
  }

  /**
   * Kill-streak time fracture effect.
   * Lowest priority — yields to death/gameplay slowMo.
   */
  static timeFracture(scene: Phaser.Scene): void {
    // Phase 1: slow-down (200 ms)
    this.requestEffect(scene, "fracture", 0.3, 200, PRIORITY_FRACTURE);

    // Phase 2: speed-up (replaces slow-down after 200 ms for 100 ms)
    scene.time.delayedCall(200, () => {
      if (!scene.sys.isActive()) return;
      this.requestEffect(scene, "fracture", 1.5, 100, PRIORITY_FRACTURE);
    });

    // Phase 3: restore (auto-cleared by the 100 ms timer in requestEffect)
  }

  /**
   * Shake the main camera.
   * Most-dramatic shake wins — weaker follow-up calls are dropped.
   */
  static screenShake(scene: Phaser.Scene, intensity = 0.005, duration = 150): void {
    const now = performance.now();
    if (now >= this._activeShakeEndTime) this._activeShakeIntensity = 0;
    if (intensity >= this._activeShakeIntensity) {
      this._activeShakeIntensity = intensity;
      this._activeShakeEndTime   = now + duration;
      scene.cameras.main.shake(duration, intensity);
    }
  }

  /**
   * Flash a sprite white (or any tint) briefly.
   */
  static flashSprite(sprite: Phaser.GameObjects.Sprite, tint = 0xffffff, duration = 60): void {
    sprite.setTintFill(tint);
    sprite.scene.time.delayedCall(duration, () => sprite.clearTint());
  }

  /**
   * Punch-scale: briefly scale up relative to current size then snap back.
   */
  static punchScale(
    target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    scale = 1.3,
    duration = 100,
  ): void {
    const scene = (target as unknown as { scene: Phaser.Scene }).scene;
    const t = target as unknown as Phaser.GameObjects.Components.Transform;
    const origX = t.scaleX;
    const origY = t.scaleY;
    scene.tweens.killTweensOf(target);
    scene.tweens.add({
      targets: target,
      scaleX: origX * scale,
      scaleY: origY * scale,
      duration: duration * 0.4,
      ease: "Back.easeOut",
      yoyo: true,
      onComplete: () => {
        t.setScale(origX, origY);
      },
    });
  }

  // Expose priority constants for external callers if needed
  static readonly PRIORITY_FRACTURE = PRIORITY_FRACTURE;
  static readonly PRIORITY_SLOWMO   = PRIORITY_SLOWMO;
  static readonly PRIORITY_HITSTOP  = PRIORITY_HITSTOP;
}
