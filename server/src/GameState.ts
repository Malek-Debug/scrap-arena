import { Player } from "./Player.js";
import { type ArenaDef, getRandomSpawnPoint } from "./Arena.js";
import { moveAndCollide, circleCircleCollision, circleRectCollision } from "./Physics.js";
import { activateAbility, tickAbility, applyPhaseDashTeleport } from "./Abilities.js";
import type {
  CharacterId, Vec2, ProjectileState, PickupState,
  S2C_PlayerHit, S2C_PlayerKilled, S2C_PlayerRespawned,
  S2C_AbilityUsed, S2C_AbilityEffect, S2C_KillFeed, S2C_PickupCollected,
  PlayerStateUpdate, MatchResult,
} from "./NetworkMessages.js";

const TICK_RATE = 50; // ms per tick (20 ticks/sec)
const MATCH_DURATION = 300000; // 5 minutes
const KILL_LIMIT = 20;
const RESPAWN_TIME = 3000;
const INVULN_TIME = 2000;
const PROJECTILE_RADIUS = 6;
const PROJECTILE_MAX_RANGE = 800;
const MAX_HEAT = 100;
const HEAT_PER_SHOT = 8;
const HEAT_DECAY_RATE = 15; // per second
const OVERHEAT_LOCKOUT = 2400;
const PICKUP_COLLECT_RADIUS = 30;

interface Projectile {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  speed: number;
  distanceTraveled: number;
  angle: number;
}

interface Pickup {
  id: number;
  x: number;
  y: number;
  type: "health" | "speed" | "damage";
  active: boolean;
  respawnTimer: number;
  respawnTime: number;
}

export type GameEvent =
  | S2C_PlayerHit
  | S2C_PlayerKilled
  | S2C_PlayerRespawned
  | S2C_AbilityUsed
  | S2C_AbilityEffect
  | S2C_KillFeed
  | S2C_PickupCollected;

export class GameState {
  readonly players: Map<string, Player> = new Map();
  readonly arena: ArenaDef;
  readonly matchDuration = MATCH_DURATION;
  readonly killLimit = KILL_LIMIT;

  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private nextProjectileId = 1;
  private tick = 0;
  private matchTimer = MATCH_DURATION;
  private matchEnded = false;
  private events: GameEvent[] = [];

  constructor(arena: ArenaDef) {
    this.arena = arena;
    this._initPickups();
  }

  private _initPickups(): void {
    for (let i = 0; i < this.arena.pickupSpawns.length; i++) {
      const spawn = this.arena.pickupSpawns[i];
      this.pickups.push({
        id: i,
        x: spawn.x,
        y: spawn.y,
        type: spawn.type,
        active: true,
        respawnTimer: 0,
        respawnTime: spawn.respawnTime,
      });
    }
  }

  addPlayer(id: string, name: string, characterId: CharacterId): Player {
    const occupiedPositions = Array.from(this.players.values()).map(p => ({ x: p.x, y: p.y }));
    const spawn = getRandomSpawnPoint(this.arena, occupiedPositions, 300);
    const player = new Player(id, name, characterId, spawn);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    // Remove all projectiles owned by this player
    this.projectiles = this.projectiles.filter(p => p.ownerId !== id);
  }

  getActivePlayerCount(): number {
    return this.players.size;
  }

  isMatchEnded(): boolean {
    return this.matchEnded;
  }

  getMatchTimeRemaining(): number {
    return this.matchTimer;
  }

  update(dt: number): GameEvent[] {
    this.events = [];
    this.tick++;

    if (this.matchEnded) return this.events;

    // Update match timer
    this.matchTimer -= dt;
    if (this.matchTimer <= 0) {
      this.matchTimer = 0;
      this.matchEnded = true;
      return this.events;
    }

    // Update each player
    for (const player of this.players.values()) {
      this._updatePlayer(player, dt);
    }

    // Update projectiles
    this._updateProjectiles(dt);

    // Update pickups
    this._updatePickups(dt);

    // Check win condition
    for (const player of this.players.values()) {
      if (player.score >= KILL_LIMIT) {
        this.matchEnded = true;
        break;
      }
    }

    return this.events;
  }

  private _updatePlayer(player: Player, dt: number): void {
    // Handle respawn timer
    if (!player.alive) {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) {
        const occupiedPositions = Array.from(this.players.values())
          .filter(p => p.alive && p.id !== player.id)
          .map(p => ({ x: p.x, y: p.y }));
        const spawn = getRandomSpawnPoint(this.arena, occupiedPositions, 300);
        player.respawn(spawn);
        this.events.push({
          type: "player_respawned",
          playerId: player.id,
          position: { x: player.x, y: player.y },
          hp: player.hp,
        });
      }
      return;
    }

    // Update invulnerability
    if (player.invulnerable) {
      player.invulnerableTimer -= dt;
      if (player.invulnerableTimer <= 0) {
        player.invulnerable = false;
        player.invulnerableTimer = 0;
      }
    }

    // Update cooldowns
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.abilityCooldown > 0) player.abilityCooldown -= dt;

    // Update ability
    tickAbility(player, dt);

    // Heat decay
    if (player.heat > 0) {
      player.heat = Math.max(0, player.heat - HEAT_DECAY_RATE * (dt / 1000));
    }

    // Handle dash
    if (player.dashing) {
      player.dashTimer -= dt;
      if (player.dashTimer <= 0) {
        player.dashing = false;
      } else {
        const dashSpeed = player.character.dashDistance / (player.character.dashDuration / 1000);
        player.velocityX = player.dashDirectionX * dashSpeed;
        player.velocityY = player.dashDirectionY * dashSpeed;
      }
    } else {
      // Normal movement
      let moveX = player.inputMoveX;
      let moveY = player.inputMoveY;

      // Normalize
      const mag = Math.sqrt(moveX * moveX + moveY * moveY);
      if (mag > 1) {
        moveX /= mag;
        moveY /= mag;
      }

      const speed = player.getEffectiveSpeed();
      player.velocityX = moveX * speed;
      player.velocityY = moveY * speed;
    }

    // Apply movement with collision
    const result = moveAndCollide(
      player.x, player.y,
      player.velocityX, player.velocityY,
      player.character.bodyRadius,
      this.arena.obstacles,
      dt / 1000,
    );
    player.x = result.x;
    player.y = result.y;
    player.velocityX = result.vx;
    player.velocityY = result.vy;

    // Clamp to arena bounds
    player.x = Math.max(player.character.bodyRadius, Math.min(this.arena.width - player.character.bodyRadius, player.x));
    player.y = Math.max(player.character.bodyRadius, Math.min(this.arena.height - player.character.bodyRadius, player.y));

    // Update aim
    player.aimAngle = player.inputAimAngle;

    // Handle dash input
    if (player.inputDash && !player.dashing && player.dashCooldown <= 0) {
      this._startDash(player);
    }

    // Handle ability input
    if (player.inputAbility && !player.abilityActive && player.abilityCooldown <= 0) {
      this._activateAbility(player);
    }

    // Handle shooting
    if (player.inputShooting && player.fireCooldown <= 0 && player.heat < MAX_HEAT) {
      this._playerShoot(player);
    }

    // Overheat lockout
    if (player.heat >= MAX_HEAT) {
      player.fireCooldown = Math.max(player.fireCooldown, OVERHEAT_LOCKOUT);
      player.heat = MAX_HEAT;
    }
  }

  private _startDash(player: Player): void {
    player.dashing = true;
    player.dashTimer = player.character.dashDuration;
    player.dashCooldown = player.character.dashCooldown;

    // Dash in movement direction, or aim direction if stationary
    let dirX = player.inputMoveX;
    let dirY = player.inputMoveY;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    if (mag < 0.1) {
      dirX = Math.cos(player.aimAngle);
      dirY = Math.sin(player.aimAngle);
    } else {
      dirX /= mag;
      dirY /= mag;
    }
    player.dashDirectionX = dirX;
    player.dashDirectionY = dirY;
  }

  private _activateAbility(player: Player): void {
    const result = activateAbility(player);
    if (!result.activated) return;

    // Handle Phantom teleport
    if (player.characterId === "phantom" && result.effectData) {
      applyPhaseDashTeleport(player, this.arena);
    }

    this.events.push({
      type: "ability_used",
      playerId: player.id,
      abilityId: player.character.abilityName,
      position: { x: player.x, y: player.y },
      direction: player.aimAngle,
    });

    if (result.effectData) {
      this.events.push({
        type: "ability_effect",
        playerId: player.id,
        abilityId: player.character.abilityName,
        effectData: result.effectData,
      });
    }
  }

  private _playerShoot(player: Player): void {
    const angle = player.aimAngle;
    const speed = player.character.projectileSpeed;
    const damage = player.getEffectiveDamage();
    const spawnDist = player.character.bodyRadius + 10;

    const proj: Projectile = {
      id: this.nextProjectileId++,
      ownerId: player.id,
      x: player.x + Math.cos(angle) * spawnDist,
      y: player.y + Math.sin(angle) * spawnDist,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      speed,
      distanceTraveled: 0,
      angle,
    };

    this.projectiles.push(proj);
    player.fireCooldown = player.getEffectiveFireRate();
    player.heat += HEAT_PER_SHOT;
  }

  private _updateProjectiles(dt: number): void {
    const dtSec = dt / 1000;
    const toRemove: number[] = [];

    for (let i = 0; i < this.projectiles.length; i++) {
      const proj = this.projectiles[i];

      // Move projectile
      const prevX = proj.x;
      const prevY = proj.y;
      proj.x += proj.vx * dtSec;
      proj.y += proj.vy * dtSec;

      const moveDist = Math.sqrt((proj.x - prevX) ** 2 + (proj.y - prevY) ** 2);
      proj.distanceTraveled += moveDist;

      // Check range limit
      if (proj.distanceTraveled >= PROJECTILE_MAX_RANGE) {
        toRemove.push(i);
        continue;
      }

      // Check arena bounds
      if (proj.x < 0 || proj.x > this.arena.width || proj.y < 0 || proj.y > this.arena.height) {
        toRemove.push(i);
        continue;
      }

      // Check obstacle collision
      let hitObstacle = false;
      for (const obs of this.arena.obstacles) {
        if (circleRectCollision({ x: proj.x, y: proj.y, radius: PROJECTILE_RADIUS }, obs)) {
          hitObstacle = true;
          break;
        }
      }
      if (hitObstacle) {
        toRemove.push(i);
        continue;
      }

      // Check player collision
      let hitPlayer = false;
      for (const target of this.players.values()) {
        if (target.id === proj.ownerId) continue;
        if (!target.alive) continue;
        if (target.invulnerable) continue;

        if (circleCircleCollision(
          { x: proj.x, y: proj.y, radius: PROJECTILE_RADIUS },
          { x: target.x, y: target.y, radius: target.character.bodyRadius },
        )) {
          const { died, actualDamage } = target.takeDamage(proj.damage, proj.ownerId);

          if (actualDamage > 0) {
            this.events.push({
              type: "player_hit",
              targetId: target.id,
              attackerId: proj.ownerId,
              damage: actualDamage,
              newHp: target.hp,
              position: { x: target.x, y: target.y },
            });
          }

          if (died) {
            const attacker = this.players.get(proj.ownerId);
            if (attacker) {
              attacker.kills++;
              attacker.score++;
            }

            target.respawnTimer = RESPAWN_TIME;

            this.events.push({
              type: "player_killed",
              victimId: target.id,
              killerId: proj.ownerId,
              killerScore: attacker?.score ?? 0,
              victimDeaths: target.deaths,
              position: { x: target.x, y: target.y },
            });

            this.events.push({
              type: "kill_feed",
              killerId: proj.ownerId,
              killerName: attacker?.name ?? "Unknown",
              victimId: target.id,
              victimName: target.name,
              weapon: "primary",
            });
          }

          hitPlayer = true;
          break;
        }
      }

      if (hitPlayer) {
        toRemove.push(i);
      }
    }

    // Remove projectiles (in reverse order to maintain indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.projectiles.splice(toRemove[i], 1);
    }
  }

  private _updatePickups(dt: number): void {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) {
          pickup.active = true;
        }
        continue;
      }

      // Check player collection
      for (const player of this.players.values()) {
        if (!player.alive) continue;
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        if (dx * dx + dy * dy < PICKUP_COLLECT_RADIUS * PICKUP_COLLECT_RADIUS) {
          this._collectPickup(player, pickup);
          break;
        }
      }
    }
  }

  private _collectPickup(player: Player, pickup: Pickup): void {
    pickup.active = false;
    pickup.respawnTimer = pickup.respawnTime;

    switch (pickup.type) {
      case "health":
        player.hp = Math.min(player.maxHp, player.hp + 40);
        break;
      case "speed":
        // Speed boost handled by temporary effect (simplified: instant heal instead for now)
        player.hp = Math.min(player.maxHp, player.hp + 20);
        break;
      case "damage":
        // Damage boost (simplified: give score bonus)
        player.hp = Math.min(player.maxHp, player.hp + 20);
        break;
    }

    this.events.push({
      type: "pickup_collected",
      pickupId: pickup.id,
      playerId: player.id,
      pickupType: pickup.type,
    });
  }

  getCurrentTick(): number {
    return this.tick;
  }

  getPlayerStates(): PlayerStateUpdate[] {
    const states: PlayerStateUpdate[] = [];
    for (const player of this.players.values()) {
      states.push(player.getStateUpdate());
    }
    return states;
  }

  getProjectileStates(): ProjectileState[] {
    return this.projectiles.map(p => ({
      id: p.id,
      ownerId: p.ownerId,
      x: p.x,
      y: p.y,
      angle: p.angle,
      speed: p.speed,
      damage: p.damage,
    }));
  }

  getPickupStates(): PickupState[] {
    return this.pickups.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      pickupType: p.type,
      active: p.active,
    }));
  }

  getResults(): MatchResult[] {
    const players = Array.from(this.players.values());
    players.sort((a, b) => b.score - a.score || a.deaths - b.deaths);

    return players.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      characterId: p.characterId,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      rank: i + 1,
    }));
  }

  getWinnerId(): string {
    const results = this.getResults();
    return results.length > 0 ? results[0].playerId : "";
  }
}
