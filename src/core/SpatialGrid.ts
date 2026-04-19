/**
 * Fixed-cell spatial hash grid for O(1) average neighbor lookups.
 * Partitions the world into cells; each entity registers by cell.
 * Clear and rebuild each AI tick — no incremental update overhead.
 *
 * Supports 500+ agents without O(n²) distance scans.
 */
export class SpatialGrid {
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private cells: Map<number, number[]>;

  constructor(worldWidth: number, worldHeight: number, cellSize = 80) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.cells = new Map();
  }

  private key(col: number, row: number): number {
    return col + row * this.cols;
  }

  private cellOf(x: number, y: number): [number, number] {
    return [
      Math.max(0, Math.min(this.cols - 1, (x / this.cellSize) | 0)),
      Math.max(0, Math.min(this.rows - 1, (y / this.cellSize) | 0)),
    ];
  }

  clear(): void {
    this.cells.clear();
  }

  insert(id: number, x: number, y: number): void {
    const [c, r] = this.cellOf(x, y);
    const k = this.key(c, r);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(id);
  }

  /**
   * Returns all entity IDs within `radius` of (x,y).
   * Writes into `out` array to avoid allocation — caller clears between uses.
   */
  query(x: number, y: number, radius: number, out: number[]): void {
    const [cc, cr] = this.cellOf(x, y);
    const span = Math.ceil(radius / this.cellSize);
    const r2 = radius * radius;

    for (let dc = -span; dc <= span; dc++) {
      const col = cc + dc;
      if (col < 0 || col >= this.cols) continue;
      for (let dr = -span; dr <= span; dr++) {
        const row = cr + dr;
        if (row < 0 || row >= this.rows) continue;
        const cell = this.cells.get(this.key(col, row));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          out.push(cell[i]);
        }
      }
    }
  }

  /** Nearest entity ID within radius, excluding self. Returns -1 if none. */
  nearest(x: number, y: number, radius: number, selfId: number, positions: Float32Array): number {
    const candidates: number[] = [];
    this.query(x, y, radius, candidates);

    let bestId = -1;
    let bestDist = radius * radius;

    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      if (id === selfId) continue;
      const ox = positions[id * 2] - x;
      const oy = positions[id * 2 + 1] - y;
      const d2 = ox * ox + oy * oy;
      if (d2 < bestDist) {
        bestDist = d2;
        bestId = id;
      }
    }
    return bestId;
  }
}
