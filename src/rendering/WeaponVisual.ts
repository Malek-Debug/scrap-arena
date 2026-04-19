import Phaser from "phaser";

/**
 * WeaponVisual — Attaches a pixel art gun sprite to the player.
 * The gun rotates toward the aim direction and shows firing animation.
 * Gun model upgrades through 5 tiers based on damage upgrades.
 */
export class WeaponVisual {
  private scene: Phaser.Scene;
  private gunSprite: Phaser.GameObjects.Image;
  private currentTier: number = 1;
  private fireTimer: number = 0;
  private static readonly TIERS = [1, 3, 5, 8, 10];
  private static readonly SCALE = [4, 3.5, 3.5, 3, 3];
  private static readonly OFFSET = [16, 18, 20, 22, 24];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const key = scene.textures.exists("gun_1_idle") ? "gun_1_idle" : "__DEFAULT";
    this.gunSprite = scene.add
      .image(0, 0, key === "__DEFAULT" ? "gun_1_idle" : key)
      .setDepth(51)
      .setScale(4)
      .setOrigin(0.2, 0.5);

    // Pixel-perfect rendering
    (this.gunSprite.texture as Phaser.Textures.Texture).setFilter(
      Phaser.Textures.FilterMode.NEAREST,
    );
  }

  /** Update gun position and rotation every frame */
  update(
    playerX: number,
    playerY: number,
    aimAngle: number,
    deltaMs: number,
  ): void {
    const tierIdx = WeaponVisual.TIERS.indexOf(this.currentTier);
    const offset = WeaponVisual.OFFSET[tierIdx] ?? 18;

    this.gunSprite.x = playerX + Math.cos(aimAngle) * offset;
    this.gunSprite.y = playerY + Math.sin(aimAngle) * offset;
    this.gunSprite.rotation = aimAngle;

    // Flip vertically when aiming left so gun doesn't appear upside down
    const aimingLeft = Math.abs(aimAngle) > Math.PI / 2;
    this.gunSprite.setFlipY(aimingLeft);

    // Handle fire animation timer
    if (this.fireTimer > 0) {
      this.fireTimer -= deltaMs;
      if (this.fireTimer <= 0) {
        this._setIdleTexture();
      }
    }
  }

  /** Called when player fires — shows firing sprite briefly */
  fire(): void {
    const fireKey = `gun_${this.currentTier}_fire`;
    if (this.scene.textures.exists(fireKey)) {
      this.gunSprite.setTexture(fireKey);
      (this.gunSprite.texture as Phaser.Textures.Texture).setFilter(
        Phaser.Textures.FilterMode.NEAREST,
      );
    }
    this.fireTimer = 80;
  }

  /** Set weapon tier (1-5 maps to gun models 1,3,5,8,10) */
  setTier(tier: number): void {
    const clamped = Phaser.Math.Clamp(tier, 1, 5);
    const gunId = WeaponVisual.TIERS[clamped - 1];
    if (gunId === this.currentTier) return;
    this.currentTier = gunId;
    const tierIdx = clamped - 1;
    this.gunSprite.setScale(WeaponVisual.SCALE[tierIdx]);
    this._setIdleTexture();
  }

  /** Calculate tier from player stats (damage-based progression) */
  static calcTier(damage: number): number {
    if (damage >= 40) return 5;
    if (damage >= 28) return 4;
    if (damage >= 18) return 3;
    if (damage >= 13) return 2;
    return 1;
  }

  private _setIdleTexture(): void {
    const idleKey = `gun_${this.currentTier}_idle`;
    if (this.scene.textures.exists(idleKey)) {
      this.gunSprite.setTexture(idleKey);
      (this.gunSprite.texture as Phaser.Textures.Texture).setFilter(
        Phaser.Textures.FilterMode.NEAREST,
      );
    }
  }

  destroy(): void {
    this.gunSprite.destroy();
  }
}
