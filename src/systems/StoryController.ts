import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, CELL_W, CELL_H } from "../core";
import type { StorySystem } from "../core";
import type { GameContext } from "./GameContext";
import { DialogueUI } from "../rendering";

export class StoryController {
  private ctx: GameContext;
  private storySystem: StorySystem;
  private interactKey: Phaser.Input.Keyboard.Key;
  private onTryTriggerWave: () => void;

  currentRoomKey = "0,0";
  private storyHint: Phaser.GameObjects.Text | null = null;
  private godModeText: Phaser.GameObjects.Text | null = null;
  // Tracks which room themes the player has seen so the contextual physics
  // tutorial only fires the first time you set foot in a given biome.
  private _themesTaught = new Set<string>();

  // Narrative system
  private dialogueUI: DialogueUI;
  private _logTerminals: Map<string, Phaser.GameObjects.Container> = new Map();
  private _logPromptVisible = false;
  private _nearbyLogId: string | null = null;

  constructor(
    ctx: GameContext,
    storySystem: StorySystem,
    interactKey: Phaser.Input.Keyboard.Key,
    onTryTriggerWave: () => void,
  ) {
    this.ctx = ctx;
    this.storySystem = storySystem;
    this.interactKey = interactKey;
    this.onTryTriggerWave = onTryTriggerWave;
    this.dialogueUI = new DialogueUI(ctx.scene);
  }

  showLoreIntro(): void { this._beginIntroCinematic(); }
  showStoryHint(msg: string, duration = 4500): void { this._showStoryHint(msg, duration); }
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
        fontFamily: "monospace", fontSize: "16px",
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
    this._showStoryHint("◉ Wave 1 CLEARED!  •  CMD CENTER unlocked ↙  •  ARMORY ↗ has the SHOP [B]  •  Explore to unlock more rooms", 7000);
    this.ctx.scene.time.delayedCall(2000, () => {
      const lines = this.storySystem.fireGreeting();
      if (lines.length > 0) this.dialogueUI.enqueue(lines);
    });
  }

  /** Start a tutorial wave right in the HUB after intro cinematic. */
  private _startTutorialInHub(): void {
    this.storySystem.setPhase("tutorial");
    this._showStoryHint("◉ TUTORIAL  •  WASD move  •  Mouse aim  •  Click / SPACE to shoot", 6000);
    this.ctx.scene.time.delayedCall(1500, () => {
      this.onTryTriggerWave();
    });

    // Reactor defense warning — most critical mechanic
    this.ctx.scene.time.delayedCall(13000, () => {
      if (this.ctx.gameOver || this.ctx.waveManager.currentWave > 1) return;
      this._showStoryHint("⚡ REACTOR CORE — room ABOVE! CIRCUIT enemies (purple/yellow) try to DESTROY it  •  Press Q to switch worlds & defend!", 8000);
      this._showReactorArrow();
    });

    // Shop hint
    this.ctx.scene.time.delayedCall(25000, () => {
      if (this.ctx.gameOver || this.ctx.waveManager.currentWave > 1) return;
      this._showStoryHint("◉ Collect SCRAP ★ from enemies  •  Visit ARMORY [top-right ↗]  •  Press [B] to open the SHOP for upgrades", 7000);
    });
  }

  /** Flashing arrow indicator pointing up toward the reactor. */
  private _showReactorArrow(): void {
    const scene = this.ctx.scene;
    const arrow = scene.add.text(GAME_WIDTH / 2, 118, "▲  REACTOR CORE\n     Defend it!", {
      fontFamily: "monospace", fontSize: "18px",
      color: "#ff4444", backgroundColor: "#000000ee",
      padding: { x: 14, y: 8 }, align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(115).setAlpha(0);
    scene.tweens.add({ targets: arrow, alpha: 1, duration: 300 });
    scene.tweens.add({
      targets: arrow, y: { from: 118, to: 110 },
      duration: 500, yoyo: true, repeat: 7, ease: "Sine.easeInOut",
      onComplete: () => scene.tweens.add({
        targets: arrow, alpha: 0, duration: 600,
        onComplete: () => arrow.destroy(),
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
    if (this.storyHint) this.storyHint.destroy();
    // Premium machine-HUD chip: amber border, dark slab, subtle pulse.
    this.storyHint = scene.add.text(GAME_WIDTH / 2, 56, msg, {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffe28a",
      backgroundColor: "#0a0d12dd",
      padding: { x: 14, y: 8 },
      stroke: "#000000",
      strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(112).setAlpha(0);
    // Glow underline so it reads at a glance even mid-fight
    const tx = this.storyHint;
    tx.setShadow(0, 0, "#ffaa33", 8, true, true);
    scene.tweens.add({ targets: tx, alpha: 1, duration: 260, ease: "Sine.easeOut" });
    // Subtle living pulse on the text colour
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
      this._showStoryHint("◉ entered " + this._roomDisplayName(col, row) + "  •  act to engage", 2500);
      if (theme) {
        const lines = this.storySystem.fireNarrativeTrigger("room_enter", theme);
        if (lines.length > 0) this.dialogueUI.enqueue(lines);
      }
      // Auto-trigger wave when entering a combat room
      this.onTryTriggerWave();
    }
  }

  // ─── First-visit theme tutorials (MACHINES theme) ────────────────────
  // Each entry teaches the room's industrial physics quirk + tactical benefit.
  private static readonly _THEME_TUTORIAL: Record<string, string> = {
    hub:         "◉ HUB  —  safe staging bay. No enemies spawn here. Use it to regroup.",
    power:       "◉ REACTOR CORE  —  press [X] on the core to PURGE corruption. +scrap, heals nearby drones to your side.",
    armory:      "◉ ARMORY  —  weapon vendor. Press [B] to spend scrap on damage / fire-rate / projectile speed.",
    control:     "◉ CMD CENTER  —  golden floor amplifies your bullet speed. Light cover, great for kiting turrets.",
    factory:     "◉ BIO LAB  —  conveyor belts shove you SIDEWAYS. Strafe with the flow, never against it.",
    server:      "◉ DATA LAB  —  servers grant +visibility. Slow walking, slow bullets — pick targets carefully.",
    maintenance: "◉ SUPPLY DEPOT  —  scrap heaps everywhere. Repair props with [G] for combo + score.",
    quarantine:  "◉ QUARANTINE  —  toxic floor drains HP per second. Get in, kill fast, get out.",
    vault:       "◉ THE VAULT  —  zero friction floor — you slide. Lead your shots, expect to drift.",
  };

  private _roomDisplayName(col: number, row: number): string {
    const theme = this.ctx.mapObstacles.getRoomThemeAtCell?.(col, row);
    const names: Record<string, string> = {
      hub: "CENTRAL HUB", factory: "BIO LAB", server: "DATA LAB",
      power: "REACTOR CORE", control: "CMD CENTER", maintenance: "SUPPLY DEPOT",
      quarantine: "QUARANTINE ZONE", armory: "ARMORY", vault: "THE VAULT",
    };
    return names[theme ?? ""] ?? "UNKNOWN SECTOR";
  }

  private _showGodModeIndicator(godMode: boolean): void {
    const scene = this.ctx.scene;
    if (this.godModeText) { this.godModeText.destroy(); this.godModeText = null; }
    this.godModeText = scene.add.text(GAME_WIDTH / 2, 110, godMode ? "★ GOD MODE: ON ★" : "GOD MODE: OFF", {
      fontFamily: "monospace", fontSize: "14px",
      color: godMode ? "#ffff44" : "#888888",
      backgroundColor: "#000000aa", padding: { x: 10, y: 6 },
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(115);
    scene.time.delayedCall(2000, () => { this.godModeText?.destroy(); this.godModeText = null; });
  }

  private _showAiLearningNotice(): void {
    const scene = this.ctx.scene;
    if (this.ctx.gameOver) return;
    const notice = scene.add.text(GAME_WIDTH / 2, 72, "⚡ ADAPTIVE CORE — LEARNING YOUR PATTERNS", {
      fontFamily: "monospace", fontSize: "13px", color: "#ff6600",
      backgroundColor: "#0a0500cc", padding: { x: 10, y: 6 },
      stroke: "#440000", strokeThickness: 1,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(108).setAlpha(0);
    scene.tweens.add({ targets: notice, alpha: 1, duration: 400 });
    scene.time.delayedCall(3000, () => scene.tweens.add({ targets: notice, alpha: 0, duration: 600, onComplete: () => notice.destroy() }));
  }
}
