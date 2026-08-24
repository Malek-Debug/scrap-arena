export type AbilityEffect =
  | { type: 'overdrive'; fireRateMultiplier: number; damageMultiplier: number }
  | { type: 'shield'; blockAmount: number }
  | { type: 'phase_dash'; distance: number; invulnDuration: number }
  | { type: 'repair_drone'; healPerSecond: number };

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  description: string;
  color: number;
  accentColor: number;
  stats: {
    maxHp: number;
    speed: number;
    damage: number;
    fireRate: number;
    projectileSpeed: number;
    armor: number;
  };
  ability: {
    name: string;
    description: string;
    cooldown: number;
    duration: number;
    effect: AbilityEffect;
  };
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'forge',
    name: 'FORGE',
    role: 'Assault',
    description: 'High-output combat machine built for sustained aggression. Overdrive pushes weapons past safe limits.',
    color: 0xff6600,
    accentColor: 0xffaa44,
    stats: {
      maxHp: 100,
      speed: 220,
      damage: 12,
      fireRate: 280,
      projectileSpeed: 600,
      armor: 0,
    },
    ability: {
      name: 'OVERDRIVE',
      description: '+50% fire rate, +25% damage for 5s',
      cooldown: 18000,
      duration: 5000,
      effect: { type: 'overdrive', fireRateMultiplier: 0.5, damageMultiplier: 1.25 },
    },
  },
  {
    id: 'bastion',
    name: 'BASTION',
    role: 'Sentinel',
    description: 'Armored guardian with reinforced plating. Energy Shield absorbs incoming fire while you hold the line.',
    color: 0x3388ff,
    accentColor: 0x88ccff,
    stats: {
      maxHp: 140,
      speed: 170,
      damage: 10,
      fireRate: 350,
      projectileSpeed: 550,
      armor: 0.15,
    },
    ability: {
      name: 'ENERGY SHIELD',
      description: 'Absorbs 100 damage for 4s',
      cooldown: 15000,
      duration: 4000,
      effect: { type: 'shield', blockAmount: 100 },
    },
  },
  {
    id: 'specter',
    name: 'SPECTER',
    role: 'Phantom',
    description: 'Phase-shifting infiltrator. Trades durability for unmatched speed and the ability to blink through danger.',
    color: 0xaa44ff,
    accentColor: 0xdd88ff,
    stats: {
      maxHp: 85,
      speed: 280,
      damage: 9,
      fireRate: 250,
      projectileSpeed: 700,
      armor: 0,
    },
    ability: {
      name: 'PHASE DASH',
      description: 'Teleport 200px forward, 0.5s invulnerable',
      cooldown: 10000,
      duration: 500,
      effect: { type: 'phase_dash', distance: 200, invulnDuration: 500 },
    },
  },
  {
    id: 'foundry',
    name: 'FOUNDRY',
    role: 'Engineer',
    description: 'Self-sustaining factory unit. Deploys repair drones to outlast opponents through attrition.',
    color: 0x00cc66,
    accentColor: 0x66ffaa,
    stats: {
      maxHp: 110,
      speed: 200,
      damage: 11,
      fireRate: 320,
      projectileSpeed: 580,
      armor: 0.05,
    },
    ability: {
      name: 'REPAIR DRONE',
      description: 'Heal 5 HP/s for 6s',
      cooldown: 20000,
      duration: 6000,
      effect: { type: 'repair_drone', healPerSecond: 5 },
    },
  },
];

export function getCharacterById(id: string): CharacterDef | undefined {
  return CHARACTERS.find(c => c.id === id);
}
