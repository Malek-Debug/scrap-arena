import Phaser from "phaser";
import { UI_FONT, UI_MONO, UI_ORBITRON, C, FS, drawBrackets } from "../../rendering/UITheme";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

export interface HUDState {
  localPlayerHp: number;
  localPlayerMaxHp: number;
  localPlayerHeat: number;
  abilityCooldown: number;
  abilityName: string;
  score: number;
  kills: number;
  deaths: number;
  matchTimeRemaining: number;
  playerCount: number;
  rank: number;
  connected: boolean;
}

export class MultiplayerHUD {
  private scene: Phaser.Scene;

  // HP bar
  private hpBarBg!: Phaser.GameObjects.Graphics;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;

  // Heat gauge
  private heatBarBg!: Phaser.GameObjects.Graphics;
  private heatBarFill!: Phaser.GameObjects.Graphics;

  // Timer
  private timerBg!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private timerPulsing = false;

  // Score area
  private scoreBg!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private kdText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;

  // Ability
  private abilityBg!: Phaser.GameObjects.Graphics;
  private abilityCooldownGfx!: Phaser.GameObjects.Graphics;
  private abilityLabel!: Phaser.GameObjects.Text;
  private abilityHint!: Phaser.GameObjects.Text;

  // Bottom heat indicator
  private weaponHeatGfx!: Phaser.GameObjects.Graphics;

  // Mini scoreboard
  private miniScoreText!: Phaser.GameObjects.Text;

  // Connection indicator
  private connectionGfx!: Phaser.GameObjects.Graphics;
  private connectionText!: Phaser.GameObjects.Text;

  // Death screen
  private deathContainer: Phaser.GameObjects.Container | null = null;
  private deathCountdownText: Phaser.GameObjects.Text | null = null;

  // Hit marker
  private hitMarkerGfx!: Phaser.GameObjects.Graphics;
  private hitMarkerTimer = 0;

  // Damage indicators
  private damageIndicators: { gfx: Phaser.GameObjects.Graphics; timer: number }[] = [];

  // Kill notification
  private killNotifications: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._createHPBar();
    this._createHeatBar();
    this._createTimer();
    this._createScoreArea();
    this._createAbilityIndicator();
    this._createWeaponHeat();
    this._createMiniScore();
    this._createConnectionIndicator();
    this._createHitMarker();
  }

  update(state: HUDState): void {
    this._updateHP(state.localPlayerHp, state.localPlayerMaxHp);
    this._updateHeat(state.localPlayerHeat);
    this._updateTimer(state.matchTimeRemaining);
    this._updateScore(state.score, state.kills, state.deaths, state.rank);
    this._updateAbility(state.abilityCooldown, state.abilityName);
    this._updateWeaponHeat(state.localPlayerHeat);
    this._updateConnection(state.connected);
    this._updateHitMarker();
    this._updateDamageIndicators();
  }

  showHitMarker(): void {
    this.hitMarkerTimer = 180;
  }

  showDamageIndicator(angle: number): void {
    const gfx = this.scene.add.graphics().setDepth(230).setScrollFactor(0);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const dist = 120;

    gfx.fillStyle(0xff2200, 0.7);
    // Draw a wedge pointing inward
    const spread = 0.3;
    const innerDist = dist - 30;
    const outerDist = dist + 20;
    gfx.beginPath();
    gfx.moveTo(cx + Math.cos(angle - spread) * outerDist, cy + Math.sin(angle - spread) * outerDist);
    gfx.lineTo(cx + Math.cos(angle) * innerDist, cy + Math.sin(angle) * innerDist);
    gfx.lineTo(cx + Math.cos(angle + spread) * outerDist, cy + Math.sin(angle + spread) * outerDist);
    gfx.closePath();
    gfx.fillPath();

    this.damageIndicators.push({ gfx, timer: 600 });

    // Red screen edge flash
    const flash = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.12)
      .setDepth(225).setScrollFactor(0);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
  }

  showKillNotification(victimName: string): void {
    const text = this.scene.add.text(GAME_WIDTH + 50, GAME_HEIGHT / 2 - 40, `ELIMINATED  ${victimName}`, {
      fontFamily: UI_FONT,
      fontSize: FS.lg,
      color: "#ff6600",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(240).setScrollFactor(0);

    text.setShadow(0, 0, "#ff6600", 10, true, true);

    this.scene.tweens.add({
      targets: text,
      x: GAME_WIDTH / 2,
      duration: 300,
      ease: "Back.easeOut",
      onComplete: () => {
        this.scene.time.delayedCall(2000, () => {
          this.scene.tweens.add({
            targets: text,
            alpha: 0,
            y: text.y - 20,
            duration: 400,
            onComplete: () => text.destroy(),
          });
        });
      },
    });

    this.killNotifications.push(text);
  }

  showDeathScreen(respawnTime: number): void {
    if (this.deathContainer) return;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.deathContainer = this.scene.add.container(0, 0)
      .setDepth(260).setScrollFactor(0).setAlpha(0);

    const veil = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    this.deathContainer.add(veil);

    // Red border flash
    const borderGfx = this.scene.add.graphics();
    borderGfx.lineStyle(4, 0xff2200, 0.8);
    borderGfx.strokeRect(4, 4, GAME_WIDTH - 8, GAME_HEIGHT - 8);
    this.deathContainer.add(borderGfx);

    const destroyedText = this.scene.add.text(cx, cy - 40, "DESTROYED", {
      fontFamily: UI_ORBITRON,
      fontSize: "48px",
      color: "#ff2200",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);
    destroyedText.setShadow(0, 0, "#ff0000", 20, true, true);
    this.deathContainer.add(destroyedText);

    this.deathCountdownText = this.scene.add.text(cx, cy + 30, `Respawning in ${Math.ceil(respawnTime / 1000)}...`, {
      fontFamily: UI_MONO,
      fontSize: FS.lg,
      color: C.mutedH,
    }).setOrigin(0.5);
    this.deathContainer.add(this.deathCountdownText);

    this.scene.tweens.add({
      targets: this.deathContainer,
      alpha: 1,
      duration: 300,
    });

    // Countdown update
    let remaining = respawnTime;
    const timer = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        remaining -= 100;
        if (remaining <= 0) {
          timer.destroy();
          return;
        }
        if (this.deathCountdownText) {
          this.deathCountdownText.setText(`Respawning in ${Math.ceil(remaining / 1000)}...`);
        }
      },
    });
  }

  hideDeathScreen(): void {
    if (!this.deathContainer) return;
    this.scene.tweens.add({
      targets: this.deathContainer,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        this.deathContainer?.destroy(true);
        this.deathContainer = null;
        this.deathCountdownText = null;
      },
    });
  }

  destroy(): void {
    this.hpBarBg.destroy();
    this.hpBarFill.destroy();
    this.hpText.destroy();
    this.heatBarBg.destroy();
    this.heatBarFill.destroy();
    this.timerBg.destroy();
    this.timerText.destroy();
    this.scoreBg.destroy();
    this.scoreText.destroy();
    this.kdText.destroy();
    this.rankText.destroy();
    this.abilityBg.destroy();
    this.abilityCooldownGfx.destroy();
    this.abilityLabel.destroy();
    this.abilityHint.destroy();
    this.weaponHeatGfx.destroy();
    this.miniScoreText.destroy();
    this.connectionGfx.destroy();
    this.connectionText.destroy();
    this.hitMarkerGfx.destroy();
    this.deathContainer?.destroy(true);
    for (const di of this.damageIndicators) di.gfx.destroy();
    for (const kn of this.killNotifications) kn.destroy();
    this.damageIndicators = [];
    this.killNotifications = [];
  }

  // ── Creation methods ────────────────────────────────────────────────────────

  private _createHPBar(): void {
    const x = 20, y = 18, w = 220, h = 20;

    this.hpBarBg = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
    this.hpBarBg.fillStyle(0x020810, 0.85);
    this.hpBarBg.fillRoundedRect(x, y, w, h, 3);
    this.hpBarBg.lineStyle(1, C.cyan, 0.4);
    this.hpBarBg.strokeRoundedRect(x, y, w, h, 3);
    // Segment lines
    const segments = 10;
    this.hpBarBg.lineStyle(1, 0x020810, 0.7);
    for (let i = 1; i < segments; i++) {
      const sx = x + (w / segments) * i;
      this.hpBarBg.lineBetween(sx, y + 2, sx, y + h - 2);
    }

    this.hpBarFill = this.scene.add.graphics().setDepth(201).setScrollFactor(0);
    this.hpText = this.scene.add.text(x + w + 8, y + h / 2, "100", {
      fontFamily: UI_MONO,
      fontSize: FS.sm,
      color: C.greenH,
      fontStyle: "bold",
    }).setOrigin(0, 0.5).setDepth(202).setScrollFactor(0);
  }

  private _createHeatBar(): void {
    const x = 20, y = 42, w = 160, h = 10;

    this.heatBarBg = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
    this.heatBarBg.fillStyle(0x020810, 0.75);
    this.heatBarBg.fillRoundedRect(x, y, w, h, 2);
    this.heatBarBg.lineStyle(1, 0xff6600, 0.25);
    this.heatBarBg.strokeRoundedRect(x, y, w, h, 2);

    this.heatBarFill = this.scene.add.graphics().setDepth(201).setScrollFactor(0);
  }

  private _createTimer(): void {
    const cx = GAME_WIDTH / 2;
    const y = 12;
    const w = 120, h = 34;

    this.timerBg = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
    this.timerBg.fillStyle(C.ink, 0.88);
    this.timerBg.fillRoundedRect(cx - w / 2, y, w, h, 5);
    this.timerBg.lineStyle(1, C.cyan, 0.35);
    this.timerBg.strokeRoundedRect(cx - w / 2, y, w, h, 5);
    // Top accent
    this.timerBg.lineStyle(2, C.cyan, 0.7);
    this.timerBg.lineBetween(cx - 30, y, cx + 30, y);

    this.timerText = this.scene.add.text(cx, y + h / 2, "5:00", {
      fontFamily: UI_MONO,
      fontSize: "20px",
      color: C.cyanH,
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
  }

  private _createScoreArea(): void {
    const x = GAME_WIDTH - 180, y = 14, w = 168, h = 50;

    this.scoreBg = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
    this.scoreBg.fillStyle(C.ink, 0.8);
    this.scoreBg.fillRoundedRect(x, y, w, h, 4);
    this.scoreBg.lineStyle(1, C.amber, 0.3);
    this.scoreBg.strokeRoundedRect(x, y, w, h, 4);
    drawBrackets(this.scoreBg, x, y, w, h, C.amber, 0.5, 8);

    this.scoreText = this.scene.add.text(x + 10, y + 8, "SCORE: 0", {
      fontFamily: UI_MONO,
      fontSize: FS.md,
      color: C.amberH,
      fontStyle: "bold",
    }).setDepth(202).setScrollFactor(0);

    this.kdText = this.scene.add.text(x + 10, y + 26, "K: 0  D: 0", {
      fontFamily: UI_MONO,
      fontSize: FS.xs,
      color: C.mutedH,
    }).setDepth(202).setScrollFactor(0);

    this.rankText = this.scene.add.text(x + w - 10, y + 14, "#1", {
      fontFamily: UI_ORBITRON,
      fontSize: "18px",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(1, 0).setDepth(202).setScrollFactor(0);
  }

  private _createAbilityIndicator(): void {
    const x = 24, y = GAME_HEIGHT - 76;
    const size = 50;

    this.abilityBg = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
    this.abilityBg.fillStyle(C.ink, 0.85);
    this.abilityBg.fillRoundedRect(x, y, size, size, 6);
    this.abilityBg.lineStyle(1.5, C.cyan, 0.45);
    this.abilityBg.strokeRoundedRect(x, y, size, size, 6);

    this.abilityCooldownGfx = this.scene.add.graphics().setDepth(201).setScrollFactor(0);

    this.abilityLabel = this.scene.add.text(x + size / 2, y + size / 2, "E", {
      fontFamily: UI_ORBITRON,
      fontSize: "18px",
      color: C.cyanH,
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(203).setScrollFactor(0);

    this.abilityHint = this.scene.add.text(x + size / 2, y + size + 6, "READY", {
      fontFamily: UI_MONO,
      fontSize: FS.xs,
      color: C.greenH,
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
  }

  private _createWeaponHeat(): void {
    this.weaponHeatGfx = this.scene.add.graphics().setDepth(200).setScrollFactor(0);
  }

  private _createMiniScore(): void {
    this.miniScoreText = this.scene.add.text(GAME_WIDTH - 14, GAME_HEIGHT - 20, "", {
      fontFamily: UI_MONO,
      fontSize: FS.xs,
      color: C.mutedH,
      align: "right",
    }).setOrigin(1, 1).setDepth(200).setScrollFactor(0);
  }

  private _createConnectionIndicator(): void {
    this.connectionGfx = this.scene.add.graphics().setDepth(250).setScrollFactor(0);
    this.connectionText = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, "CONNECTION LOST", {
      fontFamily: UI_MONO,
      fontSize: FS.sm,
      color: "#ff4444",
      fontStyle: "bold",
      backgroundColor: "#000000cc",
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(251).setScrollFactor(0).setAlpha(0);
  }

  private _createHitMarker(): void {
    this.hitMarkerGfx = this.scene.add.graphics().setDepth(240).setScrollFactor(0);
  }

  // ── Update methods ────────────────────────────────────────────────────────

  private _updateHP(hp: number, maxHp: number): void {
    const x = 20, y = 18, w = 220, h = 20;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));

    this.hpBarFill.clear();
    if (ratio > 0) {
      const fillW = Math.round(w * ratio) - 4;
      let color: number;
      if (ratio > 0.6) color = 0x00ff88;
      else if (ratio > 0.3) color = 0xffcc00;
      else color = 0xff2200;

      this.hpBarFill.fillStyle(color, 0.9);
      this.hpBarFill.fillRoundedRect(x + 2, y + 2, fillW, h - 4, 2);

      // Glow at low HP
      if (ratio < 0.3) {
        this.hpBarFill.fillStyle(0xff0000, 0.15 + Math.sin(Date.now() * 0.006) * 0.1);
        this.hpBarFill.fillRoundedRect(x, y, w, h, 3);
      }
    }

    const hpColor = ratio > 0.6 ? C.greenH : ratio > 0.3 ? "#ffcc00" : "#ff2200";
    this.hpText.setText(`${Math.ceil(hp)}`).setColor(hpColor);
  }

  private _updateHeat(heat: number): void {
    const x = 20, y = 42, w = 160, h = 10;
    const ratio = Math.max(0, Math.min(1, heat / 100));

    this.heatBarFill.clear();
    if (ratio > 0) {
      const fillW = Math.round(w * ratio) - 2;
      const color = ratio > 0.75 ? 0xff2200 : 0xff6600;
      this.heatBarFill.fillStyle(color, 0.85);
      this.heatBarFill.fillRoundedRect(x + 1, y + 1, fillW, h - 2, 1);

      // Glow when overheating
      if (ratio > 0.75) {
        const pulse = 0.3 + Math.sin(Date.now() * 0.008) * 0.2;
        this.heatBarFill.fillStyle(0xff4400, pulse);
        this.heatBarFill.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 3);
      }
    }
  }

  private _updateTimer(secondsRemaining: number): void {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = Math.floor(secondsRemaining % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    this.timerText.setText(timeStr);

    if (secondsRemaining <= 30 && !this.timerPulsing) {
      this.timerPulsing = true;
      this.timerText.setColor("#ff4444");
      this.scene.tweens.add({
        targets: this.timerText,
        scaleX: { from: 1, to: 1.1 },
        scaleY: { from: 1, to: 1.1 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else if (secondsRemaining > 30 && this.timerPulsing) {
      this.timerPulsing = false;
      this.scene.tweens.killTweensOf(this.timerText);
      this.timerText.setScale(1).setColor(C.cyanH);
    }
  }

  private _updateScore(score: number, kills: number, deaths: number, rank: number): void {
    this.scoreText.setText(`SCORE: ${score}`);
    this.kdText.setText(`K: ${kills}  D: ${deaths}`);

    const rankColors = ["#ffcc00", "#cccccc", "#cc8844", "#888888"];
    this.rankText.setText(`#${rank}`).setColor(rankColors[rank - 1] || "#888888");
  }

  private _updateAbility(cooldown: number, _name: string): void {
    const x = 24, y = GAME_HEIGHT - 76;
    const size = 50;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const radius = 20;

    this.abilityCooldownGfx.clear();

    if (cooldown > 0) {
      // Draw cooldown sweep (clock-like fill from top)
      this.abilityCooldownGfx.fillStyle(0x000000, 0.6);
      this.abilityCooldownGfx.fillRoundedRect(x + 2, y + 2, size - 4, size - 4, 4);

      const angle = cooldown * Math.PI * 2;
      const startAngle = -Math.PI / 2;
      this.abilityCooldownGfx.fillStyle(C.cyan, 0.25);
      this.abilityCooldownGfx.beginPath();
      this.abilityCooldownGfx.moveTo(cx, cy);
      this.abilityCooldownGfx.arc(cx, cy, radius, startAngle, startAngle + angle, false);
      this.abilityCooldownGfx.closePath();
      this.abilityCooldownGfx.fillPath();

      this.abilityLabel.setColor(C.mutedH);
      this.abilityHint.setText(`${Math.ceil(cooldown * 18)}s`).setColor(C.mutedH);
    } else {
      this.abilityLabel.setColor(C.cyanH);
      this.abilityHint.setText("READY").setColor(C.greenH);

      // Ready pulse
      const pulse = 0.4 + Math.sin(Date.now() * 0.004) * 0.2;
      this.abilityCooldownGfx.lineStyle(2, C.cyan, pulse);
      this.abilityCooldownGfx.strokeRoundedRect(x - 1, y - 1, size + 2, size + 2, 7);
    }
  }

  private _updateWeaponHeat(heat: number): void {
    const cx = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 24;
    const w = 200, h = 6;
    const ratio = Math.max(0, Math.min(1, heat / 100));

    this.weaponHeatGfx.clear();

    // Background bar
    this.weaponHeatGfx.fillStyle(0x020810, 0.7);
    this.weaponHeatGfx.fillRoundedRect(cx - w / 2, y, w, h, 2);
    this.weaponHeatGfx.lineStyle(1, 0xff6600, 0.2);
    this.weaponHeatGfx.strokeRoundedRect(cx - w / 2, y, w, h, 2);

    // Fill
    if (ratio > 0) {
      const fillW = Math.round(w * ratio) - 2;
      const color = ratio > 0.85 ? 0xff2200 : 0xff6600;
      this.weaponHeatGfx.fillStyle(color, 0.8);
      this.weaponHeatGfx.fillRoundedRect(cx - w / 2 + 1, y + 1, fillW, h - 2, 1);
    }
  }

  private _updateConnection(connected: boolean): void {
    if (!connected) {
      this.connectionText.setAlpha(1);
      const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.4;
      this.connectionText.setAlpha(pulse);
    } else {
      this.connectionText.setAlpha(0);
    }
  }

  private _updateHitMarker(): void {
    this.hitMarkerGfx.clear();
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= 16; // ~60fps
      const alpha = this.hitMarkerTimer / 180;
      const cx = GAME_WIDTH / 2;
      const cy = GAME_HEIGHT / 2;
      const size = 12;
      const gap = 4;

      this.hitMarkerGfx.lineStyle(2, 0xffffff, alpha);
      // Cross pattern
      this.hitMarkerGfx.lineBetween(cx - size, cy - size, cx - gap, cy - gap);
      this.hitMarkerGfx.lineBetween(cx + gap, cy - gap, cx + size, cy - size);
      this.hitMarkerGfx.lineBetween(cx - size, cy + size, cx - gap, cy + gap);
      this.hitMarkerGfx.lineBetween(cx + gap, cy + gap, cx + size, cy + size);
    }
  }

  private _updateDamageIndicators(): void {
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const di = this.damageIndicators[i];
      di.timer -= 16;
      if (di.timer <= 0) {
        di.gfx.destroy();
        this.damageIndicators.splice(i, 1);
      } else {
        di.gfx.setAlpha(di.timer / 600);
      }
    }
  }
}
