import Phaser from "phaser";
import {
  type DialogueLine, type NarrativeBeat, type StoryFlags,
  NARRATIVE_BEATS, ARIA_TAUNTS, VERA_ENCOURAGEMENTS,
  createDefaultFlags,
} from "./StoryData";

export type StoryPhase =
  | "intro"          // Wake-up cinematic
  | "tutorial"       // First wave triggered
  | "free"           // Normal gameplay
  | "complete";      // Final state

export type NarrativePhase =
  | "awakening"        // Waves 1-2
  | "first_signal"     // Waves 3-4
  | "contamination"    // Wave 5 (Boss 1)
  | "ally_in_dark"     // Waves 6-7
  | "corruption_storm" // Waves 8-9
  | "counterstrike"    // Wave 10 (Boss 2)
  | "endgame"          // Waves 11-14
  | "the_core";        // Wave 15 (Final Boss)

export type RoomTrigger =
  | "shoot"
  | "interact"
  | "enter"
  | "kill"
  | "fix";

/**
 * StorySystem orchestrates the narrative beats of Scrap Arena:
 *   intro → cameras → blackout → find_card → tutorial → free
 * It also tracks per-room "wave armed" state, narrative progression,
 * and the ARIA/VERA character dialogue system.
 */
export class StorySystem {
  phase: StoryPhase = "intro";
  narrativePhase: NarrativePhase = "awakening";
  hasPowerCard = false;
  triggeredRooms: Set<string> = new Set();

  // Narrative engine state
  flags: StoryFlags = createDefaultFlags();
  private _firedBeats: Set<string> = new Set();
  private _pendingLines: DialogueLine[] = [];
  private _lastTauntWave = 0;
  private _lastEncourageWave = 0;

  reset(): void {
    this.phase = "intro";
    this.narrativePhase = "awakening";
    this.hasPowerCard = false;
    this.triggeredRooms.clear();
    this.flags = createDefaultFlags();
    this._firedBeats.clear();
    this._pendingLines = [];
    this._lastTauntWave = 0;
    this._lastEncourageWave = 0;
  }

  setPhase(p: StoryPhase): void {
    this.phase = p;
  }

  shouldTriggerWave(roomKey: string): boolean {
    if (this.phase !== "free" && this.phase !== "tutorial") return false;
    if (this.triggeredRooms.has(roomKey)) return false;
    return true;
  }

  markTriggered(roomKey: string): void {
    this.triggeredRooms.add(roomKey);
  }

  // ─── Narrative Engine ─────────────────────────────────────────

  /** Update the narrative phase based on current wave */
  updateNarrativePhase(wave: number): void {
    if (wave <= 2) this.narrativePhase = "awakening";
    else if (wave <= 4) this.narrativePhase = "first_signal";
    else if (wave <= 5) this.narrativePhase = "contamination";
    else if (wave <= 7) this.narrativePhase = "ally_in_dark";
    else if (wave <= 9) this.narrativePhase = "corruption_storm";
    else if (wave <= 10) this.narrativePhase = "counterstrike";
    else if (wave <= 14) this.narrativePhase = "endgame";
    else this.narrativePhase = "the_core";
  }

  /**
   * Fire a narrative trigger and return any dialogue lines that should play.
   * Called by StoryController when events happen (wave start, room enter, etc).
   */
  fireNarrativeTrigger(
    trigger: NarrativeBeat["trigger"],
    value?: number | string,
  ): DialogueLine[] {
    const results: DialogueLine[] = [];

    for (const beat of NARRATIVE_BEATS) {
      if (beat.trigger !== trigger) continue;
      if (beat.triggerValue !== undefined && beat.triggerValue !== value) continue;

      const once = beat.once ?? true;
      if (once && this._firedBeats.has(beat.id)) continue;
      if (beat.condition && !beat.condition(this.flags)) continue;

      // Special case: random taunt beat
      if (beat.id === "aria_taunt_wave") {
        // handled separately
        continue;
      }

      if (beat.lines.length > 0) {
        results.push(...beat.lines);
      }
      if (beat.setFlags) {
        Object.assign(this.flags, beat.setFlags);
      }
      if (once) this._firedBeats.add(beat.id);
    }

    return results;
  }

  /** Fire the manual greeting beat after power restore */
  fireGreeting(): DialogueLine[] {
    return this.fireNarrativeTrigger("manual", undefined);
  }

  /** Get a random ARIA taunt (throttled to max 1 per 3 waves) */
  getRandomTaunt(currentWave: number): DialogueLine | null {
    if (!this.flags.ariaRevealed || this.flags.endgameStarted) return null;
    if (currentWave - this._lastTauntWave < 3) return null;
    this._lastTauntWave = currentWave;
    return ARIA_TAUNTS[Math.floor(Math.random() * ARIA_TAUNTS.length)];
  }

  /** Get a random VERA encouragement (throttled to max 1 per 2 waves) */
  getRandomEncouragement(currentWave: number): DialogueLine | null {
    if (!this.flags.veraDiscovered) return null;
    if (currentWave - this._lastEncourageWave < 2) return null;
    this._lastEncourageWave = currentWave;
    return VERA_ENCOURAGEMENTS[Math.floor(Math.random() * VERA_ENCOURAGEMENTS.length)];
  }

  /** Fire the "boss half HP" beat manually */
  fireBossHalfHp(): DialogueLine[] {
    return this.fireNarrativeTrigger("manual", undefined);
  }

  /** Fire the corruption warning if conditions met */
  fireCorruptionWarning(): DialogueLine[] {
    if (this.flags.corruptionWarningGiven) return [];
    const beat = NARRATIVE_BEATS.find(b => b.id === "corruption_warning");
    if (!beat) return [];
    if (beat.condition && !beat.condition(this.flags)) return [];
    if (this._firedBeats.has(beat.id)) return [];
    this._firedBeats.add(beat.id);
    if (beat.setFlags) Object.assign(this.flags, beat.setFlags);
    return beat.lines;
  }

  /** Consume pending lines (used by DialogueUI) */
  consumePendingLines(): DialogueLine[] {
    const lines = [...this._pendingLines];
    this._pendingLines = [];
    return lines;
  }

  /** Push lines to pending queue */
  queueLines(lines: DialogueLine[]): void {
    this._pendingLines.push(...lines);
  }
}
