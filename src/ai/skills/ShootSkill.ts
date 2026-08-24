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
  /** Cached bullet speed (px/s) — set at fire time, avoids Math.sqrt in updateAll. */
  speed: number;
  active: boolean;
  /** Bullet's own collision radius (px). Combined with agent.hitRadius in CombatSystem. */
  bulletRadius: number;
  /** enemy→player collision threshold (= bulletRadius²). */
  hitRadiusSq: number;
  glow?: Phaser.GameObjects.Arc;
}

let _scene: Phaser.Scene | null = null;
let _pool: ObjectPool<Projectile> | null = null;
const _active: Projectile[] = [];

// Single shared trail Graphics object — cleared and redrawn each frame instead of
// one Graphics per projectile. Eliminates hundreds of per-frame clear() + display list overhead.
let _trailGfx: Phaser.GameObjects.Graphics | null = null;

// Trail history: two reusable float arrays (x/y) per slot, indexed by position in _trailHistory.
// Using flat arrays avoids per-frame {x,y} object allocation.
const _TRAIL_MAX = 48; // max simultaneous trails (reduced for perf)
const _TRAIL_LEN = 5;   // history length per trail
const _trailProj: (Projectile | null)[] = new Array(_TRAIL_MAX).fill(null);
const _trailColor: number[] = new Array(_TRAIL_MAX).fill(0);
const _trailX: Float32Array = new Float32Array(_TRAIL_MAX * _TRAIL_LEN);
const _trailY: Float32Array = new Float32Array(_TRAIL_MAX * _TRAIL_LEN);
const _trailLen: Uint8Array = new Uint8Array(_TRAIL_MAX);
const _trailHead: Uint8Array = new Uint8Array(_TRAIL_MAX); // ring-buffer head
let _trailCount = 0;

/**
 * ShootSkill — fires pooled projectiles in a direction.
 * All instances share a single scene-level ObjectPool.
 * Call ShootSkill.initPool(scene) once on scene create.
 */
export class ShootSkill extends BaseSkill {
  readonly name = "Shoot";
  cooldownMs: number;
  private _baseCooldownMs: number;
  private readonly cfg: ProjectileConfig;
  private readonly ownerId: number;

  constructor(ownerId: number, cfg: Partial<ProjectileConfig> = {}, cooldownMs = 800) {
    super(1);
    this.ownerId = ownerId;
    this._baseCooldownMs = cooldownMs;
    this.cooldownMs = cooldownMs;
    this.cfg = {
      speed: cfg.speed ?? 300,
      damage: cfg.damage ?? 10,
      range: cfg.range ?? 350,
      tint: cfg.tint ?? 0xff6600,
      spreadCount: cfg.spreadCount ?? 0,
      spreadAngle: cfg.spreadAngle ?? 0.22,
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

    // Single shared trail renderer — one Graphics object for all trails
    _trailGfx = scene.add.graphics().setDepth(46).setBlendMode(Phaser.BlendModes.ADD);

    _pool = new ObjectPool<Projectile>(
      () => ({
        sprite: scene.physics.add.image(-9999, -9999, "projectile"),
        ownerId: -1,
        damage: 0,
        distanceTraveled: 0,
        maxRange: 0,
        speed: 0,
        active: false,
        bulletRadius: 7,
        hitRadiusSq: 49,
        glow: undefined,
      }),
      (p) => {
        p.sprite.setActive(false).setVisible(false).setPosition(-9999, -9999);
        (p.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        p.ownerId = -1;
        p.damage = 0;
        p.distanceTraveled = 0;
        p.maxRange = 0;
        p.speed = 0;
        p.active = false;
        p.bulletRadius = 7;
        p.hitRadiusSq = 49;
        if (p.glow) { p.glow.destroy(); p.glow = undefined; }
      },
      size,
    );
  }

  static resetPool(): void {
    const destroyProjectile = (p: Projectile): void => {
      p.active = false;
      p.ownerId = -1;
      p.damage = 0;
      p.distanceTraveled = 0;
      p.maxRange = 0;
      try {
        p.glow?.destroy();
      } catch {
        // Object may already be owned by a shutting-down scene.
      }
      try {
        p.sprite?.destroy();
      } catch {
        // Object may already be owned by a shutting-down scene.
      }
      p.glow = undefined;
    };

    // Clear shared trail data
    _trailProj.fill(null);
    _trailLen.fill(0);
    _trailHead.fill(0);
    _trailCount = 0;
    try { _trailGfx?.destroy(); } catch { /* scene already shutting down */ }
    _trailGfx = null;

    if (_pool) {
      _pool.dispose(destroyProjectile);
    } else {
      for (const p of _active) {
        destroyProjectile(p);
      }
    }

    _active.length = 0;
    _pool = null;
    _scene = null;
    ShootSkill.chronoActive = false;
    ShootSkill.chronoCenter.x = 0;
    ShootSkill.chronoCenter.y = 0;
    ShootSkill.playerBulletSpeedMult = 1.0;
  }

  static updateAll(delta: number): void {
    const dt = delta / 1000;
    for (let i = _active.length - 1; i >= 0; i--) {
      const p = _active[i];
      if (!p.active || !p.sprite.active) {
        ShootSkill._recycle(i);
        continue;
      }
      const body = p.sprite.body as Phaser.Physics.Arcade.Body;
      // Use cached speed — no sqrt needed
      p.distanceTraveled += p.speed * dt;
      // Chrono Pulse: slow enemy bullets within radius
      if (ShootSkill.chronoActive && p.ownerId > 0) {
        const cdx = p.sprite.x - ShootSkill.chronoCenter.x;
        const cdy = p.sprite.y - ShootSkill.chronoCenter.y;
        if (cdx * cdx + cdy * cdy < ShootSkill.CHRONO_RADIUS_SQ) {
          body.velocity.x *= 0.12;
          body.velocity.y *= 0.12;
          // Recompute cached speed after modification
          p.speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
        }
      }
      if (body.velocity.x !== 0 || body.velocity.y !== 0) {
        p.sprite.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
      }
      if (p.distanceTraveled >= p.maxRange) {
        ShootSkill._recycle(i);
      }
    }

    // Update all trails using the single shared Graphics object
    if (!_trailGfx) return;
    _trailGfx.clear();
    for (let i = 0; i < _TRAIL_MAX; i++) {
      const proj = _trailProj[i];
      if (!proj) continue;
      if (!proj.active) {
        // Trail expired — free the slot
        _trailProj[i] = null;
        _trailLen[i] = 0;
        _trailHead[i] = 0;
        _trailCount--;
        continue;
      }
      // Push current position into ring buffer
      const head = _trailHead[i];
      const base = i * _TRAIL_LEN;
      _trailX[base + head] = proj.sprite.x;
      _trailY[base + head] = proj.sprite.y;
      _trailHead[i] = (head + 1) % _TRAIL_LEN;
      if (_trailLen[i] < _TRAIL_LEN) _trailLen[i]++;

      // Draw trail segments from oldest to newest
      const len = _trailLen[i];
      if (len < 2) continue;
      const color = _trailColor[i];
      // Compute oldest index in ring buffer
      const oldest = (_trailHead[i] - len + _TRAIL_LEN) % _TRAIL_LEN;
      for (let j = 1; j < len; j++) {
        const a = j / len;
        const idx0 = (oldest + j - 1) % _TRAIL_LEN;
        const idx1 = (oldest + j) % _TRAIL_LEN;
        _trailGfx.lineStyle(3 * a, color, a * 0.55);
        _trailGfx.lineBetween(
          _trailX[base + idx0], _trailY[base + idx0],
          _trailX[base + idx1], _trailY[base + idx1],
        );
      }
    }
  }

  static get activeProjectiles(): Projectile[] {
    return _active;
  }

  static recycleProjectile(p: Projectile): void {
    p.active = false;
    if (p.glow) { p.glow.destroy(); p.glow = undefined; }
    _pool?.release(p);
  }

  static chronoActive = false;
  static chronoCenter = { x: 0, y: 0 };
  static readonly CHRONO_RADIUS = 320;
  static readonly CHRONO_RADIUS_SQ = 320 * 320;

  /** Per-shot speed multiplier — set by PlayerController from room physics zone. */
  static playerBulletSpeedMult = 1.0;

  /** Override per-shot damage (used by kill-streak bonus). */
  setDamage(d: number): void {
    this.cfg.damage = Math.max(1, Math.round(d));
  }

  get damage(): number {
    return this.cfg.damage;
  }

  /** Apply a fire-rate multiplier (>1 = faster). Stored on instance; call each frame or on change. */
  setFireRateMult(mult: number): void {
    this.cooldownMs = Math.round(this._baseCooldownMs / mult);
  }

  resetFireRateMult(): void {
    this.cooldownMs = this._baseCooldownMs;
  }

  private static _recycle(index: number): void {
    const p = _active[index];
    p.active = false;
    if (p.glow) { p.glow.destroy(); p.glow = undefined; }
    _pool?.release(p);
    // Swap-remove: O(1) instead of splice O(n)
    const last = _active.length - 1;
    if (index !== last) _active[index] = _active[last];
    _active.length = last;
  }

  /** Allocate a trail ring-buffer slot for a new projectile. Returns false if all slots full. */
  private static _allocTrail(proj: Projectile, color: number): void {
    // Find first free slot
    for (let i = 0; i < _TRAIL_MAX; i++) {
      if (_trailProj[i] === null) {
        _trailProj[i] = proj;
        _trailColor[i] = color;
        _trailLen[i] = 0;
        _trailHead[i] = 0;
        _trailCount++;
        return;
      }
    }
    // All slots full — silently skip trail (rare; pool size 128 = trail max)
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
    // Full FX only for player; enemies get a single lightweight flash
    if (this.ownerId === -1) {
      ShootSkill._muzzleFx(_scene, x, y, angle, this.cfg.tint);
    } else {
      ShootSkill._muzzleFxLite(_scene, x, y, angle, this.cfg.tint);
    }

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

  private static _muzzleFxLite(scene: Phaser.Scene, x: number, y: number, angle: number, color: number): void {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const flash = scene.add.circle(x + cos * 14, y + sin * 14, 4, color, 0.8)
      .setDepth(49).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: flash, scale: 1.8, alpha: 0, duration: 80,
      onComplete: () => flash.destroy(),
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
    p.speed = opts.speed;
    p.active = true;
    p.bulletRadius = 7;
    p.hitRadiusSq = 49;
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
    ShootSkill._allocTrail(p, opts.tint);
  }

  private _fireOne(x: number, y: number, angle: number): void {
    if (!_pool || !_scene) return;
    const p = _pool.acquire();
    p.ownerId = this.ownerId;
    p.damage = this.cfg.damage;
    p.maxRange = this.cfg.range;
    p.distanceTraveled = 0;
    p.active = true;
    const isPlayer = this.ownerId === -1;
    p.bulletRadius = isPlayer ? 7 : 5;
    p.hitRadiusSq = isPlayer ? 49 : 25;

    const spawnDist = 14;
    const sx = x + Math.cos(angle) * spawnDist;
    const sy = y + Math.sin(angle) * spawnDist;

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

    const bulletSpd = isPlayer
      ? this.cfg.speed * ShootSkill.playerBulletSpeedMult
      : this.cfg.speed;

    p.speed = bulletSpd; // cache for updateAll — no sqrt needed
    (p.sprite.body as Phaser.Physics.Arcade.Body)
      .setVelocity(Math.cos(angle) * bulletSpd, Math.sin(angle) * bulletSpd);

    _active.push(p);
    ShootSkill._allocTrail(p, this.cfg.tint);
  }
}
