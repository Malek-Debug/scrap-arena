import Phaser from "phaser";

export type PowerUpType =
  | "rapid_fire"
  | "shield_regen"
  | "scrap_magnet"
  | "damage_boost"
  | "speed_boost";

interface Drop {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  lifetime: number;
  collected: boolean;
}

const DROP_LABELS: Record<PowerUpType, string> = {
  rapid_fire:   "⚡",
  shield_regen: "❤",
  scrap_magnet: "◈",
  damage_boost: "↑",
  speed_boost:  "▶",
};
const DROP_COLORS: Record<PowerUpType, number> = {
  rapid_fire:   0xff4400,
  shield_regen: 0x00ff88,
  scrap_magnet: 0xffcc00,
  damage_boost: 0xff0044,
  speed_boost:  0x00aaff,
};
const DROP_NAMES: Record<PowerUpType, string> = {
  rapid_fire:   "RAPID FIRE",
  shield_regen: "REGEN +20",
  scrap_magnet: "SCRAP MAGNET",
  damage_boost: "DAMAGE x2",
  speed_boost:  "SPEED BOOST",
};

const DROP_TYPES: PowerUpType[] = ["rapid_fire", "shield_regen", "scrap_magnet", "damage_boost", "speed_boost"];

export class PowerUpSystem {
  private drops: Drop[] = [];
  private scene: Phaser.Scene;
  private nextId = 1;

  rapidFireActive = false;
  rapidFireTimer = 0;
  damageBoostActive = false;
  damageBoostTimer = 0;
  speedBoostActive = false;
  speedBoostTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  tryDrop(x: number, y: number): void {
    if (Math.random() > 0.22) return; // 22% drop rate (was 12%)
    // Weighted selection: shield_regen gets extra weight for survivability
    const weighted: PowerUpType[] = [
      "rapid_fire", "shield_regen", "shield_regen", "scrap_magnet", "damage_boost", "speed_boost",
    ];
    const type = weighted[Math.floor(Math.random() * weighted.length)];
    this.spawnDrop(x, y, type);
  }

  spawnDrop(x: number, y: number, type: PowerUpType): void {
    const color = DROP_COLORS[type];
    const sprite = this.scene.add.circle(x, y, 10, color, 0.9)
      .setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    sprite.setStrokeStyle(2, 0xffffff, 0.6);

    const label = this.scene.add.text(x, y - 16, DROP_LABELS[type], {
      fontFamily: "monospace", fontSize: "11px", color: "#ffffff",
    }).setOrigin(0.5).setDepth(46);

    this.scene.tweens.add({
      targets: sprite, scaleX: 1.35, scaleY: 1.35,
      duration: 550, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });

    this.drops.push({ id: this.nextId++, type, x, y, sprite, label, lifetime: 8000, collected: false });
  }

  checkPickup(playerX: number, playerY: number, range: number): PowerUpType | null {
    const r2 = range * range;
    for (const d of this.drops) {
      if (d.collected) continue;
      const dx = d.x - playerX, dy = d.y - playerY;
      if (dx * dx + dy * dy < r2) {
        d.collected = true;
        this.scene.tweens.add({
          targets: [d.sprite, d.label],
          scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 220,
          onComplete: () => { d.sprite.destroy(); d.label.destroy(); },
        });
        return d.type;
      }
    }
    return null;
  }

  getPickupName(type: PowerUpType): string {
    return DROP_NAMES[type];
  }

  getPickupColor(type: PowerUpType): number {
    return DROP_COLORS[type];
  }

  update(deltaMs: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.collected) { this.drops.splice(i, 1); continue; }
      d.lifetime -= deltaMs;
      if (d.lifetime <= 0) {
        d.sprite.destroy(); d.label.destroy();
        this.drops.splice(i, 1);
        continue;
      }
      if (d.lifetime < 2000) {
        d.sprite.setAlpha(Math.sin(performance.now() * 0.012) * 0.45 + 0.55);
      }
    }
    if (this.rapidFireActive) {
      this.rapidFireTimer -= deltaMs;
      if (this.rapidFireTimer <= 0) this.rapidFireActive = false;
    }
    if (this.damageBoostActive) {
      this.damageBoostTimer -= deltaMs;
      if (this.damageBoostTimer <= 0) this.damageBoostActive = false;
    }
    if (this.speedBoostActive) {
      this.speedBoostTimer -= deltaMs;
      if (this.speedBoostTimer <= 0) this.speedBoostActive = false;
    }
  }

  clearAll(): void {
    for (const d of this.drops) { d.sprite.destroy(); d.label.destroy(); }
    this.drops = [];
    this.rapidFireActive = false;
    this.damageBoostActive = false;
    this.speedBoostActive = false;
  }
}
