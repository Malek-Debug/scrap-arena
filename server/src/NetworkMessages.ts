// ─── Network Message Protocol ────────────────────────────────────────────────
// All messages use JSON with a discriminated union on `type`.
// Client → Server messages are prefixed with C2S_
// Server → Client messages are prefixed with S2C_

export type CharacterId = "assault" | "sentinel" | "phantom" | "engineer";

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Client → Server ─────────────────────────────────────────────────────────

export interface C2S_CreateRoom {
  type: "create_room";
  playerName: string;
}

export interface C2S_JoinRoom {
  type: "join_room";
  roomCode: string;
  playerName: string;
}

export interface C2S_LeaveRoom {
  type: "leave_room";
}

export interface C2S_SelectCharacter {
  type: "select_character";
  characterId: CharacterId;
}

export interface C2S_Ready {
  type: "ready";
  ready: boolean;
}

export interface C2S_StartMatch {
  type: "start_match";
}

export interface C2S_Input {
  type: "input";
  seq: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  shooting: boolean;
  ability: boolean;
  dash: boolean;
}

export interface C2S_Ping {
  type: "ping";
  timestamp: number;
}

export type ClientMessage =
  | C2S_CreateRoom
  | C2S_JoinRoom
  | C2S_LeaveRoom
  | C2S_SelectCharacter
  | C2S_Ready
  | C2S_StartMatch
  | C2S_Input
  | C2S_Ping;

// ─── Server → Client ─────────────────────────────────────────────────────────

export interface S2C_RoomCreated {
  type: "room_created";
  roomCode: string;
  playerId: string;
}

export interface S2C_RoomJoined {
  type: "room_joined";
  roomCode: string;
  playerId: string;
  players: LobbyPlayerInfo[];
}

export interface S2C_PlayerJoined {
  type: "player_joined";
  player: LobbyPlayerInfo;
}

export interface S2C_PlayerLeft {
  type: "player_left";
  playerId: string;
}

export interface S2C_PlayerReady {
  type: "player_ready";
  playerId: string;
  ready: boolean;
}

export interface S2C_CharacterSelected {
  type: "character_selected";
  playerId: string;
  characterId: CharacterId;
}

export interface S2C_MatchStarting {
  type: "match_starting";
  countdown: number;
}

export interface S2C_MatchStarted {
  type: "match_started";
  players: MatchPlayerInit[];
  arenaId: string;
  matchDuration: number;
  killLimit: number;
}

export interface S2C_GameState {
  type: "game_state";
  tick: number;
  players: PlayerStateUpdate[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  matchTime: number;
}

export interface S2C_PlayerHit {
  type: "player_hit";
  targetId: string;
  attackerId: string;
  damage: number;
  newHp: number;
  position: Vec2;
}

export interface S2C_PlayerKilled {
  type: "player_killed";
  victimId: string;
  killerId: string;
  killerScore: number;
  victimDeaths: number;
  position: Vec2;
}

export interface S2C_PlayerRespawned {
  type: "player_respawned";
  playerId: string;
  position: Vec2;
  hp: number;
}

export interface S2C_AbilityUsed {
  type: "ability_used";
  playerId: string;
  abilityId: string;
  position: Vec2;
  direction: number;
}

export interface S2C_AbilityEffect {
  type: "ability_effect";
  playerId: string;
  abilityId: string;
  effectData: Record<string, number | string | boolean>;
}

export interface S2C_MatchEnded {
  type: "match_ended";
  results: MatchResult[];
  winnerId: string;
  matchDuration: number;
}

export interface S2C_Error {
  type: "error";
  code: string;
  message: string;
}

export interface S2C_Pong {
  type: "pong";
  timestamp: number;
  serverTime: number;
}

export interface S2C_KillFeed {
  type: "kill_feed";
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: string;
}

export interface S2C_PickupCollected {
  type: "pickup_collected";
  pickupId: number;
  playerId: string;
  pickupType: string;
}

export type ServerMessage =
  | S2C_RoomCreated
  | S2C_RoomJoined
  | S2C_PlayerJoined
  | S2C_PlayerLeft
  | S2C_PlayerReady
  | S2C_CharacterSelected
  | S2C_MatchStarting
  | S2C_MatchStarted
  | S2C_GameState
  | S2C_PlayerHit
  | S2C_PlayerKilled
  | S2C_PlayerRespawned
  | S2C_AbilityUsed
  | S2C_AbilityEffect
  | S2C_MatchEnded
  | S2C_Error
  | S2C_Pong
  | S2C_KillFeed
  | S2C_PickupCollected;

// ─── Shared Data Structures ──────────────────────────────────────────────────

export interface LobbyPlayerInfo {
  id: string;
  name: string;
  characterId: CharacterId;
  ready: boolean;
  isHost: boolean;
}

export interface MatchPlayerInit {
  id: string;
  name: string;
  characterId: CharacterId;
  position: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
}

export interface PlayerStateUpdate {
  id: string;
  x: number;
  y: number;
  hp: number;
  heat: number;
  aimAngle: number;
  velocityX: number;
  velocityY: number;
  score: number;
  deaths: number;
  alive: boolean;
  invulnerable: boolean;
  abilityCooldown: number;
  dashCooldown: number;
  abilityActive: boolean;
}

export interface ProjectileState {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
}

export interface PickupState {
  id: number;
  x: number;
  y: number;
  pickupType: string;
  active: boolean;
}

export interface MatchResult {
  playerId: string;
  playerName: string;
  characterId: CharacterId;
  kills: number;
  deaths: number;
  score: number;
  rank: number;
}
