import { SystemsBus } from "./SystemsBus";

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  cost: number;
  maxLevel: number;
  currentLevel: number;
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

const DEFAULT_STATS: Readonly<PlayerStats> = {
  speed: 200,
  damage: 10,
  maxHp: 100,
  fireRate: 400,
  projectileSpeed: 400,
  pickupRange: 100,
};

const MIN_FIRE_RATE = 150;

export class UpgradeSystem {
  scrap = 0;
  stats: PlayerStats;
  unlockedThemes: Set<string> = new Set(["hub", "power", "armory"]);
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
    // Rooms auto-unlock on wave clear — exclude card_ upgrades from shop
    return defs.filter((u) => u.currentLevel < u.maxLevel && !u.id.startsWith("card_"));
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
      fireRate: 0,
      pickupRange: 0,
      multiShot: 0,
      armor: 0,
      phaseMastery: 0,
      rapidFire: 0,
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
        id: "speed",
        name: "Thruster Boost",
        description: "+30 speed per level",
        cost: 15 + this.lvl("speed") * 10,
        maxLevel: 3,
        currentLevel: this.lvl("speed"),
        apply: () => {
          this.stats.speed += 30;
          this.levels.speed++;
        },
      },
      {
        id: "damage",
        name: "Caliber Upgrade",
        description: "+5 damage per level",
        cost: 10 + this.lvl("damage") * 8,
        maxLevel: 5,
        currentLevel: this.lvl("damage"),
        apply: () => {
          this.stats.damage += 5;
          this.levels.damage++;
        },
      },
      {
        id: "maxHp",
        name: "Armor Plating",
        description: "+25 maxHp per level",
        cost: 20 + this.lvl("maxHp") * 12,
        maxLevel: 4,
        currentLevel: this.lvl("maxHp"),
        apply: () => {
          this.stats.maxHp += 25;
          this.levels.maxHp++;
        },
      },
      {
        id: "fireRate",
        name: "Rapid Servos",
        description: "-60ms cooldown per level",
        cost: 15 + this.lvl("fireRate") * 10,
        maxLevel: 4,
        currentLevel: this.lvl("fireRate"),
        apply: () => {
          this.stats.fireRate = Math.max(MIN_FIRE_RATE, this.stats.fireRate - 60);
          this.levels.fireRate++;
        },
      },
      {
        id: "pickupRange",
        name: "Magnet Array",
        description: "+40 pickup range per level",
        cost: 10 + this.lvl("pickupRange") * 5,
        maxLevel: 3,
        currentLevel: this.lvl("pickupRange"),
        apply: () => {
          this.stats.pickupRange += 40;
          this.levels.pickupRange++;
        },
      },
      {
        id: "multiShot",
        name: "Multi-Shot",
        description: "Fire spread of projectiles (+2 per level)",
        cost: 20 + this.lvl("multiShot") * 15,
        maxLevel: 3,
        currentLevel: this.lvl("multiShot"),
        apply: () => {
          this.levels.multiShot++;
        },
      },
      {
        id: "armor",
        name: "Armor Plating",
        description: "Reduce incoming damage by 15%",
        cost: 20 + this.lvl("armor") * 12,
        maxLevel: 3,
        currentLevel: this.lvl("armor"),
        apply: () => {
          this.stats.maxHp += 30;
          this.levels.armor++;
        },
      },
      {
        id: "phaseMastery",
        name: "Phase Mastery",
        description: "Reduce world switch cooldown by 0.5s",
        cost: 25 + this.lvl("phaseMastery") * 20,
        maxLevel: 2,
        currentLevel: this.lvl("phaseMastery"),
        apply: () => {
          this.levels.phaseMastery++;
        },
      },
      {
        id: "rapidFire",
        name: "Rapid Fire",
        description: "Fire rate +15%",
        cost: 18 + this.lvl("rapidFire") * 12,
        maxLevel: 3,
        currentLevel: this.lvl("rapidFire"),
        apply: () => {
          this.stats.fireRate = Math.max(MIN_FIRE_RATE, this.stats.fireRate - 40);
          this.levels.rapidFire++;
        },
      },
      // ─── Room Access Cards ───────────────────────────────────
      {
        id: "riftsync",
        name: "Rift Sync",
        description: "Each bullet echoes a ghost shot (40% dmg, alternate phase)",
        cost: 30,
        maxLevel: 1,
        currentLevel: this.lvl("riftsync"),
        apply: () => { this.levels["riftsync"]++; },
      },
      {
        id: "mirror_plating",
        name: "Mirror Plating",
        description: "Scrap Shield reflects bullets back to nearest enemy",
        cost: 35,
        maxLevel: 1,
        currentLevel: this.lvl("mirror_plating"),
        apply: () => { this.levels["mirror_plating"]++; },
      },
      {
        id: "card_factory",
        name: "Bio Lab Access Card",
        description: "Unlocks the Bio Lab sector. Permanently disables the bio-barrier.",
        cost: 20,
        maxLevel: 1,
        currentLevel: this.lvl("card_factory"),
        apply: () => {
          this.unlockedThemes.add("factory");
          this.levels.card_factory++;
        },
      },
      {
        id: "card_server",
        name: "Data Lab Access Card",
        description: "Unlocks the Data Lab sector. Disables the data-barrier.",
        cost: 20,
        maxLevel: 1,
        currentLevel: this.lvl("card_server"),
        apply: () => {
          this.unlockedThemes.add("server");
          this.levels.card_server++;
        },
      },
      {
        id: "card_power",
        name: "Reactor Core Access Card",
        description: "Unlocks the Reactor Core sector. High-risk, high-reward zone.",
        cost: 25,
        maxLevel: 1,
        currentLevel: this.lvl("card_power"),
        apply: () => {
          this.unlockedThemes.add("power");
          this.levels.card_power++;
        },
      },
      {
        id: "card_control",
        name: "Cmd Center Access Card",
        description: "Unlocks the Command Center sector.",
        cost: 25,
        maxLevel: 1,
        currentLevel: this.lvl("card_control"),
        apply: () => {
          this.unlockedThemes.add("control");
          this.levels.card_control++;
        },
      },
      {
        id: "card_maintenance",
        name: "Supply Depot Access Card",
        description: "Unlocks the Supply Depot sector.",
        cost: 15,
        maxLevel: 1,
        currentLevel: this.lvl("card_maintenance"),
        apply: () => {
          this.unlockedThemes.add("maintenance");
          this.levels.card_maintenance++;
        },
      },
      {
        id: "card_armory",
        name: "Armory Access Card",
        description: "Unlocks the Armory — faster bullets and combat drills. High-intensity zone.",
        cost: 20,
        maxLevel: 1,
        currentLevel: this.lvl("card_armory"),
        apply: () => {
          this.unlockedThemes.add("armory");
          this.levels.card_armory++;
        },
      },
      {
        id: "card_quarantine",
        name: "Quarantine Access Card",
        description: "Unlocks the Quarantine Zone — toxic fog, hazardous floor. Proceed with caution.",
        cost: 25,
        maxLevel: 1,
        currentLevel: this.lvl("card_quarantine"),
        apply: () => {
          this.unlockedThemes.add("quarantine");
          this.levels.card_quarantine++;
        },
      },
      {
        id: "card_vault",
        name: "Secure Vault Access Card",
        description: "Unlocks the Secure Vault — slow bullets, elite guards, high-value loot.",
        cost: 35,
        maxLevel: 1,
        currentLevel: this.lvl("card_vault"),
        apply: () => {
          this.unlockedThemes.add("vault");
          this.levels.card_vault++;
        },
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

  get riftsyncLevel(): number { return this.levels["riftsync"] ?? 0; }
  get mirrorPlatingLevel(): number { return this.levels["mirror_plating"] ?? 0; }
}
