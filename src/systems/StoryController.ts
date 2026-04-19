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
          this._enterFreePhase();
        },
      });
    });
  }

  private _enterFreePhase(): void {
    this.storySystem.setPhase("free");
    this.storySystem.flags.powerRestored = true;
    this._showStoryHint("◉ explore rooms — shoot or move to trigger waves  •  [B] shop", 5500);
    // Fire the ARIA greeting narrative
    this.ctx.scene.time.delayedCall(2000, () => {
      const lines = this.storySystem.fireGreeting();
      if (lines.length > 0) this.dialogueUI.enqueue(lines);
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
    this.storyHint = scene.add.text(GAME_WIDTH / 2, 56, msg, {
      fontFamily: "monospace", fontSize: "13px", color: "#ffffaa",
      backgroundColor: "#00000099", padding: { x: 10, y: 6 },
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(112).setAlpha(0);
    scene.tweens.add({ targets: this.storyHint, alpha: 1, duration: 400 });
    scene.time.delayedCall(duration, () => {
      if (this.storyHint) {
        const t = this.storyHint;
        scene.tweens.add({ targets: t, alpha: 0, duration: 500, onComplete: () => t.destroy() });
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
    if (this.storySystem.phase === "free") {
      this._showStoryHint("◉ entered " + this._roomDisplayName(col, row) + "  •  act to engage", 2500);
      const theme = this.ctx.mapObstacles.getRoomThemeAtCell?.(col, row);
      if (theme) {
        const lines = this.storySystem.fireNarrativeTrigger("room_enter", theme);
        if (lines.length > 0) this.dialogueUI.enqueue(lines);
      }
    }
  }

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
