export interface MemoryEntry {
  key: string;
  value: unknown;
  position: { x: number; y: number } | null;
  timestamp: number;
  ttl: number; // ms, 0 = permanent
}

/**
 * Per-agent memory store — spatial and event memory.
 * Auto-expires entries based on TTL. O(n) prune per tick,
 * but n is small per agent (<32 entries typical).
 */
export class Memory {
  private entries: Map<string, MemoryEntry> = new Map();
  private readonly maxEntries: number;

  constructor(maxEntries = 32) {
    this.maxEntries = maxEntries;
  }

  store(key: string, value: unknown, position: { x: number; y: number } | null = null, ttl = 5000): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      this.evictOldest();
    }
    this.entries.set(key, {
      key,
      value,
      position,
      timestamp: performance.now(),
      ttl,
    });
  }

  recall(key: string): MemoryEntry | undefined {
    return this.entries.get(key);
  }

  recallPosition(key: string): { x: number; y: number } | null {
    return this.entries.get(key)?.position ?? null;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  forget(key: string): void {
    this.entries.delete(key);
  }

  /** Prune expired entries — call once per AI tick, not every frame */
  prune(now: number = performance.now()): void {
    this.entries.forEach((entry, key) => {
      if (entry.ttl > 0 && now - entry.timestamp > entry.ttl) {
        this.entries.delete(key);
      }
    });
  }

  /** Last known player position — convenience accessor */
  get lastKnownPlayerPos(): { x: number; y: number } | null {
    return this.recallPosition("player_position");
  }

  set lastKnownPlayerPos(pos: { x: number; y: number } | null) {
    if (pos) {
      this.store("player_position", true, pos, 10000);
    }
  }

  /** Environment anomalies — convenience */
  storeAnomaly(id: string, position: { x: number; y: number }, data: unknown, ttl = 8000): void {
    this.store(`anomaly_${id}`, data, position, ttl);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    this.entries.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });
    if (oldestKey) this.entries.delete(oldestKey);
  }
}
