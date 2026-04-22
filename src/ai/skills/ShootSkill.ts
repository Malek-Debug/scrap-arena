import Phaser from "phaser";
import { BaseSkill } from "./BaseSkill";
import { ObjectPool } from "../../core/ObjectPool";
import { SystemsBus } from "../../core/SystemsBus";

export interface ProjectileConfig {
  speed: number;
  damage: number;
  range: number;
  tint: number;
  spreadCount?: number;   // number of extra projectiles (0 = single shot)
  spreadAngle?: number;   // half-angle of spread in radians
}

export interface Projectile {
  sprite: Phaser.Physics.Arcade.Image;
  ownerId: number;
  damage: number;
  distanceTraveled: number;
  maxRange: number;
  active: boolean;
  glow?: Phaser.GameObjects.Arc;
}

let _scene: Phaser.Scene | null = null;
let _pool: ObjectPool<Projectile> | null = null;
const _active: Projectile[] = [];
const _trails: { gfx: Phaser.GameObjects.Graphics; proj: Projectile; color: number; history: { x: number; y: number }[] }[] = [];

/**
 * ShootSkill — fires pooled projectiles in a direction.
 * All instances share a single scene-level ObjectPool.
 * Call ShootSkill.initPool(scene) once on scene create.
 */
export class ShootSkill extends BaseSkill {
  readonly name = "Shoot";
  readonly cooldownMs: number;
  private readonly cfg: ProjectileConfig;
  private readonly ownerId: number;

  constructor(ownerId: number, cfg: Partial<ProjectileConfig> = {}, cooldownMs = 800) {
    super(1);
    this.ownerId = ownerId;
    this.cooldownMs = cooldownMs;
    this.cfg = {
      speed: cfg.speed ?? 300,
      damage: cfg.damage ?? 10,
      range: cfg.range ?? 350,
      tint: cfg.tint ?? 0xff6600,
    };
  }

  static initPool(scene: Phaser.Scene, size = 128): void {
    _scene = scene;
    if (!scene.textures.exists("projectile")) {
      const g = scene.add.graphics().setVisible(false);
      g.fillStyle(0xffffff);
      g.fillCircle(4, 4, 4);
      g.generateTexture("projectile", 8, 8);
      g.destroy();
    }
    // Ensure bullet textures use NEAREST filter for pixel-crisp look
    for (const key of ["bullet_1", "bullet_3", "bullet_6", "bullet_8", "bullet_10"]) {
      if (scene.textures.exists(key)) {
        (scene.textures.get(key) as Phaser.Textures.Texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    _pool = new ObjectPool<Projectile>(
      () => ({
        sprite: scene.physics.add.image(-9999, -9999, "projectile"),
        ownerId: -1,
        damage: 0,
        distanceTraveled: 0,
        maxRange: 0,
        active: false,
        glow: undefined,
      }),
      (p) => {
        p.sprite.setActive(false).setVisible(false).setPosition(-9999, -9999);
        (p.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        p.ownerId = -1;
        p.damage = 0;
        p.distanceTraveled = 0;
        p.maxRange = 0;
        p.active = false;
        if (p.glow) { p.glow.destroy(); p.glow = undefined; }
      },
      size,
    );
  }

  static updateAll(delta: number): void {
    for (let i = _active.length - 1; i >= 0; i--) {
      const p = _active[i];
      if (!p.active || !p.sprite.active) {
        ShootSkill._recycle(i);
        continue;
      }
      const body = p.sprite.body as Phaser.Physics.Arcade.Body;
      const spd = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
      p.distanceTraveled += spd * (delta / 1000);
      // Chrono Pulse: slow enemy bullets within radius
      if (ShootSkill.chronoActive && p.ownerId > 0) {
        const cdx = p.sprite.x - ShootSkill.chronoCenter.x;
        const cdy = p.sprite.y - ShootSkill.chronoCenter.y;
        if (cdx * cdx + cdy * cdy < ShootSkill.CHRONO_RADIUS * ShootSkill.CHRONO_RADIUS) {
          body.velocity.x *= 0.12;
          body.velocity.y *= 0.12;
        }
      }
      // Move glow with projectile (no event listener needed)
      if (p.glow) p.glow.setPosition(p.sprite.x, p.sprite.y);
      // Rotate bullet sprite to face travel direction
      if (body.velocity.x !== 0 || body.velocity.y !== 0) {
        p.sprite.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
      }
      if (p.distanceTraveled >= p.maxRange) {
        ShootSkill._recycle(i);
      }
    }

    // Update projectile trails
    for (let i = _trails.length - 1; i >= 0; i--) {
      const t = _trails[i];
      if (!t.proj.active) {
        t.gfx.destroy();
        _trails.splice(i, 1);
        continue;
      }
      t.history.push({ x: t.proj.sprite.x, y: t.proj.sprite.y });
      if (t.history.length > 8) t.history.shift();
      t.gfx.clear();
      const len = t.history.length;
      for (let j = 1; j < len; j++) {
        const a = j / len;
        t.gfx.lineStyle(3 * a, t.color, a * 0.6);
        t.gfx.lineBetween(t.history[j - 1].x, t.history[j - 1].y, t.history[j].x, t.history[j].y);
      }
    }
  }

  static get activeProjectiles(): Projectile[] {
    return _active;
  }

  static recycleProjectile(p: Projectile): void {
    const idx = _active.indexOf(p);
    if (idx !== -1) ShootSkill._recycle(idx);
  }

  static chronoActive = false;
  static chronoCenter = { x: 0, y: 0 };
  static readonly CHRONO_RADIUS = 320;

  /** Per-shot speed multiplier — set by PlayerController from room physics zone. */
  static playerBulletSpeedMult = 1.0;

  private static _recycle(index: number): void {
    const p = _active[index];
    p.active = false;
    if (p.glow) { p.glow.destroy(); p.glow = undefined; }
    _pool?.release(p);
    _active.splice(index, 1);
  }

  protected onUse(...args: unknown[]): void {
    if (!_pool || !_scene) return;
    const [x, y, angle] = args as [number, number, number];

    // Build list of angles to fire (center + spread)
    const count = (this.cfg.spreadCount ?? 0) + 1;
    const half = this.cfg.spreadAngle ?? 0.22;
    const angles: number[] = [];
    if (count === 1) {
      angles.push(angle);
    } else {
      for (let i = 0; i < count; i++) {
        angles.push(angle + (i / (count - 1) - 0.5) * 2 * half);
      }
    }

    for (const a of angles) {
      this._fireOne(x, y, a);
    }

    // ── MACHINE-THEME MUZZLE FX ────────────────────────────────────────
    ShootSkill._muzzleFx(_scene, x, y, angle, this.cfg.tint);

    SystemsBus.instance.emit("projectile:fired", this.ownerId, x, y, angle);
  }

  /**
   * Industrial muzzle effect: bright core flash, directional spark fan, and
   * an ejected shell casing that tumbles + falls. Object-pool-friendly: all
   * elements self-destruct via tween onComplete and are not retained.
   */
  private static _muzzleFx(scene: Phaser.Scene, x: number, y: number, angle: number, color: number): void {
    const cos = Math.cos(angle), sin = Math.sin(angle);

    // 1) Hot core — white-hot pinpoint that fades through tint
    const core = scene.add.circle(x + cos * 16, y + sin * 16, 5, 0xffffff, 1)
      .setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: core, scale: 2.6, alpha: 0, duration: 90,
      onComplete: () => core.destroy(),
    });

    // 2) Directional flash — stretched along barrel axis
    const flash = scene.add.ellipse(x + cos * 22, y + sin * 22, 28, 10, color, 0.85)
      .setRotation(angle).setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: flash, scaleX: 1.8, scaleY: 0.4, alpha: 0, duration: 110,
      onComplete: () => flash.destroy(),
    });

    // 3) Spark fan — 4 short hot streaks
    for (let i = 0; i < 4; i++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const sa = angle + spread;
      const speed = 140 + Math.random() * 90;
      const spark = scene.add.rectangle(x + cos * 18, y + sin * 18, 4, 1.5, 0xffe28a, 1)
        .setRotation(sa).setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: spark,
        x: spark.x + Math.cos(sa) * speed * 0.18,
        y: spark.y + Math.sin(sa) * speed * 0.18,
        scaleX: 0.3, alpha: 0, duration: 180,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }

    // 4) Ejected shell casing — perpendicular to barrel, tumbles + falls
    const ejectAngle = angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
    const casing = scene.add.rectangle(x, y, 5, 2, 0xc9a85a, 1)
      .setStrokeStyle(0.5, 0x6b4a1a, 1)
      .setDepth(46);
    const ev = 80 + Math.random() * 40;
    scene.tweens.add({
      targets: casing,
      x: casing.x + Math.cos(ejectAngle) * ev * 0.45,
      y: casing.y + Math.sin(ejectAngle) * ev * 0.45 + 18, // slight gravity
      angle: 540 + Math.random() * 360,
      alpha: 0,
      duration: 380, ease: "Quad.easeIn",
      onComplete: () => casing.destroy(),
    });
  }

  /** Fire a single projectile bypassing cooldown — used by special abilities */
  static fireImmediate(
    x: number, y: number, angle: number,
    opts: { damage: number; range: number; speed: number; tint: number; ownerId: number },
  ): void {
    if (!_pool || !_scene) return;
    const p = _pool.acquire();
    p.ownerId = opts.ownerId;
    p.damage = opts.damage;
    p.maxRange = opts.range;
    p.distanceTraveled = 0;
    p.active = true;
    const spawnDist = 14;
    const sx = x + Math.cos(angle) * spawnDist;
    const sy = y + Math.sin(angle) * spawnDist;
    p.sprite.setPosition(sx, sy).setActive(true).setVisible(true).setTint(opts.tint).setScale(1.6).setDepth(48);
    const isPlayerImm = opts.ownerId === -1;
    const bulletKeyImm = isPlayerImm && _scene!.textures.exists("bullet_3") ? "bullet_3" : "projectile";
    p.sprite.setTexture(bulletKeyImm);
    if (isPlayerImm) p.sprite.setScale(3.5);
    if (isPlayerImm && bulletKeyImm !== "projectile") {
      p.sprite.setRotation(angle);
      (p.sprite.texture as Phaser.Textures.Texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    (p.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * opts.speed, Math.sin(angle) * opts.speed);
    _active.push(p);
    p.glow = _scene.add.circle(sx, sy, 12, opts.tint, 0.45).setDepth(47).setBlendMode(Phaser.BlendModes.ADD);
    const trailGfx = _scene.add.graphics().setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
    _trails.push({ gfx: trailGfx, proj: p, color: opts.tint, history: [{ x: sx, y: sy }] });
  }

  private _fireOne(x: number, y: number, angle: number): void {
    if (!_pool || !_scene) return;
    const p = _pool.acquire();
    p.ownerId = this.ownerId;
    p.damage = this.cfg.damage;
    p.maxRange = this.cfg.range;
    p.distanceTraveled = 0;
    p.active = true;

    const spawnDist = 14;
    const sx = x + Math.cos(angle) * spawnDist;
    const sy = y + Math.sin(angle) * spawnDist;

    // Use pixel art bullet for player, default projectile for enemies
    const isPlayer = this.ownerId === -1;
    const bulletKey = isPlayer && _scene!.textures.exists("bullet_3") ? "bullet_3" : "projectile";

    p.sprite
      .setTexture(bulletKey)
      .setPosition(sx, sy)
      .setActive(true)
      .setVisible(true)
      .setTint(this.cfg.tint)
      .setScale(isPlayer ? 3.5 : 1.4)
      .setDepth(48);

    if (isPlayer && bulletKey !== "projectile") {
      p.sprite.setRotation(angle);
      (p.sprite.texture as Phaser.Textures.Texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    const bulletSpd = this.ownerId === -1
      ? this.cfg.speed * ShootSkill.playerBulletSpeedMult
      : this.cfg.speed;

    (p.sprite.body as Phaser.Physics.Arcade.Body)
      .setVelocity(Math.cos(angle) * bulletSpd, Math.sin(angle) * bulletSpd);

    _active.push(p);

    // Glow halo — stored on projectile, moved in updateAll (no event listener)
    p.glow = _scene.add.circle(sx, sy, 10, this.cfg.tint, 0.35)
      .setDepth(47).setBlendMode(Phaser.BlendModes.ADD);

    // Energy trail
    const trailGfx = _scene.add.graphics().setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
    _trails.push({ gfx: trailGfx, proj: p, color: this.cfg.tint, history: [{ x: sx, y: sy }] });
  }
}
