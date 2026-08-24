import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, CELL_W, CELL_H } from "../core";
import type { StorySystem } from "../core";
import type { GameContext } from "./GameContext";
import { DialogueUI } from "../rendering";
import { UI_FONT, constrainTextBlock } from "../rendering/UITheme";

// ── Notification layout constants ────────────────────────────────────────────
// Top-center screen space is divided into two priority slots:
//   ALERT slot  (y = NOTIF_ALERT_Y)  — critical flashing banners (reactor arrow, god mode)
//   HINT  slot  (y = NOTIF_HINT_Y_BASE when alert absent, pushed down when alert present)
const NOTIF_ALERT_Y    = 52;   // alert banner sits just below wave chip (~y=44)
const NOTIF_HINT_Y_BASE = 52;  // hint baseline when no alert is active
const NOTIF_ALERT_H    = 60;   // estimated max height of an alert banner (padding incl.)
const NOTIF_HINT_PUSHED = NOTIF_ALERT_Y + NOTIF_ALERT_H + 8; // hint Y when alert active

export class StoryController {
  private ctx: GameContext;
  private storySystem: StorySystem;
  private onTryTriggerWave: () => void;

  currentRoomKey = "0,0";
  private storyHint: Phaser.GameObjects.Text | null = null;
  private godModeText: Phaser.GameObjects.Text | null = null;
  // Tracks which room themes the player has seen so the contextual physics
  // tutorial only fires the first time you set foot in a given biome.
  private _themesTaught = new Set<string>();

  // Suppress low-priority hints for this many ms after a critical event stamps it.
  private _suppressLowPriorityUntil = 0;

  // Alert slot occupancy — set when a reactor arrow / critical alert is showing.
  // _showStoryHint() reads this to choose the correct Y offset.
  private _alertSlotActive = false;

  // Reactive event tracking
  private _worldSwitchCount = 0;
  private _lowHpFired = false;
  private _nearDeathCooldown = 0;

  // Narrative system
  private dialogueUI: DialogueUI;
  private _logTerminals: Map<string, Phaser.GameObjects.Container> = new Map();

  constructor(
    ctx: GameContext,
    storySystem: StorySystem,
    onTryTriggerWave: () => void,
  ) {
    this.ctx = ctx;
    this.storySystem = storySystem;
    this.onTryTriggerWave = onTryTriggerWave;
    this.dialogueUI = new DialogueUI(ctx.scene);
  }

  /** Called by F10 capture mode — hides/shows all story-layer UI. */
  setCaptureMode(enabled: boolean): void {
    if (this.dialogueUI) {
      this.dialogueUI.setVisible(!enabled);
    }
    if (this.storyHint) this.storyHint.setVisible(!enabled);
    if (this.godModeText) this.godModeText.setVisible(!enabled);
  }

  showLoreIntro(): void { this._beginIntroCinematic(); }
  /**
   * Show a story hint.
   * @param priority "high" bypasses suppression and also stamps a 2.5s suppression window;
   *                 "low" (default) is silently dropped during that window.
   */
  showStoryHint(msg: string, duration = 4500, priority: "high" | "low" = "low"): void {
    if (priority === "high") {
      this._suppressLowPriorityUntil = performance.now() + 2500;
    } else if (performance.now() < this._suppressLowPriorityUntil) {
      return;
    }
    this._showStoryHint(msg, duration);
  }
  /** Stamp a suppression window without showing any hint (call from critical combat events). */
  suppressLowPriorityHints(ms = 2500): void {
    this._suppressLowPriorityUntil = Math.max(this._suppressLowPriorityUntil, performance.now() + ms);
  }
  restorePower(): void { this._restorePower(); }
  showGodModeIndicator(godMode: boolean): void { this._showGodModeIndicator(godMode); }
  showAiLearningNotice(): void { this._showAiLearningNotice(); }
  updateStory(): void { this._updateStory(); this.dialogueUI.update(); }
  updateBlackoutVision(): void { /* removed — camera system stripped */ }
  updateSurveillancePlayerDots(): void { /* removed — camera system stripped */ }

  // ─── Narrative API (called by WaveOrchestrator / MainScene) ────

  onWaveStart(wave: number): void {
    this.storySystem.updateNarrativePhase(wave);
    const lines = this.storySystem.fireNarrativeTrigger("wave_start", wave);
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
    const taunt = this.storySystem.getRandomTaunt(wave);
    if (taunt && lines.length === 0) this.dialogueUI.enqueue([taunt]);
  }

  onWaveClear(wave: number): void {
    const lines = this.storySystem.fireNarrativeTrigger("wave_clear", wave);
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
    const enc = this.storySystem.getRandomEncouragement(wave);
    if (enc && lines.length === 0) this.dialogueUI.enqueue([enc]);
  }

  onBossSpawn(wave: number): void {
    const lines = this.storySystem.fireNarrativeTrigger("boss_spawn", wave);
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  onBossKill(wave: number): void {
    this.storySystem.flags.bossesDefeated++;
    const lines = this.storySystem.fireNarrativeTrigger("boss_kill", wave);
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  checkCorruptionWarning(): void {
    const lines = this.storySystem.fireCorruptionWarning();
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called when player switches world. newWorld = 'FOUNDRY' | 'CIRCUIT'. */
  onWorldSwitch(newWorld: string): void {
    this._worldSwitchCount++;
    const id = newWorld === 'CIRCUIT'
      ? 'world_switch_to_void_first'
      : 'world_switch_to_foundry_first';
    const lines = this.storySystem.fireManualBeat(id);
    if (lines.length > 0) {
      // Small delay so the switch flash clears before dialogue appears
      this.ctx.scene.time.delayedCall(600, () => {
        if (!this.ctx.gameOver) this.dialogueUI.enqueue(lines);
      });
    }
  }

  /** Called when reactor HP crosses 50% or 25% threshold. threshold = 0.5 | 0.25. */
  onReactorThreshold(threshold: number): void {
    const id = threshold <= 0.25
      ? (this.storySystem.flags.veraDiscovered ? 'reactor_damaged_25' : 'reactor_damaged_25_early')
      : 'reactor_damaged_50';
    const lines = this.storySystem.fireManualBeat(id);
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called when reactor is repaired above a threshold. */
  onReactorRepaired(): void {
    const lines = this.storySystem.fireManualBeat('reactor_repaired');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called by HUDManager or PlayerController when HP drops below 30%. */
  onPlayerLowHp(): void {
    if (this._lowHpFired) return;
    this._lowHpFired = true;
    const id = this.storySystem.flags.veraDiscovered ? 'player_low_hp' : 'player_low_hp_early';
    const lines = this.storySystem.fireManualBeat(id);
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Reset low HP flag when player recovers above 50%. */
  onPlayerHpRecovered(): void {
    this._lowHpFired = false;
  }

  /** Called when player drops below 15% HP. Has a 12s cooldown to avoid spam. */
  onPlayerNearDeath(): void {
    const now = performance.now();
    if (now < this._nearDeathCooldown) return;
    this._nearDeathCooldown = now + 12000;
    const lines = this.storySystem.fireManualBeat('player_near_death');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called once when guards first appear in a wave. */
  onFirstGuardSeen(): void {
    const lines = this.storySystem.fireManualBeat('first_guard_spotted');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called once when collectors first appear. */
  onFirstCollectorSeen(): void {
    const lines = this.storySystem.fireManualBeat('first_collector_spotted');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called once when sawblades first appear. */
  onFirstSawbladeSeen(): void {
    const lines = this.storySystem.fireManualBeat('first_sawblade_spotted');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called once when welders first appear. */
  onFirstWelderSeen(): void {
    const lines = this.storySystem.fireManualBeat('first_welder_spotted');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called once when turrets first appear. */
  onFirstTurretSeen(): void {
    const lines = this.storySystem.fireManualBeat('first_turret_spotted');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  /** Called when all waves are cleared and the player wins. */
  onVictory(): void {
    const lines = this.storySystem.fireManualBeat('victory_pre');
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  onBossHalfHp(): void {
    const lines = this.storySystem.fireBossHalfHp();
    if (lines.length > 0) this.dialogueUI.enqueue(lines);
  }

  getNarrativePhaseLabel(): string {
    const labels: Record<string, string> = {
      awakening: "AWAKENING",
      first_signal: "FIRST SIGNAL",
      contamination: "CONTAMINATION",
      ally_in_dark: "ALLY IN THE DARK",
      corruption_storm: "CORRUPTION STORM",
      counterstrike: "COUNTERSTRIKE",
      endgame: "ENDGAME",
      the_core: "THE CORE",
    };
    return labels[this.storySystem.narrativePhase] ?? "UNKNOWN";
  }

  reset(): void {
    this.currentRoomKey = "0,0";
    this._alertSlotActive = false;
    this._worldSwitchCount = 0;
    this._lowHpFired = false;
    this._nearDeathCooldown = 0;
    if (this.storyHint) {
      this.ctx.scene.tweens.killTweensOf(this.storyHint);
      this.storyHint.destroy();
      this.storyHint = null;
    }
    if (this.godModeText) {
      this.godModeText.destroy();
      this.godModeText = null;
    }
    this.dialogueUI.clear();
    for (const [, c] of this._logTerminals) c.destroy(true);
    this._logTerminals.clear();
  }

  // ─── Intro — quick cinematic, then straight to "free" gameplay ────

  private _beginIntroCinematic(): void {
    const scene = this.ctx.scene;
    this.storySystem.setPhase("intro");

    const overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setScrollFactor(0).setDepth(300);

    const lines = [
      "...",
      "systems rebooting...",
      "corruption detected in all sectors.",
      "survive.",
    ];
    const texts: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < lines.length; i++) {
      const t = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40 + i * 32, lines[i], {
        fontFamily: UI_FONT, fontSize: "16px",
        color: i === 0 ? "#444444" : i === 3 ? "#ff4444" : "#00ff88",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(301).setAlpha(0);
      texts.push(t);
    }

    let delay = 300;
    for (const t of texts) {
      scene.time.delayedCall(delay, () => scene.tweens.add({ targets: t, alpha: 1, duration: 500 }));
      delay += 800;
    }

    scene.time.delayedCall(delay + 1000, () => {
      scene.tweens.add({
        targets: [overlay, ...texts], alpha: 0, duration: 800,
        onComplete: () => {
          overlay.destroy();
          texts.forEach(t => t.destroy());
          this._startTutorialInHub();
        },
      });
    });
  }

  private _enterFreePhase(): void {
    this.storySystem.setPhase("free");
    this.storySystem.flags.powerRestored = true;
    this._showStoryHint("Wave 1 cleared. Cmd Center unlocked. Visit the Armory or press B for upgrades.", 6500);
    this.ctx.scene.time.delayedCall(2000, () => {
      const lines = this.storySystem.fireGreeting();
      if (lines.length > 0) this.dialogueUI.enqueue(lines);
    });
  }

  /** Start a tutorial wave right in the HUB after intro cinematic. */
  private _startTutorialInHub(): void {
    this.storySystem.setPhase("tutorial");
    this._showStoryHint("Tutorial: WASD or arrows move. Mouse aims. Click or Space shoots.", 5600);
    this.ctx.scene.time.delayedCall(1500, () => {
      this.onTryTriggerWave();
    });

    // World-split intro — fires at 4s so it lands before enemies get dangerous.
    // Teaches the two-world split before the player needs to act on it.
    this.ctx.scene.time.delayedCall(4000, () => {
      if (this.ctx.gameOver) return;
      this._showStoryHint(
        "TWO WORLDS OVERLAP HERE.\n" +
        "MACHINE CORE (amber) — enemies hunt you.\n" +
        "VOID SECTOR (cyan) — enemies hunt the REACTOR.\n" +
        "Press Q to phase-shift between worlds!",
        8000,
      );
    });

    // Reactor defense pointer — fires after the world intro hint clears
    this.ctx.scene.time.delayedCall(13000, () => {
      if (this.ctx.gameOver || this.ctx.waveManager.currentWave > 1) return;
      this.showStoryHint(
        "REACTOR CORE is in the top-right room. VOID SECTOR enemies will attack it!\n" +
        "Press Q to enter VOID SECTOR and eliminate them before they reach the reactor.",
        7600,
        "high",
      );
      this._showReactorArrow();
    });

    // Shop hint — fires well after combat starts
    this.ctx.scene.time.delayedCall(28000, () => {
      if (this.ctx.gameOver || this.ctx.waveManager.currentWave > 1) return;
      this._showStoryHint("Collect scrap ★ from enemies. Visit the Armory or press B for upgrades.", 6500);
    });
  }

  /** Flashing arrow indicator pointing up toward the reactor. */
  private _showReactorArrow(): void {
    const scene = this.ctx.scene;
    // Uses the alert slot so any active storyHint is pushed below it.
    this._alertSlotActive = true;
    const startY = NOTIF_ALERT_Y;
    const arrow = scene.add.text(GAME_WIDTH / 2, startY, "▲  REACTOR CORE\n     Defend it!", {
      fontFamily: UI_FONT, fontSize: "18px",
      color: "#ff4444", backgroundColor: "#000000ee",
      padding: { x: 14, y: 8 }, align: "center",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(115).setAlpha(0);
    scene.tweens.add({ targets: arrow, alpha: 1, duration: 300 });
    scene.tweens.add({
      targets: arrow, y: { from: startY, to: startY + 6 },
      duration: 500, yoyo: true, repeat: 7, ease: "Sine.easeInOut",
      onComplete: () => scene.tweens.add({
        targets: arrow, alpha: 0, duration: 600,
        onComplete: () => { arrow.destroy(); this._alertSlotActive = false; },
      }),
    });
  }

  private _restorePower(): void {
    // Now a no-op since we skip straight to free. Kept for API compatibility.
    if (this.storySystem.phase !== "free") {
      this._enterFreePhase();
    }
  }

  private _showStoryHint(msg: string, duration = 4500): void {
    const scene = this.ctx.scene;
    // Kill previous hint before placing new one
    if (this.storyHint) {
      scene.tweens.killTweensOf(this.storyHint);
      this.storyHint.destroy();
      this.storyHint = null;
    }
    // Choose Y based on whether the alert slot (reactor arrow / god mode) is occupied.
    // This prevents the hint from rendering directly on top of the alert banner.
    const slotY = this._alertSlotActive ? NOTIF_HINT_PUSHED : NOTIF_HINT_Y_BASE;
    this.storyHint = scene.add.text(GAME_WIDTH / 2, slotY, msg, {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#ffe28a",
      backgroundColor: "#0a0d12dd",
      padding: { x: 14, y: 9 },
      stroke: "#000000",
      strokeThickness: 2,
      align: "center",
      lineSpacing: 4,
      wordWrap: { width: 700, useAdvancedWrap: true },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(112).setAlpha(0);
    constrainTextBlock(this.storyHint, 760, 3, 10);
    const tx = this.storyHint;
    tx.setShadow(0, 0, "#ffaa33", 8, true, true);
    scene.tweens.add({ targets: tx, alpha: 1, duration: 260, ease: "Sine.easeOut" });
    const pulse = scene.tweens.add({
      targets: tx, scale: { from: 1, to: 1.025 },
      duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
    scene.time.delayedCall(duration, () => {
      if (this.storyHint === tx) {
        pulse.stop();
        scene.tweens.add({ targets: tx, alpha: 0, duration: 500, onComplete: () => tx.destroy() });
        this.storyHint = null;
      }
    });
  }

  private _updateStory(): void {
    const px = this.ctx.playerSprite.x, py = this.ctx.playerSprite.y;
    const col = Math.floor(px / CELL_W), row = Math.floor(py / CELL_H);
    const newRoomKey = `${col},${row}`;
    if (newRoomKey !== this.currentRoomKey) { this.currentRoomKey = newRoomKey; this._onRoomEntered(col, row); }
  }

  private _onRoomEntered(col: number, row: number): void {
    const theme = this.ctx.mapObstacles.getRoomThemeAtCell?.(col, row);
    // First-time biome tutorial — explains the MACHINES theme physics for the
    // room you just walked into so the player understands how the world bends.
    if (theme && !this._themesTaught.has(theme)) {
      this._themesTaught.add(theme);
      const hint = StoryController._THEME_TUTORIAL[theme];
      if (hint) this._showStoryHint(hint, 6500);
    }
    if (this.storySystem.phase === "free") {
      if (theme) {
        const narrativeLines = this.storySystem.fireNarrativeTrigger("room_enter", theme);
        if (narrativeLines.length > 0) this.dialogueUI.enqueue(narrativeLines);
        const logLines = this.storySystem.discoverLog(theme);
        if (logLines.length > 0) this.dialogueUI.enqueue(logLines);
      }
      // Auto-trigger wave when entering a combat room
      this.onTryTriggerWave();
    }
  }

  // ─── First-visit theme tutorials (MACHINES theme) ────────────────────
  // Each entry teaches the room's industrial physics quirk + tactical benefit.
  private static readonly _THEME_TUTORIAL: Record<string, string> = {
    hub:         "Hub: safe staging bay. Regroup here.",
    power:       "Reactor Core: press X on the core to purge corruption.",
    armory:      "Armory: press B to spend scrap on upgrades.",
    control:     "Cmd Center: golden floor boosts bullet speed.",
    factory:     "Bio Lab: conveyors push sideways. Strafe with the flow.",
    server:      "Data Lab: more visibility, slower movement and bullets.",
    maintenance: "Supply Depot: repair props with G for combo and score.",
    quarantine:  "Quarantine: toxic floor drains HP. Move fast.",
    vault:       "Vault: low friction. Lead shots and expect drift.",
  };

  private _showGodModeIndicator(godMode: boolean): void {
    const scene = this.ctx.scene;
    if (this.godModeText) {
      scene.tweens.killTweensOf(this.godModeText);
      this.godModeText.destroy();
      this.godModeText = null;
    }
    this._alertSlotActive = true;
    this.godModeText = scene.add.text(GAME_WIDTH / 2, NOTIF_ALERT_Y, godMode ? "★ GOD MODE: ON ★" : "GOD MODE: OFF", {
      fontFamily: UI_FONT, fontSize: "14px",
      color: godMode ? "#ffff44" : "#888888",
      backgroundColor: "#000000aa", padding: { x: 10, y: 6 },
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(115);
    scene.time.delayedCall(2000, () => {
      this.godModeText?.destroy();
      this.godModeText = null;
      this._alertSlotActive = false;
    });
  }

  private _showAiLearningNotice(): void {
    const scene = this.ctx.scene;
    if (this.ctx.gameOver) return;
    // Delay if hint slot is occupied to prevent overlap.
    if (this.storyHint) {
      scene.time.delayedCall(3200, () => this._showAiLearningNotice());
      return;
    }
    const slotY = this._alertSlotActive ? NOTIF_HINT_PUSHED : NOTIF_HINT_Y_BASE;
    const notice = scene.add.text(GAME_WIDTH / 2, slotY, "⚡ ADAPTIVE CORE — LEARNING YOUR PATTERNS", {
      fontFamily: UI_FONT, fontSize: "13px", color: "#ff6600",
      backgroundColor: "#0a0500cc", padding: { x: 10, y: 6 },
      stroke: "#440000", strokeThickness: 1,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(108).setAlpha(0);
    scene.tweens.add({ targets: notice, alpha: 1, duration: 400 });
    scene.time.delayedCall(3000, () => scene.tweens.add({ targets: notice, alpha: 0, duration: 600, onComplete: () => notice.destroy() }));
  }
}
