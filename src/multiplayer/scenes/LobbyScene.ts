import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../core";
import { UI_FONT, UI_MONO, UI_ORBITRON, UI_OXANIUM, drawPanel } from "../../rendering/UITheme";
import { AudioManager } from "../../audio/AudioManager";
import type { NetworkClient } from "../network/NetworkClient";
import type { ServerMessage, S2C_PlayerJoined, S2C_PlayerLeft, S2C_PlayerReady, S2C_CharacterSelected, S2C_MatchStarting, S2C_MatchStarted } from "../network/NetworkMessages";

const BG = 0x080412;
const ACCENT = 0xff6600;
const TEAL = 0x00ff88;
const TEAL_HEX = "#00ff88";

interface LobbyPlayer {
  id: string;
  name: string;
  characterId: string;
  ready: boolean;
}

export class LobbyScene extends Phaser.Scene {
  private players: LobbyPlayer[] = [];
  private playerSlots: Phaser.GameObjects.Container[] = [];
  private startButton: Phaser.GameObjects.Container | null = null;
  private isHost = false;
  private localReady = false;
  private networkClient: NetworkClient | null = null;

  constructor() {
    super({ key: "LobbyScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);
    this.cameras.main.fadeIn(400, 0, 0, 0);
    AudioManager.instance.setScene(this);

    this.networkClient = this.registry.get("networkClient") as NetworkClient | null;
    this.players = [];
    this.playerSlots = [];
    this.localReady = false;

    const cx = GAME_WIDTH / 2;

    this._drawBackground();
    this._drawHeader(cx);
    this._drawRoomCode(cx);
    this._drawPlayerSlots(cx);
    this._drawGameModeInfo(cx);
    this._drawButtons(cx);
    this._bindNetworkEvents();

    // Populate with current room state if available
    const roomData = this.registry.get("roomData") as { players?: LobbyPlayer[]; roomCode?: string; isHost?: boolean } | null;
    if (roomData) {
      this.isHost = roomData.isHost ?? false;
      if (roomData.players) {
        this.players = [...roomData.players];
        this._refreshSlots();
      }
    }
  }

  private _drawBackground(): void {
    const bg = this.add.graphics().setDepth(-10);
    bg.fillStyle(BG, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const grid = this.add.graphics().setDepth(-9).setAlpha(0.06);
    for (let x = 0; x <= GAME_WIDTH; x += 48) {
      grid.lineStyle(1, 0x1a0e2a, 1);
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 48) {
      grid.lineStyle(1, 0x1a0e2a, 1);
      grid.lineBetween(0, y, GAME_WIDTH, y);
    }

    const frame = this.add.graphics().setDepth(0);
    frame.lineStyle(1.5, ACCENT, 0.25);
    frame.strokeRect(14, 14, GAME_WIDTH - 28, GAME_HEIGHT - 28);
    const cLen = 24;
    frame.lineStyle(2, ACCENT, 0.55);
    frame.lineBetween(14, 14, 14 + cLen, 14); frame.lineBetween(14, 14, 14, 14 + cLen);
    frame.lineBetween(GAME_WIDTH - 14 - cLen, 14, GAME_WIDTH - 14, 14); frame.lineBetween(GAME_WIDTH - 14, 14, GAME_WIDTH - 14, 14 + cLen);
    frame.lineBetween(14, GAME_HEIGHT - 14, 14 + cLen, GAME_HEIGHT - 14); frame.lineBetween(14, GAME_HEIGHT - 14 - cLen, 14, GAME_HEIGHT - 14);
    frame.lineBetween(GAME_WIDTH - 14 - cLen, GAME_HEIGHT - 14, GAME_WIDTH - 14, GAME_HEIGHT - 14); frame.lineBetween(GAME_WIDTH - 14, GAME_HEIGHT - 14 - cLen, GAME_WIDTH - 14, GAME_HEIGHT - 14);
  }

  private _drawHeader(cx: number): void {
    this.add.text(cx, 40, "MATCH LOBBY", {
      fontFamily: UI_ORBITRON, fontSize: "36px", color: "#ff7a18", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 3, color: "#ff4400", blur: 16, fill: true },
    }).setOrigin(0.5).setDepth(10);

    const sep = this.add.graphics().setDepth(10);
    sep.lineStyle(1, ACCENT, 0.5);
    sep.lineBetween(cx - 240, 68, cx + 240, 68);
  }

  private _drawRoomCode(cx: number): void {
    this.add.text(cx, 90, "ROOM CODE", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#888866",
    }).setOrigin(0.5).setDepth(10);

    const code = this.registry.get("roomCode") as string || "----";
    this.add.text(cx, 116, code, {
      fontFamily: UI_ORBITRON, fontSize: "28px", color: TEAL_HEX, fontStyle: "bold",
      stroke: "#001a0a", strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: "#00ff88", blur: 12, fill: true },
      letterSpacing: 8,
    }).setOrigin(0.5).setDepth(10);

    // Copy hint
    this.add.text(cx, 140, "share this code with friends", {
      fontFamily: UI_FONT, fontSize: "11px", color: "#556644",
    }).setOrigin(0.5).setDepth(10);
  }

  private _drawPlayerSlots(cx: number): void {
    const slotW = 260;
    const slotH = 110;
    const gap = 20;
    const startX = cx - (slotW * 2 + gap) / 2;
    const startY = 170;

    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = startX + col * (slotW + gap);
      const sy = startY + row * (slotH + gap);

      const container = this.add.container(sx, sy).setDepth(10);

      const bg = this.add.graphics();
      bg.fillStyle(0x0a0518, 0.8);
      bg.fillRoundedRect(0, 0, slotW, slotH, 8);
      bg.lineStyle(1, ACCENT, 0.3);
      bg.strokeRoundedRect(0, 0, slotW, slotH, 8);
      container.add(bg);

      const slotLabel = this.add.text(slotW / 2, 16, `SLOT ${i + 1}`, {
        fontFamily: UI_MONO, fontSize: "10px", color: "#444433",
      }).setOrigin(0.5);
      container.add(slotLabel);

      const nameText = this.add.text(slotW / 2, 42, "WAITING...", {
        fontFamily: UI_FONT, fontSize: "16px", color: "#555544",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5);
      container.add(nameText);

      const charText = this.add.text(slotW / 2, 64, "", {
        fontFamily: UI_MONO, fontSize: "11px", color: "#888866",
      }).setOrigin(0.5);
      container.add(charText);

      const readyBadge = this.add.text(slotW / 2, 88, "", {
        fontFamily: UI_MONO, fontSize: "11px", color: TEAL_HEX, fontStyle: "bold",
      }).setOrigin(0.5);
      container.add(readyBadge);

      this.playerSlots.push(container);
    }
  }

  private _drawGameModeInfo(cx: number): void {
    const infoY = 420;
    const panel = this.add.graphics().setDepth(9);
    drawPanel(panel, cx - 200, infoY, 400, 60, ACCENT);

    this.add.text(cx, infoY + 18, "FREE FOR ALL", {
      fontFamily: UI_OXANIUM, fontSize: "16px", color: "#ff9944", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(10);

    this.add.text(cx, infoY + 40, "SCRAP YARD ARENA  •  FIRST TO 20 KILLS", {
      fontFamily: UI_MONO, fontSize: "10px", color: "#777766",
    }).setOrigin(0.5).setDepth(10);
  }

  private _drawButtons(cx: number): void {
    const btnY = 530;

    // Ready button
    this._createButton(cx - 120, btnY, 200, 44, "READY", TEAL, TEAL_HEX, () => this._toggleReady());

    // Start button (host only)
    this.startButton = this._createButton(cx + 120, btnY, 200, 44, "START MATCH", ACCENT, "#ff7a18", () => this._startMatch());
    this.startButton.setAlpha(0.3);

    // Leave button
    this._createButton(cx, btnY + 70, 160, 36, "LEAVE", 0xff4444, "#ff4444", () => this._leave());
  }

  private _createButton(x: number, y: number, w: number, h: number, label: string, color: number, colorHex: string, onClick: () => void): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(15);

    const bg = this.add.graphics();
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? color : 0x0a0518, hover ? 0.25 : 0.8);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(2, color, hover ? 1 : 0.6);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    };
    drawBg(false);
    container.add(bg);

    const txt = this.add.text(0, 0, label, {
      fontFamily: UI_FONT, fontSize: "15px", color: colorHex, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(txt);

    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => { drawBg(true); txt.setColor("#ffffff"); });
    hit.on("pointerout", () => { drawBg(false); txt.setColor(colorHex); });
    hit.on("pointerdown", onClick);
    container.add(hit);

    return container;
  }

  private _refreshSlots(): void {
    for (let i = 0; i < 4; i++) {
      const container = this.playerSlots[i];
      if (!container || container.list.length < 5) continue;

      const bg = container.list[0] as Phaser.GameObjects.Graphics;
      const nameText = container.list[2] as Phaser.GameObjects.Text;
      const charText = container.list[3] as Phaser.GameObjects.Text;
      const readyBadge = container.list[4] as Phaser.GameObjects.Text;

      const player = this.players[i];
      if (player) {
        bg.clear();
        bg.fillStyle(player.ready ? 0x002a0a : 0x0a0518, 0.8);
        bg.fillRoundedRect(0, 0, 260, 110, 8);
        bg.lineStyle(2, player.ready ? TEAL : ACCENT, 0.6);
        bg.strokeRoundedRect(0, 0, 260, 110, 8);

        nameText.setText(player.name || `PLAYER ${i + 1}`).setColor("#ffffff");
        charText.setText(player.characterId ? player.characterId.toUpperCase() : "NO CHARACTER");
        readyBadge.setText(player.ready ? "✓ READY" : "NOT READY");
        readyBadge.setColor(player.ready ? TEAL_HEX : "#ff4444");
      } else {
        bg.clear();
        bg.fillStyle(0x0a0518, 0.8);
        bg.fillRoundedRect(0, 0, 260, 110, 8);
        bg.lineStyle(1, ACCENT, 0.3);
        bg.strokeRoundedRect(0, 0, 260, 110, 8);

        nameText.setText("WAITING...").setColor("#555544");
        charText.setText("");
        readyBadge.setText("");
      }
    }

    // Update start button availability
    if (this.startButton) {
      const readyCount = this.players.filter(p => p.ready).length;
      this.startButton.setAlpha(this.isHost && readyCount >= 2 ? 1 : 0.3);
    }
  }

  private _toggleReady(): void {
    this.localReady = !this.localReady;
    this.networkClient?.setReady(this.localReady);

    // Update local display immediately
    const localId = this.registry.get("localPlayerId") as string;
    const local = this.players.find(p => p.id === localId);
    if (local) {
      local.ready = this.localReady;
      this._refreshSlots();
    }
  }

  private _startMatch(): void {
    if (!this.isHost) return;
    const readyCount = this.players.filter(p => p.ready).length;
    if (readyCount < 2) return;
    this.networkClient?.startMatch();
  }

  private _leave(): void {
    this.networkClient?.send({ type: "leave_room" });
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("MultiplayerMenu");
    });
  }

  private _bindNetworkEvents(): void {
    if (!this.networkClient) return;
    const net = this.networkClient;

    net.on("player_joined", (msg: ServerMessage) => {
      const data = msg as S2C_PlayerJoined;
      this.players.push({ id: data.player.id, name: data.player.name, characterId: data.player.characterId || "", ready: data.player.ready });
      this._refreshSlots();
      this._animateSlotJoin(this.players.length - 1);
    });

    net.on("player_left", (msg: ServerMessage) => {
      const data = msg as S2C_PlayerLeft;
      this.players = this.players.filter(p => p.id !== data.playerId);
      this._refreshSlots();
    });

    net.on("player_ready", (msg: ServerMessage) => {
      const data = msg as S2C_PlayerReady;
      const p = this.players.find(pl => pl.id === data.playerId);
      if (p) { p.ready = data.ready; this._refreshSlots(); }
    });

    net.on("character_selected", (msg: ServerMessage) => {
      const data = msg as S2C_CharacterSelected;
      const p = this.players.find(pl => pl.id === data.playerId);
      if (p) { p.characterId = data.characterId; this._refreshSlots(); }
    });

    net.on("match_starting", (msg: ServerMessage) => {
      const data = msg as S2C_MatchStarting;
      this._showCountdown(data.countdown);
    });

    net.on("match_started", (msg: ServerMessage) => {
      const data = msg as S2C_MatchStarted;
      this.registry.set("matchPlayers", data.players);
      this.scene.start("MultiplayerArena");
    });
  }

  private _animateSlotJoin(index: number): void {
    const slot = this.playerSlots[index];
    if (!slot) return;
    slot.setScale(0.9).setAlpha(0);
    this.tweens.add({ targets: slot, scale: 1, alpha: 1, duration: 300, ease: "Back.easeOut" });
  }

  private _showCountdown(seconds: number): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(100);
    const countText = this.add.text(cx, cy, `${seconds}`, {
      fontFamily: UI_ORBITRON, fontSize: "72px", color: "#ffffff", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 8,
    }).setOrigin(0.5).setDepth(101);

    let count = seconds;
    const timer = this.time.addEvent({
      delay: 1000, repeat: seconds - 1,
      callback: () => {
        count--;
        if (count <= 0) {
          overlay.destroy();
          countText.destroy();
          timer.destroy();
          this.scene.start("MultiplayerArena");
        } else {
          countText.setText(`${count}`);
          this.tweens.add({ targets: countText, scale: 1.3, duration: 100, yoyo: true });
        }
      },
    });
  }

  shutdown(): void {
    this.networkClient?.removeAllListeners();
  }
}
