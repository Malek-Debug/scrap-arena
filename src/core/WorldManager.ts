export enum WorldType {
  FOUNDRY = "FOUNDRY",   // Machine Core — industrial copper dimension
  CIRCUIT = "CIRCUIT",   // Void Sector — fractured violet dimension
}

// Color palettes per world — realistic atmospheric machine aesthetics
export const WORLD_PALETTES = {
  [WorldType.FOUNDRY]: {
    voidColor:     0x06090a,
    particles:     [0xd4832a, 0xb06820, 0xee9a3a, 0xaa6224, 0xf5aa44],
    gridPrimary:   0xcc7733,
    gridSecondary: 0x7a4a1a,
    shardColors:   [0xd4832a, 0xee9a3a],
    borderFrom:    { r: 0xcc, g: 0x77, b: 0x33 },
    borderTo:      { r: 0x7a, g: 0x4a, b: 0x1a },
    tintColor:     0x05070a,
    flashColor:    0xee9a3a,
    label:         "MACHINE CORE",
  },
  [WorldType.CIRCUIT]: {
    voidColor:     0x07040f,
    particles:     [0x9933ff, 0x7722dd, 0xbb55ff, 0x8833ee, 0xcc66ff],
    gridPrimary:   0xaa33ff,
    gridSecondary: 0x5511aa,
    shardColors:   [0xaa33ff, 0xcc55ff],
    borderFrom:    { r: 0xaa, g: 0x33, b: 0xff },
    borderTo:      { r: 0x55, g: 0x11, b: 0xaa },
    tintColor:     0x060408,
    flashColor:    0xcc44ff,
    label:         "VOID SECTOR",
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
