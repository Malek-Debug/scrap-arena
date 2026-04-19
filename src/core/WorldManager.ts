export enum WorldType {
  FOUNDRY = "FOUNDRY",   // Sterile lab / clean zone
  CIRCUIT = "CIRCUIT",   // Bio containment zone
}

// Color palettes per world
export const WORLD_PALETTES = {
  [WorldType.FOUNDRY]: {
    voidColor: 0x0d1520,
    particles: [0x44aaff, 0x88ddff, 0x00aaff, 0x22ccff, 0x66bbff],
    gridPrimary: 0x44aaff,
    gridSecondary: 0x2266aa,
    shardColors: [0x44aaff, 0x88ddff],
    borderFrom: { r: 0x44, g: 0xaa, b: 0xff },
    borderTo:   { r: 0x22, g: 0x66, b: 0xaa },
    tintColor: 0x041020,
    flashColor: 0x44aaff,
    label: "LAB SECTOR A",
  },
  [WorldType.CIRCUIT]: {
    voidColor: 0x0a1a0d,
    particles: [0x00ff88, 0x44ffcc, 0x00ddaa, 0x66ff99, 0x22ffbb],
    gridPrimary: 0x00ff88,
    gridSecondary: 0x00aa55,
    shardColors: [0x00ff88, 0x44ffcc],
    borderFrom: { r: 0x00, g: 0xff, b: 0x88 },
    borderTo:   { r: 0x00, g: 0xaa, b: 0x55 },
    tintColor: 0x040e08,
    flashColor: 0x00ff88,
    label: "LAB SECTOR B",
  },
} as const;

export class WorldManager {
  currentWorld: WorldType = WorldType.FOUNDRY;
  private switchCooldown = 0;
  private switchCooldownDuration = 4000;

  // Instability — staying in one world too long is dangerous
  private worldTimer = 0;
  private static readonly INSTABILITY_THRESHOLD = 18000; // 18s before instability
  private static readonly INSTABILITY_DAMAGE_INTERVAL = 1500; // damage tick rate
  private instabilityDmgTimer = 0;

  get canSwitch(): boolean {
    return this.switchCooldown <= 0;
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.switchCooldown);
  }

  get palette() {
    return WORLD_PALETTES[this.currentWorld];
  }

  /** 0-1 how close to instability. 0 = safe, 1 = fully unstable */
  get instability(): number {
    return Math.min(1, Math.max(0, this.worldTimer / WorldManager.INSTABILITY_THRESHOLD));
  }

  /** True if player is taking instability damage */
  get isUnstable(): boolean {
    return this.worldTimer >= WorldManager.INSTABILITY_THRESHOLD;
  }

  switchWorld(): WorldType {
    if (!this.canSwitch) return this.currentWorld;
    this.currentWorld =
      this.currentWorld === WorldType.FOUNDRY
        ? WorldType.CIRCUIT
        : WorldType.FOUNDRY;
    this.switchCooldown = this.switchCooldownDuration;
    this.worldTimer = 0; // Reset instability on switch
    this.instabilityDmgTimer = 0;
    return this.currentWorld;
  }

  setPhaseMastery(level: number): void {
    this.switchCooldownDuration = Math.max(2000, 4000 - level * 500);
  }

  /** Returns instability damage to apply this frame (0 if stable) */
  update(deltaMs: number): number {
    if (this.switchCooldown > 0) this.switchCooldown -= deltaMs;
    this.worldTimer += deltaMs;

    if (this.isUnstable) {
      this.instabilityDmgTimer += deltaMs;
      if (this.instabilityDmgTimer >= WorldManager.INSTABILITY_DAMAGE_INTERVAL) {
        this.instabilityDmgTimer = 0;
        return 3; // 3 damage per tick when unstable
      }
    }
    return 0;
  }
}
