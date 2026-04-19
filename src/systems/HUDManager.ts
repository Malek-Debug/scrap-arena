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

    // Decorative background behind HP/Heat bars
    scene.add.rectangle(112, GAME_HEIGHT - 15, 228, 40, 0x000000, 0.65)
      .setOrigin(0.5).setScrollFactor(0).setDepth(99);

    this.hpBarBg = scene.add
      .rectangle(12, GAME_HEIGHT - 24, 200, 16, 0x440000)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.hpBar = scene.add
      .rectangle(12, GAME_HEIGHT - 24, 200, 16, 0x00ff44)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

    scene.add.text(12, GAME_HEIGHT - 44, "HP", {
      fontFamily: "monospace", fontSize: "11px", color: "#00ff88",
    }).setScrollFactor(0).setDepth(100);

    this.heatBarBg = scene.add
      .rectangle(12, GAME_HEIGHT - 6, 200, 10, 0x330a00)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.heatBar = scene.add
      .rectangle(12, GAME_HEIGHT - 6, 0, 10, 0xff4400)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
    this.heatLabel = scene.add.text(216, GAME_HEIGHT - 6, "HEAT", {
      fontFamily: "monospace", fontSize: "9px", color: "#ff6600",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

    this.hudText = scene.add.text(8, 8, "", {
      fontSize: "13px", color: "#00ff88",
      fontFamily: "monospace",
      backgroundColor: "#00000088",
      padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(100);

    this._waveText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, "", {
      fontFamily: "monospace", fontSize: "36px",
      color: "#00ff88", fontStyle: "bold",
      stroke: "#003311", strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(110).setAlpha(0);

    this.worldSwitchArc = scene.add.graphics().setScrollFactor(0).setDepth(106);

    this._waveIndicator = scene.add.text(GAME_WIDTH / 2, 8, "WAVE 1", {
      fontFamily: "monospace", fontSize: "12px", color: "#00ff88",
      backgroundColor: "#00000088", padding: { x: 8, y: 4 },
      fontStyle: "bold",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(105);

    this._narrativeLabel = scene.add.text(GAME_WIDTH / 2, 28, "", {
      fontFamily: "monospace", fontSize: "9px", color: "#88aacc",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(105).setAlpha(0.7);

    scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 2, "SCRAP ARENA: THE FRACTURE", {
      fontFamily: "monospace", fontSize: "9px", color: "#ffffff22",
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(99);

    const shopBtn = scene.add.text(GAME_WIDTH - 12, 8, "[B] SHOP", {
      fontFamily: "monospace", fontSize: "13px", color: "#ffcc00",
      backgroundColor: "#00000099", padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(105).setInteractive({ useHandCursor: true });
    shopBtn.on("pointerover", () => shopBtn.setColor("#ffffff"));
    shopBtn.on("pointerout", () => shopBtn.setColor("#ffcc00"));
    shopBtn.on("pointerdown", () => this.onOpenShop());

    this.enemyHpGfx = scene.add.graphics().setDepth(55);

    this.corruptionText = scene.add.text(GAME_WIDTH - 200, 60, "", {
      fontFamily: "monospace", fontSize: "12px", color: "#ff4444",
    }).setScrollFactor(0).setDepth(200);

    this.lowHpOverlay = scene.add.graphics().setScrollFactor(0).setDepth(150);

    this.abilityHudGfx = scene.add.graphics().setScrollFactor(0).setDepth(101);
    const abilityDefs = [
      { key: "E", label: "NOVA",   color: 0x00ffff },
      { key: "R", label: "SURGE",  color: 0xcc44ff },
      { key: "F", label: "SHIELD", color: 0x44ff88 },
      { key: "C", label: "CHRONO", color: 0x44ccff },
    ];
    this.abilityHudTexts = [];
    for (let i = 0; i < 4; i++) {
      const tx = 12 + i * 62;
      const ty = GAME_HEIGHT - 56;
      const t = scene.add.text(tx, ty, `[${abilityDefs[i].key}] ${abilityDefs[i].label}`, {
        fontFamily: "monospace", fontSize: "9px",
        color: `#${abilityDefs[i].color.toString(16).padStart(6, "0")}`,
      }).setScrollFactor(0).setDepth(102);
      this.abilityHudTexts.push(t);
    }

    // World label (top-right)
    this.worldLabel = scene.add.text(GAME_WIDTH - 12, 8, `[Q] ${pal.label}`, {
      fontFamily: "monospace", fontSize: "14px",
      color: "#ff8844", fontStyle: "bold",
      backgroundColor: "#00000088",
      padding: { x: 6, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(105);

    // Breach ring VFX layer
    this.breachGfx = scene.add.graphics().setDepth(56).setBlendMode(Phaser.BlendModes.ADD);

    this._showTutorialHint();
  }

  update(playerHeat: number, heatOverheatTimer: number): void {
    const ctx = this.ctx;
    const scene = ctx.scene;

    const hpRatio = ctx.playerHp / ctx.playerStats.maxHp;
    this.hpBar.width = 200 * hpRatio;
    this.hpBar.setFillStyle(hpRatio > 0.5 ? 0x00ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff2200);

    const heatRatio = playerHeat / 100;
    this.heatBar.width = 200 * heatRatio;
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

    this.worldSwitchArc.clear();
    if (!switchReady) {
      const ratio = 1 - (ctx.worldManager.cooldownRemaining / 4000);
      const cx = GAME_WIDTH - 80;
      const cy = 22;
      const r = 10;
      const arcColor = w === WorldType.FOUNDRY ? 0xff8844 : 0x44ccff;
      this.worldSwitchArc.lineStyle(2, 0x222222, 0.8);
      this.worldSwitchArc.strokeCircle(cx, cy, r);
      this.worldSwitchArc.lineStyle(3, arcColor, 1);
      this.worldSwitchArc.beginPath();
      this.worldSwitchArc.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
      this.worldSwitchArc.strokePath();
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
        const tx = 12 + i * 62;
        const ty = GAME_HEIGHT - 46;
        const ready = ctx.abilitySystem.canUse(ids[i]);
        const ratio = 1 - ctx.abilitySystem.getCooldownRatio(ids[i]);
        this.abilityHudGfx.fillStyle(0x111111, 0.7);
        this.abilityHudGfx.fillRect(tx, ty, 58, 6);
        this.abilityHudGfx.fillStyle(ready ? colors[i] : 0x444444, ready ? 1 : 0.5);
        this.abilityHudGfx.fillRect(tx, ty, 58 * ratio, 6);
        if (this.abilityHudTexts[i]) {
          const remaining = ((1 - ratio) * cooldowns[i] / 1000).toFixed(1);
          this.abilityHudTexts[i].setText(ready ? labels[i] : `${labels[i].slice(0, 3)} ${remaining}s`);
          this.abilityHudTexts[i].setAlpha(ready ? 1 : 0.55);
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
      this.bossHpBar.width = 600 * (hp / maxHp);
      const pct = hp / maxHp;
      this.bossHpBar.setFillStyle(pct > 0.5 ? 0xff2200 : pct > 0.25 ? 0xff6600 : 0xff0000);
    }
  }

  buildBossUI(wave: number, bossName: string): void {
    const scene = this.ctx.scene;
    const bossBarW = 600;
    const bossBarH = 18;
    const bossBarX = GAME_WIDTH / 2 - bossBarW / 2;
    const bossBarY = 28;
    this.bossHpBarBg = scene.add
      .rectangle(GAME_WIDTH / 2, bossBarY, bossBarW + 4, bossBarH + 4, 0x330000)
      .setScrollFactor(0).setDepth(110);
    this.bossHpBar = scene.add
      .rectangle(bossBarX, bossBarY, bossBarW, bossBarH, 0xff2200)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(111);
    this.bossNameText = scene.add.text(GAME_WIDTH / 2, bossBarY - 16, bossName, {
      fontFamily: "monospace", fontSize: "16px", color: "#ff4444", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(112);
    void wave;
  }

  destroyBossUI(): void {
    this.bossHpBar?.destroy();
    this.bossHpBarBg?.destroy();
    this.bossNameText?.destroy();
    this.bossHpBar = null;
    this.bossHpBarBg = null;
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
      { t: 5200,  msg: "WASD / ←↑↓→ to move  •  Mouse to aim  •  LMB or SPACE to shoot" },
      { t: 9000,  msg: "Press Q to PHASE-SHIFT between worlds  •  Each world has different enemies" },
      { t: 13000, msg: "SHIFT or RMB to DASH  •  Heat limits shooting — don't overheat!" },
    ];
    for (const { t, msg } of tips) {
      this.ctx.scene.time.delayedCall(t, () => {
        if (this.ctx.gameOver || this.ctx.waveManager.currentWave > 1) return;
        const tip = this.ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 12, msg, {
          fontFamily: "monospace", fontSize: "12px",
          color: "#aaffdd", backgroundColor: "#00000099",
          padding: { x: 10, y: 7 }, align: "center",
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(105).setAlpha(0);
        this.ctx.scene.tweens.add({ targets: tip, alpha: 1, duration: 400 });
        this.ctx.scene.time.delayedCall(2600, () => {
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
