import type { WebSocket } from "ws";
import { Room } from "./Room.js";
import { validateMessage } from "./Validation.js";
import type { ServerMessage } from "./NetworkMessages.js";

export class GameServer {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId → roomCode
  private nextPlayerId = 1;

  generatePlayerId(): string {
    return `p_${this.nextPlayerId++}_${Date.now().toString(36)}`;
  }

  handleConnection(ws: WebSocket): void {
    const playerId = this.generatePlayerId();
    let playerRoomCode: string | null = null;

    ws.on("message", (data) => {
      const raw = data.toString();
      const msg = validateMessage(raw);
      if (!msg) {
        this._sendTo(ws, { type: "error", code: "INVALID_MESSAGE", message: "Invalid message format" });
        return;
      }

      switch (msg.type) {
        case "create_room": {
          if (playerRoomCode) {
            this._sendTo(ws, { type: "error", code: "ALREADY_IN_ROOM", message: "Already in a room" });
            return;
          }

          const code = this._generateRoomCode();
          const room = new Room(code);
          room.onEmpty = () => this._destroyRoom(code);
          this.rooms.set(code, room);

          const added = room.addPlayer(playerId, msg.playerName, ws);
          if (added) {
            playerRoomCode = code;
            this.playerRooms.set(playerId, code);
            this._sendTo(ws, { type: "room_created", roomCode: code, playerId });
          }
          break;
        }

        case "join_room": {
          if (playerRoomCode) {
            this._sendTo(ws, { type: "error", code: "ALREADY_IN_ROOM", message: "Already in a room" });
            return;
          }

          const room = this.rooms.get(msg.roomCode);
          if (!room) {
            this._sendTo(ws, { type: "error", code: "ROOM_NOT_FOUND", message: "Room not found" });
            return;
          }

          const added = room.addPlayer(playerId, msg.playerName, ws);
          if (added) {
            playerRoomCode = msg.roomCode;
            this.playerRooms.set(playerId, msg.roomCode);
          }
          break;
        }

        case "leave_room": {
          // Disconnect handling in Room will clean up
          break;
        }

        default:
          // All other messages are handled by the room itself
          break;
      }
    });

    ws.on("close", () => {
      this.playerRooms.delete(playerId);
    });

    ws.on("error", () => {
      this.playerRooms.delete(playerId);
    });
  }

  private _generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: string;
    do {
      code = "";
      for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private _destroyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      room.destroy();
      this.rooms.delete(code);
    }
  }

  private _sendTo(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getPlayerCount(): number {
    return this.playerRooms.size;
  }

  getStatus(): { rooms: number; players: number } {
    return { rooms: this.rooms.size, players: this.playerRooms.size };
  }
}
