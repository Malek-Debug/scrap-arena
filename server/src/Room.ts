import type { WebSocket } from "ws";
import { GameState, type GameEvent } from "./GameState.js";
import { getArena } from "./Arena.js";
import { validateMessage, checkRateLimit, clearRateLimit } from "./Validation.js";
import type {
  CharacterId, ClientMessage, ServerMessage,
  LobbyPlayerInfo, MatchPlayerInit,
} from "./NetworkMessages.js";

const TICK_RATE_MS = 50; // 20 ticks per second
const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_SECONDS = 3;

type RoomPhase = "lobby" | "countdown" | "playing" | "ended";

interface ConnectedPlayer {
  id: string;
  name: string;
  ws: WebSocket;
  characterId: CharacterId;
  ready: boolean;
  isHost: boolean;
  lastInputTime: number;
}

export class Room {
  readonly code: string;
  private phase: RoomPhase = "lobby";
  private players: Map<string, ConnectedPlayer> = new Map();
  private gameState: GameState | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private countdownTimer = 0;
  private matchStartTime = 0;

  onEmpty?: () => void;

  constructor(code: string) {
    this.code = code;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  getPhase(): RoomPhase {
    return this.phase;
  }

  addPlayer(id: string, name: string, ws: WebSocket): boolean {
    if (this.phase !== "lobby") {
      this._sendTo(ws, { type: "error", code: "MATCH_IN_PROGRESS", message: "Match already in progress" });
      return false;
    }

    if (this.isFull()) {
      this._sendTo(ws, { type: "error", code: "ROOM_FULL", message: "Room is full" });
      return false;
    }

    const isHost = this.players.size === 0;
    const player: ConnectedPlayer = {
      id,
      name,
      ws,
      characterId: "assault",
      ready: false,
      isHost,
      lastInputTime: 0,
    };

    this.players.set(id, player);

    // Notify the joining player of room state
    const lobbyPlayers = this._getLobbyPlayers();
    this._sendTo(ws, {
      type: "room_joined",
      roomCode: this.code,
      playerId: id,
      players: lobbyPlayers,
    });

    // Notify others of new player
    this._broadcastExcept(id, {
      type: "player_joined",
      player: {
        id,
        name,
        characterId: player.characterId,
        ready: false,
        isHost,
      },
    });

    // Set up message handling
    ws.on("message", (data) => this._onMessage(id, data.toString()));
    ws.on("close", () => this._onDisconnect(id));
    ws.on("error", () => this._onDisconnect(id));

    return true;
  }

  private _onMessage(playerId: string, raw: string): void {
    const msg = validateMessage(raw);
    if (!msg) return;

    if (!checkRateLimit(playerId)) {
      const player = this.players.get(playerId);
      if (player) {
        this._sendTo(player.ws, { type: "error", code: "RATE_LIMITED", message: "Too many messages" });
      }
      return;
    }

    switch (msg.type) {
      case "select_character":
        this._handleSelectCharacter(playerId, msg.characterId);
        break;
      case "ready":
        this._handleReady(playerId, msg.ready);
        break;
      case "start_match":
        this._handleStartMatch(playerId);
        break;
      case "input":
        this._handleInput(playerId, msg);
        break;
      case "leave_room":
        this._onDisconnect(playerId);
        break;
      case "ping":
        this._handlePing(playerId, msg.timestamp);
        break;
    }
  }

  private _handleSelectCharacter(playerId: string, characterId: CharacterId): void {
    if (this.phase !== "lobby") return;
    const player = this.players.get(playerId);
    if (!player) return;

    player.characterId = characterId;

    this._broadcast({
      type: "character_selected",
      playerId,
      characterId,
    });
  }

  private _handleReady(playerId: string, ready: boolean): void {
    if (this.phase !== "lobby") return;
    const player = this.players.get(playerId);
    if (!player) return;

    player.ready = ready;

    this._broadcast({
      type: "player_ready",
      playerId,
      ready,
    });
  }

  private _handleStartMatch(playerId: string): void {
    if (this.phase !== "lobby") return;
    const player = this.players.get(playerId);
    if (!player || !player.isHost) return;

    // Check conditions
    if (this.players.size < MIN_PLAYERS_TO_START) {
      this._sendTo(player.ws, { type: "error", code: "NOT_ENOUGH_PLAYERS", message: `Need at least ${MIN_PLAYERS_TO_START} players` });
      return;
    }

    const allReady = Array.from(this.players.values()).every(p => p.ready || p.isHost);
    if (!allReady) {
      this._sendTo(player.ws, { type: "error", code: "NOT_ALL_READY", message: "All players must be ready" });
      return;
    }

    this._startCountdown();
  }

  private _startCountdown(): void {
    this.phase = "countdown";
    this.countdownTimer = COUNTDOWN_SECONDS;

    this._broadcast({ type: "match_starting", countdown: this.countdownTimer });

    const interval = setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer <= 0) {
        clearInterval(interval);
        this._startMatch();
      } else {
        this._broadcast({ type: "match_starting", countdown: this.countdownTimer });
      }
    }, 1000);
  }

  private _startMatch(): void {
    this.phase = "playing";
    this.matchStartTime = Date.now();

    const arena = getArena("scrap_pit");
    this.gameState = new GameState(arena);

    // Add all players to game state
    const matchPlayers: MatchPlayerInit[] = [];
    for (const player of this.players.values()) {
      const gamePlayer = this.gameState.addPlayer(player.id, player.name, player.characterId);
      matchPlayers.push({
        id: player.id,
        name: player.name,
        characterId: player.characterId,
        position: { x: gamePlayer.x, y: gamePlayer.y },
        hp: gamePlayer.hp,
        maxHp: gamePlayer.maxHp,
        speed: gamePlayer.character.speed,
      });
    }

    // Send match started to all
    this._broadcast({
      type: "match_started",
      players: matchPlayers,
      arenaId: arena.id,
      matchDuration: this.gameState.matchDuration,
      killLimit: this.gameState.killLimit,
    });

    // Start game loop
    this.tickInterval = setInterval(() => this._gameTick(), TICK_RATE_MS);
  }

  private _gameTick(): void {
    if (!this.gameState || this.phase !== "playing") return;

    const events = this.gameState.update(TICK_RATE_MS);

    // Broadcast events
    for (const event of events) {
      this._broadcast(event as ServerMessage);
    }

    // Broadcast state update
    this._broadcast({
      type: "game_state",
      tick: this.gameState.getCurrentTick(),
      players: this.gameState.getPlayerStates(),
      projectiles: this.gameState.getProjectileStates(),
      pickups: this.gameState.getPickupStates(),
      matchTime: this.gameState.getMatchTimeRemaining(),
    });

    // Check match end
    if (this.gameState.isMatchEnded()) {
      this._endMatch();
    }

    // Check if too few players remain
    if (this.gameState.getActivePlayerCount() < MIN_PLAYERS_TO_START) {
      this._endMatch();
    }
  }

  private _handleInput(playerId: string, msg: { seq: number; moveX: number; moveY: number; aimAngle: number; shooting: boolean; ability: boolean; dash: boolean }): void {
    if (this.phase !== "playing" || !this.gameState) return;

    const gamePlayer = this.gameState.players.get(playerId);
    if (!gamePlayer) return;

    gamePlayer.applyInput(msg.moveX, msg.moveY, msg.aimAngle, msg.shooting, msg.ability, msg.dash, msg.seq);
  }

  private _handlePing(playerId: string, timestamp: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this._sendTo(player.ws, { type: "pong", timestamp, serverTime: Date.now() });
  }

  private _endMatch(): void {
    if (this.phase === "ended") return;
    this.phase = "ended";

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    if (this.gameState) {
      const results = this.gameState.getResults();
      const winnerId = this.gameState.getWinnerId();
      const matchDuration = Date.now() - this.matchStartTime;

      this._broadcast({
        type: "match_ended",
        results,
        winnerId,
        matchDuration,
      });
    }

    // Reset room to lobby after 10 seconds
    setTimeout(() => {
      this._resetToLobby();
    }, 10000);
  }

  private _resetToLobby(): void {
    this.phase = "lobby";
    this.gameState = null;
    for (const player of this.players.values()) {
      player.ready = false;
    }
  }

  private _onDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    clearRateLimit(playerId);
    this.players.delete(playerId);

    // Remove from game state if match is running
    if (this.gameState) {
      this.gameState.removePlayer(playerId);
    }

    // Notify others
    this._broadcastExcept(playerId, { type: "player_left", playerId });

    // Promote new host if needed
    if (player.isHost && this.players.size > 0) {
      const newHost = this.players.values().next().value;
      if (newHost) {
        newHost.isHost = true;
        // Notify about new host via player list update
        this._broadcast({
          type: "player_joined",
          player: {
            id: newHost.id,
            name: newHost.name,
            characterId: newHost.characterId,
            ready: newHost.ready,
            isHost: true,
          },
        });
      }
    }

    // Clean up empty room
    if (this.players.size === 0) {
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
      this.onEmpty?.();
    }

    // End match if too few players during game
    if (this.phase === "playing" && this.players.size < MIN_PLAYERS_TO_START) {
      this._endMatch();
    }
  }

  private _getLobbyPlayers(): LobbyPlayerInfo[] {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      characterId: p.characterId,
      ready: p.ready,
      isHost: p.isHost,
    }));
  }

  private _sendTo(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private _broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.ws.readyState === player.ws.OPEN) {
        player.ws.send(data);
      }
    }
  }

  private _broadcastExcept(excludeId: string, msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.id !== excludeId && player.ws.readyState === player.ws.OPEN) {
        player.ws.send(data);
      }
    }
  }

  destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    for (const player of this.players.values()) {
      player.ws.close();
    }
    this.players.clear();
  }
}
