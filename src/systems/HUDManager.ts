import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, WorldType } from "../core";
import type { AnyAgent, GameContext } from "./GameContext";
import type { GuardAgent } from "../agents/GuardAgent";
import type { CollectorAgent } from "../agents/CollectorAgent";
import { AudioManager } from "../audio";
import type { MissionUI } from "../rendering";
import { UI_MONO, UI_ORBITRON, UI_FONT, C, FS, O, constrainTextBlock, drawGlass, drawBrackets } from "../rendering/UITheme";

// ── Layout ────────────────────────────────────────────────────────────────────
//
//  TOP-LEFT   [24,16 → 256,68]  Score / scrap / kills
//  TOP-CENTER [490,8 → 790,44]  Wave label
//  TOP-RIGHT  [1080,16→1256,102] Reactor arc + world nodes
//  LEFT-SIDE  [24,160→224,380]  MissionUI
//  BTM-CENTER [440,600→840,712]  Command bar  (heat | rings | HP)
//  BTM-RIGHT  [1084,564→1256,712] Radar
//  BTM-LEFT   [24,545→424,625]  Dialogue
//
// Spacing grid: 8px.  Screen margins: min 24px from edge.
// ─────────────────────────────────────────────────────────────────────────────

const CMD_CX = GAME_WIDTH / 2;        // 640
const CMD_W  = 400;
const CMD_H  = 100;
const CMD_X  = CMD_CX - CMD_W / 2;   // 440
const CMD_Y  = GAME_HEIGHT - CMD_H - 8; // 612

// Left zone (HP) — inside command bar
const HP_LABEL_X = CMD_X + 12;
const HP_BAR_X   = CMD_X + 12;
const HP_BAR_Y   = CMD_Y + 74;
const HP_BAR_W   = 104;
const HP_BAR_H   = 8;

// Right zone (heat)
const HT_BAR_X   = CMD_X + CMD_W - 12 - 104;  // 724
const HT_BAR_Y   = CMD_Y + 74;
const HT_BAR_W   = 104;
const HT_BAR_H   = 4;

// Center zone (abilities)
const ABL_CY     = CMD_Y + 44;
const ABL_SX     = CMD_CX - 90;     // first ring cx
const ABL_SP     = 60;

// Reactor arc — right-anchored panel, 176px wide from edge
// RCX/RCY are the arc centre. Everything below is laid out relative to these.
const RCX = 1196, RCY = 50, R_OUTER = 32, R_INNER = 26;

// Top-right panel column bounds (used for text anchoring)
const TR_RIGHT  = GAME_WIDTH - 16;   // 1264  — text right-anchor X
// Row Y positions inside the top-right panel (all origin 0.5 or (1,0))
const TR_ROW1_Y = 16;    // [B] SHOP
const TR_ROW2_Y = 32;    // world [Q] label (below shop)
// Corruption / repair notice stays below reactor circle
const TR_CORRUPT_Y = RCY + R_OUTER + 24 + 16; // ~122 — below "REACTOR" label

// ─────────────────────────────────────────────────────────────────────────────

export class HUDManager {
  private ctx: GameContext;
  private missionUI: MissionUI;
  private onOpenShop: () => void;

  // ── HP / Heat ───────────────────────────────────────────────────────────────
  private hpBar!: Phaser.GameObjects.Rectangle;
  private heatBar!: Phaser.GameObjects.Rectangle;
  private heatLabel!: Phaser.GameObjects.Text;
  private heatPctText!: Phaser.GameObjects.Text;
  private _hotZoneLabel: Phaser.GameObjects.Text | null = null;

  // ── Score panel ─────────────────────────────────────────────────────────────
  private _scoreText!: Phaser.GameObjects.Text;
  private _statsRow!: Phaser.GameObjects.Text;
  private _comboText!: Phaser.GameObjects.Text;
  private _prevCombo = 0;

  // compat alias
  hudText!: Phaser.GameObjects.Text;

  // ── Wave ────────────────────────────────────────────────────────────────────
  private _waveText!: Phaser.GameObjects.Text;
  private _waveIndicator!: Phaser.GameObjects.Text;
  private _waveIndicatorBg!: Phaser.GameObjects.Rectangle;
  private _narrativeLabel!: Phaser.GameObjects.Text;

  // ── Reactor arc ─────────────────────────────────────────────────────────────
  private _reactorGfx!: Phaser.GameObjects.Graphics;
  private _reactorLabel!: Phaser.GameObjects.Text;
  private _reactorPctText!: Phaser.GameObjects.Text;
  private _reactorLastPct = 1;
  private _reactorFlashTimer = 0;

  // ── World nodes ─────────────────────────────────────────────────────────────
  private _worldNodeGfx!: Phaser.GameObjects.Graphics;
  private _worldQLabel!: Phaser.GameObjects.Text;
  private _dimensionLabel!: Phaser.GameObjects.Text;   // always-visible full identity
  worldLabel!: Phaser.GameObjects.Text;
  worldSwitchArc!: Phaser.GameObjects.Graphics;
  private _legendDimmed = false;

  // ── Command bar ─────────────────────────────────────────────────────────────
  private _cmdGfx!: Phaser.GameObjects.Graphics;
  private abilityHudGfx!: Phaser.GameObjects.Graphics;
  private abilityHudTexts: Phaser.GameObjects.Text[] = [];

  // ── Enemy HP ────────────────────────────────────────────────────────────────
  private enemyHpGfx!: Phaser.GameObjects.Graphics;
  private _hpBarFrameSkip = 0;

  // ── VFX ─────────────────────────────────────────────────────────────────────
  private breachGfx!: Phaser.GameObjects.Graphics;
  private corruptionText!: Phaser.GameObjects.Text;
  private lowHpOverlay!: Phaser.GameObjects.Graphics;

  // ── Boss HP ─────────────────────────────────────────────────────────────────
  private bossHpBar: Phaser.GameObjects.Rectangle | null = null;
  private bossHpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private bossNameText: Phaser.GameObjects.Text | null = null;
  private bossHpGhost: Phaser.GameObjects.Rectangle | null = null;
  private bossHpPhaseTicks: Phaser.GameObjects.Graphics | null = null;
  private _bossLastPct = 1;

  // ── Active buff indicators ──────────────────────────────────────────────────
  private _buffTexts: Phaser.GameObjects.Text[] = [];

  // ── Tutorial ────────────────────────────────────────────────────────────────
  private _lowHpSoundTime = 0;
  private _tutShotShown = false;
  private _tutDashShown = false;
  private _tutKillShown = false;
  private _tutScrapShown = false;
  private _tutHeatShown = false;
  private _tutCircuitEnemyShown = false;

  // Capture mode — all persistent HUD objects listed here for bulk hide/show
  private _hudObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(ctx: GameContext, missionUI: MissionUI, onOpenShop: () => void) {
    this.ctx = ctx;
    this.missionUI = missionUI;
    this.onOpenShop = onOpenShop;
  }

  get waveTextRef(): Phaser.GameObjects.Text { return this._waveText; }

  setNarrativePhase(label: string): void {
    if (this._narrativeLabel) this._narrativeLabel.setText(label);
  }

  /** Hide or show all persistent HUD elements for F10 capture mode. */
  setCaptureMode(enabled: boolean): void {
    for (const obj of this._hudObjects) {
      (obj as Phaser.GameObjects.Text).setVisible(!enabled);
    }
    this.missionUI?.setVisible(!enabled);
  }

  // ───────────────────────────────────────────────────────────────────────────

  build(): void {
    const scene = this.ctx.scene;

    // ── TOP-LEFT: Score panel — floating glass ────────────────────────────────
    const tlGfx = scene.add.graphics().setScrollFactor(0).setDepth(98);
    drawGlass(tlGfx, 24, 16, 232, 60, C.cyan);

    this._scoreText = scene.add.text(36, 24, "0", {
      fontFamily: UI_MONO, fontSize: FS.md, color: C.amberH, fontStyle: "bold",
    }).setScrollFactor(0).setDepth(100);

    this._statsRow = scene.add.text(36, 48, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
    }).setScrollFactor(0).setDepth(100);

    this._comboText = scene.add.text(248, 48, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH, fontStyle: "bold",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.hudText = scene.add.text(-9999, -9999, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
    }).setScrollFactor(0).setDepth(1).setAlpha(0);

    // ── TOP-CENTER: Wave indicator ────────────────────────────────────────────
    this._waveText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, "", {
      fontFamily: UI_ORBITRON, fontSize: FS.xl,
      color: C.cyanH, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(110).setAlpha(0);

    this._waveIndicator = scene.add.text(GAME_WIDTH / 2, 16, "WAVE 1", {
      fontFamily: UI_MONO, fontSize: FS.sm, color: C.cyanH, fontStyle: "bold",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(105);

    this._narrativeLabel = scene.add.text(GAME_WIDTH / 2, 32, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.mutedH,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(105);

    // compat dummy — boss UI sets alpha on this
    this._waveIndicatorBg = scene.add.rectangle(-9999, -9999, 1, 1, 0x000000, 0)
      .setScrollFactor(0).setDepth(1);

    // ── TOP-RIGHT: Reactor — dual-ring arc meter ──────────────────────────────
    this._reactorGfx = scene.add.graphics().setScrollFactor(0).setDepth(106);

    this._reactorPctText = scene.add.text(RCX, RCY, "100%", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH, fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(107);

    this._reactorLabel = scene.add.text(RCX, RCY + R_OUTER + 8, "REACTOR", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(106).setAlpha(O.dimText);
    if (scene.textures.exists("UI_Reactor")) {
      scene.add.image(RCX, RCY + R_OUTER + 24, "UI_Reactor")
        .setScale(0.5).setScrollFactor(0).setDepth(106).setAlpha(0.35);
    }

    // ── TOP-RIGHT: World nodes ────────────────────────────────────────────────
    this._worldNodeGfx = scene.add.graphics().setScrollFactor(0).setDepth(106);
    // [Q] label sits in row 2 — below the [B] shop button, safely clear of border
    this._worldQLabel = scene.add.text(TR_RIGHT, TR_ROW2_Y, "[Q] FOUNDRY", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(107).setAlpha(O.dimText);

    // compat
    this.worldLabel = scene.add.text(-9999, -9999, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
    }).setScrollFactor(0).setDepth(1).setAlpha(0);
    this.worldSwitchArc = scene.add.graphics().setScrollFactor(0).setDepth(1).setAlpha(0);

    // ── Always-visible dimension identity label (bottom-right corner) ────────
    // Shows "MACHINE CORE" or "VOID SECTOR" — updates immediately on Q press.
    this._dimensionLabel = scene.add.text(GAME_WIDTH - 16, GAME_HEIGHT - 14, "MACHINE CORE", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(108).setAlpha(0.55);

    // Shop button — row 1 (topmost right item)
    const shopBtn = scene.add.text(TR_RIGHT, TR_ROW1_Y, "[B] SHOP", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(107)
      .setInteractive({ useHandCursor: true })
      .setAlpha(O.dimText);
    shopBtn.on("pointerover", () => shopBtn.setAlpha(1));
    shopBtn.on("pointerout",  () => shopBtn.setAlpha(O.dimText));
    shopBtn.on("pointerdown", () => this.onOpenShop());

    // ── BOTTOM-CENTER: Command bar ────────────────────────────────────────────
    this._cmdGfx = scene.add.graphics().setScrollFactor(0).setDepth(99);
    this._rebuildCommandBar();

    // HP bar — left zone
    const hpBg = scene.add.rectangle(HP_BAR_X + HP_BAR_W / 2, HP_BAR_Y, HP_BAR_W, HP_BAR_H, C.ink, 1)
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100);
    hpBg.setAlpha(0.85);
    this.hpBar = scene.add.rectangle(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, C.cyan)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

    // HP label above bar — icon + text
    if (scene.textures.exists("UI_Health")) {
      scene.add.image(HP_LABEL_X + HP_BAR_W / 2 - 20, HP_BAR_Y - 8, "UI_Health")
        .setScale(0.55).setScrollFactor(0).setDepth(101).setAlpha(O.dimText);
    }
    scene.add.text(HP_LABEL_X + HP_BAR_W / 2, HP_BAR_Y - 10, "HP", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.cyanH,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(101).setAlpha(O.dimText);

    // Heat bar — right zone
    const htBg = scene.add.rectangle(HT_BAR_X + HT_BAR_W / 2, HT_BAR_Y, HT_BAR_W, HT_BAR_H, C.ink, 1)
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100);
    htBg.setAlpha(0.85);
    this.heatBar = scene.add.rectangle(HT_BAR_X, HT_BAR_Y, 0, HT_BAR_H, C.red)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

    // Heat labels — icon + text
    if (scene.textures.exists("UI_Heat")) {
      scene.add.image(HT_BAR_X + HT_BAR_W / 2 - 22, HT_BAR_Y - 8, "UI_Heat")
        .setScale(0.55).setScrollFactor(0).setDepth(101).setAlpha(O.dimText);
    }
    scene.add.text(HT_BAR_X + HT_BAR_W / 2, HT_BAR_Y - 10, "HEAT", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(101).setAlpha(O.dimText);

    this.heatPctText = scene.add.text(HT_BAR_X + HT_BAR_W / 2, HT_BAR_Y + 10, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);

    this.heatLabel = scene.add.text(HT_BAR_X + HT_BAR_W / 2, HT_BAR_Y + 20, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.amberH,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);

    // Ability rings (center zone)
    this.abilityHudGfx = scene.add.graphics().setScrollFactor(0).setDepth(101);
    const abilityDefs = [
      { key: "E", label: "NOVA",   col: C.cyanH  },
      { key: "R", label: "SURGE",  col: "#cc44ff" },
      { key: "F", label: "SHIELD", col: C.greenH  },
      { key: "C", label: "CHRONO", col: C.amberH  },
    ];
    const abilityIconKeys = ["UI_AbilityNova", "UI_AbilitySurge", "UI_AbilityShield", "UI_AbilityChrono"];
    this.abilityHudTexts = [];
    for (let i = 0; i < 4; i++) {
      const cx = ABL_SX + i * ABL_SP;
      // Icon above key letter
      if (scene.textures.exists(abilityIconKeys[i])) {
        scene.add.image(cx, ABL_CY - 22, abilityIconKeys[i])
          .setScale(0.6).setScrollFactor(0).setDepth(103).setAlpha(0.65);
      }
      const keyTxt = scene.add.text(cx, ABL_CY - 5, abilityDefs[i].key, {
        fontFamily: UI_MONO, fontSize: FS.sm, color: abilityDefs[i].col, fontStyle: "bold",
      }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
      const nameTxt = scene.add.text(cx, ABL_CY + 21, abilityDefs[i].label, {
        fontFamily: UI_MONO, fontSize: FS.xs, color: abilityDefs[i].col,
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(103);
      this.abilityHudTexts.push(keyTxt, nameTxt);
    }

    // ── Watermark ─────────────────────────────────────────────────────────────
    scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 2, "SCRAP ARENA: THE FRACTURE", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: "#ffffff10",
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(99);

    // ── VFX layers ────────────────────────────────────────────────────────────
    this.enemyHpGfx = scene.add.graphics().setDepth(55);
    this.breachGfx = scene.add.graphics().setDepth(56).setBlendMode(Phaser.BlendModes.ADD);

    // Corruption text — sits below the reactor circle so it never collides with
    // the arc, the world-nodes, or the top-right text rows.
    this.corruptionText = scene.add.text(TR_RIGHT, TR_CORRUPT_Y, "", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.redH,
      wordWrap: { width: 220, useAdvancedWrap: true },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    this.lowHpOverlay = scene.add.graphics().setScrollFactor(0).setDepth(150);

    // Register all HUD objects for capture mode bulk-hide.
    // Snapshot immediately after build — includes every scrollFactor=0 object
    // added during this call.  Depth 1 dummies are included; setVisible(false)
    // on them is harmless since they are invisible anyway.
    this._hudObjects = scene.children.getAll().filter(go => {
      const sf = (go as Phaser.GameObjects.Graphics).scrollFactorX ?? 1;
      return sf === 0;
    });
  }

  // ── Rebuild command bar glass (called once; could also call on resize) ──────
  private _rebuildCommandBar(): void {
    const gfx = this._cmdGfx;
    gfx.clear();

    // Very transparent fill — no heavy box
    gfx.fillStyle(C.ink, 0.35);
    gfx.fillRoundedRect(CMD_X, CMD_Y, CMD_W, CMD_H, 6);

    // Single top accent line only
    gfx.lineStyle(1, C.cyan, 0.5);
    gfx.lineBetween(CMD_X + 8, CMD_Y, CMD_X + CMD_W - 8, CMD_Y);

    // Subtle left/right edge lines (not full borders)
    gfx.lineStyle(1, C.cyan, 0.15);
    gfx.lineBetween(CMD_X, CMD_Y, CMD_X, CMD_Y + CMD_H);
    gfx.lineBetween(CMD_X + CMD_W, CMD_Y, CMD_X + CMD_W, CMD_Y + CMD_H);

    // Corner ticks only at top corners
    drawBrackets(gfx, CMD_X, CMD_Y, CMD_W, 0, C.cyan, 0.55, 8);

    // Vertical dividers — separate HP / abilities / heat zones
    gfx.lineStyle(1, C.cyan, 0.10);
    const d1x = CMD_X + 128, d2x = CMD_X + CMD_W - 128;
    gfx.lineBetween(d1x, CMD_Y + 12, d1x, CMD_Y + CMD_H - 12);
    gfx.lineBetween(d2x, CMD_Y + 12, d2x, CMD_Y + CMD_H - 12);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  update(playerHeat: number, heatOverheatTimer: number): void {
    const ctx = this.ctx;
    const scene = ctx.scene;
    const now = performance.now();

    // ── HP ───────────────────────────────────────────────────────────────────
    const hpRatio = ctx.playerHp / ctx.playerStats.maxHp;
    this.hpBar.width = HP_BAR_W * Math.max(0, hpRatio);
    this.hpBar.setFillStyle(hpRatio > 0.5 ? C.cyan : hpRatio > 0.25 ? C.amber : C.red);

    // ── Heat ─────────────────────────────────────────────────────────────────
    const heatRatio  = playerHeat / 100;
    this.heatBar.width = HT_BAR_W * heatRatio;
    const isOverheat = heatOverheatTimer > 0;
    const inRedZone  = !isOverheat && heatRatio >= 0.75;
    const inWarning  = !isOverheat && !inRedZone && heatRatio >= 0.5;

    if (isOverheat) {
      const fp = Math.sin(now * 0.022) * 0.5 + 0.5;
      this.heatBar.setFillStyle(fp > 0.5 ? 0xff0000 : 0xcc0000).setAlpha(0.7 + fp * 0.3);
      const rem = (heatOverheatTimer / 1000).toFixed(1);
      this.heatLabel.setText("OVERHEAT").setColor(C.redH);
      this.heatPctText.setText(`${rem}s`).setColor(C.redH);
      this.heatLabel.setScale(1 + fp * 0.06);
    } else {
      this.heatLabel.setScale(1);
      let r: number, g: number, b = 0;
      if (heatRatio < 0.5) {
        const t = heatRatio / 0.5;
        r = Math.round(0x66 + t * (0xff - 0x66));
        g = Math.round(0xcc - t * (0xcc - 0x88));
      } else if (heatRatio < 0.75) {
        const t = (heatRatio - 0.5) / 0.25;
        r = 0xff; g = Math.round(0x88 - t * 0x55);
      } else {
        const t = (heatRatio - 0.75) / 0.25;
        r = 0xff; g = Math.round(0x33 - t * 0x33);
      }
      this.heatBar.setFillStyle(Phaser.Display.Color.GetColor(r, g, b)).setAlpha(1);
      this.heatPctText.setText(`${Math.round(heatRatio * 100)}%`);
      if (inRedZone) {
        this.heatBar.setAlpha(0.75 + 0.25 * Math.sin(now * 0.018));
        this.heatLabel.setText("RED ZONE").setColor(C.redH);
        this.heatPctText.setColor(C.redH);
      } else if (inWarning) {
        this.heatLabel.setText("HOT").setColor(C.amberH);
        this.heatPctText.setColor(C.amberH);
      } else {
        this.heatLabel.setText("").setColor(C.amberH);
        this.heatPctText.setColor(C.mutedH);
      }
    }

    // Hot zone bonus — floats above heat bar
    if (inRedZone) {
      if (!this._hotZoneLabel) {
        this._hotZoneLabel = scene.add.text(HT_BAR_X + HT_BAR_W / 2, CMD_Y - 8, "+20% DMG", {
          fontFamily: UI_MONO, fontSize: FS.xs, color: C.redH,
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(102).setAlpha(0);
        scene.tweens.add({ targets: this._hotZoneLabel, alpha: 1, duration: 250 });
      } else {
        this._hotZoneLabel.setAlpha(0.6 + 0.4 * Math.sin(now * 0.01));
      }
    } else if (this._hotZoneLabel) {
      this._hotZoneLabel.destroy(); this._hotZoneLabel = null;
    }

    // ── Score ────────────────────────────────────────────────────────────────
    this._scoreText.setText(this._compact(ctx.comboSystem.score));

    const instab = ctx.worldManager.instability;
    const instabStr = instab > 0.5
      ? (ctx.worldManager.isUnstable ? "  SWITCH!" : `  ${Math.floor(instab * 100)}% INST`)
      : "";
    this._statsRow.setText(`⬡ ${ctx.upgradeSystem.scrap}  ✖ ${ctx.killCount}${instabStr}`);

    if (ctx.worldManager.isUnstable) {
      this._statsRow.setColor(Math.sin(now * 0.012) > 0 ? C.redH : C.amberH);
    } else if (instab > 0.5) {
      this._statsRow.setColor(C.amberH);
    } else {
      this._statsRow.setColor(C.cyanH);
    }

    const combo = ctx.comboSystem.combo;
    if (combo >= 3) {
      // Scale punch when combo increments
      if (combo !== this._prevCombo) {
        const punchScale = combo >= 10 ? 1.5 : combo >= 5 ? 1.35 : 1.2;
        this._comboText.setScale(punchScale);
        scene.tweens.add({
          targets: this._comboText, scaleX: 1, scaleY: 1,
          duration: 200, ease: "Back.easeOut",
        });
      }
      const comboColor = combo >= 10 ? C.redH : combo >= 5 ? C.amberH : C.cyanH;
      this._comboText
        .setText(`⚡ ${combo}× ${ctx.comboSystem.multiplier.toFixed(1)}`)
        .setColor(comboColor)
        .setAlpha(0.90 + 0.10 * Math.sin(now * 0.014));
    } else {
      if (this._prevCombo >= 3) {
        scene.tweens.add({ targets: this._comboText, alpha: 0, duration: 300 });
      }
    }
    this._prevCombo = combo;

    // ── Wave indicator ───────────────────────────────────────────────────────
    if (this._waveIndicator) {
      const wn = ctx.waveManager.currentWave;
      if (wn === 0) {
        this._waveIndicator.setText("AWAITING BREACH").setColor(C.mutedH);
      } else {
        const isBoss = wn % 5 === 0;
        this._waveIndicator.setText(isBoss ? `⚠ BOSS PROTOCOL  W${wn}` : `BREACH EVENT  ${String(wn).padStart(2, "0")}`);
        this._waveIndicator.setColor(isBoss ? C.redH : C.cyanH);
      }
    }

    // ── Reactor arc ──────────────────────────────────────────────────────────
    this._drawReactorArc();

    // ── World nodes ──────────────────────────────────────────────────────────
    this._drawWorldNodes();

    // ── Low-HP vignette ──────────────────────────────────────────────────────
    this.lowHpOverlay.clear();
    if (hpRatio < 0.35 && !ctx.gameOver) {
      // Heartbeat-style pulse: fast double-beat
      const beatT = (now % 900) / 900;
      const beat = beatT < 0.12 ? beatT / 0.12 :
                   beatT < 0.22 ? (0.22 - beatT) / 0.10 :
                   beatT < 0.34 ? (beatT - 0.22) / 0.12 * 0.6 :
                   beatT < 0.44 ? (0.44 - beatT) / 0.10 * 0.6 : 0;
      const danger = 1 - hpRatio / 0.35; // 0 at 35% → 1 at 0%
      const pulseAlpha = (0.08 + danger * 0.14) * (1 + beat * 0.8);
      const edgeW = Math.round(12 + danger * 28);
      this.lowHpOverlay.fillStyle(0xcc0000, pulseAlpha);
      // Four thickening edge bars
      this.lowHpOverlay.fillRect(0, 0, GAME_WIDTH, edgeW);
      this.lowHpOverlay.fillRect(0, GAME_HEIGHT - edgeW, GAME_WIDTH, edgeW);
      this.lowHpOverlay.fillRect(0, 0, edgeW, GAME_HEIGHT);
      this.lowHpOverlay.fillRect(GAME_WIDTH - edgeW, 0, edgeW, GAME_HEIGHT);
      if (scene.time.now - this._lowHpSoundTime > (hpRatio < 0.15 ? 800 : 1500)) {
        AudioManager.instance.lowHpPulse();
        this._lowHpSoundTime = scene.time.now;
      }
    }

    // ── Ability rings ────────────────────────────────────────────────────────
    this._drawAbilityStrip();

    // ── Enemy HP bars (every 3rd frame) ─────────────────────────────────────
    this._hpBarFrameSkip = (this._hpBarFrameSkip + 1) % 3;
    if (this._hpBarFrameSkip === 0) {
      this.enemyHpGfx.clear();
      for (const agent of ctx.allAgents) {
        if (agent.isDead || !agent.sprite || !this._isAgentInCurrentWorld(agent)) continue;
        if (agent.hp >= agent.maxHp) continue;
        const ratio = Math.max(0, agent.hp / agent.maxHp);
        const bw = 24, bh = 3, bx = agent.posX - 12, by = agent.posY - 24;
        this.enemyHpGfx.fillStyle(0x220000, 0.85);
        this.enemyHpGfx.fillRect(bx, by, bw, bh);
        this.enemyHpGfx.fillStyle(ratio > 0.5 ? C.cyan : ratio > 0.25 ? C.amber : C.red, 1);
        this.enemyHpGfx.fillRect(bx, by, bw * ratio, bh);
      }
    }

    // ── Missions ─────────────────────────────────────────────────────────────
    const completed = ctx.missionSystem.getCompletedMissions();
    for (const m of completed) {
      this.missionUI.showCompletion(m);
      ctx.upgradeSystem.addScrap(m.reward.scrap);
      ctx.comboSystem.score += m.reward.scoreBonus;
    }
    ctx.missionSystem.clearCompleted();
    this.missionUI.update(ctx.missionSystem.getActiveMissions());

    // ── Active Power-Up Timers ─────────────────────────────────────────────────
    this._drawActiveBuffs();

    // ── Corruption ───────────────────────────────────────────────────────────
    const cStats = ctx.mapObstacles.getCorruptionStats();
    if (cStats.total > 0) {
      const pct = Math.round(cStats.avgCorruption);
      this.corruptionText.setText(`[G] REPAIR  ${pct}%`);
      this.corruptionText.setColor(pct > 50 ? C.redH : pct > 25 ? C.amberH : C.greenH);
    } else {
      this.corruptionText.setText("");
    }

    if (this._reactorFlashTimer > 0) this._reactorFlashTimer -= 16;
  }

  private _drawActiveBuffs(): void {
    const pus = this.ctx.powerUpSystem;
    const buffs: { label: string; time: number; color: string }[] = [];
    if (this.ctx.phaseSurgeTimer > 0) buffs.push({ label: "⚡SURGE ×1.4", time: this.ctx.phaseSurgeTimer, color: "#cc44ff" });
    if (pus.rapidFireActive) buffs.push({ label: "⚡RAPID", time: pus.rapidFireTimer, color: "#ff4400" });
    if (pus.damageBoostActive) buffs.push({ label: "↑DMG x2", time: pus.damageBoostTimer, color: "#ff0044" });
    if (pus.speedBoostActive) buffs.push({ label: "▶SPEED", time: pus.speedBoostTimer, color: "#00aaff" });

    // Recycle text objects
    while (this._buffTexts.length < buffs.length) {
      const t = this.ctx.scene.add.text(0, 0, "", {
        fontFamily: UI_MONO, fontSize: "12px", color: "#ffffff", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setScrollFactor(0).setDepth(200).setOrigin(0, 0.5);
      this._buffTexts.push(t);
    }
    for (let i = 0; i < this._buffTexts.length; i++) {
      if (i < buffs.length) {
        const b = buffs[i];
        const sec = (b.time / 1000).toFixed(1);
        this._buffTexts[i].setText(`${b.label} ${sec}s`).setColor(b.color)
          .setPosition(24 + i * 110, 90).setVisible(true);
      } else {
        this._buffTexts[i].setVisible(false);
      }
    }
  }

  // ─── Reactor — dual rings ─────────────────────────────────────────────────

  private _drawReactorArc(): void {
    const gfx = this._reactorGfx;
    gfx.clear();

    const ratio = Math.max(0, this.ctx.reactorHp / this.ctx.reactorMaxHp);
    this._reactorLastPct = Phaser.Math.Linear(this._reactorLastPct, ratio, 0.04);
    const now = performance.now();
    const isCrit = ratio < 0.25 && !this.ctx.gameOver;
    const critPulse = isCrit ? Math.sin(now * 0.008) * 0.5 + 0.5 : 0;
    const arcColor  = ratio > 0.5 ? C.cyan : ratio > 0.25 ? C.amber : C.red;

    // Outer decorative ring (always faint)
    gfx.lineStyle(1, C.cyan, 0.09);
    gfx.strokeCircle(RCX, RCY, R_OUTER + 8);

    // Track ring
    gfx.lineStyle(4, C.ink, 0.96);
    gfx.strokeCircle(RCX, RCY, R_OUTER);

    // Ghost arc (chip effect)
    if (this._reactorLastPct > ratio + 0.015) {
      gfx.lineStyle(4, 0x886622, 0.30);
      gfx.beginPath();
      gfx.arc(RCX, RCY, R_OUTER, -Math.PI / 2, -Math.PI / 2 + this._reactorLastPct * Math.PI * 2, false);
      gfx.strokePath();
    }

    // Live arc
    if (ratio > 0) {
      const fa = this._reactorFlashTimer > 0
        ? 0.5 + 0.5 * Math.abs(Math.sin(this._reactorFlashTimer * 0.04))
        : 1;
      gfx.lineStyle(4, arcColor, fa);
      gfx.beginPath();
      gfx.arc(RCX, RCY, R_OUTER, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
      gfx.strokePath();
    }

    // Inner ring — subtle corruption indicator
    gfx.lineStyle(1, arcColor, 0.18);
    gfx.strokeCircle(RCX, RCY, R_INNER);

    // Critical pulse ring — expands outward
    if (isCrit) {
      gfx.lineStyle(1, C.red, 0.25 + critPulse * 0.55);
      gfx.strokeCircle(RCX, RCY, R_OUTER + 4 + critPulse * 6);
    }

    // Center fill — dark
    gfx.fillStyle(C.ink, 0.72);
    gfx.fillCircle(RCX, RCY, R_INNER - 1);

    // Pct text + label
    const pctCol = ratio > 0.5 ? C.cyanH : ratio > 0.25 ? C.amberH : C.redH;
    this._reactorPctText.setText(`${Math.ceil(ratio * 100)}%`).setColor(pctCol);

    if (isCrit) {
      this._reactorLabel.setColor(critPulse > 0.5 ? C.redH : "#ff8844");
    } else {
      this._reactorLabel.setColor(ratio < 0.5 ? C.amberH : C.cyanH).setAlpha(O.dimText);
    }

    // Update label text to reflect reactor state
    if (ratio <= 0) {
      this._reactorLabel.setText("OFFLINE").setColor(C.redH).setAlpha(1);
    } else if (ratio < 0.25) {
      this._reactorLabel.setText("CRITICAL").setColor(C.redH).setAlpha(1);
    } else if (ratio < 0.5) {
      this._reactorLabel.setText("DAMAGED").setColor(C.amberH).setAlpha(1);
    } else if (ratio < 0.7) {
      this._reactorLabel.setText("DEGRADED").setColor(C.amberH).setAlpha(O.dimText);
    } else {
      this._reactorLabel.setText("REACTOR").setColor(ratio < 0.5 ? C.amberH : C.cyanH).setAlpha(O.dimText);
    }
  }

  // ─── World nodes ──────────────────────────────────────────────────────────

  private _drawWorldNodes(): void {
    const ctx = this.ctx;
    const gfx = this._worldNodeGfx;
    gfx.clear();

    const now = performance.now();
    const foundryActive = ctx.worldManager.currentWorld === WorldType.FOUNDRY;
    const switchReady   = ctx.worldManager.canSwitch;
    const cdRatio       = switchReady ? 1 : (1 - ctx.worldManager.cooldownRemaining / 4000);
    const dim           = this._legendDimmed ? 0.2 : 1;

    // Node centres — left of reactor arc
    const fnX = 1092, cnX = 1148, ny = RCY, nr = 14;

    // Connector
    gfx.lineStyle(1, 0x2a3840, 0.4);
    gfx.lineBetween(fnX + nr, ny, cnX - nr, ny);

    // FOUNDRY
    const fA = (foundryActive ? 1.0 : 0.22) * dim;
    gfx.lineStyle(1, C.amber, fA);
    gfx.strokeCircle(fnX, ny, nr);
    if (foundryActive) {
      gfx.fillStyle(C.amber, 0.08);
      gfx.fillCircle(fnX, ny, nr);
      if (!switchReady) {
        gfx.lineStyle(2, C.amber, 0.8);
        gfx.beginPath();
        gfx.arc(fnX, ny, nr + 4, -Math.PI / 2, -Math.PI / 2 + cdRatio * Math.PI * 2, false);
        gfx.strokePath();
      } else {
        gfx.lineStyle(1, C.amber, 0.3 + 0.3 * Math.sin(now * 0.005));
        gfx.strokeCircle(fnX, ny, nr + 4);
      }
    }
    gfx.fillStyle(C.amber, foundryActive ? 0.9 * dim : 0.18 * dim);
    gfx.fillCircle(fnX, ny, 4);

    // CIRCUIT
    const cA = (!foundryActive ? 1.0 : 0.22) * dim;
    gfx.lineStyle(1, C.cyan, cA);
    gfx.strokeCircle(cnX, ny, nr);
    if (!foundryActive) {
      gfx.fillStyle(C.cyan, 0.08);
      gfx.fillCircle(cnX, ny, nr);
      if (!switchReady) {
        gfx.lineStyle(2, C.cyan, 0.8);
        gfx.beginPath();
        gfx.arc(cnX, ny, nr + 4, -Math.PI / 2, -Math.PI / 2 + cdRatio * Math.PI * 2, false);
        gfx.strokePath();
      } else {
        gfx.lineStyle(1, C.cyan, 0.3 + 0.3 * Math.sin(now * 0.005));
        gfx.strokeCircle(cnX, ny, nr + 4);
      }
    }
    gfx.fillStyle(C.cyan, !foundryActive ? 0.9 * dim : 0.18 * dim);
    gfx.fillCircle(cnX, ny, 4);

    const wLabel = foundryActive ? "[Q] FOUNDRY" : "[Q] CIRCUIT";
    const wColor = foundryActive ? C.amberH : C.cyanH;
    // Position is set once in build(); just update text + color here
    this._worldQLabel.setText(wLabel).setColor(wColor).setAlpha(O.dimText);

    // Always-visible dimension name + bonus hint
    const dimName = foundryActive ? "FOUNDRY  ▲DMG  ▲HEAT" : "CIRCUIT  ▲COOL  ▲SPD";
    this._dimensionLabel?.setText(dimName).setColor(wColor);
  }

  // ─── Ability rings ────────────────────────────────────────────────────────

  private _drawAbilityStrip(): void {
    const ctx = this.ctx;
    const gfx = this.abilityHudGfx;
    gfx.clear();

    const ids      = ["nova_burst", "phase_surge", "scrap_shield", "chrono_pulse"] as const;
    const colors   = [C.cyan, 0xcc44ff, C.green, C.amber] as const;
    const labels   = ["NOVA", "SURGE", "SHIELD", "CHRONO"];
    const cooldowns = [8000, 6000, 12000, 16000];
    const now = performance.now();

    for (let i = 0; i < 4; i++) {
      const cx = ABL_SX + i * ABL_SP;
      const cy = ABL_CY;
      const r  = 18;
      const ready     = ctx.abilitySystem.canUse(ids[i]);
      const fillRatio = 1 - ctx.abilitySystem.getCooldownRatio(ids[i]);
      const col       = colors[i];

      // Track
      gfx.lineStyle(2, 0x0c1820, 1);
      gfx.strokeCircle(cx, cy, r);

      if (fillRatio < 1) {
        // Cooldown arc
        gfx.lineStyle(2, 0x1a2a38, 0.7);
        gfx.strokeCircle(cx, cy, r);
        gfx.lineStyle(2, col, 0.65);
        gfx.beginPath();
        gfx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + fillRatio * Math.PI * 2, false);
        gfx.strokePath();
      } else {
        // Ready — slow pulse
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005 + i * 1.2);
        gfx.lineStyle(2, col, 0.45 + pulse * 0.45);
        gfx.strokeCircle(cx, cy, r);
        gfx.fillStyle(col, 0.04 + 0.04 * pulse);
        gfx.fillCircle(cx, cy, r - 1);
      }

      const keyTxt  = this.abilityHudTexts[i * 2];
      const nameTxt = this.abilityHudTexts[i * 2 + 1];
      if (keyTxt) keyTxt.setAlpha(ready ? 1 : 0.28);
      if (nameTxt) {
        if (!ready) {
          const rem = ((1 - fillRatio) * cooldowns[i] / 1000).toFixed(1);
          nameTxt.setText(`${rem}s`).setAlpha(0.38);
        } else {
          nameTxt.setText(labels[i]).setAlpha(0.55);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API — unchanged signatures
  // ─────────────────────────────────────────────────────────────────────────

  showWorldSwitchBanner(newWorld: WorldType): void {
    const scene = this.ctx.scene;
    const isFoundry = newWorld === WorldType.FOUNDRY;
    const label     = isFoundry ? "◈  MACHINE CORE" : "◈  VOID SECTOR";
    const color     = isFoundry ? C.amberH : C.cyanH;
    const tint      = isFoundry ? C.amber   : C.cyan;

    const bar = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 48, tint, 0)
      .setScrollFactor(0).setDepth(202);
    const txt = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, label, {
      fontFamily: UI_MONO, fontSize: FS.lg, color, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0);

    scene.tweens.add({
      targets: bar, fillAlpha: { from: 0, to: 0.22 },
      duration: 80, yoyo: true, hold: 200, onComplete: () => bar.destroy(),
    });
    scene.tweens.add({
      targets: txt, alpha: { from: 0, to: 1 },
      duration: 80, yoyo: true, hold: 220, onComplete: () => txt.destroy(),
    });
  }

  /** Quick warning indicator when boss fires — red pulse near boss position (world-space). */
  showBossAttackWarning(bossX: number, bossY: number): void {
    const scene = this.ctx.scene;
    const ring = scene.add.circle(bossX, bossY, 36, 0xff0000, 0)
      .setDepth(58).setStrokeStyle(3, 0xff2200, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: ring, scaleX: 2.2, scaleY: 2.2, alpha: 0,
      duration: 220, ease: "Quad.easeOut", onComplete: () => ring.destroy(),
    });
  }

  showBossDimensionWarning(world: "FOUNDRY" | "CIRCUIT"): void {
    const scene = this.ctx.scene;
    const label = world === "FOUNDRY" ? "⚙ BOSS → FOUNDRY" : "◈ BOSS → CIRCUIT";
    const color = world === "FOUNDRY" ? "#ff8800" : "#aa44ff";
    const txt = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, label, {
      fontFamily: UI_FONT, fontSize: "18px", color, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(130).setAlpha(0);
    scene.tweens.add({
      targets: txt, alpha: 1, duration: 150,
      onComplete: () => {
        scene.tweens.add({ targets: txt, alpha: 0, y: txt.y - 30, duration: 1000, delay: 600, onComplete: () => txt.destroy() });
      },
    });
  }

  flashReactorBar(): void {
    this._reactorFlashTimer = 900;
    const pct = this.ctx.reactorHp / this.ctx.reactorMaxHp;
    this._reactorLastPct = Math.min(1, pct + 0.07);
  }

  flashReactorCritical(): void {
    this._reactorFlashTimer = 1400;
    const scene = this.ctx.scene;
    scene.tweens.add({
      targets: this._reactorPctText,
      scaleX: 1.4, scaleY: 1.4,
      duration: 100, yoyo: true, ease: "Back.easeOut",
    });
    scene.tweens.add({
      targets: this._reactorLabel,
      scaleX: 1.2, scaleY: 1.2,
      duration: 100, yoyo: true, ease: "Back.easeOut",
    });
  }

  showRepairFeedback(): void {
    const scene = this.ctx.scene;
    const tip = scene.add.text(RCX, RCY - R_OUTER - 12, "+REPAIRED", {
      fontFamily: UI_MONO, fontSize: FS.xs, color: C.greenH,
      stroke: "#001a08", strokeThickness: 3,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(115).setAlpha(0);
    scene.tweens.add({
      targets: tip, alpha: 1, y: tip.y - 12, duration: 250, ease: "Quad.easeOut",
      onComplete: () => scene.tweens.add({
        targets: tip, alpha: 0, y: tip.y - 10, duration: 400, delay: 300,
        onComplete: () => tip.destroy(),
      }),
    });
  }

  /** Flash a reactor state change notification under the reactor arc. */
  showReactorStateFlash(state: 'damaged' | 'critical' | 'repaired'): void {
    const scene = this.ctx.scene;
    const [msg, color] = state === 'repaired'
      ? ["◈ REACTOR STABILIZED", C.greenH]
      : state === 'critical'
      ? ["◈ REACTOR CRITICAL", C.redH]
      : ["◈ REACTOR DAMAGED", C.amberH];
    const txt = scene.add.text(RCX, RCY + R_OUTER + 36, msg, {
      fontFamily: UI_MONO, fontSize: FS.xs, color,
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(108).setAlpha(0);
    scene.tweens.add({
      targets: txt, alpha: 1, duration: 200,
      onComplete: () => scene.tweens.add({ targets: txt, alpha: 0, duration: 400, delay: 1800, onComplete: () => txt.destroy() }),
    });
  }

  drawBreachRings(): void {
    this.breachGfx.clear();
    const now = performance.now();
    for (const agent of ([...this.ctx.guards, ...this.ctx.collectors] as (GuardAgent | CollectorAgent)[])) {
      if (agent.isDead) continue;
      const { isCharging, isActive, isBuildingUp, chargeProgress } = agent.breach;
      if (!isCharging && !isActive && !isBuildingUp) continue;
      const px = agent.posX, py = agent.posY;
      if (isActive) {
        const pulse = Math.sin(now * 0.006) * 0.5 + 0.5;
        this.breachGfx.lineStyle(2 + pulse * 2, 0xff00ff, 0.7 + pulse * 0.3);
        this.breachGfx.strokeCircle(px, py, 28 + pulse * 8);
        this.breachGfx.lineStyle(1, 0xff00ff, 0.25 + pulse * 0.15);
        this.breachGfx.strokeCircle(px, py, 42 + pulse * 12);
      } else if (isCharging) {
        this.breachGfx.lineStyle(1, 0xaa44ff, chargeProgress * 0.7);
        this.breachGfx.strokeCircle(px, py, 50 - chargeProgress * 22);
        this.breachGfx.lineStyle(3, 0xcc88ff, 0.95);
        this.breachGfx.beginPath();
        this.breachGfx.arc(px, py, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeProgress, false);
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
      const fullW = 560;
      this.bossHpBar.width = fullW * pct;
      this.bossHpBar.setFillStyle(pct > 0.6 ? 0xff2200 : pct > 0.3 ? 0xff8800 : pct > 0.15 ? 0xffcc00 : 0xff0044);
      if (this.bossHpGhost) {
        const ghostPct = this.bossHpGhost.width / fullW;
        this.bossHpGhost.width = fullW * Phaser.Math.Linear(ghostPct, pct, 0.08);
        if (this._bossLastPct - pct > 0.05) {
          this.ctx.scene.tweens.add({
            targets: this.bossHpBar, alpha: { from: 0.4, to: 1 }, duration: 220, ease: "Sine.easeOut",
          });
        }
      }
      this._bossLastPct = pct;
    }
  }

  buildBossUI(wave: number, bossName: string): void {
    const scene = this.ctx.scene;
    const bW = 560, bH = 14, bX = GAME_WIDTH / 2 - bW / 2, bY = 68;

    this.bossHpBarBg = scene.add.rectangle(GAME_WIDTH / 2, bY, bW + 6, bH + 6, 0x140000)
      .setScrollFactor(0).setDepth(110).setStrokeStyle(1, 0x882211, 0.8);
    this.bossHpGhost = scene.add.rectangle(bX, bY, bW, bH, 0xffee44)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(110.5).setAlpha(0.45);
    this.bossHpBar = scene.add.rectangle(bX, bY, bW, bH, 0xff2200)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(111);
    this.bossHpPhaseTicks = scene.add.graphics().setScrollFactor(0).setDepth(112);
    this.bossHpPhaseTicks.lineStyle(1, 0xffffff, 0.6);
    [0.6, 0.3, 0.15].forEach(t => {
      const x = bX + bW * t;
      this.bossHpPhaseTicks!.lineBetween(x, bY - bH / 2, x, bY + bH / 2);
    });
    this.bossNameText = scene.add.text(GAME_WIDTH / 2, bY - 18, bossName.toUpperCase(), {
      fontFamily: UI_ORBITRON, fontSize: FS.sm, color: C.redH, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(112);
    this._bossLastPct = 1;
    void wave;
    this._waveIndicator?.setAlpha(0);
    this._waveIndicatorBg?.setAlpha(0);
  }

  destroyBossUI(): void {
    this.bossHpBar?.destroy(); this.bossHpBarBg?.destroy();
    this.bossHpGhost?.destroy(); this.bossHpPhaseTicks?.destroy();
    this.bossNameText?.destroy();
    this.bossHpBar = null; this.bossHpBarBg = null;
    this.bossHpGhost = null; this.bossHpPhaseTicks = null; this.bossNameText = null;
    this._waveIndicator?.setAlpha(1);
    this._waveIndicatorBg?.setAlpha(1);
  }

  dimWorldLegend(): void {
    if (this._legendDimmed) return;
    this._legendDimmed = true;
  }

  destroy(): void {
    this.destroyBossUI();
    this.abilityHudGfx?.destroy();
    this.abilityHudTexts.forEach(t => t.destroy());
    this.abilityHudTexts = [];
    this._worldNodeGfx?.destroy();
    this._reactorGfx?.destroy();
    this.enemyHpGfx?.destroy();
    this._hotZoneLabel?.destroy(); this._hotZoneLabel = null;
  }

  // ─── Tutorial hints ───────────────────────────────────────────────────────

  private _showHint(msg: string, dur = 4500): void {
    if (this.ctx.gameOver) return;
    // Anchor bottom of hint text 28px above the command bar top edge.
    // origin(0.5,1) means the TEXT BOTTOM sits at this Y — the text expands upward.
    // This guarantees multi-line hints never overlap the ability rings regardless of
    // how many lines wordWrap produces.
    const hintBottomY = CMD_Y - 28;
    const tip = this.ctx.scene.add.text(GAME_WIDTH / 2, hintBottomY, msg, {
      fontFamily: UI_MONO, fontSize: FS.xs,
      color: C.softH, backgroundColor: "#02081080",
      padding: { x: 14, y: 8 }, align: "center",
      wordWrap: { width: 680, useAdvancedWrap: true },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(105).setAlpha(0);
    constrainTextBlock(tip, 680, 2, 9);
    this.ctx.scene.tweens.add({ targets: tip, alpha: 1, y: tip.y - 6, duration: 280, ease: "Sine.easeOut" });
    this.ctx.scene.time.delayedCall(dur, () => {
      this.ctx.scene.tweens.add({
        targets: tip, alpha: 0, y: tip.y - 8, duration: 400,
        onComplete: () => tip.destroy(),
      });
    });
  }

  onFirstShot(): void {
    if (this._tutShotShown) return; this._tutShotShown = true;
    this._showHint("WASD / arrows to move  •  Mouse to aim  •  LMB or SPACE to shoot", 4500);
  }
  onFirstDash(): void {
    if (this._tutDashShown) return; this._tutDashShown = true;
    this._showHint("SHIFT or RMB to DASH  •  Rapid fire OVERHEATS weapon — let it cool!", 5000);
  }
  onFirstKill(): void {
    if (this._tutKillShown) return; this._tutKillShown = true;
    this._showHint(
      "First kill! FOUNDRY (amber) — enemies hunt you.  VOID SECTOR (cyan) — enemies hunt the REACTOR. Press Q to switch!",
      6500,
    );
  }
  onFirstScrap(): void {
    if (this._tutScrapShown) return; this._tutScrapShown = true;
    this._showHint("Collect SCRAP ★ from enemies  •  [B] opens SHOP for upgrades", 5500);
  }
  onFirstHeatWarning(): void {
    if (this._tutHeatShown) return; this._tutHeatShown = true;
    this._showHint("⚠ WEAPON HOT — ease off fire before OVERHEAT  •  HOT ZONE gives +25% damage bonus!", 5000);
  }
  onFirstCircuitEnemy(): void {
    if (this._tutCircuitEnemyShown) return; this._tutCircuitEnemyShown = true;
    this._showHint("⚠ CIRCUIT ENEMIES detected — they attack the REACTOR!  Press Q to PHASE-SHIFT into VOID SECTOR.", 6500);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _isAgentInCurrentWorld(agent: AnyAgent): boolean {
    return this.ctx.worldManager.isAgentInCurrentWorld(agent);
  }
  private _compact(value: number): string {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 10000)   return `${Math.floor(value / 1000)}K`;
    return `${value}`;
  }
}
