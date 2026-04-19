import { SystemsBus } from "../core/SystemsBus";

export interface ResourceNodeData {
  id: number;
  x: number;
  y: number;
  value: number;
  respawnMs: number;
  active: boolean;
}

/**
 * Manages spawnable resource nodes in the world.
 * Agents query this registry; harvesting triggers respawn timers.
 */
export class ResourceSystem {
  private static _instance: ResourceSystem;
  private nodes: Map<number, ResourceNodeData> = new Map();
  private nextId = 0;

  static get instance(): ResourceSystem {
    return (this._instance ??= new ResourceSystem());
  }

  spawn(x: number, y: number, value = 20, respawnMs = 8000): ResourceNodeData {
    const node: ResourceNodeData = {
      id: this.nextId++,
      x, y, value,
      respawnMs,
      active: true,
    };
    this.nodes.set(node.id, node);
    SystemsBus.instance.emit("resource:spawned", node);
    return node;
  }

  harvest(id: number): number {
    const node = this.nodes.get(id);
    if (!node || !node.active) return 0;
    node.active = false;
    SystemsBus.instance.emit("resource:harvested", node);
    setTimeout(() => {
      node.active = true;
      SystemsBus.instance.emit("resource:respawned", node);
    }, node.respawnMs);
    return node.value;
  }

  /** Returns all active nodes sorted by distance from (x,y) */
  nearestActive(x: number, y: number, maxCount = 4): ResourceNodeData[] {
    const result: ResourceNodeData[] = [];
    this.nodes.forEach((n) => { if (n.active) result.push(n); });
    result.sort((a, b) => {
      const da = (a.x - x) ** 2 + (a.y - y) ** 2;
      const db = (b.x - x) ** 2 + (b.y - y) ** 2;
      return da - db;
    });
    return result.slice(0, maxCount);
  }

  getAll(): ResourceNodeData[] {
    return Array.from(this.nodes.values());
  }

  clear(): void {
    this.nodes.clear();
  }
}
