import type { PlayerStateUpdate, ProjectileState, PickupState } from "./NetworkMessages";

export interface EntitySnapshot {
  x: number;
  y: number;
  timestamp: number;
}

interface FullSnapshot {
  tick: number;
  receivedAt: number;
  players: Map<string, PlayerStateUpdate>;
  projectiles: Map<number, ProjectileState>;
  pickups: Map<number, PickupState>;
}

const BUFFER_SIZE = 3;
const INTERPOLATION_DELAY_MS = 100;

export class Interpolation {
  private snapshots: FullSnapshot[] = [];
  private entityHistory: Map<string, EntitySnapshot[]> = new Map();

  pushSnapshot(entityId: string, snapshot: EntitySnapshot): void {
    let history = this.entityHistory.get(entityId);
    if (!history) {
      history = [];
      this.entityHistory.set(entityId, history);
    }
    history.push(snapshot);
    while (history.length > BUFFER_SIZE + 1) history.shift();
  }

  pushGameState(
    tick: number,
    players: PlayerStateUpdate[],
    projectiles: ProjectileState[],
    pickups: PickupState[],
  ): void {
    const playerMap = new Map<string, PlayerStateUpdate>();
    for (const p of players) playerMap.set(p.id, p);

    const projMap = new Map<number, ProjectileState>();
    for (const p of projectiles) projMap.set(p.id, p);

    const pickupMap = new Map<number, PickupState>();
    for (const p of pickups) pickupMap.set(p.id, p);

    this.snapshots.push({
      tick,
      receivedAt: performance.now(),
      players: playerMap,
      projectiles: projMap,
      pickups: pickupMap,
    });

    while (this.snapshots.length > BUFFER_SIZE) {
      this.snapshots.shift();
    }
  }

  getInterpolatedPosition(entityId: string, now: number): { x: number; y: number } | null {
    const history = this.entityHistory.get(entityId);
    if (!history || history.length === 0) return null;

    if (history.length === 1) {
      return { x: history[0].x, y: history[0].y };
    }

    const renderTime = now - INTERPOLATION_DELAY_MS;

    let from: EntitySnapshot | null = null;
    let to: EntitySnapshot | null = null;

    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].timestamp <= renderTime && history[i + 1].timestamp >= renderTime) {
        from = history[i];
        to = history[i + 1];
        break;
      }
    }

    if (!from || !to) {
      from = history[history.length - 2];
      to = history[history.length - 1];
    }

    const elapsed = to.timestamp - from.timestamp;
    const t = elapsed > 0 ? Math.min(1, Math.max(0, (renderTime - from.timestamp) / elapsed)) : 1;

    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  }

  getLatestPickups(): PickupState[] {
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return [];
    return Array.from(latest.pickups.values());
  }

  removeEntity(entityId: string): void {
    this.entityHistory.delete(entityId);
  }

  clear(): void {
    this.snapshots = [];
    this.entityHistory.clear();
  }
}
