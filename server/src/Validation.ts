import type { ClientMessage } from "./NetworkMessages.js";

const MAX_INPUT_RATE = 20; // max inputs per second
const RATE_WINDOW_MS = 1000;

interface RateEntry {
  timestamps: number[];
  violations: number;
}

const rateLimits = new Map<string, RateEntry>();

export function validateMessage(raw: string): ClientMessage | null {
  if (raw.length > 2048) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  if (!("type" in parsed) || typeof (parsed as { type: unknown }).type !== "string") return null;

  const msg = parsed as ClientMessage;

  switch (msg.type) {
    case "create_room":
      if (!isValidName(msg.playerName)) return null;
      break;
    case "join_room":
      if (!isValidName(msg.playerName)) return null;
      if (!isValidRoomCode(msg.roomCode)) return null;
      break;
    case "leave_room":
      break;
    case "select_character":
      if (!isValidCharacter(msg.characterId)) return null;
      break;
    case "ready":
      if (typeof msg.ready !== "boolean") return null;
      break;
    case "start_match":
      break;
    case "input":
      if (!isValidInput(msg)) return null;
      break;
    case "ping":
      if (typeof msg.timestamp !== "number") return null;
      break;
    default:
      return null;
  }

  return msg;
}

function isValidName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  if (name.length < 1 || name.length > 20) return false;
  // Allow alphanumeric, spaces, underscores, dashes
  return /^[a-zA-Z0-9 _\-]+$/.test(name);
}

function isValidRoomCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  return /^[A-Z0-9]{4,6}$/.test(code);
}

function isValidCharacter(id: unknown): boolean {
  if (typeof id !== "string") return false;
  return ["assault", "sentinel", "phantom", "engineer"].includes(id);
}

function isValidInput(msg: { seq: unknown; moveX: unknown; moveY: unknown; aimAngle: unknown; shooting: unknown; ability: unknown; dash: unknown }): boolean {
  if (typeof msg.seq !== "number" || !Number.isFinite(msg.seq)) return false;
  if (typeof msg.moveX !== "number" || !Number.isFinite(msg.moveX)) return false;
  if (typeof msg.moveY !== "number" || !Number.isFinite(msg.moveY)) return false;
  if (typeof msg.aimAngle !== "number" || !Number.isFinite(msg.aimAngle)) return false;
  if (typeof msg.shooting !== "boolean") return false;
  if (typeof msg.ability !== "boolean") return false;
  if (typeof msg.dash !== "boolean") return false;

  // Normalize move vector - client might send values outside -1 to 1
  if (Math.abs(msg.moveX) > 1.01 || Math.abs(msg.moveY) > 1.01) return false;

  return true;
}

export function checkRateLimit(playerId: string): boolean {
  const now = Date.now();
  let entry = rateLimits.get(playerId);

  if (!entry) {
    entry = { timestamps: [now], violations: 0 };
    rateLimits.set(playerId, entry);
    return true;
  }

  // Remove timestamps outside window
  entry.timestamps = entry.timestamps.filter(t => now - t < RATE_WINDOW_MS);
  entry.timestamps.push(now);

  if (entry.timestamps.length > MAX_INPUT_RATE) {
    entry.violations++;
    // Kick after 5 consecutive violations
    return entry.violations < 5;
  }

  // Reset violations on good behavior
  entry.violations = Math.max(0, entry.violations - 1);
  return true;
}

export function clearRateLimit(playerId: string): void {
  rateLimits.delete(playerId);
}

export function validateMovementSpeed(
  prevX: number, prevY: number,
  newX: number, newY: number,
  maxSpeed: number, dt: number,
): boolean {
  const dx = newX - prevX;
  const dy = newY - prevY;
  const distSq = dx * dx + dy * dy;
  // Allow 20% tolerance for network jitter
  const maxDist = maxSpeed * dt * 1.2;
  return distSq <= maxDist * maxDist;
}

export function validateFireRate(lastFireTime: number, fireRate: number): boolean {
  const now = Date.now();
  // Allow 10% tolerance
  return (now - lastFireTime) >= fireRate * 0.9;
}
