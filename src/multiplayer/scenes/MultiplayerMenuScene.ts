import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../core";
import { UI_FONT, UI_MONO, UI_ORBITRON, UI_OXANIUM, drawPanel } from "../../rendering/UITheme";
import { AudioManager } from "../../audio/AudioManager";
import type { NetworkClient, ConnectionState } from "../network/NetworkClient";
import type { ServerMessage, S2C_Error } from "../network/NetworkMessages";

const BG = 0x080412;
const ACCENT = 0xff6600;
const ACCENT_HEX = "#ff6600";
const TEAL = 0x00ff88;
const TEAL_HEX = "#00ff88";

export class MultiplayerMenuScene extends Phaser.Scene {
  private joinInput: Phaser.GameObjects.Text | null = null;
  private joinCode = "";
  private joinMode = false;
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: "MultiplayerMenu" });
  }

  create(): void {
    this.joinMode = false;
    this.joinCode = "";
    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.fadeIn(400, 0, 0, 0);

    AudioManager.instance.setScene(this);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this._drawBackground(cx, cy);
    this._drawTitle(cx);
    this._drawButtons(cx, cy);
    this._drawFooter(cx);

    this.statusText = this.add.text(cx, GAME_HEIGHT - 100, "", {
      fontFamily: UI_FONT, fontSize: "13px", color: "#ff4444",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
  }

  private _drawBackground(cx: number, cy: number): void {
    const bg = this.add.graphics().setDepth(-10);
    bg.fillStyle(BG, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Grid
    const grid = this.add.graphics().setDepth(-9).setAlpha(0.08);
    for (let x = 0; x <= GAME_WIDTH; x += 64) {
      grid.lineStyle(1, 0x1a0e2a, 1);
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 64) {
      grid.lineStyle(1, 0x1a0e2a, 1);
      grid.lineBetween(0, y, GAME_WIDTH, y);
    }

    // Frame
    const frame = this.add.graphics().setDepth(1);
    frame.lineStyle(2, ACCENT, 0.4);
    frame.strokeRect(16, 16, GAME_WIDTH - 32, GAME_HEIGHT - 32);
    frame.lineStyle(1, TEAL, 0.15);
    frame.strokeRect(22, 22, GAME_WIDTH - 44, GAME_HEIGHT - 44);

    // Corner accents
    const cornerSize = 20;
    frame.lineStyle(3, ACCENT, 0.8);
    [[16, 16], [GAME_WIDTH - 16 - cornerSize, 16], [16, GAME_HEIGHT - 16 - cornerSize], [GAME_WIDTH - 16 - cornerSize, GAME_HEIGHT - 16 - cornerSize]]
      .forEach(([bx, by]) => frame.strokeRect(bx, by, cornerSize, cornerSize));

    // Center glow
    const glow = this.add.graphics().setDepth(-8).setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(ACCENT, 0.03);
    glow.fillCircle(cx, cy, 300);
    glow.fillStyle(TEAL, 0.02);
    glow.fillCircle(cx, cy - 50, 150);
  }

  private _drawTitle(cx: number): void {
    const title = this.add.text(cx, 70, "MULTIPLAYER", {
      fontFamily: UI_ORBITRON,
      fontSize: "52px", color: ACCENT_HEX, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 4, color: "#ff4400", blur: 20, fill: true },
    }).setOrigin(0.5).setDepth(10).setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 600, ease: "Back.easeOut" });

    const subtitle = this.add.text(cx, 116, "S C R A P   A R E N A", {
      fontFamily: UI_OXANIUM,
      fontSize: "14px", color: TEAL_HEX,
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 12, fill: true },
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 400, delay: 300 });

    // Separator
    const sep = this.add.graphics().setDepth(10).setAlpha(0);
    sep.lineStyle(2, ACCENT, 0.6);
    sep.lineBetween(cx - 200, 140, cx + 200, 140);
    sep.fillStyle(TEAL, 0.8);
    sep.fillCircle(cx, 140, 3);
    this.tweens.add({ targets: sep, alpha: 1, duration: 400, delay: 400 });
  }

  private _drawButtons(cx: number, _cy: number): void {
    const buttons = [
      { label: "QUICK MATCH", icon: "⚡", action: () => this._quickMatch() },
      { label: "CREATE MATCH", icon: "＋", action: () => this._createMatch() },
      { label: "JOIN MATCH", icon: "→", action: () => this._showJoinInput() },
      { label: "CHARACTER", icon: "◆", action: () => this._goCharacterSelect() },
      { label: "BACK", icon: "←", action: () => this._goBack() },
    ];

    const startY = 180;
    const gap = 62;

    buttons.forEach((btn, i) => {
      this._createMenuButton(cx, startY + i * gap, btn.label, btn.icon, 200 + i * 80, btn.action);
    });
  }

  private _createMenuButton(x: number, y: number, label: string, icon: string, delay: number, onClick: () => void): void {
    const W = 340, H = 50;
    const bg = this.add.graphics().setDepth(10).setAlpha(0);
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? ACCENT : 0x0a0518, hover ? 0.2 : 0.7);
      bg.fillRoundedRect(x - W / 2, y - H / 2, W, H, 6);
      bg.lineStyle(2, hover ? 0xffffff : ACCENT, hover ? 0.9 : 0.5);
      bg.strokeRoundedRect(x - W / 2, y - H / 2, W, H, 6);
      bg.fillStyle(hover ? TEAL : ACCENT, hover ? 0.9 : 0.4);
      bg.fillRect(x - W / 2, y - H / 2 + 6, 3, H - 12);
    };
    drawBg(false);

    const iconText = this.add.text(x - W / 2 + 24, y, icon, {
      fontFamily: UI_MONO, fontSize: "18px", color: ACCENT_HEX, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(11).setAlpha(0);

    const labelText = this.add.text(x - W / 2 + 50, y, label, {
      fontFamily: UI_FONT, fontSize: "18px", color: ACCENT_HEX, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(11).setAlpha(0);

    const hit = this.add.zone(x, y, W, H).setInteractive({ useHandCursor: true }).setDepth(12);
    hit.on("pointerover", () => { drawBg(true); labelText.setColor("#ffffff"); iconText.setColor(TEAL_HEX); });
    hit.on("pointerout", () => { drawBg(false); labelText.setColor(ACCENT_HEX); iconText.setColor(ACCENT_HEX); });
    hit.on("pointerdown", () => { hit.disableInteractive(); onClick(); });

    this.tweens.add({ targets: [bg, iconText, labelText], alpha: 1, duration: 350, delay });
  }

  private _drawFooter(cx: number): void {
    this.add.text(cx, GAME_HEIGHT - 30, "GAMEDEV.JS JAM 2026  •  MULTIPLAYER ARENA", {
      fontFamily: UI_MONO, fontSize: "10px", color: "#443322",
    }).setOrigin(0.5).setDepth(10).setAlpha(0.6);
  }

  private _getNetworkClient(): NetworkClient | null {
    return this.registry.get("networkClient") as NetworkClient | null ?? null;
  }

  private _quickMatch(): void {
    const client = this._getNetworkClient();
    if (!client || client.state !== "connected") {
      this._showStatus("Connecting to server...");
      const nc = this.registry.get("networkClient") as NetworkClient | null;
      if (nc) {
        const url = this.registry.get("serverUrl") as string || "ws://localhost:3001";
        if (!url) { this._showStatus("Server URL not configured"); return; }
        nc.connect(url);
        const stateHandler = (state: ConnectionState) => {
          if (state === "connected") {
            nc.offStateChange(stateHandler);
            nc.createRoom();
            nc.once("room_created", () => this.scene.start("LobbyScene"));
          } else if (state === "error") {
            nc.offStateChange(stateHandler);
            this._showStatus("Connection failed");
          }
        };
        nc.onStateChange(stateHandler);
      } else {
        this._showStatus("Network not initialized");
      }
      return;
    }
    client.createRoom();
    client.once("room_created", () => this.scene.start("LobbyScene"));
  }

  private _createMatch(): void {
    const client = this._getNetworkClient();
    if (!client || client.state !== "connected") {
      this._showStatus("Not connected to server");
      return;
    }
    client.createRoom();
    client.once("room_created", () => this.scene.start("LobbyScene"));
    client.once("error", (msg: ServerMessage) => this._showStatus((msg as S2C_Error).message));
  }

  private _showJoinInput(): void {
    if (this.joinMode) return;
    this.joinMode = true;
    this.joinCode = "";

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 60;

    const panel = this.add.graphics().setDepth(30);
    drawPanel(panel, cx - 200, cy - 60, 400, 120, TEAL);

    const prompt = this.add.text(cx, cy - 35, "ENTER ROOM CODE", {
      fontFamily: UI_MONO, fontSize: "12px", color: TEAL_HEX,
    }).setOrigin(0.5).setDepth(31);

    this.joinInput = this.add.text(cx, cy, "____", {
      fontFamily: UI_MONO, fontSize: "32px", color: "#ffffff",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(31);

    const confirmBtn = this.add.text(cx, cy + 40, "[ ENTER ]", {
      fontFamily: UI_MONO, fontSize: "13px", color: TEAL_HEX,
    }).setOrigin(0.5).setDepth(31).setInteractive({ useHandCursor: true });
    confirmBtn.on("pointerover", () => confirmBtn.setColor("#ffffff"));
    confirmBtn.on("pointerout", () => confirmBtn.setColor(TEAL_HEX));
    confirmBtn.on("pointerdown", () => this._submitJoinCode());

    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => {
      if (!this.joinMode) return;
      if (ev.key === "Enter") { this._submitJoinCode(); return; }
      if (ev.key === "Escape") { this.joinMode = false; panel.destroy(); prompt.destroy(); this.joinInput?.destroy(); confirmBtn.destroy(); return; }
      if (ev.key === "Backspace") { this.joinCode = this.joinCode.slice(0, -1); }
      else if (ev.key.length === 1 && this.joinCode.length < 6) { this.joinCode += ev.key.toUpperCase(); }
      const display = this.joinCode.padEnd(4, "_");
      this.joinInput?.setText(display);
    });
  }

  private _submitJoinCode(): void {
    if (this.joinCode.length < 4) { this._showStatus("Code must be at least 4 characters"); return; }
    const client = this._getNetworkClient();
    if (!client || client.state !== "connected") { this._showStatus("Not connected to server"); return; }
    client.joinRoom(this.joinCode);
    client.once("room_joined", () => this.scene.start("LobbyScene"));
    client.once("error", (msg: ServerMessage) => this._showStatus((msg as S2C_Error).message));
  }

  private _goCharacterSelect(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("CharacterSelect", { standalone: true });
    });
  }

  private _goBack(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("TitleScene");
    });
  }

  private _showStatus(msg: string): void {
    if (!this.statusText) return;
    this.statusText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.statusText, alpha: 0, duration: 3000, delay: 2000 });
  }
}
