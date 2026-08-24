import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../../core";
import { UI_FONT, UI_MONO, UI_OXANIUM } from "../../rendering/UITheme";
import { AudioManager } from "../../audio/AudioManager";
import type { NetworkClient } from "../network/NetworkClient";
import { Interpolation, type EntitySnapshot } from "../network/Interpolation";
import { Prediction } from "../network/Prediction";
import { PvPArena } from "../arena/PvPArena";
import type {
  ServerMessage, S2C_GameState, S2C_PlayerHit, S2C_PlayerKilled,
  S2C_PlayerRespawned, S2C_AbilityUsed, S2C_MatchEnded, S2C_KillFeed,
  PlayerStateUpdate, MatchPlayerInit, CharacterId,
} from "../network/NetworkMessages";

const ARENA_WIDTH = PvPArena.WIDTH;
const ARENA_HEIGHT = PvPArena.HEIGHT;

interface KillFeedEntry {
  killer: string;
  victim: string;
  time: number;
}

const CHARACTER_COLORS: Record<string, number> = {
  assault: 0xff6600,
  sentinel: 0x3388ff,
  phantom: 0xcc44ff,
  engineer: 0x00ff88,
};

const CHARACTER_NAMES: Record<string, string> = {
  assault: "WRECKER",
  sentinel: "BASTION",
  phantom: "SPECTRE",
  engineer: "FORGE",
};

export class MultiplayerArenaScene extends Phaser.Scene {
  private networkClient: NetworkClient | null = null;
  private localPlayerId = "";
  private inputSeq = 0;

  // Rendering
  private playerSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private playerCharacters: Map<string, CharacterId> = new Map();
  private projectileSprites: Map<number, Phaser.GameObjects.Arc> = new Map();

  // Network systems
  private interpolation!: Interpolation;
  private prediction!: Prediction;

  // Input state
  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
  };
  private shooting = false;
  private aimAngle = 0;

  // HUD
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private heatBar!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private killFeed: KillFeedEntry[] = [];
  private killFeedTexts: Phaser.GameObjects.Text[] = [];
  private localHp = 100;
  private localMaxHp = 100;
  private localHeat = 0;
  private localScore = 0;
  private matchTime = 300;

  // Match state
  private matchActive = true;

  constructor() {
    super({ key: "MultiplayerArena" });
  }

  create(): void {
    this.networkClient = this.registry.get("networkClient") as NetworkClient | null;
    this.localPlayerId = this.networkClient?.playerId || this.registry.get("localPlayerId") as string || "";
    this.matchActive = true;
    this.killFeed = [];
    this.inputSeq = 0;

    this.cameras.main.setBackgroundColor(0x0a0a14);
    this.physics.world.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Initialize systems
    this.interpolation = new Interpolation();
    this.prediction = new Prediction();
    this.prediction.configure(200, ARENA_WIDTH, ARENA_HEIGHT);

    // Build arena (side-effect: draws arena geometry and creates physics bodies)
    new PvPArena(this);

    // Setup camera
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Setup input
    this.keys = {
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      shift: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      e: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      space: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      esc: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };

    this.input.on("pointerdown", () => { this.shooting = true; });
    this.input.on("pointerup", () => { this.shooting = false; });

    // Build HUD
    this._buildHUD();

    // Bind network events
    this._bindNetworkEvents();

    // Audio
    AudioManager.instance.setScene(this);
    AudioManager.instance.init();

    // Fade in
    this.cameras.main.fadeIn(600, 0, 0, 0);

    // Initialize players from match data
    const matchPlayers = this.registry.get("matchPlayers") as MatchPlayerInit[] | null;
    if (matchPlayers) {
      for (const p of matchPlayers) {
        this.playerCharacters.set(p.id, p.characterId);
        this._createPlayerSprite(p.id, p.position.x, p.position.y, p.characterId, p.hp, p.maxHp);
        if (p.id === this.localPlayerId) {
          this.prediction.configure(p.speed, ARENA_WIDTH, ARENA_HEIGHT);
          this.prediction.setPosition(p.position.x, p.position.y);
          this.localMaxHp = p.maxHp;
          this.localHp = p.hp;
        }
      }
    }
  }

  update(_time: number, deltaMs: number): void {
    if (!this.matchActive) return;

    // Collect input
    const dx = (this.keys.a.isDown ? -1 : 0) + (this.keys.d.isDown ? 1 : 0);
    const dy = (this.keys.w.isDown ? -1 : 0) + (this.keys.s.isDown ? 1 : 0);

    // Aim angle from player to mouse
    const localSprite = this.playerSprites.get(this.localPlayerId);
    if (localSprite) {
      const cam = this.cameras.main;
      const worldX = this.input.activePointer.x + cam.scrollX;
      const worldY = this.input.activePointer.y + cam.scrollY;
      this.aimAngle = Math.atan2(worldY - localSprite.y, worldX - localSprite.x);
    }

    const isShooting = this.shooting || this.keys.space.isDown;
    const ability = Phaser.Input.Keyboard.JustDown(this.keys.e);
    const dash = Phaser.Input.Keyboard.JustDown(this.keys.shift);

    // Send input to server
    this.inputSeq++;
    const input = {
      seq: this.inputSeq,
      moveX: dx,
      moveY: dy,
      aimAngle: this.aimAngle,
      shooting: isShooting,
      ability,
      dash,
    };

    this.networkClient?.sendInput(input);

    // Client-side prediction for local player
    if (localSprite) {
      this.prediction.applyInput({ seq: input.seq, moveX: input.moveX, moveY: input.moveY }, deltaMs);
      this.prediction.update(deltaMs);
      const predicted = this.prediction.getPosition();
      localSprite.setPosition(predicted.x, predicted.y);
      this.cameras.main.startFollow(localSprite, true, 0.08, 0.08);
    }

    // Interpolate remote players
    const now = performance.now();
    for (const [id, sprite] of this.playerSprites) {
      if (id === this.localPlayerId) continue;
      const interp = this.interpolation.getInterpolatedPosition(id, now);
      if (interp) {
        sprite.setPosition(interp.x, interp.y);
      }
    }

    // Update HUD
    this._updateHUD();

    // Clean old kill feed entries
    const cutoff = performance.now() - 5000;
    this.killFeed = this.killFeed.filter(k => k.time > cutoff);
    this._refreshKillFeed();
  }

  private _buildHUD(): void {
    // HP bar
    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(200);
    this.hpText = this.add.text(130, GAME_HEIGHT - 40, "100 / 100", {
      fontFamily: UI_MONO, fontSize: "12px", color: "#00ff88",
      stroke: "#000000", strokeThickness: 2,
    }).setScrollFactor(0).setDepth(201).setOrigin(0.5);

    // Heat bar
    this.heatBar = this.add.graphics().setScrollFactor(0).setDepth(200);

    // Score
    this.scoreText = this.add.text(GAME_WIDTH / 2, 20, "0 KILLS", {
      fontFamily: UI_OXANIUM, fontSize: "18px", color: "#ffffff", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5);

    // Timer
    this.timerText = this.add.text(GAME_WIDTH / 2, 46, "5:00", {
      fontFamily: UI_MONO, fontSize: "14px", color: "#ffcc44",
      stroke: "#000000", strokeThickness: 3,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5);

    // Ability cooldown
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, "[E] ABILITY READY", {
      fontFamily: UI_MONO, fontSize: "12px", color: "#00ff88",
      stroke: "#000000", strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5);

    // Kill feed area
    for (let i = 0; i < 5; i++) {
      const txt = this.add.text(GAME_WIDTH - 20, 70 + i * 22, "", {
        fontFamily: UI_MONO, fontSize: "11px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 2,
      }).setScrollFactor(0).setDepth(200).setOrigin(1, 0).setAlpha(0);
      this.killFeedTexts.push(txt);
    }

    // Connection indicator
    this.add.text(20, 20, "●", {
      fontFamily: UI_MONO, fontSize: "12px", color: "#00ff88",
    }).setScrollFactor(0).setDepth(200);

    this.add.text(34, 20, "CONNECTED", {
      fontFamily: UI_MONO, fontSize: "10px", color: "#556655",
    }).setScrollFactor(0).setDepth(200);
  }

  private _updateHUD(): void {
    // HP bar
    this.hpBar.clear();
    const hpX = 30, hpY = GAME_HEIGHT - 50, hpW = 200, hpH = 16;
    this.hpBar.fillStyle(0x1a1a1a, 0.8);
    this.hpBar.fillRect(hpX, hpY, hpW, hpH);
    const hpFill = Math.max(0, this.localHp / this.localMaxHp);
    const hpColor = hpFill > 0.5 ? 0x00ff88 : hpFill > 0.25 ? 0xffaa00 : 0xff4444;
    this.hpBar.fillStyle(hpColor, 0.9);
    this.hpBar.fillRect(hpX, hpY, hpW * hpFill, hpH);
    this.hpBar.lineStyle(1, hpColor, 0.6);
    this.hpBar.strokeRect(hpX, hpY, hpW, hpH);
    this.hpText.setText(`${Math.ceil(this.localHp)} / ${this.localMaxHp}`);

    // Heat bar
    this.heatBar.clear();
    const htX = 30, htY = GAME_HEIGHT - 28, htW = 200, htH = 8;
    this.heatBar.fillStyle(0x1a1a1a, 0.6);
    this.heatBar.fillRect(htX, htY, htW, htH);
    const heatFill = Math.max(0, Math.min(1, this.localHeat / 100));
    const heatColor = heatFill > 0.75 ? 0xff4444 : heatFill > 0.5 ? 0xffaa00 : 0xff6600;
    this.heatBar.fillStyle(heatColor, 0.8);
    this.heatBar.fillRect(htX, htY, htW * heatFill, htH);

    // Timer
    const mins = Math.floor(this.matchTime / 60);
    const secs = Math.floor(this.matchTime % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, "0")}`);
    if (this.matchTime < 30) this.timerText.setColor("#ff4444");

    // Score
    this.scoreText.setText(`${this.localScore} KILLS`);
  }

  private _refreshKillFeed(): void {
    for (let i = 0; i < 5; i++) {
      const entry = this.killFeed[this.killFeed.length - 1 - i];
      const txt = this.killFeedTexts[i];
      if (entry) {
        txt.setText(`${entry.killer} ▸ ${entry.victim}`).setAlpha(1);
        const age = performance.now() - entry.time;
        if (age > 4000) txt.setAlpha(Math.max(0, 1 - (age - 4000) / 1000));
      } else {
        txt.setAlpha(0);
      }
    }
  }

  private _bindNetworkEvents(): void {
    if (!this.networkClient) return;
    const net = this.networkClient;

    net.on("game_state", (msg: ServerMessage) => {
      const data = msg as S2C_GameState;
      this._processGameState(data);
    });

    net.on("player_hit", (msg: ServerMessage) => {
      const data = msg as S2C_PlayerHit;
      this._onPlayerHit(data.targetId, data.damage);
    });

    net.on("player_killed", (msg: ServerMessage) => {
      const data = msg as S2C_PlayerKilled;
      this.killFeed.push({
        killer: this._getPlayerName(data.killerId),
        victim: this._getPlayerName(data.victimId),
        time: performance.now(),
      });
      if (data.killerId === this.localPlayerId) {
        this._showKillConfirmation();
      }
      if (data.victimId === this.localPlayerId) {
        this._onLocalDeath();
      }
    });

    net.on("kill_feed", (msg: ServerMessage) => {
      const data = msg as S2C_KillFeed;
      this.killFeed.push({ killer: data.killerName, victim: data.victimName, time: performance.now() });
    });

    net.on("player_respawned", (msg: ServerMessage) => {
      const data = msg as S2C_PlayerRespawned;
      if (data.playerId === this.localPlayerId) {
        this._onLocalRespawn(data.position.x, data.position.y);
      } else {
        this._spawnEffect(data.position.x, data.position.y);
      }
    });

    net.on("ability_used", (msg: ServerMessage) => {
      const data = msg as S2C_AbilityUsed;
      this._showAbilityVFX(data.abilityId, data.position.x, data.position.y);
    });

    net.on("match_ended", (msg: ServerMessage) => {
      const data = msg as S2C_MatchEnded;
      this.matchActive = false;
      this.time.delayedCall(2000, () => {
        this.scene.start("MatchResults", {
          winner: data.winnerId,
          rankings: data.results,
          localPlayerId: this.localPlayerId,
        });
      });
    });
  }

  private _processGameState(state: S2C_GameState): void {
    const now = performance.now();
    this.matchTime = state.matchTime;

    for (const player of state.players) {
      if (player.id === this.localPlayerId) {
        this.prediction.reconcile(player.x, player.y, state.tick);
        this.localHp = player.hp;
        this.localHeat = player.heat;
        this.localScore = player.score;
      } else {
        const snapshot: EntitySnapshot = { x: player.x, y: player.y, timestamp: now };
        this.interpolation.pushSnapshot(player.id, snapshot);
      }

      if (!this.playerSprites.has(player.id)) {
        const charId = this.playerCharacters.get(player.id) || "assault";
        this._createPlayerSprite(player.id, player.x, player.y, charId, player.hp, 100);
      }

      const sprite = this.playerSprites.get(player.id);
      if (sprite) {
        sprite.setVisible(player.alive);
        this._updatePlayerHpBar(sprite, player);
      }
    }

    const activeProjectileIds = new Set(state.projectiles.map(p => p.id));
    for (const [id, sprite] of this.projectileSprites) {
      if (!activeProjectileIds.has(id)) {
        sprite.destroy();
        this.projectileSprites.delete(id);
      }
    }

    for (const proj of state.projectiles) {
      if (!this.projectileSprites.has(proj.id)) {
        const charId = this.playerCharacters.get(proj.ownerId) || "assault";
        const color = CHARACTER_COLORS[charId] ?? 0x00ff88;
        const bullet = this.add.circle(proj.x, proj.y, 4, color, 1).setDepth(40);
        this.projectileSprites.set(proj.id, bullet);
      } else {
        this.projectileSprites.get(proj.id)!.setPosition(proj.x, proj.y);
      }
    }
  }

  private _createPlayerSprite(id: string, x: number, y: number, characterId: CharacterId, hp: number, maxHp: number): void {
    const color = CHARACTER_COLORS[characterId] ?? 0x00ff88;
    const container = this.add.container(x, y).setDepth(50);

    container.add(this.add.circle(0, 0, 18, color, 0.9));
    const glow = this.add.circle(0, 0, 24, color, 0.2);
    glow.setStrokeStyle(1, color, 0.5);
    container.add(glow);

    container.add(this.add.triangle(20, 0, 0, -4, 8, 0, 0, 4, color, 1).setName("direction"));

    const label = id === this.localPlayerId ? "YOU" : (CHARACTER_NAMES[characterId] || "???");
    container.add(this.add.text(0, -32, label, {
      fontFamily: UI_MONO, fontSize: "9px", color: "#ffffff",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5));

    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x000000, 0.6);
    hpBg.fillRect(-20, -26, 40, 4);
    container.add(hpBg);

    const hpG = this.add.graphics().setName("hpFill");
    hpG.fillStyle(color, 0.9);
    hpG.fillRect(-20, -26, 40 * (maxHp > 0 ? hp / maxHp : 1), 4);
    container.add(hpG);

    this.playerSprites.set(id, container);
    this.playerCharacters.set(id, characterId);

    if (id === this.localPlayerId) {
      this.cameras.main.startFollow(container, true, 0.08, 0.08);
    }
  }

  private _updatePlayerHpBar(sprite: Phaser.GameObjects.Container, player: PlayerStateUpdate): void {
    const g = sprite.getByName("hpFill") as Phaser.GameObjects.Graphics;
    if (!g) return;
    g.clear();
    const charId = this.playerCharacters.get(player.id) || "assault";
    const color = CHARACTER_COLORS[charId] ?? 0x00ff88;
    g.fillStyle(color, 0.9);
    g.fillRect(-20, -26, 40 * Math.max(0, Math.min(1, player.hp / this.localMaxHp)), 4);
  }

  private _getPlayerName(playerId: string): string {
    const c = this.playerCharacters.get(playerId);
    return c ? (CHARACTER_NAMES[c] || playerId.slice(-4)) : playerId.slice(-4);
  }

  private _onPlayerHit(targetId: string, _damage: number): void {
    const sprite = this.playerSprites.get(targetId);
    if (!sprite) return;

    // Flash red
    const flash = this.add.circle(sprite.x, sprite.y, 22, 0xff0000, 0.5).setDepth(55);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 200, onComplete: () => flash.destroy() });

    if (targetId === this.localPlayerId) {
      // Screen edge flash for damage feedback
      const dmgFlash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.15)
        .setScrollFactor(0).setDepth(190);
      this.tweens.add({ targets: dmgFlash, alpha: 0, duration: 300, onComplete: () => dmgFlash.destroy() });
      this.cameras.main.shake(80, 0.005);
    }
  }

  private _showKillConfirmation(): void {
    const txt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, "KILL!", {
      fontFamily: UI_OXANIUM, fontSize: "28px", color: "#ff6600", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 5,
    }).setScrollFactor(0).setDepth(210).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: txt, alpha: 1, scale: 1.2, duration: 150, yoyo: true, hold: 300, onComplete: () => txt.destroy() });
  }

  private _onLocalDeath(): void {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.3)
      .setScrollFactor(0).setDepth(195);
    const deathText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "DESTROYED", {
      fontFamily: UI_FONT, fontSize: "36px", color: "#ff4444", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 6,
    }).setScrollFactor(0).setDepth(196).setOrigin(0.5);
    const respawnText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, "Respawning in 3...", {
      fontFamily: UI_FONT, fontSize: "14px", color: "#ffffff",
      stroke: "#000000", strokeThickness: 3,
    }).setScrollFactor(0).setDepth(196).setOrigin(0.5);

    let count = 3;
    const timer = this.time.addEvent({
      delay: 1000, repeat: 2,
      callback: () => {
        count--;
        if (count <= 0) {
          overlay.destroy(); deathText.destroy(); respawnText.destroy(); timer.destroy();
        } else {
          respawnText.setText(`Respawning in ${count}...`);
        }
      },
    });
  }

  private _onLocalRespawn(x: number, y: number): void {
    this.prediction.setPosition(x, y);
    this.prediction.update(0);
    const sprite = this.playerSprites.get(this.localPlayerId);
    if (sprite) {
      sprite.setPosition(x, y).setVisible(true);
      // Spawn invulnerability flash
      const ring = this.add.circle(x, y, 30, 0x00ff88, 0.6).setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    }
  }

  private _spawnEffect(x: number, y: number): void {
    const ring = this.add.circle(x, y, 20, 0x00ffcc, 0.4).setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: 2.5, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
  }

  private _showAbilityVFX(abilityId: string, x: number, y: number): void {
    switch (abilityId) {
      case "overdrive": {
        const burst = this.add.circle(x, y, 30, 0xff6600, 0.5).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 400, onComplete: () => burst.destroy() });
        break;
      }
      case "energy_shield": {
        const shield = this.add.circle(x, y, 35, 0x3388ff, 0.3).setDepth(45)
          .setStrokeStyle(3, 0x3388ff, 0.8);
        this.tweens.add({ targets: shield, alpha: 0, duration: 4000, onComplete: () => shield.destroy() });
        break;
      }
      case "phase_dash": {
        const trail = this.add.circle(x, y, 18, 0xcc44ff, 0.6).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: trail, scale: 0.2, alpha: 0, duration: 500, onComplete: () => trail.destroy() });
        break;
      }
      case "repair_drone": {
        const drone = this.add.circle(x, y - 30, 8, 0x00ff88, 0.8).setDepth(45);
        this.tweens.add({
          targets: drone, y: y - 40, alpha: 0.4, duration: 1000, yoyo: true, repeat: 5,
          onComplete: () => drone.destroy(),
        });
        break;
      }
      default: {
        const generic = this.add.circle(x, y, 25, 0x00ff88, 0.4).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: generic, scale: 2, alpha: 0, duration: 300, onComplete: () => generic.destroy() });
      }
    }
  }

  shutdown(): void {
    this.networkClient?.removeAllListeners();
    this.playerSprites.forEach(s => s.destroy());
    this.playerSprites.clear();
    this.projectileSprites.forEach(s => s.destroy());
    this.projectileSprites.clear();
  }
}
