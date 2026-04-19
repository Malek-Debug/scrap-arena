/**
 * GameState — formal state machine replacing scattered boolean flags.
 *
 * Replaces:
 *   private gameOver = false;
 *   private paused = false;
 *   private camerasViewActive = false;
 *   (and various inline guards)
 *
 * Usage:
 *   const sm = new GameStateMachine();
 *   sm.transition(GameState.PAUSED);
 *   if (sm.is(GameState.PLAYING)) { ... }
 */

export const enum GameState {
  PLAYING    = "playing",
  PAUSED     = "paused",
  WAVE_REST  = "wave_rest",
  SHOP       = "shop",
  BOSS_INTRO = "boss_intro",
  GAME_OVER  = "game_over",
  CUTSCENE   = "cutscene",
}

/** Valid transitions map: key = current state, value = states it can move to. */
const TRANSITIONS: Record<GameState, GameState[]> = {
  [GameState.PLAYING]:    [GameState.PAUSED, GameState.WAVE_REST, GameState.BOSS_INTRO, GameState.GAME_OVER, GameState.SHOP, GameState.CUTSCENE],
  [GameState.PAUSED]:     [GameState.PLAYING, GameState.GAME_OVER],
  [GameState.WAVE_REST]:  [GameState.PLAYING, GameState.SHOP, GameState.PAUSED, GameState.GAME_OVER],
  [GameState.SHOP]:       [GameState.PLAYING, GameState.WAVE_REST, GameState.PAUSED],
  [GameState.BOSS_INTRO]: [GameState.PLAYING, GameState.GAME_OVER],
  [GameState.GAME_OVER]:  [],
  [GameState.CUTSCENE]:   [GameState.PLAYING, GameState.PAUSED],
};

type StateListener = (from: GameState, to: GameState) => void;

export class GameStateMachine {
  private _current: GameState = GameState.PLAYING;
  private _listeners: StateListener[] = [];

  get current(): GameState {
    return this._current;
  }

  /** Returns true if the machine is currently in the given state. */
  is(state: GameState): boolean {
    return this._current === state;
  }

  /** Returns true if any of the given states matches current. */
  isAny(...states: GameState[]): boolean {
    return states.includes(this._current);
  }

  /** Returns true if the given state is active or higher-priority than PLAYING. */
  isInterrupted(): boolean {
    return this._current !== GameState.PLAYING;
  }

  /**
   * Attempt to move to `next`.
   * Returns true on success, false if the transition is not permitted.
   */
  transition(next: GameState): boolean {
    if (!TRANSITIONS[this._current].includes(next)) {
      return false;
    }
    const prev = this._current;
    this._current = next;
    for (const fn of this._listeners) fn(prev, next);
    return true;
  }

  /**
   * Force-set state without validation (use only for initialisation/reset).
   */
  forceSet(state: GameState): void {
    const prev = this._current;
    this._current = state;
    for (const fn of this._listeners) fn(prev, state);
  }

  /** Register a callback invoked on every successful transition. */
  onChange(fn: StateListener): void {
    this._listeners.push(fn);
  }

  /** Convenience: is game over? */
  get isGameOver(): boolean { return this._current === GameState.GAME_OVER; }
  /** Convenience: is paused (any non-playing non-gameover state)? */
  get isPaused(): boolean    { return this._current === GameState.PAUSED; }
  /** Convenience: is gameplay running? */
  get isPlaying(): boolean   { return this._current === GameState.PLAYING; }
}
