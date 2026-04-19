export interface Ability {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
  currentCooldown: number;
  keybind: string;
  color: number;
}

export class AbilitySystem {
  private abilities: Map<string, Ability> = new Map();

  constructor() {
    this._register({ id: "nova_burst",   name: "NOVA BURST",   description: "Radial explosion",        cooldownMs: 8000,  currentCooldown: 0, keybind: "E", color: 0x00ffff });
    this._register({ id: "phase_surge",  name: "PHASE SURGE",  description: "8-way phase volley",      cooldownMs: 6000,  currentCooldown: 0, keybind: "R", color: 0xcc44ff });
    this._register({ id: "scrap_shield", name: "SCRAP SHIELD", description: "2s invincibility",        cooldownMs: 12000, currentCooldown: 0, keybind: "F", color: 0xffcc00 });
    this._register({ id: "chrono_pulse", name: "CHRONO PULSE", description: "3s area time dilation", cooldownMs: 16000, currentCooldown: 0, keybind: "C", color: 0x44ccff });
  }

  private _register(a: Ability): void {
    this.abilities.set(a.id, a);
  }

  canUse(id: string): boolean {
    const a = this.abilities.get(id);
    return !!a && a.currentCooldown <= 0;
  }

  trigger(id: string): void {
    const a = this.abilities.get(id);
    if (a) a.currentCooldown = a.cooldownMs;
  }

  update(deltaMs: number): void {
    for (const a of this.abilities.values()) {
      if (a.currentCooldown > 0) a.currentCooldown = Math.max(0, a.currentCooldown - deltaMs);
    }
  }

  getCooldownRatio(id: string): number {
    const a = this.abilities.get(id);
    if (!a || a.cooldownMs === 0) return 1;
    return 1 - a.currentCooldown / a.cooldownMs;
  }

  getAbility(id: string): Ability | undefined {
    return this.abilities.get(id);
  }

  getAll(): Ability[] {
    return [...this.abilities.values()];
  }

  reset(): void {
    for (const a of this.abilities.values()) a.currentCooldown = 0;
  }
}
