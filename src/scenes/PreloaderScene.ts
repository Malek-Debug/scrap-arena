import Phaser from "phaser";
import { generatePlaceholders } from "../rendering/PlaceholderTextures";

/**
 * Preloader scene — loads all assets before gameplay.
 * Achieves fast FCP by rendering a minimal progress bar immediately.
 * Supports texture atlases natively via Phaser's loader.
 */
export class PreloaderScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Rectangle;
  private barBg!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: "Preloader" });
  }

  preload(): void {
    // YouTube Playables: signal that we've rendered the first loading frame
    if (typeof ytgame !== "undefined") ytgame.game.firstFrameReady();

    const { width, height } = this.cameras.main;
    const barW = width * 0.5;
    const barH = 16;
    const x = (width - barW) / 2;
    const y = height / 2;

    this.barBg = this.add.rectangle(x, y, barW, barH, 0x222222).setOrigin(0, 0.5);
    this.bar = this.add.rectangle(x, y, 0, barH, 0x00ff88).setOrigin(0, 0.5);

    this.load.on("progress", (v: number) => {
      this.bar.width = barW * v;
    });

    // --- LOAD YOUR ASSETS HERE ---
    // Player character spritesheet (Cyborg from Cyberpunk pack)
    this.load.spritesheet("player_idle_sheet", "assets/player/idle.png", { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet("player_run_sheet", "assets/player/run.png", { frameWidth: 48, frameHeight: 48 });

    // Texture atlases (multi-packed)
    // this.load.atlas("sprites", "assets/atlas/sprites.png", "assets/atlas/sprites.json");

    // Audio
    // this.load.audio("bgm", "assets/audio/bgm.ogg");

    // Tilemaps
    // this.load.tilemapTiledJSON("level1", "assets/maps/level1.json");

    // Weapon sprites — 5 gun tiers (idle + firing)
    const gunTiers = [1, 3, 5, 8, 10];
    for (const t of gunTiers) {
      this.load.image(`gun_${t}_idle`, `assets/guns/${t}_1.png`);
      this.load.image(`gun_${t}_fire`, `assets/guns/${t}_2.png`);
    }
    // Bullet sprites
    this.load.image("bullet_1", "assets/bullets/1.png");
    this.load.image("bullet_3", "assets/bullets/3.png");
    this.load.image("bullet_6", "assets/bullets/6.png");
    this.load.image("bullet_8", "assets/bullets/8.png");
    this.load.image("bullet_10", "assets/bullets/10.png");
    // Muzzle flash frames
    this.load.image("muzzle_1", "assets/effects/1_1.png");
    this.load.image("muzzle_2", "assets/effects/2_1.png");

    // --- Enemy pixel art spritesheets (Reactor Man Asset Pack) ---
    this.load.spritesheet("enemy_sheet", "assets/enemies/All_Terrain_Missile_Bot.png", { frameWidth: 48, frameHeight: 40 });
    this.load.spritesheet("guard_sheet", "assets/enemies/Big_Propeller_Bot.png", { frameWidth: 32, frameHeight: 40 });
    this.load.spritesheet("collector_sheet", "assets/enemies/UFO_Bomb_Bot.png", { frameWidth: 48, frameHeight: 32 });
    this.load.spritesheet("turret_sheet", "assets/enemies/Multi_Directional_Cannon.png", { frameWidth: 40, frameHeight: 40 });
    this.load.spritesheet("sawblade_sheet", "assets/enemies/Roller_Bot.png", { frameWidth: 48, frameHeight: 40 });
    this.load.spritesheet("welder_sheet", "assets/enemies/Toxic_Barrel_Bot.png", { frameWidth: 44, frameHeight: 48 });
    this.load.spritesheet("boss_sheet", "assets/enemies/Reactor_Man_Boss.png", { frameWidth: 33, frameHeight: 49 });
    // Enemy projectile sprites
    this.load.spritesheet("missile_proj_sheet", "assets/enemies/Yellow_Missile.png", { frameWidth: 16, frameHeight: 16 });
    this.load.image("cannonball_tex", "assets/enemies/Cannon_Ball.png");
    this.load.spritesheet("goop_proj_sheet", "assets/enemies/Toxic_Goop_Shot.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("boss_proj_sheet", "assets/enemies/Reactor_Man_Projectile.png", { frameWidth: 16, frameHeight: 16 });

    // ── Audio assets (Kenney CC0) ──────────────────────────────────────────
    const audioFiles: [string, string | string[]][] = [
      ["sfx_shoot",         "assets/audio/sfx_shoot.ogg"],
      ["sfx_shoot2",        "assets/audio/sfx_shoot2.ogg"],
      ["sfx_shoot_large",   "assets/audio/sfx_shoot_large.ogg"],
      ["sfx_explosion",     "assets/audio/sfx_explosion.ogg"],
      ["sfx_explosion_big", "assets/audio/sfx_explosion_big.ogg"],
      ["sfx_hit",           "assets/audio/sfx_hit.ogg"],
      ["sfx_player_hit",    "assets/audio/sfx_player_hit.ogg"],
      ["sfx_player_death",  "assets/audio/sfx_player_death.ogg"],
      ["sfx_dash",          "assets/audio/sfx_dash.ogg"],
      ["sfx_door_open",     "assets/audio/sfx_door_open.ogg"],
      ["sfx_door_close",    "assets/audio/sfx_door_close.ogg"],
      ["sfx_pickup",        "assets/audio/sfx_pickup.ogg"],
      ["sfx_upgrade",       "assets/audio/sfx_upgrade.ogg"],
      ["sfx_barrier",       "assets/audio/sfx_barrier.ogg"],
      ["sfx_wave_complete", "assets/audio/sfx_wave_complete.ogg"],
      ["sfx_combo",         "assets/audio/sfx_combo.ogg"],
      ["sfx_error",         "assets/audio/sfx_error.ogg"],
      ["sfx_switch",        "assets/audio/sfx_switch.ogg"],
      ["sfx_powerup",       "assets/audio/sfx_powerup.ogg"],
      ["sfx_shield",        "assets/audio/sfx_shield.ogg"],
      // Load compact formats first; keep mp3 fallback for wider compatibility.
      ["music_main",        ["assets/audio/music_main.ogg", "assets/audio/Gameplay Music.mp3"]],
      ["music_boss",        ["assets/audio/music_boss.ogg", "assets/audio/Boss Music.mp3"]],
      ["music_title",       ["assets/audio/music_title.ogg", "assets/audio/Game Lobby.mp3"]],
      ["music_lobby",       ["assets/audio/Game Lobby.mp3", "assets/audio/music_title.ogg"]],
      ["music_gameover",    ["assets/audio/Boss Music.mp3", "assets/audio/music_boss.ogg"]],
      ["music_victory",     ["assets/audio/Game Lobby.mp3", "assets/audio/music_title.ogg"]],
    ];
    for (const [key, url] of audioFiles) {
      this.load.audio(key, url);
    }

    // Generate placeholder textures for demo
    this.generatePlaceholders();
  }

  create(): void {
    this.bar.destroy();
    this.barBg.destroy();
    this._createPlayerAnimations();
    this._createEnemyAnimations();
    this.scene.start("TitleScene");
  }

  /** Create player character animations from Cyborg spritesheet */
  private _createPlayerAnimations(): void {
    if (this.textures.exists("player_idle_sheet")) {
      (this.textures.get("player_idle_sheet") as Phaser.Textures.Texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.anims.create({
        key: "player_idle",
        frames: this.anims.generateFrameNumbers("player_idle_sheet", { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (this.textures.exists("player_run_sheet")) {
      (this.textures.get("player_run_sheet") as Phaser.Textures.Texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.anims.create({
        key: "player_run",
        frames: this.anims.generateFrameNumbers("player_run_sheet", { start: 0, end: 5 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  /** Create pixel-art enemy animations + set NEAREST filter for crisp scaling */
  private _createEnemyAnimations(): void {
    const defs: { key: string; sheet: string; idle: [number, number]; attack?: [number, number]; rate: number }[] = [
      { key: "enemy", sheet: "enemy_sheet", idle: [0, 3], attack: [4, 7], rate: 8 },
      { key: "guard", sheet: "guard_sheet", idle: [0, 2], attack: [3, 5], rate: 8 },
      { key: "collector", sheet: "collector_sheet", idle: [0, 2], attack: [3, 5], rate: 8 },
      { key: "turret", sheet: "turret_sheet", idle: [0, 4], attack: [5, 9], rate: 6 },
      { key: "sawblade", sheet: "sawblade_sheet", idle: [0, 7], attack: [8, 10], rate: 12 },
      { key: "welder", sheet: "welder_sheet", idle: [0, 2], attack: [3, 5], rate: 6 },
      { key: "boss", sheet: "boss_sheet", idle: [0, 3], attack: [4, 7], rate: 8 },
    ];
    for (const d of defs) {
      if (!this.textures.exists(d.sheet)) continue;
      this.anims.create({
        key: `${d.key}_idle`,
        frames: this.anims.generateFrameNumbers(d.sheet, { start: d.idle[0], end: d.idle[1] }),
        frameRate: d.rate,
        repeat: -1,
      });
      if (d.attack) {
        this.anims.create({
          key: `${d.key}_attack`,
          frames: this.anims.generateFrameNumbers(d.sheet, { start: d.attack[0], end: d.attack[1] }),
          frameRate: d.rate + 2,
          repeat: 0,
        });
      }
    }
    // Projectile animations
    if (this.textures.exists("missile_proj_sheet")) {
      this.anims.create({ key: "missile_fly", frames: this.anims.generateFrameNumbers("missile_proj_sheet", { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
    }
    if (this.textures.exists("boss_proj_sheet")) {
      this.anims.create({ key: "boss_proj_fly", frames: this.anims.generateFrameNumbers("boss_proj_sheet", { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
    }
    if (this.textures.exists("goop_proj_sheet")) {
      this.anims.create({ key: "goop_fly", frames: this.anims.generateFrameNumbers("goop_proj_sheet", { start: 0, end: 2 }), frameRate: 8, repeat: -1 });
    }
    // Set NEAREST filter on all enemy textures for crisp pixel art
    const texKeys = ["enemy_sheet", "guard_sheet", "collector_sheet", "turret_sheet", "sawblade_sheet", "welder_sheet", "boss_sheet", "missile_proj_sheet", "cannonball_tex", "goop_proj_sheet", "boss_proj_sheet"];
    for (const key of texKeys) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  private generatePlaceholders(): void {
    generatePlaceholders(this);
  }
}
