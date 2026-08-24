import { SystemsBus } from "./SystemsBus";

function _shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  cost: number;
  maxLevel: number;
  currentLevel: number;
  minWave?: number;  // earliest wave this upgrade can appear in the shop
  apply: () => void;
}

export interface PlayerStats {
  speed: number;
  damage: number;
  maxHp: number;
  fireRate: number;
  projectileSpeed: number;
  pickupRange: number;
}

export const DEFAULT_STATS: Readonly<PlayerStats> = {
  speed: 200,
  damage: 10,
  maxHp: 100,
  fireRate: 280,
  projectileSpeed: 520,
  pickupRange: 100,
};

const MIN_FIRE_RATE = 150;

export class UpgradeSystem {
  scrap = 0;
  stats: PlayerStats;
  unlockedThemes: Set<string> = new Set(["hub", "power", "armory"]);
  currentWave = 1;  // set by MainScene before opening the shop
  private levels: Record<string, number> = {};

  constructor(playerStats: PlayerStats) {
    this.stats = playerStats;
    this.resetLevels();
  }

  addScrap(amount: number): void {
    this.scrap += amount;
    SystemsBus.instance.emit("upgrade:scrap_changed", this.scrap);
  }

  getAvailableUpgrades(): UpgradeOption[] {
    const defs = this.upgradeDefinitions();
    const available = defs.filter((u) => {
      if (u.currentLevel >= u.maxLevel) return false;
      if (u.minWave !== undefined && this.currentWave < u.minWave) return false;
      return true;
    });
    _shuffle(available);
    return available.slice(0, 5);
  }

  /** Called by WaveOrchestrator when a room auto-unlocks on wave clear.
   *  Marks the card as obtained so it won't appear in the shop as purchasable. */
  markCardObtained(theme: string): void {
    const key = `card_${theme}` as keyof typeof this.levels;
    if (key in this.levels) {
      this.levels[key] = 1;
    }
    this.unlockedThemes.add(theme);
  }

  tryPurchase(upgradeId: string): boolean {
    const upgrade = this.upgradeDefinitions().find((u) => u.id === upgradeId);
    if (!upgrade) return false;
    if (upgrade.currentLevel >= upgrade.maxLevel) return false;
    if (this.scrap < upgrade.cost) return false;

    this.scrap -= upgrade.cost;
    upgrade.apply();
    SystemsBus.instance.emit("upgrade:purchased", upgradeId);
    return true;
  }

  reset(): void {
    this.resetLevels();
    this.unlockedThemes = new Set(["hub", "power", "armory"]);
    this.stats.speed = DEFAULT_STATS.speed;
    this.stats.damage = DEFAULT_STATS.damage;
    this.stats.maxHp = DEFAULT_STATS.maxHp;
    this.stats.fireRate = DEFAULT_STATS.fireRate;
    this.stats.projectileSpeed = DEFAULT_STATS.projectileSpeed;
    this.stats.pickupRange = DEFAULT_STATS.pickupRange;
  }

  private resetLevels(): void {
    this.levels = {
      speed: 0,
      damage: 0,
      maxHp: 0,
      pickupRange: 0,
      multiShot: 0,
      armor: 0,
      phaseMastery: 0,
      rapidFire: 0,
      thermalReg: 0,
      card_factory: 0,
      card_server: 0,
      card_power: 0,
      card_control: 0,
      card_maintenance: 0,
      card_armory: 0,
      card_quarantine: 0,
      card_vault: 0,
      riftsync: 0,
      mirror_plating: 0,
    };
  }

  private lvl(id: string): number {
    return this.levels[id] ?? 0;
  }

  private upgradeDefinitions(): UpgradeOption[] {
    return [
      {
        id: "damage",
        name: "Caliber Upgrade",
        description: `Hit harder, overheat faster\nDmg +5 (${this.stats.damage}→${this.stats.damage + 5}) | Heat +2/shot`,
        cost: 12 + this.lvl("damage") * 10,
        maxLevel: 4,
        currentLevel: this.lvl("damage"),
        apply: () => {
          this.stats.damage += 5;
          this.levels.damage++;
        },
      },
      {
        id: "thermalReg",
        name: "Thermal Regulator",
        description: `Cool faster, recover sooner\nCooling +8/s | Lockout -300ms`,
        cost: 15 + this.lvl("thermalReg") * 12,
        maxLevel: 3,
        currentLevel: this.lvl("thermalReg"),
        apply: () => {
          this.levels.thermalReg++;
        },
      },
      {
        id: "rapidFire",
        name: "Rapid Fire",
        description: `Shoot faster, bullets fly further\nRate -30ms (${this.stats.fireRate}→${Math.max(MIN_FIRE_RATE, this.stats.fireRate - 30)}) | Spd +60`,
        cost: 18 + this.lvl("rapidFire") * 14,
        maxLevel: 3,
        currentLevel: this.lvl("rapidFire"),
        apply: () => {
          this.stats.fireRate = Math.max(MIN_FIRE_RATE, this.stats.fireRate - 30);
          this.stats.projectileSpeed += 60;
          this.levels.rapidFire++;
        },
      },
      {
        id: "multiShot",
        name: "Multi-Shot",
        description: `Spread fire, great vs groups\nProjectiles +2 (${1 + this.lvl("multiShot") * 2}→${1 + (this.lvl("multiShot") + 1) * 2}) | Heat +3/shot`,
        cost: 22 + this.lvl("multiShot") * 18,
        maxLevel: 3,
        currentLevel: this.lvl("multiShot"),
        apply: () => {
          this.levels.multiShot++;
        },
      },
      {
        id: "speed",
        name: "Thruster Boost",
        description: `Move & dash faster\nSpeed +35 (${this.stats.speed}→${this.stats.speed + 35}) | Dash +12%`,
        cost: 15 + this.lvl("speed") * 10,
        maxLevel: 3,
        currentLevel: this.lvl("speed"),
        apply: () => {
          this.stats.speed += 35;
          this.levels.speed++;
        },
      },
      {
        id: "maxHp",
        name: "Hull Reinforcement",
        description: `Tank more hits, heal on kills\nHP +25 (${this.stats.maxHp}→${this.stats.maxHp + 25}) | Kill heal +1`,
        cost: 20 + this.lvl("maxHp") * 12,
        maxLevel: 4,
        currentLevel: this.lvl("maxHp"),
        apply: () => {
          this.stats.maxHp += 25;
          this.levels.maxHp++;
        },
      },
      {
        id: "armor",
        name: "Armor Plating",
        description: `Take less damage from all sources\nDR +15% (${this.lvl("armor") * 15}%→${(this.lvl("armor") + 1) * 15}%)`,
        cost: 20 + this.lvl("armor") * 12,
        maxLevel: 3,
        currentLevel: this.lvl("armor"),
        apply: () => {
          this.levels.armor++;
        },
      },
      {
        id: "phaseMastery",
        name: "Phase Mastery",
        description: `Switch dimensions faster, longer surges\nCD ${(4.0 - this.lvl("phaseMastery") * 0.6).toFixed(1)}s→${(4.0 - (this.lvl("phaseMastery") + 1) * 0.6).toFixed(1)}s | Surge +0.5s`,
        cost: 22 + this.lvl("phaseMastery") * 15,
        maxLevel: 3,
        currentLevel: this.lvl("phaseMastery"),
        apply: () => {
          this.levels.phaseMastery++;
        },
      },
      {
        id: "pickupRange",
        name: "Magnet Array",
        description: `Collect scrap from further away\nRange +50px (${this.stats.pickupRange}→${this.stats.pickupRange + 50})`,
        cost: 8 + this.lvl("pickupRange") * 5,
        maxLevel: 3,
        currentLevel: this.lvl("pickupRange"),
        apply: () => {
          this.stats.pickupRange += 50;
          this.levels.pickupRange++;
        },
      },
      // ─── Specialty Upgrades ───────────────────────────────────
      {
        id: "riftsync",
        name: "Rift Sync",
        description: "Bullets hit both dimensions\nGhost echo at 40% dmg in alternate phase",
        cost: 28,
        maxLevel: 1,
        minWave: 3,
        currentLevel: this.lvl("riftsync"),
        apply: () => { this.levels["riftsync"]++; },
      },
      {
        id: "mirror_plating",
        name: "Mirror Plating",
        description: "Turn enemy fire against them\nReflect projectiles back at full damage",
        cost: 32,
        maxLevel: 1,
        minWave: 5,
        currentLevel: this.lvl("mirror_plating"),
        apply: () => { this.levels["mirror_plating"]++; },
      },
    ];
  }

  get phaseMasteryLevel(): number {
    return this.levels["phaseMastery"] ?? 0;
  }

  get multiShotLevel(): number {
    return this.levels["multiShot"] ?? 0;
  }

  get armorLevel(): number {
    return this.levels["armor"] ?? 0;
  }

  get thermalRegLevel(): number { return this.levels["thermalReg"] ?? 0; }

  get hullLevel(): number { return this.levels["maxHp"] ?? 0; }

  get speedLevel(): number { return this.levels["speed"] ?? 0; }

  /** Extra heat per shot from Caliber and Multi-Shot upgrades. */
  get heatPenalty(): number {
    return (this.levels["damage"] ?? 0) * 2 + (this.levels["multiShot"] ?? 0) * 3;
  }

  /** Extra heat dissipation/sec from Thermal Regulator. */
  get bonusCooling(): number {
    return (this.levels["thermalReg"] ?? 0) * 8;
  }

  /** Overheat duration reduction (ms) from Thermal Regulator. */
  get overheatReduction(): number {
    return (this.levels["thermalReg"] ?? 0) * 300;
  }

  /** Phase Surge duration bonus (ms) from Phase Mastery. */
  get phaseSurgeBonus(): number {
    return (this.levels["phaseMastery"] ?? 0) * 500;
  }

  /** Dash force multiplier from Thruster Boost. */
  get dashForceMult(): number {
    return 1 + (this.levels["speed"] ?? 0) * 0.12;
  }

  /** Kill regen bonus from Hull Reinforcement. */
  get killRegenBonus(): number {
    return (this.levels["maxHp"] ?? 0);
  }

  get riftsyncLevel(): number { return this.levels["riftsync"] ?? 0; }
  get mirrorPlatingLevel(): number { return this.levels["mirror_plating"] ?? 0; }
}
