import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WorldType } from "../core";
import type { AnyAgent, GameContext } from "./GameContext";
import type { GuardAgent } from "../agents/GuardAgent";
import type { CollectorAgent } from "../agents/CollectorAgent";
import { EnemyAgent } from "../agents/EnemyAgent";
import { SawbladeAgent } from "../agents/SawbladeAgent";
import { TurretAgent } from "../agents/TurretAgent";
import { AudioManager } from "../audio";
import type { MissionUI } from "../rendering";

/**
 * HUDManager — owns all HUD graphics/text objects and their update logic.
 * Call build() once in scene create(), then update() each frame.
 */
export class HUDManager {
  private ctx: GameContext;
  private missionUI: MissionUI;
  private onOpenShop: () => void;

  // HP / Heat bars
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private heatBar!: Phaser.GameObjects.Rectangle;
  private heatBarBg!: Phaser.GameObjects.Rectangle;
  private heatLabel!: Phaser.GameObjects.Text;

  // HUD text elements
  private hudText!: Phaser.GameObjects.Text;
  private _waveText!: Phaser.GameObjects.Text;
  private worldSwitchArc!: Phaser.GameObjects.Graphics;
  private _waveIndicator!: Phaser.GameObjects.Text;
  private _narrativeLabel!: Phaser.GameObjects.Text;
  private worldLabel!: Phaser.GameObjects.Text;

  // Enemy HP bars layer
  private enemyHpGfx!: Phaser.GameObjects.Graphics;

  // Corruption / overlay / ability HUD
  private corruptionText!: Phaser.GameObjects.Text;
  private lowHpOverlay!: Phaser.GameObjects.Graphics;
  private abilityHudGfx!: Phaser.GameObjects.Graphics;
  private abilityHudTexts: Phaser.GameObjects.Text[] = [];

  // Breach ring VFX
  private breachGfx!: Phaser.GameObjects.Graphics;

  // Boss HP bar (null when no boss)
  private bossHpBar: Phaser.GameObjects.Rectangle | null = null;
  private bossHpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private bossNameText: Phaser.GameObjects.Text | null = null;
  // Smoothed "ghost" chip behind the live bar — shows damage taken in last beat
  private bossHpGhost: Phaser.GameObjects.Rectangle | null = null;
  private bossHpPhaseTicks: Phaser.GameObjects.Graphics | null = null;
  private _bossLastPct = 1;

  // Reactor HP bar (always visible)
  private reactorHpBar: Phaser.GameObjects.Rectangle | null = null;
  private reactorHpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private reactorHpGhost: Phaser.GameObjects.Rectangle | null = null;
  private reactorHpLabel: Phaser.GameObjects.Text | null = null;
  private _reactorLastPct = 1;
  private _reactorFlashTimer = 0;

  // Rate-limit state
  private _hpBarFrameSkip = 0;
  private _lowHpSoundTime = 0;

  constructor(ctx: GameContext, missionUI: MissionUI, onOpenShop: () => void) {
    this.ctx = ctx;
    this.missionUI = missionUI;
    this.onOpenShop = onOpenShop;
  }

  get waveTextRef(): Phaser.GameObjects.Text {
    return this._waveText;
  }

  setNarrativePhase(label: string): void {
    if (this._narrativeLabel) this._narrativeLabel.setText(label);
  }

  build(): void {
    const scene = this.ctx.scene;
    const pal = this.ctx.worldManager.palette;

    // ── PLAYER HP / HEAT panel (bottom-left) ──────────────────────────────────
    // Styled backing panel — fixed size to frame the HP+heat bars cleanly
    scene.add.rectangle(6, GAME_HEIGHT - 56, 268, 58, 0x050510, 0.92)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(99);
    scene.add.rectangle(6, GAME_HEIGHT - 56, 268, 58, 0x000000, 0)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(99)
      .setStrokeStyle(1, 0x00ff8844, 1);
    // Left accent bar
    scene.add.rectangle(6, GAME_HEIGHT - 56, 3, 50, 0x00ff88, 0.6)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);

    // HP bar — 248px wide, 18px tall
    const hpBarW = 248;
    this.hpBarBg = scene.add
      .rectangle(14, GAME_HEIGHT - 42, hpBarW, 18, 0x110808)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.hpBar = scene.add
      .rectangle(14, GAME_HEIGHT - 42, hpBarW, 18, 0x00ff44)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
    scene.add.text(16, GAME_HEIGHT - 42, "HP", {
      fontFamily: "monospace", fontSize: "10px", color: "#001a08", fontStyle: "bold",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(102);

    // Heat bar — 248px wide, 10px tall
    this.heatBarBg = scene.add
      .rectangle(14, GAME_HEIGHT - 18, hpBarW, 10, 0x110500)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.heatBar = scene.add
      .rectangle(14, GAME_HEIGHT - 18, 0, 10, 0xff4400)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
    this.heatLabel = scene.add.text(14 + hpBarW + 5, GAME_HEIGHT - 18, "HEAT", {
      fontFamily: "monospace", fontSize: "9px", color: "#ff6600",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

    // ── TOP-LEFT info block ────────────────────────────────────────────────────
    // Left accent bar (visual anchor for the HUD block)
    scene.add.rectangle(4, 4, 4, 56, 0x00ff88, 0.55)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.hudText = scene.add.text(14, 6, "", {
      fontSize: "12px", color: "#00ff88",
      fontFamily: "monospace",
      backgroundColor: "#05050e",
      padding: { x: 10, y: 7 },
    }).setScrollFactor(0).setDepth(100);

    // ── Wave announce (centre screen) ─────────────────────────────────────────
    this._waveText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, "", {
      fontFamily: "monospace", fontSize: "42px",
      color: "#00ff88", fontStyle: "bold",
      stroke: "#001a08", strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(110).setAlpha(0);

    // ── World switch cooldown arc ──────────────────────────────────────────────
    this.worldSwitchArc = scene.add.graphics().setScrollFactor(0).setDepth(106);

    // ── Wave indicator (top-centre) ───────────────────────────────────────────
    scene.add.rectangle(GAME_WIDTH / 2, 22, 200, 32, 0x000000, 0.78)
      .setOrigin(0.5).setScrollFactor(0).setDepth(104)
      .setStrokeStyle(1, 0x00ff8855, 1);
    this._waveIndicator = scene.add.text(GAME_WIDTH / 2, 22, "WAVE 1", {
      fontFamily: "monospace", fontSize: "14px", color: "#00ff88",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(105);

    this._narrativeLabel = scene.add.text(GAME_WIDTH / 2, 42, "", {
      fontFamily: "monospace", fontSize: "9px", color: "#88aacc",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(105).setAlpha(0.7);

    // ── Watermark ────────────────────────────────────────────────────────────
    scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 2, "SCRAP ARENA: THE FRACTURE", {
      fontFamily: "monospace", fontSize: "9px", color: "#ffffff18",
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(99);

    // ── Shop button ───────────────────────────────────────────────────────────
    const shopBtn = scene.add.text(GAME_WIDTH - 12, 8, "[B] SHOP", {
      fontFamily: "monospace", fontSize: "13px", color: "#ffcc00",
      backgroundColor: "#00000099", padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(105).setInteractive({ useHandCursor: true });
    shopBtn.on("pointerover", () => shopBtn.setColor("#ffffff"));
    shopBtn.on("pointerout", () => shopBtn.setColor("#ffcc00"));
    shopBtn.on("pointerdown", () => this.onOpenShop());

    this.enemyHpGfx = scene.add.graphics().setDepth(55);

    this.corruptionText = scene.add.text(GAME_WIDTH - 218, 112, "", {
      fontFamily: "monospace", fontSize: "11px", color: "#ff4444",
    }).setScrollFactor(0).setDepth(200);

    this.lowHpOverlay = scene.add.graphics().setScrollFactor(0).setDepth(150);

    // ── Ability hotkey strip (bottom-left above HP bar) ───────────────────────
    this.abilityHudGfx = scene.add.graphics().setScrollFactor(0).setDepth(101);
    const abilityDefs = [
      { key: "E", label: "NOVA",   color: 0x00ffff },
      { key: "R", label: "SURGE",  color: 0xcc44ff },
      { key: "F", label: "SHIELD", color: 0x44ff88 },
      { key: "C", label: "CHRONO", color: 0x44ccff },
    ];
    this.abilityHudTexts = [];
    for (let i = 0; i < 4; i++) {
      const tx = 12 + i * 66;
      const ty = GAME_HEIGHT - 68;
      const t = scene.add.text(tx, ty, `[${abilityDefs[i].key}] ${abilityDefs[i].label}`, {
        fontFamily: "monospace", fontSize: "10px",
        color: `#${abilityDefs[i].color.toString(16).padStart(6, "0")}`,
      }).setScrollFactor(0).setDepth(102);
      this.abilityHudTexts.push(t);
    }

    // ── World label (top-right, below shop button) ────────────────────────────
    scene.add.rectangle(GAME_WIDTH - 12, 36, 160, 28, 0x000000, 0.80)
      .setOrigin(1, 0.5).setScrollFactor(0).setDepth(104)
      .setStrokeStyle(1, 0xff884455, 1);
    this.worldLabel = scene.add.text(GAME_WIDTH - 88, 36, `[Q] ${pal.label}`, {
      fontFamily: "monospace", fontSize: "13px",
      color: "#ff8844", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(105);

    // Breach ring VFX layer
    this.breachGfx = scene.add.graphics().setDepth(56).setBlendMode(Phaser.BlendModes.ADD);

    // ── REACTOR HP BAR — prominent right-side panel ───────────────────────────
    const rBarX = GAME_WIDTH - 218;
    const rBarY = 74;
    const rBarW = 206;
    scene.add.rectangle(GAME_WIDTH - 8, rBarY, rBarW + 16, 48, 0x000000, 0.85)
      .setOrigin(1, 0.5).setScrollFactor(0).setDepth(99)
      .setStrokeStyle(2, 0x00ff8844, 1);
    this.reactorHpLabel = scene.add.text(rBarX, rBarY - 14, "⚡ REACTOR CORE", {
      fontFamily: "monospace", fontSize: "11px", color: "#00ff88", fontStyle: "bold",
    }).setScrollFactor(0).setDepth(102);
    this.reactorHpBarBg = scene.add.rectangle(rBarX, rBarY + 4, rBarW, 16, 0x001a00)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.reactorHpGhost = scene.add.rectangle(rBarX, rBarY + 4, rBarW, 16, 0x886622, 0.7)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.reactorHpBar = scene.add.rectangle(rBarX, rBarY + 4, rBarW, 16, 0x00ff88)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
    scene.add.text(rBarX + rBarW + 4, rBarY + 4, "HP", {
      fontFamily: "monospace", fontSize: "9px", color: "#00ff4466",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

    // Patch reactorHpBarBg width to match rBarW
    this.reactorHpBarBg.width = rBarW;
    this.reactorHpGhost!.width = rBarW;
    this.reactorHpBar!.width = rBarW;

    this._showTutorialHint();
  }

  update(playerHeat: number, heatOverheatTimer: number): void {
    const ctx = this.ctx;
    const scene = ctx.scene;

    const hpRatio = ctx.playerHp / ctx.playerStats.maxHp;
    this.hpBar.width = 248 * hpRatio;
    this.hpBar.setFillStyle(hpRatio > 0.5 ? 0x00ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff2200);

    const heatRatio = playerHeat / 100;
    this.heatBar.width = 248 * heatRatio;
    const isOverheated = heatOverheatTimer > 0;
    this.heatBar.setFillStyle(
      isOverheated ? 0xff0000 :
      heatRatio > 0.8 ? 0xff2200 :
      heatRatio > 0.5 ? 0xff6600 : 0xff4400,
    );
    if (isOverheated) {
      this.heatBar.alpha = Math.sin(performance.now() * 0.015) * 0.5 + 0.5;
      const remaining = (heatOverheatTimer / 1000).toFixed(1);
      this.heatLabel.setText(`OVERHEAT ${remaining}s`).setColor("#ff0000");
    } else {
      this.heatBar.alpha = 1;
      this.heatLabel.setText("HEAT").setColor(heatRatio > 0.7 ? "#ff4400" : "#ff6600");
    }

    const w = ctx.worldManager.currentWorld;
    const switchReady = ctx.worldManager.canSwitch;
    const switchCd = (ctx.worldManager.cooldownRemaining / 1000).toFixed(1);
    const instab = ctx.worldManager.instability;

    const comboStr = ctx.comboSystem.combo > 0
      ? `  ⚡${ctx.comboSystem.combo}x${ctx.comboSystem.multiplier.toFixed(1)}`
      : "";

    const instabStr = instab > 0.5
      ? (ctx.worldManager.isUnstable ? "  ⚠ UNSTABLE! SWITCH NOW!" : `  ⚠ Instability: ${Math.floor(instab * 100)}%`)
      : "";

    this.hudText.setText(
      `SCORE ${ctx.comboSystem.score}` +
      `  W${ctx.waveManager.currentWave}` +
      `  K${ctx.killCount}` +
      `  ⬡${ctx.upgradeSystem.scrap}` +
      comboStr +
      `\n[Q] ${switchReady ? "▶ SWITCH" : switchCd + "s"}` +
      `  ◈${this._countActiveEnemies()}` +
      `  ◇${this._countGhostEnemies()}` +
      instabStr,
    );

    if (ctx.worldManager.isUnstable) {
      this.hudText.setColor(Math.random() > 0.5 ? "#ff2200" : "#ff6600");
    } else if (instab > 0.5) {
      this.hudText.setColor("#ffaa00");
    } else {
      this.hudText.setColor("#00ff88");
    }

    const pal = ctx.worldManager.palette;
    this.worldLabel.setText(`[Q] ${pal.label}`);
    this.worldLabel.setColor(w === WorldType.FOUNDRY ? "#ff8844" : "#44ccff");

    // World-switch cooldown arc — drawn inside the world-label panel
    this.worldSwitchArc.clear();
    if (!switchReady) {
      const ratio = 1 - (ctx.worldManager.cooldownRemaining / 4000);
      const acx = GAME_WIDTH - 18;
      const acy = 36;
      const r = 10;
      const arcColor = w === WorldType.FOUNDRY ? 0xff8844 : 0x44ccff;
      this.worldSwitchArc.lineStyle(2, 0x333333, 0.7);
      this.worldSwitchArc.strokeCircle(acx, acy, r);
      this.worldSwitchArc.lineStyle(3, arcColor, 1);
      this.worldSwitchArc.beginPath();
      this.worldSwitchArc.arc(acx, acy, r, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
      this.worldSwitchArc.strokePath();
    } else {
      // Show a small "READY" glow dot
      const acx = GAME_WIDTH - 18;
      const acy = 36;
      const arcColor = w === WorldType.FOUNDRY ? 0xff8844 : 0x44ccff;
      this.worldSwitchArc.fillStyle(arcColor, 0.9);
      this.worldSwitchArc.fillCircle(acx, acy, 5);
    }

    this.lowHpOverlay.clear();
    const hpRatioNow = ctx.playerHp / ctx.playerStats.maxHp;
    if (hpRatioNow < 0.25 && !ctx.gameOver) {
      const pulse = 0.15 + 0.15 * Math.sin(performance.now() * 0.008);
      this.lowHpOverlay.fillStyle(0xff0000, pulse);
      this.lowHpOverlay.fillRect(0, 0, GAME_WIDTH, 10);
      this.lowHpOverlay.fillRect(0, GAME_HEIGHT - 10, GAME_WIDTH, 10);
      this.lowHpOverlay.fillRect(0, 0, 10, GAME_HEIGHT);
      this.lowHpOverlay.fillRect(GAME_WIDTH - 10, 0, 10, GAME_HEIGHT);
      if (scene.time.now - this._lowHpSoundTime > 1500) {
        AudioManager.instance.lowHpPulse();
        this._lowHpSoundTime = scene.time.now;
      }
    }

    if (this.abilityHudGfx) {
      this.abilityHudGfx.clear();
      const ids = ["nova_burst", "phase_surge", "scrap_shield", "chrono_pulse"] as const;
      const labels = ["[E] NOVA", "[R] SURGE", "[F] SHIELD", "[C] CHRONO"];
      const cooldowns = [8000, 6000, 12000, 16000];
      const colors = [0x00ffff, 0xcc44ff, 0x44ff88, 0x44ccff];
      for (let i = 0; i < 4; i++) {
        const tx = 12 + i * 66;
        const ty = GAME_HEIGHT - 57;
        const ready = ctx.abilitySystem.canUse(ids[i]);
        const ratio = 1 - ctx.abilitySystem.getCooldownRatio(ids[i]);
        // Cooldown bar background
        this.abilityHudGfx.fillStyle(0x0a0a0a, 0.85);
        this.abilityHudGfx.fillRect(tx, ty, 62, 7);
        // Fill
        this.abilityHudGfx.fillStyle(ready ? colors[i] : 0x444444, ready ? 1 : 0.5);
        this.abilityHudGfx.fillRect(tx, ty, 62 * ratio, 7);
        // Ready pulse glow
        if (ready) {
          this.abilityHudGfx.lineStyle(1, colors[i], 0.6 + 0.4 * Math.sin(performance.now() * 0.006));
          this.abilityHudGfx.strokeRect(tx, ty, 62, 7);
        }
        if (this.abilityHudTexts[i]) {
          const remaining = ((1 - ratio) * cooldowns[i] / 1000).toFixed(1);
          this.abilityHudTexts[i].setText(ready ? labels[i] : `${labels[i].slice(0, 3)} ${remaining}s`);
          this.abilityHudTexts[i].setAlpha(ready ? 1 : 0.6);
        }
      }
    }

    if (this._waveIndicator) {
      const wn = ctx.waveManager.currentWave;
      if (wn === 0) {
        this._waveIndicator.setText("INITIALIZING…");
        this._waveIndicator.setColor("#88aacc");
      } else {
        const isBoss = wn % 5 === 0;
        this._waveIndicator.setText(isBoss ? `⚠ WAVE ${wn} — BOSS` : `WAVE ${wn}`);
        this._waveIndicator.setColor(isBoss ? "#ff2200" : "#00ff88");
      }
    }

    this._hpBarFrameSkip = (this._hpBarFrameSkip + 1) % 3;
    if (this._hpBarFrameSkip === 0) {
      this.enemyHpGfx.clear();
      for (const agent of ctx.allAgents) {
        if (agent.isDead || !agent.sprite || !this._isAgentInCurrentWorld(agent)) continue;
        if (agent.hp >= agent.maxHp) continue;
        const ratio = Math.max(0, agent.hp / agent.maxHp);
        const bw = 24;
        const bh = 3;
        const bx = agent.posX - bw / 2;
        const by = agent.posY - 24;
        this.enemyHpGfx.fillStyle(0x220000, 0.9);
        this.enemyHpGfx.fillRect(bx, by, bw, bh);
        const barColor = ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2200;
        this.enemyHpGfx.fillStyle(barColor, 1);
        this.enemyHpGfx.fillRect(bx, by, bw * ratio, bh);
      }
    }

    const completed = ctx.missionSystem.getCompletedMissions();
    for (const m of completed) {
      this.missionUI.showCompletion(m);
      ctx.upgradeSystem.addScrap(m.reward.scrap);
      ctx.comboSystem.score += m.reward.scoreBonus;
    }
    ctx.missionSystem.clearCompleted();
    this.missionUI.update(ctx.missionSystem.getActiveMissions());

    const cStats = ctx.mapObstacles.getCorruptionStats();
    if (cStats.total > 0) {
      const pct = Math.round(cStats.avgCorruption);
      this.corruptionText.setText(`[G] REPAIR  Corruption: ${pct}%`);
      this.corruptionText.setColor(pct > 50 ? "#ff2222" : pct > 25 ? "#ffaa44" : "#44ff88");
    } else {
      this.corruptionText.setText("");
    }

    // ── REACTOR HP BAR UPDATE ─────────────────────────────────────────────────
    if (this.reactorHpBar && this.reactorHpBarBg) {
      const reactRatio = Math.max(0, ctx.reactorHp / ctx.reactorMaxHp);
      const rBarW = 206;
      this.reactorHpBar.width = rBarW * reactRatio;
      const reactColor = reactRatio > 0.5 ? 0x00ff88 : reactRatio > 0.25 ? 0xffaa00 : 0xff2200;
      this.reactorHpBar.setFillStyle(reactColor);
      // Ghost bar lerps down to show recent damage
      if (this.reactorHpGhost) {
        this._reactorLastPct = Phaser.Math.Linear(this._reactorLastPct, reactRatio, 0.025);
        this.reactorHpGhost.width = rBarW * Math.max(reactRatio, this._reactorLastPct);
      }
      // Flash on hit
      if (this._reactorFlashTimer > 0) {
        this._reactorFlashTimer -= 16;
        this.reactorHpBar.setAlpha(Math.sin(this._reactorFlashTimer * 0.04) * 0.45 + 0.55);
      } else {
        this.reactorHpBar.setAlpha(1);
      }
      // Critical pulse warning
      if (reactRatio < 0.25 && !ctx.gameOver) {
        this.reactorHpLabel?.setColor(Math.random() > 0.5 ? "#ff2200" : "#ff7700");
      } else {
        this.reactorHpLabel?.setColor(reactRatio < 0.5 ? "#ffaa00" : "#00ff88");
      }
    }
  }

  /** Call when reactor takes damage — triggers flash on the HP bar. */
  flashReactorBar(): void {
    this._reactorFlashTimer = 900;
    if (this.reactorHpGhost) {
      const pct = this.ctx.reactorHp / this.ctx.reactorMaxHp;
      this._reactorLastPct = Math.min(1, pct + 0.07);
    }
  }

  drawBreachRings(): void {
    this.breachGfx.clear();
    const now = performance.now();
    for (const agent of ([...this.ctx.guards, ...this.ctx.collectors] as (GuardAgent | CollectorAgent)[])) {
      if (agent.isDead) continue;
      const { isCharging, isActive, isBuildingUp, chargeProgress } = agent.breach;
      if (!isCharging && !isActive && !isBuildingUp) continue;

      const px = agent.posX;
      const py = agent.posY;

      if (isActive) {
        const pulse = Math.sin(now * 0.006) * 0.5 + 0.5;
        this.breachGfx.lineStyle(2 + pulse * 2, 0xff00ff, 0.7 + pulse * 0.3);
        this.breachGfx.strokeCircle(px, py, 28 + pulse * 8);
        this.breachGfx.lineStyle(1, 0xff00ff, 0.25 + pulse * 0.15);
        this.breachGfx.strokeCircle(px, py, 42 + pulse * 12);
      } else if (isCharging) {
        const r = 50 - chargeProgress * 22;
        this.breachGfx.lineStyle(1, 0xaa44ff, chargeProgress * 0.7);
        this.breachGfx.strokeCircle(px, py, r);
        const startA = -Math.PI / 2;
        const endA = startA + Math.PI * 2 * chargeProgress;
        this.breachGfx.lineStyle(3, 0xcc88ff, 0.95);
        this.breachGfx.beginPath();
        this.breachGfx.arc(px, py, 24, startA, endA, false);
        this.breachGfx.strokePath();
      } else if (isBuildingUp) {
        const pulse = Math.sin(now * 0.003) * 0.5 + 0.5;
        this.breachGfx.lineStyle(1, 0x8844aa, 0.12 + pulse * 0.1);
        this.breachGfx.strokeCircle(px, py, 35 + pulse * 6);
      }
    }
  }

  updateBossHpBar(hp: number, maxHp: number): void {
    if (this.bossHpBar && maxHp > 0) {
      const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
      const fullW = 600;
      this.bossHpBar.width = fullW * pct;
      // Color phases: red → orange → red — tracks BossAgent thresholds (0.6/0.3/0.15)
      const col = pct > 0.6 ? 0xff2200
                : pct > 0.3 ? 0xff8800
                : pct > 0.15 ? 0xffcc00
                : 0xff0044;
      this.bossHpBar.setFillStyle(col);
      // Damage chip lerps down behind the live bar — readable hit feedback
      if (this.bossHpGhost) {
        const ghostPct = this.bossHpGhost.width / fullW;
        const target = pct;
        const lerped = Phaser.Math.Linear(ghostPct, target, 0.08);
        this.bossHpGhost.width = fullW * lerped;
        // Flash bar when sudden damage > 5% in one frame
        if (this._bossLastPct - pct > 0.05) {
          const bar = this.bossHpBar;
          this.ctx.scene.tweens.add({
            targets: bar, alpha: { from: 0.4, to: 1 }, duration: 220, ease: "Sine.easeOut",
          });
        }
      }
      this._bossLastPct = pct;
    }
  }

  buildBossUI(wave: number, bossName: string): void {
    const scene = this.ctx.scene;
    const bossBarW = 600;
    const bossBarH = 18;
    const bossBarX = GAME_WIDTH / 2 - bossBarW / 2;
    const bossBarY = 62; // below wave indicator (wave indicator spans y=6–38)
    // Outer slab (dark with red rim)
    this.bossHpBarBg = scene.add
      .rectangle(GAME_WIDTH / 2, bossBarY, bossBarW + 8, bossBarH + 8, 0x140000)
      .setScrollFactor(0).setDepth(110).setStrokeStyle(2, 0x882211, 1);
    // Damage chip (yellow ghost behind the live bar)
    this.bossHpGhost = scene.add
      .rectangle(bossBarX, bossBarY, bossBarW, bossBarH, 0xffee44)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(110.5).setAlpha(0.55);
    // Live HP bar
    this.bossHpBar = scene.add
      .rectangle(bossBarX, bossBarY, bossBarW, bossBarH, 0xff2200)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(111);
    // Phase tick markers at 0.6 / 0.3 / 0.15 — match BossAgent phase thresholds
    this.bossHpPhaseTicks = scene.add.graphics().setScrollFactor(0).setDepth(112);
    this.bossHpPhaseTicks.lineStyle(2, 0xffffff, 0.85);
    [0.6, 0.3, 0.15].forEach(t => {
      const x = bossBarX + bossBarW * t;
      this.bossHpPhaseTicks!.lineBetween(x, bossBarY - bossBarH / 2, x, bossBarY + bossBarH / 2);
    });
    this.bossNameText = scene.add.text(GAME_WIDTH / 2, bossBarY - 20, "▰  " + bossName + "  ▰", {
      fontFamily: "monospace", fontSize: "16px", color: "#ff5555", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(112);
    this.bossNameText.setShadow(0, 0, "#ff2200", 8, true, true);
    this._bossLastPct = 1;
    void wave;
  }

  destroyBossUI(): void {
    this.bossHpBar?.destroy();
    this.bossHpBarBg?.destroy();
    this.bossHpGhost?.destroy();
    this.bossHpPhaseTicks?.destroy();
    this.bossNameText?.destroy();
    this.bossHpBar = null;
    this.bossHpBarBg = null;
    this.bossHpGhost = null;
    this.bossHpPhaseTicks = null;
    this.bossNameText = null;
  }

  destroy(): void {
    this.destroyBossUI();
    this.abilityHudGfx?.destroy();
    this.abilityHudTexts.forEach(t => t.destroy());
    this.abilityHudTexts = [];
    this.worldLabel?.destroy();
    this.worldSwitchArc?.destroy();
    this.enemyHpGfx?.destroy();
  }

  private _showTutorialHint(): void {
    const tips = [
      { t: 4000,  msg: "WASD / ←↑↓→ to move  •  Mouse to aim  •  LMB or SPACE to shoot", dur: 4500 },
      { t: 9500,  msg: "SHIFT or RMB to DASH  •  Rapid fire OVERHEATS weapon — let it cool!", dur: 5000 },
      { t: 17000, msg: "Press Q to PHASE-SHIFT  •  FOUNDRY = red enemies attack YOU  •  CIRCUIT = purple/yellow attack REACTOR", dur: 6000 },
      { t: 27000, msg: "Collect SCRAP ★ from enemies  •  [B] opens SHOP in ARMORY (top-right) for upgrades", dur: 5500 },
    ];
    for (const { t, msg, dur } of tips) {
      this.ctx.scene.time.delayedCall(t, () => {
        if (this.ctx.gameOver || this.ctx.waveManager.currentWave > 1) return;
        const tip = this.ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 96, msg, {
          fontFamily: "monospace", fontSize: "12px",
          color: "#aaffdd", backgroundColor: "#00000099",
          padding: { x: 10, y: 7 }, align: "center",
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(105).setAlpha(0);
        this.ctx.scene.tweens.add({ targets: tip, alpha: 1, duration: 400 });
        this.ctx.scene.time.delayedCall(dur, () => {
          this.ctx.scene.tweens.add({
            targets: tip, alpha: 0, duration: 500,
            onComplete: () => tip.destroy(),
          });
        });
      });
    }
  }

  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    const w = this.ctx.worldManager.currentWorld;
    if (w === WorldType.FOUNDRY) {
      return agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent;
    } else {
      return !(agent instanceof EnemyAgent || agent instanceof SawbladeAgent || agent instanceof TurretAgent);
    }
  }

  private _countActiveEnemies(): number {
    return this.ctx.allAgents.filter(a => this._isAgentInCurrentWorld(a)).length;
  }

  private _countGhostEnemies(): number {
    return this.ctx.allAgents.filter(a => !this._isAgentInCurrentWorld(a)).length;
  }
}
