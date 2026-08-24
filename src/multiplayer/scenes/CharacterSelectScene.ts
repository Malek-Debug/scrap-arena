import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../core";
import { UI_FONT, UI_MONO, UI_ORBITRON, UI_OXANIUM, drawPanel } from "../../rendering/UITheme";
import { AudioManager } from "../../audio/AudioManager";
import type { NetworkClient } from "../network/NetworkClient";

const BG = 0x080412;

interface CharacterDef {
  id: string;
  name: string;
  role: string;
  color: number;
  colorHex: string;
  hp: number;
  speed: number;
  damage: number;
  abilityName: string;
  abilityDesc: string;
  description: string;
}

const CHARACTERS: CharacterDef[] = [
  {
    id: "assault", name: "WRECKER", role: "ASSAULT",
    color: 0xff6600, colorHex: "#ff6600",
    hp: 100, speed: 70, damage: 95,
    abilityName: "OVERDRIVE",
    abilityDesc: "+50% fire rate for 5 seconds",
    description: "Heavy weapons platform built for raw damage output. Overdrive supercharges its weapon systems.",
  },
  {
    id: "sentinel", name: "BASTION", role: "SENTINEL",
    color: 0x3388ff, colorHex: "#3388ff",
    hp: 140, speed: 55, damage: 65,
    abilityName: "ENERGY SHIELD",
    abilityDesc: "Absorbs 100 damage for 4 seconds",
    description: "Armored defense unit with reinforced plating. Deploys an energy barrier to absorb incoming fire.",
  },
  {
    id: "phantom", name: "SPECTRE", role: "PHANTOM",
    color: 0xcc44ff, colorHex: "#cc44ff",
    hp: 80, speed: 95, damage: 75,
    abilityName: "PHASE DASH",
    abilityDesc: "Teleport forward, 0.5s invulnerability",
    description: "High-speed infiltrator that phases through reality. Phase Dash makes it untouchable for a moment.",
  },
  {
    id: "engineer", name: "FORGE", role: "ENGINEER",
    color: 0x00ff88, colorHex: "#00ff88",
    hp: 110, speed: 70, damage: 70,
    abilityName: "REPAIR DRONE",
    abilityDesc: "Heals 5 HP/sec for 6 seconds",
    description: "Tactical support machine with self-repair capability. Repair Drone restores hull integrity over time.",
  },
];

export class CharacterSelectScene extends Phaser.Scene {
  private selectedIndex = 0;
  private charCards: Phaser.GameObjects.Container[] = [];
  private detailPanel: Phaser.GameObjects.Container | null = null;
  private standalone = false;
  private networkClient: NetworkClient | null = null;

  constructor() {
    super({ key: "CharacterSelect" });
  }

  init(data: { standalone?: boolean }): void {
    this.standalone = data?.standalone ?? false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.fadeIn(400, 0, 0, 0);
    AudioManager.instance.setScene(this);
    this.networkClient = this.registry.get("networkClient") as NetworkClient | null;

    this.selectedIndex = 0;
    this.charCards = [];

    const cx = GAME_WIDTH / 2;

    this._drawBackground();
    this._drawHeader(cx);
    this._drawCharacterCards(cx);
    this._drawDetailPanel(cx);
    this._drawButtons(cx);

    this._updateSelection();
  }

  private _drawBackground(): void {
    const bg = this.add.graphics().setDepth(-10);
    bg.fillStyle(BG, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const grid = this.add.graphics().setDepth(-9).setAlpha(0.05);
    for (let x = 0; x <= GAME_WIDTH; x += 40) {
      grid.lineStyle(1, 0x1a0e2a, 1);
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 40) {
      grid.lineStyle(1, 0x1a0e2a, 1);
      grid.lineBetween(0, y, GAME_WIDTH, y);
    }
  }

  private _drawHeader(cx: number): void {
    this.add.text(cx, 36, "SELECT YOUR MACHINE", {
      fontFamily: UI_ORBITRON, fontSize: "30px", color: "#ff7a18", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 2, color: "#ff4400", blur: 14, fill: true },
    }).setOrigin(0.5).setDepth(10);

    const sep = this.add.graphics().setDepth(10);
    sep.lineStyle(1, 0xff6600, 0.5);
    sep.lineBetween(cx - 200, 60, cx + 200, 60);
  }

  private _drawCharacterCards(cx: number): void {
    const cardW = 140;
    const cardH = 180;
    const gap = 20;
    const totalW = CHARACTERS.length * cardW + (CHARACTERS.length - 1) * gap;
    const startX = cx - totalW / 2;
    const cardY = 100;

    CHARACTERS.forEach((char, i) => {
      const x = startX + i * (cardW + gap);
      const container = this.add.container(x, cardY).setDepth(10);

      const bg = this.add.graphics();
      container.add(bg);

      // Character icon (stylized circle)
      const icon = this.add.graphics();
      icon.fillStyle(char.color, 0.3);
      icon.fillCircle(cardW / 2, 60, 35);
      icon.lineStyle(2, char.color, 0.8);
      icon.strokeCircle(cardW / 2, 60, 35);
      // Inner detail
      icon.fillStyle(char.color, 0.6);
      icon.fillCircle(cardW / 2, 60, 12);
      container.add(icon);

      const name = this.add.text(cardW / 2, 110, char.name, {
        fontFamily: UI_OXANIUM, fontSize: "14px", color: char.colorHex, fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5);
      container.add(name);

      const role = this.add.text(cardW / 2, 130, char.role, {
        fontFamily: UI_MONO, fontSize: "10px", color: "#888877",
      }).setOrigin(0.5);
      container.add(role);

      // Stat bars
      this._drawMiniBar(container, 20, 148, 100, char.hp / 140, char.color);
      this._drawMiniBar(container, 20, 160, 100, char.speed / 100, char.color);
      this._drawMiniBar(container, 20, 172, 100, char.damage / 100, char.color);

      // Interactivity
      const hit = this.add.zone(cardW / 2, cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => { this.selectedIndex = i; this._updateSelection(); });
      container.add(hit);

      this.charCards.push(container);
    });
  }

  private _drawMiniBar(container: Phaser.GameObjects.Container, x: number, y: number, w: number, fill: number, color: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a1a1a, 0.8);
    gfx.fillRect(x, y, w, 6);
    gfx.fillStyle(color, 0.8);
    gfx.fillRect(x, y, w * fill, 6);
    gfx.lineStyle(1, color, 0.3);
    gfx.strokeRect(x, y, w, 6);
    container.add(gfx);
  }

  private _drawDetailPanel(cx: number): void {
    const panelY = 300;
    const panelW = 600;
    const panelH = 200;

    this.detailPanel = this.add.container(cx - panelW / 2, panelY).setDepth(10);

    const bg = this.add.graphics();
    drawPanel(bg, 0, 0, panelW, panelH, 0xff6600);
    this.detailPanel.add(bg);

    // Placeholder texts - updated in _updateSelection
    const charName = this.add.text(panelW / 2, 24, "", {
      fontFamily: UI_ORBITRON, fontSize: "24px", color: "#ffffff", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setName("detailName");
    this.detailPanel.add(charName);

    const charRole = this.add.text(panelW / 2, 50, "", {
      fontFamily: UI_MONO, fontSize: "12px", color: "#888877",
    }).setOrigin(0.5).setName("detailRole");
    this.detailPanel.add(charRole);

    const charDesc = this.add.text(panelW / 2, 80, "", {
      fontFamily: UI_FONT, fontSize: "13px", color: "#ccccaa", align: "center",
      wordWrap: { width: 500, useAdvancedWrap: true },
    }).setOrigin(0.5, 0).setName("detailDesc");
    this.detailPanel.add(charDesc);

    const abilityName = this.add.text(30, 130, "", {
      fontFamily: UI_OXANIUM, fontSize: "14px", color: "#00ff88", fontStyle: "bold",
    }).setName("detailAbilityName");
    this.detailPanel.add(abilityName);

    const abilityDesc = this.add.text(30, 150, "", {
      fontFamily: UI_FONT, fontSize: "12px", color: "#88ccaa",
    }).setName("detailAbilityDesc");
    this.detailPanel.add(abilityDesc);

    // Stat labels on the right
    const statX = panelW - 180;
    const labels = ["HP", "SPEED", "DAMAGE"];
    labels.forEach((label, i) => {
      this.detailPanel!.add(this.add.text(statX, 125 + i * 22, label, {
        fontFamily: UI_MONO, fontSize: "10px", color: "#777766",
      }));
    });

    // Stat bars (will be redrawn)
    const statBars = this.add.graphics().setName("detailStatBars");
    this.detailPanel.add(statBars);
  }

  private _drawButtons(cx: number): void {
    const btnY = 530;

    // Confirm button
    this._createButton(cx, btnY, 220, 48, "CONFIRM", 0x00ff88, "#00ff88", () => this._confirm());

    // Back button
    this._createButton(cx, btnY + 65, 140, 36, "BACK", 0xff4444, "#ff4444", () => this._goBack());
  }

  private _createButton(x: number, y: number, w: number, h: number, label: string, color: number, colorHex: string, onClick: () => void): void {
    const bg = this.add.graphics().setDepth(10);
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? color : 0x0a0518, hover ? 0.2 : 0.8);
      bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      bg.lineStyle(2, color, hover ? 1 : 0.6);
      bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    };
    drawBg(false);

    const txt = this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: "16px", color: colorHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    const hit = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(12);
    hit.on("pointerover", () => { drawBg(true); txt.setColor("#ffffff"); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(colorHex); });
    hit.on("pointerdown", onClick);
  }

  private _updateSelection(): void {
    const char = CHARACTERS[this.selectedIndex];

    // Update card highlights
    this.charCards.forEach((card, i) => {
      const bg = card.list[0] as Phaser.GameObjects.Graphics;
      const c = CHARACTERS[i];
      bg.clear();
      if (i === this.selectedIndex) {
        bg.fillStyle(c.color, 0.15);
        bg.fillRoundedRect(0, 0, 140, 180, 8);
        bg.lineStyle(2, c.color, 0.9);
        bg.strokeRoundedRect(0, 0, 140, 180, 8);
        // Glow
        bg.lineStyle(4, c.color, 0.3);
        bg.strokeRoundedRect(-4, -4, 148, 188, 10);
      } else {
        bg.fillStyle(0x0a0518, 0.7);
        bg.fillRoundedRect(0, 0, 140, 180, 8);
        bg.lineStyle(1, c.color, 0.3);
        bg.strokeRoundedRect(0, 0, 140, 180, 8);
      }
    });

    // Update detail panel
    if (!this.detailPanel) return;
    const nameText = this.detailPanel.getByName("detailName") as Phaser.GameObjects.Text;
    const roleText = this.detailPanel.getByName("detailRole") as Phaser.GameObjects.Text;
    const descText = this.detailPanel.getByName("detailDesc") as Phaser.GameObjects.Text;
    const abilityNameText = this.detailPanel.getByName("detailAbilityName") as Phaser.GameObjects.Text;
    const abilityDescText = this.detailPanel.getByName("detailAbilityDesc") as Phaser.GameObjects.Text;
    const statBars = this.detailPanel.getByName("detailStatBars") as Phaser.GameObjects.Graphics;

    if (nameText) nameText.setText(char.name).setColor(char.colorHex);
    if (roleText) roleText.setText(char.role);
    if (descText) descText.setText(char.description);
    if (abilityNameText) abilityNameText.setText(`[E] ${char.abilityName}`);
    if (abilityDescText) abilityDescText.setText(char.abilityDesc);

    if (statBars) {
      statBars.clear();
      const panelW = 600;
      const statX = panelW - 110;
      const barW = 80;
      const stats = [char.hp / 140, char.speed / 100, char.damage / 100];
      stats.forEach((fill, i) => {
        const by = 125 + i * 22;
        statBars.fillStyle(0x1a1a1a, 0.8);
        statBars.fillRect(statX, by, barW, 10);
        statBars.fillStyle(char.color, 0.9);
        statBars.fillRect(statX, by, barW * fill, 10);
        statBars.lineStyle(1, char.color, 0.4);
        statBars.strokeRect(statX, by, barW, 10);
      });
    }
  }

  private _confirm(): void {
    const char = CHARACTERS[this.selectedIndex];
    this.registry.set("selectedCharacter", char.id);

    if (this.networkClient && this.networkClient.state === "connected") {
      this.networkClient.selectCharacter(char.id);
    }

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.standalone) {
        this.scene.start("MultiplayerMenu");
      } else {
        this.scene.start("LobbyScene");
      }
    });
  }

  private _goBack(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.standalone) {
        this.scene.start("MultiplayerMenu");
      } else {
        this.scene.start("LobbyScene");
      }
    });
  }
}
