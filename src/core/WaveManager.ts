import { SystemsBus } from "./SystemsBus";

export type WaveEventType =
  | "normal" | "elite_surge" | "swarm" | "fortress" | "shadow_protocol" | "final_push";

export interface WaveEvent {
  type: WaveEventType;
  label: string;
  description: string;
  color: string;
  modifiers: {
    hpMult: number; speedMult: number; countMult: number; damageMult: number;
    turretBonus: number; sawbladeBonus: number;
  };
}

const WAVE_EVENTS: Record<WaveEventType, WaveEvent> = {
  normal:          { type: "normal",          label: "COMBAT WAVE",      description: "Destroy all enemies",                  color: "#00ff88", modifiers: { hpMult:1,   speedMult:1,   countMult:1,   damageMult:1,   turretBonus:0, sawbladeBonus:0 } },
  elite_surge:     { type: "elite_surge",     label: "ELITE SURGE",      description: "Elite units — 2x HP & damage",         color: "#ff6600", modifiers: { hpMult:2,   speedMult:1.3, countMult:0.8, damageMult:2,   turretBonus:1, sawbladeBonus:2 } },
  swarm:           { type: "swarm",           label: "SWARM PROTOCOL",   description: "Overwhelming numbers — stay mobile!",  color: "#ff0044", modifiers: { hpMult:0.5, speedMult:1.5, countMult:3,   damageMult:0.8, turretBonus:0, sawbladeBonus:3 } },
  fortress:        { type: "fortress",        label: "FORTRESS MODE",    description: "Heavily armored positions",            color: "#ffaa00", modifiers: { hpMult:2.5, speedMult:0.6, countMult:0.6, damageMult:1.5, turretBonus:4, sawbladeBonus:0 } },
  shadow_protocol: { type: "shadow_protocol", label: "SHADOW PROTOCOL",  description: "Enemies breach dimensions rapidly",    color: "#cc44ff", modifiers: { hpMult:1.2, speedMult:1.2, countMult:1.2, damageMult:1.5, turretBonus:2, sawbladeBonus:2 } },
  final_push:      { type: "final_push",      label: "FINAL PUSH",       description: "Maximum resistance — survive!",        color: "#ffffff", modifiers: { hpMult:1.5, speedMult:1.3, countMult:2,   damageMult:1.5, turretBonus:3, sawbladeBonus:3 } },
};

const WAVE_EVENT_SEQUENCE: WaveEventType[] = [
  "normal", "normal", "swarm", "fortress", "normal",
  "elite_surge", "swarm", "shadow_protocol", "fortress", "final_push",
];

export interface WaveManagerConfig {
  baseEnemyCount: number;
  enemyScaling: number;
  restDurationMs: number;
}

export interface WaveConfig {
  enemyCount: number;
  guardCount: number;
  collectorCount: number;
  turretCount: number;
  sawbladeCount: number;
  welderCount: number;
  enemyHp: number;
  enemySpeed: number;
}

const DEFAULT_CONFIG: WaveManagerConfig = {
  baseEnemyCount: 5,
  enemyScaling: 1.25,
  restDurationMs: 4000,
};

export class WaveManager {
  public currentWave: number = 0;
  public isActive: boolean = false;
  public isResting: boolean = false;
  public restTimer: number = 0;

  private config: WaveManagerConfig;

  constructor(config: Partial<WaveManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  startWave(): void {
    this.currentWave++;
    this.isActive = true;
    this.isResting = false;
    this.restTimer = 0;
    SystemsBus.instance.emit("wave:start", this.currentWave);
  }

  getWaveEvent(wave: number): WaveEvent {
    const isBossWave = wave % 5 === 0;
    if (isBossWave) return WAVE_EVENTS["normal"];
    const idx = (wave - 1) % WAVE_EVENT_SEQUENCE.length;
    return WAVE_EVENTS[WAVE_EVENT_SEQUENCE[idx]];
  }

  getWaveConfig(): WaveConfig {
    const wave = this.currentWave;
    const enemyCount = Math.min(12, Math.floor(
      this.config.baseEnemyCount * Math.pow(this.config.enemyScaling, wave - 1)
    ));
    const guardCount = Math.min(1 + Math.floor(wave * 0.7), 8);
    const collectorCount = Math.min(2 + Math.floor(wave * 0.6), 8);
    const turretCount = wave >= 4 ? Math.min(Math.floor((wave - 3) * 0.8), 4) : 0;
    const sawbladeCount = wave >= 2 ? Math.min(wave - 1, 4) : 0;
    const welderCount = wave >= 2 ? Math.min(1 + Math.floor((wave - 2) * 0.6), 4) : 0;
    const enemyHp = 40 + wave * 12;
    const enemySpeed = Math.min(95 + wave * 7, 200);

    return { enemyCount, guardCount, collectorCount, turretCount, sawbladeCount, welderCount, enemyHp, enemySpeed };
  }

  onWaveCleared(): void {
    this.isActive = false;
    this.isResting = true;
    this.restTimer = this.config.restDurationMs;
    SystemsBus.instance.emit("wave:cleared", this.currentWave);
  }

  update(deltaMs: number): void {
    if (!this.isResting) return;

    this.restTimer -= deltaMs;
    if (this.restTimer <= 0) {
      this.isResting = false;
      this.restTimer = 0;
      SystemsBus.instance.emit("wave:rest_end", this.currentWave);
      // NOTE: Do NOT auto-start next wave. The scene's trigger system handles it.
    }
  }

  reset(): void {
    this.currentWave = 0;
    this.isActive = false;
    this.isResting = false;
    this.restTimer = 0;
  }
}
