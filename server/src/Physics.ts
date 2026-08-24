import type { ArenaObstacle } from "./Arena.js";
import type { Vec2 } from "./NetworkMessages.js";

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export function circleRectCollision(circle: Circle, rect: ArenaObstacle): boolean {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return (dx * dx + dy * dy) < (circle.radius * circle.radius);
}

export function resolveCircleRectCollision(circle: Circle, rect: ArenaObstacle): Vec2 {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distSq = dx * dx + dy * dy;
  const radiusSq = circle.radius * circle.radius;

  if (distSq >= radiusSq) return { x: circle.x, y: circle.y };

  if (distSq === 0) {
    // Circle center is inside the rectangle - push out to nearest edge
    const toLeft = circle.x - rect.x;
    const toRight = (rect.x + rect.width) - circle.x;
    const toTop = circle.y - rect.y;
    const toBottom = (rect.y + rect.height) - circle.y;
    const minDist = Math.min(toLeft, toRight, toTop, toBottom);

    if (minDist === toLeft) return { x: rect.x - circle.radius, y: circle.y };
    if (minDist === toRight) return { x: rect.x + rect.width + circle.radius, y: circle.y };
    if (minDist === toTop) return { x: circle.x, y: rect.y - circle.radius };
    return { x: circle.x, y: rect.y + rect.height + circle.radius };
  }

  const dist = Math.sqrt(distSq);
  const overlap = circle.radius - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  return {
    x: circle.x + nx * overlap,
    y: circle.y + ny * overlap,
  };
}

export function moveAndCollide(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  obstacles: ArenaObstacle[],
  dt: number,
): { x: number; y: number; vx: number; vy: number } {
  let newX = x + vx * dt;
  let newY = y + vy * dt;
  let outVx = vx;
  let outVy = vy;

  // Resolve collisions iteratively (max 3 passes)
  for (let pass = 0; pass < 3; pass++) {
    let collided = false;
    for (const obs of obstacles) {
      const circle: Circle = { x: newX, y: newY, radius };
      if (circleRectCollision(circle, obs)) {
        const resolved = resolveCircleRectCollision(circle, obs);
        // Determine which axis was penetrated more and zero that velocity
        const dxRes = resolved.x - newX;
        const dyRes = resolved.y - newY;
        if (Math.abs(dxRes) > Math.abs(dyRes)) {
          outVx = 0;
        } else {
          outVy = 0;
        }
        newX = resolved.x;
        newY = resolved.y;
        collided = true;
      }
    }
    if (!collided) break;
  }

  return { x: newX, y: newY, vx: outVx, vy: outVy };
}

export function circleCircleCollision(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const totalRadius = a.radius + b.radius;
  return (dx * dx + dy * dy) < (totalRadius * totalRadius);
}

export function pointInRect(px: number, py: number, rect: ArenaObstacle): boolean {
  return px >= rect.x && px <= rect.x + rect.width &&
         py >= rect.y && py <= rect.y + rect.height;
}

export function lineRectIntersection(
  x1: number, y1: number, x2: number, y2: number,
  rect: ArenaObstacle,
): boolean {
  // Check if line segment intersects rectangle using separating axis
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 10));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    if (pointInRect(px, py, rect)) return true;
  }
  return false;
}
