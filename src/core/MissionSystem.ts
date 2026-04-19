// ---------------------------------------------------------------------------
// MissionSystem — Tracks 3 active missions, auto-generates replacements
// ---------------------------------------------------------------------------

export type MissionType =
  | "KILL_COUNT"
  | "WAVE_SURVIVE"
  | "SCRAP_COLLECT"
  | "COMBO_REACH"
  | "WORLD_SWITCH"
  | "BOSS_KILL"
  | "NO_DAMAGE_WAVE"
  | "ABILITY_USE";

export interface MissionReward {
  scrap: number;
  scoreBonus: number;
}

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward: MissionReward;
  completed: boolean;
}

interface MissionTemplate {
  type: MissionType;
  variants: { target: number; title: string; description: string; reward: MissionReward }[];
}

const TEMPLATES: MissionTemplate[] = [
  {
    type: "KILL_COUNT",
    variants: [
      { target: 5, title: "Scrap 5 Machines", description: "Destroy 5 enemies", reward: { scrap: 15, scoreBonus: 200 } },
      { target: 10, title: "Wrecker", description: "Destroy 10 enemies", reward: { scrap: 30, scoreBonus: 500 } },
      { target: 15, title: "Demolisher", description: "Destroy 15 enemies", reward: { scrap: 50, scoreBonus: 800 } },
      { target: 20, title: "Annihilator", description: "Destroy 20 enemies", reward: { scrap: 80, scoreBonus: 1200 } },
    ],
  },
  {
    type: "WAVE_SURVIVE",
    variants: [
      { target: 3, title: "Survive Wave 3", description: "Reach wave 3", reward: { scrap: 25, scoreBonus: 400 } },
      { target: 5, title: "Survive Wave 5", description: "Reach wave 5", reward: { scrap: 50, scoreBonus: 800 } },
      { target: 8, title: "Endurance Run", description: "Reach wave 8", reward: { scrap: 80, scoreBonus: 1500 } },
      { target: 10, title: "Iron Will", description: "Reach wave 10", reward: { scrap: 120, scoreBonus: 2500 } },
    ],
  },
  {
    type: "SCRAP_COLLECT",
    variants: [
      { target: 50, title: "Scavenger", description: "Collect 50 scrap", reward: { scrap: 20, scoreBonus: 300 } },
      { target: 100, title: "Hoarder", description: "Collect 100 scrap", reward: { scrap: 40, scoreBonus: 600 } },
      { target: 200, title: "Scrap Baron", description: "Collect 200 scrap", reward: { scrap: 70, scoreBonus: 1000 } },
    ],
  },
  {
    type: "COMBO_REACH",
    variants: [
      { target: 5, title: "Combo x5", description: "Reach a 5-hit combo", reward: { scrap: 20, scoreBonus: 400 } },
      { target: 8, title: "Combo x8", description: "Reach an 8-hit combo", reward: { scrap: 35, scoreBonus: 700 } },
      { target: 10, title: "Combo x10", description: "Reach a 10-hit combo", reward: { scrap: 50, scoreBonus: 1000 } },
      { target: 15, title: "Combo Master", description: "Reach a 15-hit combo", reward: { scrap: 80, scoreBonus: 1800 } },
    ],
  },
  {
    type: "WORLD_SWITCH",
    variants: [
      { target: 3, title: "Phase Shifter", description: "Switch worlds 3 times", reward: { scrap: 15, scoreBonus: 250 } },
      { target: 5, title: "Dimension Hopper", description: "Switch worlds 5 times", reward: { scrap: 30, scoreBonus: 500 } },
      { target: 10, title: "Reality Breaker", description: "Switch worlds 10 times", reward: { scrap: 50, scoreBonus: 900 } },
    ],
  },
  {
    type: "BOSS_KILL",
    variants: [
      { target: 1, title: "Boss Slayer", description: "Defeat a boss", reward: { scrap: 60, scoreBonus: 1500 } },
    ],
  },
  {
    type: "NO_DAMAGE_WAVE",
    variants: [
      { target: 1, title: "Untouchable", description: "Complete a wave without taking damage", reward: { scrap: 40, scoreBonus: 1000 } },
    ],
  },
  {
    type: "ABILITY_USE",
    variants: [
      { target: 5, title: "Ability Novice", description: "Use abilities 5 times", reward: { scrap: 15, scoreBonus: 300 } },
      { target: 10, title: "Ability Expert", description: "Use abilities 10 times", reward: { scrap: 35, scoreBonus: 700 } },
    ],
  },
];

const MAX_ACTIVE = 3;

export class MissionSystem {
  private active: Mission[] = [];
  private completedQueue: Mission[] = [];
  private nextId = 0;
  private cumulativeKills = 0;
  private cumulativeScrap = 0;
  private cumulativeWorldSwitches = 0;
  private cumulativeAbilityUses = 0;
  private highestCombo = 0;
  private highestWave = 0;

  constructor() {
    // Seed initial missions
    while (this.active.length < MAX_ACTIVE) {
      this._generateMission();
    }
  }

  // --- Event hooks ---

  onKill(): void {
    this.cumulativeKills++;
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "KILL_COUNT") {
        m.progress = this.cumulativeKills;
        this._checkComplete(m);
      }
    }
  }

  onScrapCollect(amount: number): void {
    this.cumulativeScrap += amount;
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "SCRAP_COLLECT") {
        m.progress = this.cumulativeScrap;
        this._checkComplete(m);
      }
    }
  }

  onWaveComplete(wave: number): void {
    this.highestWave = Math.max(this.highestWave, wave);
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "WAVE_SURVIVE") {
        m.progress = this.highestWave;
        this._checkComplete(m);
      }
    }
  }

  onComboReached(combo: number): void {
    this.highestCombo = Math.max(this.highestCombo, combo);
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "COMBO_REACH") {
        m.progress = this.highestCombo;
        this._checkComplete(m);
      }
    }
  }

  onWorldSwitch(): void {
    this.cumulativeWorldSwitches++;
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "WORLD_SWITCH") {
        m.progress = this.cumulativeWorldSwitches;
        this._checkComplete(m);
      }
    }
  }

  onBossKill(): void {
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "BOSS_KILL") {
        m.progress = 1;
        this._checkComplete(m);
      }
    }
  }

  onWaveNoDamage(): void {
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "NO_DAMAGE_WAVE") {
        m.progress = 1;
        this._checkComplete(m);
      }
    }
  }

  onAbilityUse(): void {
    this.cumulativeAbilityUses++;
    for (const m of this.active) {
      if (m.completed) continue;
      if (m.type === "ABILITY_USE") {
        m.progress = this.cumulativeAbilityUses;
        this._checkComplete(m);
      }
    }
  }

  // --- Queries ---

  getActiveMissions(): readonly Mission[] {
    return this.active;
  }

  getCompletedMissions(): readonly Mission[] {
    return this.completedQueue;
  }

  clearCompleted(): void {
    this.completedQueue.length = 0;
  }

  reset(): void {
    this.active = [];
    this.completedQueue = [];
    this.nextId = 0;
    this.cumulativeKills = 0;
    this.cumulativeScrap = 0;
    this.cumulativeWorldSwitches = 0;
    this.cumulativeAbilityUses = 0;
    this.highestCombo = 0;
    this.highestWave = 0;
    while (this.active.length < MAX_ACTIVE) {
      this._generateMission();
    }
  }

  // --- Internal ---

  private _checkComplete(m: Mission): void {
    if (m.progress >= m.target && !m.completed) {
      m.completed = true;
      m.progress = m.target;
      this.completedQueue.push(m);
      // Replace after a short delay (called in update cycle)
      this._replaceCompleted();
    }
  }

  private _replaceCompleted(): void {
    this.active = this.active.filter((m) => !m.completed);
    while (this.active.length < MAX_ACTIVE) {
      this._generateMission();
    }
  }

  private _generateMission(): void {
    const activeTypes = new Set(this.active.map((m) => m.type));
    // Filter out types already active
    const available = TEMPLATES.filter((t) => !activeTypes.has(t.type));
    if (available.length === 0) return;

    const template = available[Math.floor(Math.random() * available.length)];
    const variant = template.variants[Math.floor(Math.random() * template.variants.length)];

    const mission: Mission = {
      id: `mission_${this.nextId++}`,
      type: template.type,
      title: variant.title,
      description: variant.description,
      target: variant.target,
      progress: this._getCurrentProgress(template.type, variant.target),
      reward: { ...variant.reward },
      completed: false,
    };

    // Don't add an already-completed mission
    if (mission.progress >= mission.target) {
      // Try a harder variant if available
      const harder = template.variants.filter((v) => v.target > mission.progress);
      if (harder.length > 0) {
        const h = harder[Math.floor(Math.random() * harder.length)];
        mission.target = h.target;
        mission.title = h.title;
        mission.description = h.description;
        mission.reward = { ...h.reward };
      } else {
        // All variants already completed for this type — skip and try another
        if (available.length > 1) {
          this._generateMission();
          return;
        }
        // Reset progress-style mission so it can still be tracked going forward
        mission.progress = 0;
      }
    }

    this.active.push(mission);
  }

  private _getCurrentProgress(type: MissionType, _target: number): number {
    switch (type) {
      case "KILL_COUNT": return this.cumulativeKills;
      case "SCRAP_COLLECT": return this.cumulativeScrap;
      case "COMBO_REACH": return this.highestCombo;
      case "WORLD_SWITCH": return this.cumulativeWorldSwitches;
      case "WAVE_SURVIVE": return this.highestWave;
      case "ABILITY_USE": return this.cumulativeAbilityUses;
      case "BOSS_KILL": return 0;
      case "NO_DAMAGE_WAVE": return 0;
    }
  }
}
