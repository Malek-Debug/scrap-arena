import type { ClientMessage, ServerMessage, C2S_Input, CharacterId } from "./NetworkMessages";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

type MessageHandler = (msg: ServerMessage) => void;
type StateHandler = (state: ConnectionState) => void;

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url = "";
  state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: string[] = [];
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private stateHandlers: StateHandler[] = [];
  private inputBuffer: C2S_Input | null = null;
  private inputSendInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private _latency = 0;
  private _playerId = "";
  private _playerName = "Player";

  get connectionState(): ConnectionState { return this.state; }
  get latency(): number { return this._latency; }
  get playerId(): string { return this._playerId; }
  get isConnected(): boolean { return this.state === "connected"; }

  setPlayerName(name: string): void { this._playerName = name; }

  connect(url: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.disconnect();
    }

    this.url = url;
    this.reconnectAttempts = 0;
    this._connect();
  }

  disconnect(): void {
    this._clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this._setState("disconnected");
    this.messageQueue = [];
  }

  on(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.push(handler);
    } else {
      this.messageHandlers.set(type, [handler]);
    }
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  once(type: string, handler: MessageHandler): void {
    const wrapper: MessageHandler = (msg) => {
      this.off(type, wrapper);
      handler(msg);
    };
    this.on(type, wrapper);
  }

  removeAllListeners(): void {
    this.messageHandlers.clear();
    this.stateHandlers = [];
  }

  onStateChange(handler: StateHandler): void {
    this.stateHandlers.push(handler);
  }

  offStateChange(handler: StateHandler): void {
    const idx = this.stateHandlers.indexOf(handler);
    if (idx >= 0) this.stateHandlers.splice(idx, 1);
  }

  send(msg: ClientMessage): void {
    const data = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }

  createRoom(): void {
    this.send({ type: "create_room", playerName: this._playerName });
  }

  joinRoom(code: string): void {
    this.send({ type: "join_room", roomCode: code, playerName: this._playerName });
  }

  setReady(ready: boolean): void {
    this.send({ type: "ready", ready });
  }

  selectCharacter(id: CharacterId): void {
    this.send({ type: "select_character", characterId: id });
  }

  startMatch(): void {
    this.send({ type: "start_match" });
  }

  leaveRoom(): void {
    this.send({ type: "leave_room" });
  }

  sendInput(input: Omit<C2S_Input, "type">): void {
    this.inputBuffer = { type: "input", ...input };
  }

  setPlayerId(id: string): void {
    this._playerId = id;
  }

  private _connect(): void {
    this._setState("connecting");

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this._setState("error");
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this._setState("connected");
      this._flushQueue();
      this._startInputSending();
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this._handleMessage(msg);
      } catch {
        // Malformed message — ignore
      }
    };

    this.ws.onclose = () => {
      this._stopInputSending();
      this._stopPing();
      this._setState("disconnected");
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._setState("error");
    };
  }

  private _handleMessage(msg: ServerMessage): void {
    // Handle room_created / room_joined to capture playerId
    if (msg.type === "room_created" || msg.type === "room_joined") {
      this._playerId = msg.playerId;
    }

    if (msg.type === "pong") {
      this._latency = Math.round((performance.now() - msg.timestamp) / 2);
      return;
    }

    const handlers = this.messageHandlers.get(msg.type);
    if (handlers) {
      for (const h of handlers) h(msg);
    }

    const wildcard = this.messageHandlers.get("*");
    if (wildcard) {
      for (const h of wildcard) h(msg);
    }
  }

  private _setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    for (const h of this.stateHandlers) h(s);
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state !== "connected") this._connect();
    }, delay);
  }

  private _flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (const data of this.messageQueue) {
      this.ws.send(data);
    }
    this.messageQueue = [];
  }

  private _startInputSending(): void {
    this._stopInputSending();
    this.inputSendInterval = setInterval(() => {
      if (this.inputBuffer && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(this.inputBuffer));
        this.inputBuffer = null;
      }
    }, 50);
  }

  private _stopInputSending(): void {
    if (this.inputSendInterval) {
      clearInterval(this.inputSendInterval);
      this.inputSendInterval = null;
    }
  }

  private _startPing(): void {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: "ping", timestamp: performance.now() };
        this.ws.send(JSON.stringify(msg));
      }
    }, 2000);
  }

  private _stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private _clearTimers(): void {
    this._stopInputSending();
    this._stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
