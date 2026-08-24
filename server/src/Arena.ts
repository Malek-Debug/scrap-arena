import type { Vec2 } from "./NetworkMessages.js";

export interface ArenaObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickupSpawn {
  x: number;
  y: number;
  type: "health" | "speed" | "damage";
  respawnTime: number; // ms
}

export interface ArenaDef {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnPoints: Vec2[];
  obstacles: ArenaObstacle[];
  pickupSpawns: PickupSpawn[];
}

// Scrap Pit arena - designed for 4-player PvP
// Layout: Central open area with surrounding cover, multiple routes, choke points
export const SCRAP_PIT_ARENA: ArenaDef = {
  id: "scrap_pit",
  name: "THE SCRAP PIT",
  width: 2400,
  height: 1600,

  // 8 spawn points distributed around the perimeter for fair spawning
  spawnPoints: [
    { x: 200, y: 200 },    // top-left
    { x: 1200, y: 150 },   // top-center
    { x: 2200, y: 200 },   // top-right
    { x: 2200, y: 1400 },  // bottom-right
    { x: 1200, y: 1450 },  // bottom-center
    { x: 200, y: 1400 },   // bottom-left
    { x: 200, y: 800 },    // mid-left
    { x: 2200, y: 800 },   // mid-right
  ],

  obstacles: [
    // Central structure - provides cover in the middle
    { x: 1100, y: 700, width: 200, height: 200 },

    // Top corridor walls
    { x: 500, y: 300, width: 180, height: 40 },
    { x: 1700, y: 300, width: 180, height: 40 },

    // Bottom corridor walls
    { x: 500, y: 1260, width: 180, height: 40 },
    { x: 1700, y: 1260, width: 180, height: 40 },

    // Left side cover
    { x: 380, y: 600, width: 60, height: 120 },
    { x: 380, y: 880, width: 60, height: 120 },

    // Right side cover
    { x: 1960, y: 600, width: 60, height: 120 },
    { x: 1960, y: 880, width: 60, height: 120 },

    // Inner ring pillars (create flanking routes around center)
    { x: 800, y: 500, width: 80, height: 80 },
    { x: 1520, y: 500, width: 80, height: 80 },
    { x: 800, y: 1020, width: 80, height: 80 },
    { x: 1520, y: 1020, width: 80, height: 80 },

    // Corner structures
    { x: 100, y: 100, width: 100, height: 60 },
    { x: 2200, y: 100, width: 100, height: 60 },
    { x: 100, y: 1440, width: 100, height: 60 },
    { x: 2200, y: 1440, width: 100, height: 60 },

    // Mid-lane horizontal walls creating choke points
    { x: 650, y: 780, width: 140, height: 40 },
    { x: 1610, y: 780, width: 140, height: 40 },

    // Boundary walls
    { x: 0, y: 0, width: 2400, height: 20 },      // top
    { x: 0, y: 1580, width: 2400, height: 20 },   // bottom
    { x: 0, y: 0, width: 20, height: 1600 },      // left
    { x: 2380, y: 0, width: 20, height: 1600 },   // right
  ],

  pickupSpawns: [
    // Health pickups - near corners, away from direct combat
    { x: 300, y: 400, type: "health", respawnTime: 20000 },
    { x: 2100, y: 400, type: "health", respawnTime: 20000 },
    { x: 300, y: 1200, type: "health", respawnTime: 20000 },
    { x: 2100, y: 1200, type: "health", respawnTime: 20000 },

    // Damage boost - central, high-risk high-reward
    { x: 1200, y: 800, type: "damage", respawnTime: 30000 },

    // Speed pickups - mid lanes
    { x: 600, y: 800, type: "speed", respawnTime: 25000 },
    { x: 1800, y: 800, type: "speed", respawnTime: 25000 },
  ],
};

export function getArena(id: string): ArenaDef {
  if (id === "scrap_pit") return SCRAP_PIT_ARENA;
  return SCRAP_PIT_ARENA;
}

export function getRandomSpawnPoint(arena: ArenaDef, excludePositions: Vec2[], minDistance: number): Vec2 {
  const available = arena.spawnPoints.filter(sp => {
    for (const pos of excludePositions) {
      const dx = sp.x - pos.x;
      const dy = sp.y - pos.y;
      if (dx * dx + dy * dy < minDistance * minDistance) return false;
    }
    return true;
  });

  if (available.length === 0) {
    // Fallback: pick the spawn furthest from all occupied positions
    let best = arena.spawnPoints[0];
    let bestDist = 0;
    for (const sp of arena.spawnPoints) {
      let minDist = Infinity;
      for (const pos of excludePositions) {
        const dx = sp.x - pos.x;
        const dy = sp.y - pos.y;
        minDist = Math.min(minDist, dx * dx + dy * dy);
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        best = sp;
      }
    }
    return { x: best.x, y: best.y };
  }

  const idx = Math.floor(Math.random() * available.length);
  return { x: available[idx].x, y: available[idx].y };
}
