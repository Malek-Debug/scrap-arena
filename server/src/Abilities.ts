import { Player } from "./Player.js";
import type { CharacterId, Vec2 } from "./NetworkMessages.js";

export interface AbilityResult {
  activated: boolean;
  effectData?: Record<string, number | string | boolean>;
}

export function activateAbility(player: Player): AbilityResult {
  if (player.abilityCooldown > 0 || player.abilityActive || !player.alive) {
    return { activated: false };
  }

  switch (player.characterId) {
    case "assault":
      return activateOverdrive(player);
    case "sentinel":
      return activateEnergyShield(player);
    case "phantom":
      return activatePhaseDash(player);
    case "engineer":
      return activateRepairDrone(player);
    default:
      return { activated: false };
  }
}

function activateOverdrive(player: Player): AbilityResult {
  player.abilityActive = true;
  player.abilityTimer = player.character.abilityDuration;
  player.abilityCooldown = player.character.abilityCooldown;
  player.overdriveActive = true;

  return {
    activated: true,
    effectData: {
      fireRateMultiplier: 0.5,
      damageMultiplier: 1.3,
      duration: player.character.abilityDuration,
    },
  };
}

function activateEnergyShield(player: Player): AbilityResult {
  player.abilityActive = true;
  player.abilityTimer = player.character.abilityDuration;
  player.abilityCooldown = player.character.abilityCooldown;
  player.shieldHp = 100;

  return {
    activated: true,
    effectData: {
      shieldHp: 100,
      duration: player.character.abilityDuration,
    },
  };
}

function activatePhaseDash(player: Player): AbilityResult {
  player.abilityActive = true;
  player.abilityTimer = player.character.abilityDuration;
  player.abilityCooldown = player.character.abilityCooldown;
  player.invulnerable = true;
  player.invulnerableTimer = player.character.abilityDuration;

  // Teleport forward in aim direction
  const distance = 200;
  const dx = Math.cos(player.aimAngle) * distance;
  const dy = Math.sin(player.aimAngle) * distance;

  return {
    activated: true,
    effectData: {
      teleportX: player.x + dx,
      teleportY: player.y + dy,
      invulnDuration: player.character.abilityDuration,
    },
  };
}

function activateRepairDrone(player: Player): AbilityResult {
  player.abilityActive = true;
  player.abilityTimer = player.character.abilityDuration;
  player.abilityCooldown = player.character.abilityCooldown;
  player.healingPerTick = 5; // 5 HP per second

  return {
    activated: true,
    effectData: {
      healPerSecond: 5,
      duration: player.character.abilityDuration,
    },
  };
}

export function tickAbility(player: Player, dt: number): void {
  if (!player.abilityActive) return;

  player.abilityTimer -= dt;

  switch (player.characterId) {
    case "engineer":
      // Heal over time
      if (player.healingPerTick > 0 && player.alive) {
        const healAmount = player.healingPerTick * (dt / 1000);
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
      }
      break;
    case "sentinel":
      // Shield expires when timer runs out (or when shieldHp hits 0 from damage)
      if (player.shieldHp <= 0) {
        player.abilityTimer = 0;
      }
      break;
  }

  if (player.abilityTimer <= 0) {
    deactivateAbility(player);
  }
}

export function deactivateAbility(player: Player): void {
  player.abilityActive = false;
  player.abilityTimer = 0;

  switch (player.characterId) {
    case "assault":
      player.overdriveActive = false;
      break;
    case "sentinel":
      player.shieldHp = 0;
      break;
    case "phantom":
      // Invulnerability already handled by invulnerableTimer
      break;
    case "engineer":
      player.healingPerTick = 0;
      break;
  }
}

export function applyPhaseDashTeleport(player: Player, arena: { width: number; height: number }): Vec2 {
  const distance = 200;
  let newX = player.x + Math.cos(player.aimAngle) * distance;
  let newY = player.y + Math.sin(player.aimAngle) * distance;

  // Clamp to arena bounds
  newX = Math.max(30, Math.min(arena.width - 30, newX));
  newY = Math.max(30, Math.min(arena.height - 30, newY));

  player.x = newX;
  player.y = newY;

  return { x: newX, y: newY };
}
