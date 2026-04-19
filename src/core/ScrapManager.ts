import Phaser from "phaser";
import { SystemsBus } from "./SystemsBus";

interface ScrapItem {
  sprite: Phaser.GameObjects.Sprite;
  value: number;
}

const MAX_ACTIVE = 50;
const COLLECT_RADIUS = 40;
const MAGNET_RADIUS = 100;
const MAGNET_SPEED = 150; // px/s

export class ScrapManager {
  private scene: Phaser.Scene;
  private scraps: ScrapItem[] = [];
  private _vortexActive = false;
  private _vortexMultiplier = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get activeCount(): number {
    return this.scraps.length;
  }

  setVortex(active: boolean, multiplier = 1): void {
    this._vortexActive = active;
    this._vortexMultiplier = multiplier;
    for (const item of this.scraps) {
      if (active) item.sprite.setTint(0xffcc00);
      else item.sprite.clearTint();
    }
  }

  spawnScrap(x: number, y: number, value: number): void {
    // Enforce cap — remove oldest first
    while (this.scraps.length >= MAX_ACTIVE) {
      const oldest = this.scraps.shift()!;
      oldest.sprite.destroy();
    }

    const ox = x + Phaser.Math.Between(-20, 20);
    const oy = y + Phaser.Math.Between(-20, 20);

    const sprite = this.scene.add.sprite(ox, oy, "scrap");
    sprite.setDepth(3);

    this.scene.tweens.add({
      targets: sprite,
      y: oy - 3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.scraps.push({ sprite, value });
    if (this._vortexActive) sprite.setTint(0xffcc00);
  }

  update(playerX: number, playerY: number, deltaMs: number): void {
    for (let i = this.scraps.length - 1; i >= 0; i--) {
      const item = this.scraps[i];
      const dx = playerX - item.sprite.x;
      const dy = playerY - item.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < COLLECT_RADIUS) {
        this.collect(item, i);
        continue;
      }

      const magnetRad = this._vortexActive ? 600 : MAGNET_RADIUS;
      const magnetSpd = this._vortexActive ? MAGNET_SPEED * 4 * this._vortexMultiplier : MAGNET_SPEED;
      if (dist < magnetRad && dist > 0) {
        const move = magnetSpd * (deltaMs / 1000);
        item.sprite.x += (dx / dist) * move;
        item.sprite.y += (dy / dist) * move;
      }
    }
  }

  clear(): void {
    for (const item of this.scraps) {
      item.sprite.destroy();
    }
    this.scraps.length = 0;
  }

  private collect(item: ScrapItem, index: number): void {
    this.scraps.splice(index, 1);
    SystemsBus.instance.emit("scrap:collected", item.value);

    this.scene.tweens.add({
      targets: item.sprite,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        item.sprite.destroy();
      },
    });
  }
}
