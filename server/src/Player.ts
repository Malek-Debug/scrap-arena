import type { CharacterId, Vec2, PlayerStateUpdate } from "./NetworkMessages.js";
import { getCharacter, type CharacterDef } from "./Characters.js";

export class Player {
  readonly id: string;
  name: string;
  characterId: CharacterId;
  character: CharacterDef;

  x: number;
  y: number;
  velocityX = 0;
  velocityY = 0;
  aimAngle = 0;

  hp: number;
  maxHp: number;
  heat = 0;
  alive = true;

  score = 0;
  kills = 0;
  deaths = 0;

  // Cooldowns (remaining ms)
  fireCooldown = 0;
  dashCooldown = 0;
  abilityCooldown = 0;

  // State flags
  invulnerable = false;
  invulnerableTimer = 0;
  respawnTimer = 0;
  abilityActive = false;
  abilityTimer = 0;
  dashing = false;
  dashTimer = 0;
  dashDirectionX = 0;
  dashDirectionY = 0;

  // Ability-specific state
  shieldHp = 0; // Sentinel energy shield remaining absorption
  overdriveActive = false;
  healingPerTick = 0;

  // Input state (latest received)
  inputMoveX = 0;
  inputMoveY = 0;
  inputAimAngle = 0;
  inputShooting = false;
  inputAbility = false;
  inputDash = false;
  lastInputSeq = 0;

  constructor(id: string, name: string, characterId: CharacterId, spawn: Vec2) {
    this.id = id;
    this.name = name;
    this.characterId = characterId;
    this.character = getCharacter(characterId);
    this.x = spawn.x;
    this.y = spawn.y;
    this.hp = this.character.maxHp;
    this.maxHp = this.character.maxHp;
  }

  applyInput(moveX: number, moveY: number, aimAngle: number, shooting: boolean, ability: boolean, dash: boolean, seq: number): void {
    this.inputMoveX = moveX;
    this.inputMoveY = moveY;
    this.inputAimAngle = aimAngle;
    this.inputShooting = shooting;
    this.inputAbility = ability;
    this.inputDash = dash;
    this.lastInputSeq = seq;
  }

  takeDamage(amount: number, attackerId: string): { died: boolean; actualDamage: number } {
    if (this.invulnerable || !this.alive) return { died: false, actualDamage: 0 };

    // Sentinel shield absorbs damage first
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, amount);
      this.shieldHp -= absorbed;
      amount -= absorbed;
      if (amount <= 0) return { died: false, actualDamage: absorbed };
    }

    const actualDamage = Math.min(this.hp, amount);
    this.hp -= actualDamage;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      return { died: true, actualDamage };
    }

    return { died: false, actualDamage };
  }

  respawn(position: Vec2): void {
    this.x = position.x;
    this.y = position.y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.hp = this.maxHp;
    this.heat = 0;
    this.alive = true;
    this.invulnerable = true;
    this.invulnerableTimer = 2000;
    this.fireCooldown = 0;
    this.dashCooldown = 0;
    this.abilityActive = false;
    this.abilityTimer = 0;
    this.shieldHp = 0;
    this.overdriveActive = false;
    this.healingPerTick = 0;
    this.dashing = false;
    this.dashTimer = 0;
  }

  getStateUpdate(): PlayerStateUpdate {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      hp: this.hp,
      heat: this.heat,
      aimAngle: this.aimAngle,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      score: this.score,
      deaths: this.deaths,
      alive: this.alive,
      invulnerable: this.invulnerable,
      abilityCooldown: this.abilityCooldown,
      dashCooldown: this.dashCooldown,
      abilityActive: this.abilityActive,
    };
  }

  getEffectiveFireRate(): number {
    if (this.overdriveActive) return this.character.fireRate * 0.5;
    return this.character.fireRate;
  }

  getEffectiveDamage(): number {
    if (this.overdriveActive) return Math.round(this.character.damage * 1.3);
    return this.character.damage;
  }

  getEffectiveSpeed(): number {
    return this.character.speed;
  }
}
