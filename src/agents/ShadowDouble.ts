import Phaser from "phaser";
import { ShootSkill } from "../ai/skills/ShootSkill";

interface HistoryEntry {
  x: number;
  y: number;
  angle: number;
  time: number;
}

const BUFFER_SIZE = 30;
const RECORD_INTERVAL = 50;
const REPLAY_DELAY = 500;
const AFTERIMAGE_INTERVAL = 100;
const MAX_AFTERIMAGES = 8;
const SHADOW_OWNER_ID = -2;
const FIRE_RANGE = 300;

export class ShadowDouble {
  private scene: Phaser.Scene;
  private playerSprite: Phaser.Physics.Arcade.Sprite;
  private shadow: Phaser.GameObjects.Sprite;
  private shootSkill: ShootSkill;

  // Position history circular buffer
  private buffer: HistoryEntry[] = [];
  private bufferHead = 0;
  private bufferCount = 0;
  private recordTimer = 0;

  // Afterimage trail
  private afterimages: Phaser.GameObjects.Image[] = [];
  private afterimageTimer = 0;

  // Intensity / visibility
  private intensity = 1;

  // Breathing animation
  private breathTimer = 0;

  // Glitch effect
  private glitchTimer = 0;
  private glitchDuration = 0;
  private nextGlitchIn: number;
  private glitchOffsetX = 0;
  private glitchOffsetY = 0;
  private preGlitchX = 0;
  private preGlitchY = 0;
  private isGlitching = false;

  private destroyed = false;

  constructor(scene: Phaser.Scene, playerSprite: Phaser.Physics.Arcade.Sprite) {
    this.scene = scene;
    this.playerSprite = playerSprite;

    // Init circular buffer
    this.buffer = new Array(BUFFER_SIZE);
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this.buffer[i] = { x: playerSprite.x, y: playerSprite.y, angle: 0, time: 0 };
    }

    // Shadow sprite — use Cyborg spritesheet if available
    const hasCyborgTex = scene.textures.exists("player_idle_sheet");
    if (hasCyborgTex) {
      this.shadow = scene.add.sprite(playerSprite.x, playerSprite.y, "player_idle_sheet", 0);
      this.shadow.setScale(2.2);
    } else {
      this.shadow = scene.add.sprite(playerSprite.x, playerSprite.y, "player");
      this.shadow.setScale(1.3);
    }
    this.shadow.setTint(0xcc44ff);
    this.shadow.setDepth(9);
    this.updateAlpha();

    // Shadow shooting
    this.shootSkill = new ShootSkill(
      SHADOW_OWNER_ID,
      { damage: 4, range: 280, speed: 250, tint: 0xcc44ff },
      1200,
    );

    this.nextGlitchIn = Phaser.Math.Between(3000, 5000);
  }

  update(deltaMs: number, playerX: number, playerY: number, aimAngle: number): void {
    if (this.destroyed) return;

    const now = performance.now();

    // Record player position
    this.recordTimer += deltaMs;
    while (this.recordTimer >= RECORD_INTERVAL) {
      this.recordTimer -= RECORD_INTERVAL;
      this.buffer[this.bufferHead] = { x: playerX, y: playerY, angle: aimAngle, time: now };
      this.bufferHead = (this.bufferHead + 1) % BUFFER_SIZE;
      if (this.bufferCount < BUFFER_SIZE) this.bufferCount++;
    }

    // Read delayed position from buffer
    const delayed = this.getDelayedEntry(now);
    let prevX = this.shadow.x;
    let prevY = this.shadow.y;
    if (delayed) {
      this.shadow.setPosition(delayed.x, delayed.y);
      // Flip shadow based on aim angle (same as player)
      if (Math.abs(delayed.angle) > Math.PI / 2) {
        this.shadow.setFlipX(true);
      } else {
        this.shadow.setFlipX(false);
      }
    }

    // Play matching animation if Cyborg textures are available
    const hasCyborg = this.scene.textures.exists("player_idle_sheet");
    if (hasCyborg) {
      const dx = this.shadow.x - prevX;
      const dy = this.shadow.y - prevY;
      const moving = dx * dx + dy * dy > 4;
      const runExists = this.shadow.anims?.exists?.("player_run");
      const idleExists = this.shadow.anims?.exists?.("player_idle");
      if (moving && runExists) {
        if (this.shadow.anims.currentAnim?.key !== "player_run") this.shadow.play("player_run");
      } else if (idleExists) {
        if (this.shadow.anims.currentAnim?.key !== "player_idle") this.shadow.play("player_idle");
      }
      // Don't rotate — use flip instead
      this.shadow.setRotation(0);
    } else if (delayed) {
      this.shadow.setRotation(delayed.angle);
    }

    // Breathing oscillation
    this.breathTimer += deltaMs;
    const baseScale = this.scene.textures.exists("player_idle_sheet") ? 2.2 : 1.0;
    const breathScale = baseScale + 0.1 * Math.sin((this.breathTimer / 600) * Math.PI * 2);
    this.shadow.setScale(breathScale);

    // Glitch effect
    this.updateGlitch(deltaMs);

    // Afterimage trail
    if (this.intensity > 0) {
      this.afterimageTimer += deltaMs;
      if (this.afterimageTimer >= AFTERIMAGE_INTERVAL) {
        this.afterimageTimer -= AFTERIMAGE_INTERVAL;
        this.spawnAfterimage();
      }
    }

    // Shadow shooting — only when intensity > 0
    if (this.intensity > 0) {
      this.shootSkill.tick();
      if (this.shootSkill.canUse) {
        this.tryShootNearestEnemy();
      }
    }
  }

  setIntensity(intensity: number): void {
    this.intensity = Phaser.Math.Clamp(intensity, 0, 1);
    this.updateAlpha();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.shadow.destroy();

    for (const img of this.afterimages) {
      img.destroy();
    }
    this.afterimages.length = 0;
  }

  // --- Private helpers ---

  private updateAlpha(): void {
    this.shadow.setAlpha(0.55 + this.intensity * 0.3);
  }

  private getDelayedEntry(now: number): HistoryEntry | null {
    if (this.bufferCount === 0) return null;

    const targetTime = now - REPLAY_DELAY;
    let best: HistoryEntry | null = null;
    let bestDiff = Infinity;

    // Search buffer for the entry closest to targetTime
    for (let i = 0; i < this.bufferCount; i++) {
      const idx = (this.bufferHead - 1 - i + BUFFER_SIZE) % BUFFER_SIZE;
      const entry = this.buffer[idx];
      const diff = Math.abs(entry.time - targetTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = entry;
      }
    }

    return best;
  }

  private spawnAfterimage(): void {
    if (this.intensity <= 0) return;

    // Enforce max afterimages
    while (this.afterimages.length >= MAX_AFTERIMAGES) {
      const oldest = this.afterimages.shift()!;
      oldest.destroy();
    }

    const texKey = this.scene.textures.exists("player_idle_sheet") ? "player_idle_sheet" : "player";
    const img = this.scene.add.image(this.shadow.x, this.shadow.y, texKey, texKey === "player_idle_sheet" ? 0 : undefined);
    img.setTint(0x8800ff);
    img.setAlpha(0.30);
    img.setDepth(8);
    img.setRotation(this.shadow.rotation);
    img.setFlipX(this.shadow.flipX);
    img.setScale(this.shadow.scaleX, this.shadow.scaleY);

    this.afterimages.push(img);

    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: 400,
      onComplete: () => {
        const idx = this.afterimages.indexOf(img);
        if (idx !== -1) this.afterimages.splice(idx, 1);
        img.destroy();
      },
    });
  }

  private tryShootNearestEnemy(): void {
    const sx = this.shadow.x;
    const sy = this.shadow.y;

    let nearestDist = FIRE_RANGE;
    let nearestAngle = 0;
    let found = false;

    const bodies = this.scene.physics.world.bodies;
    bodies.iterate((body: Phaser.Physics.Arcade.Body) => {
      const go = body.gameObject;
      if (!go || !go.active) return null;

      if (go === this.playerSprite) return null;
      if (go === this.shadow) return null;

      const tex = (go as Phaser.GameObjects.Sprite).texture?.key;
      if (tex !== "enemy" && tex !== "guard" && tex !== "collector") return null;

      const ex = body.x + body.halfWidth;
      const ey = body.y + body.halfHeight;
      const dx = ex - sx;
      const dy = ey - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestAngle = Math.atan2(dy, dx);
        found = true;
      }
      return null;
    });

    if (found) {
      this.shootSkill.tryUse(sx, sy, nearestAngle);
    }
  }

  private updateGlitch(deltaMs: number): void {
    if (this.isGlitching) {
      this.glitchDuration -= deltaMs;
      if (this.glitchDuration <= 0) {
        // Snap back
        this.shadow.setPosition(this.preGlitchX, this.preGlitchY);
        this.isGlitching = false;
        this.nextGlitchIn = Phaser.Math.Between(3000, 5000);
      }
      return;
    }

    this.glitchTimer += deltaMs;
    if (this.glitchTimer >= this.nextGlitchIn) {
      this.glitchTimer = 0;
      this.isGlitching = true;
      this.glitchDuration = 100;

      this.preGlitchX = this.shadow.x;
      this.preGlitchY = this.shadow.y;
      this.glitchOffsetX = Phaser.Math.Between(-30, 30);
      this.glitchOffsetY = Phaser.Math.Between(-30, 30);
      this.shadow.setPosition(
        this.preGlitchX + this.glitchOffsetX,
        this.preGlitchY + this.glitchOffsetY,
      );
    }
  }
}
