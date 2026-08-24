import type { CharacterId } from "./NetworkMessages.js";

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  description: string;
  maxHp: number;
  speed: number;
  damage: number;
  fireRate: number; // ms between shots
  projectileSpeed: number;
  dashCooldown: number; // ms
  dashDistance: number;
  dashDuration: number; // ms
  abilityCooldown: number; // ms
  abilityName: string;
  abilityDuration: number; // ms
  bodyRadius: number;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  assault: {
    id: "assault",
    name: "WRECKER",
    role: "Assault",
    description: "High-output weapons platform. Overdrive overclocks all systems for devastating burst damage.",
    maxHp: 100,
    speed: 220,
    damage: 14,
    fireRate: 180,
    projectileSpeed: 700,
    dashCooldown: 1200,
    dashDistance: 180,
    dashDuration: 150,
    abilityCooldown: 18000,
    abilityName: "Overdrive",
    abilityDuration: 5000,
    bodyRadius: 18,
  },
  sentinel: {
    id: "sentinel",
    name: "BASTION",
    role: "Sentinel",
    description: "Heavy armor core. Energy Shield projects a damage-absorbing barrier on demand.",
    maxHp: 150,
    speed: 170,
    damage: 10,
    fireRate: 280,
    projectileSpeed: 600,
    dashCooldown: 1800,
    dashDistance: 120,
    dashDuration: 180,
    abilityCooldown: 14000,
    abilityName: "Energy Shield",
    abilityDuration: 4000,
    bodyRadius: 22,
  },
  phantom: {
    id: "phantom",
    name: "SPECTRE",
    role: "Phantom",
    description: "Ultra-fast recon frame. Phase Dash tears through space, becoming untouchable mid-leap.",
    maxHp: 80,
    speed: 280,
    damage: 11,
    fireRate: 200,
    projectileSpeed: 750,
    dashCooldown: 800,
    dashDistance: 240,
    dashDuration: 120,
    abilityCooldown: 10000,
    abilityName: "Phase Dash",
    abilityDuration: 500,
    bodyRadius: 15,
  },
  engineer: {
    id: "engineer",
    name: "FORGE",
    role: "Engineer",
    description: "Adaptive support chassis. Repair Drone provides sustained healing in the heat of battle.",
    maxHp: 110,
    speed: 200,
    damage: 12,
    fireRate: 240,
    projectileSpeed: 650,
    dashCooldown: 1400,
    dashDistance: 150,
    dashDuration: 160,
    abilityCooldown: 20000,
    abilityName: "Repair Drone",
    abilityDuration: 6000,
    bodyRadius: 20,
  },
};

export function getCharacter(id: CharacterId): CharacterDef {
  return CHARACTERS[id];
}
