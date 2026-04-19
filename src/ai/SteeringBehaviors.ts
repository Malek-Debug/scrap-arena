import Phaser from "phaser";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core";

export interface SteeredAgent {
  id: number;
  posX: number;
  posY: number;
}

/**
 * SteeringBehaviors — static steering force utilities.
 * Used by enemy agents to produce natural-looking group movement:
 * separation (no piling), flanking (encirclement), strafing (orbit attack).
 */
export class SteeringBehaviors {

  /**
   * Separation — pushes agent away from nearby neighbors.
   * Returns a normalized force vector scaled by overlap intensity.
   */
  static separation(
    agent: SteeredAgent,
    neighbors: SteeredAgent[],
    radius = 48,
  ): { x: number; y: number } {
    let fx = 0;
    let fy = 0;
    for (const n of neighbors) {
      if (n.id === agent.id) continue;
      const dx = agent.posX - n.posX;
      const dy = agent.posY - n.posY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < radius) {
        const strength = ((radius - dist) / radius) * 2.5;
        fx += (dx / dist) * strength;
        fy += (dy / dist) * strength;
      }
    }
    return { x: fx, y: fy };
  }

  /**
   * Flank target — the position an agent should move toward to surround
   * the player from a given angular slot, at standoffRange distance.
   */
  static flankTarget(
    playerX: number,
    playerY: number,
    slotAngle: number,
    standoffRange = 130,
  ): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(playerX + Math.cos(slotAngle) * standoffRange, 30, WORLD_WIDTH - 30),
      y: Phaser.Math.Clamp(playerY + Math.sin(slotAngle) * standoffRange, 30, WORLD_HEIGHT - 30),
    };
  }

  /**
   * Assign evenly-distributed flank angles for a group of N enemies.
   * baseAngle offsets the starting angle (randomised per wave for variety).
   */
  static assignFlankAngles(count: number, baseAngle = 0): number[] {
    const angles: number[] = [];
    for (let i = 0; i < count; i++) {
      angles.push(baseAngle + (i / count) * Math.PI * 2);
    }
    return angles;
  }

  /**
   * Strafe target — agent orbits the player at orbitRadius.
   * direction: +1 = counter-clockwise, -1 = clockwise.
   * Returns the next position along the orbit arc.
   */
  static strafeTarget(
    agentX: number,
    agentY: number,
    playerX: number,
    playerY: number,
    orbitRadius: number,
    direction: 1 | -1,
    angularSpeed: number,
    deltaMs: number,
  ): { x: number; y: number } {
    const currentAngle = Math.atan2(agentY - playerY, agentX - playerX);
    const newAngle = currentAngle + direction * angularSpeed * (deltaMs / 1000);
    return {
      x: Phaser.Math.Clamp(playerX + Math.cos(newAngle) * orbitRadius, 30, WORLD_WIDTH - 30),
      y: Phaser.Math.Clamp(playerY + Math.sin(newAngle) * orbitRadius, 30, WORLD_HEIGHT - 30),
    };
  }

  /**
   * Predict intercept — returns the angle to shoot to lead a moving target.
   * projectileSpeed: speed of the projectile.
   * targetVx/Vy: target velocity components.
   */
  static interceptAngle(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
    targetVx: number,
    targetVy: number,
    projectileSpeed: number,
  ): number {
    const dx = targetX - fromX;
    const dy = targetY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const leadTime = dist / Math.max(projectileSpeed, 1);
    const leadX = targetX + targetVx * leadTime;
    const leadY = targetY + targetVy * leadTime;
    return Math.atan2(leadY - fromY, leadX - fromX);
  }
}
