import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { UI_FONT, UI_ORBITRON, UI_OXANIUM } from "../rendering/UITheme";

const W  = GAME_WIDTH;
const H  = GAME_HEIGHT;
const CX = W / 2;
const CY = H / 2;

const C = {
  ink:    0x000000,
  arch:   0x080c14,
  wall:   0x0d1420,
  amber:  0xff7a18,  amberS: "#ff7a18",
  cyan:   0x38d8ff,  cyanS:  "#38d8ff",
  void:   0x9900ff,  voidS:  "#9900ff",
  red:    0xff1a1a,  redS:   "#ff1a1a",
  green:  0x00ff88,
  white:  0xffffff,
};

interface Particle { wx: number; wy: number; vx: number; vy: number; color: number; alpha: number; size: number; life: number; decay: number; }
interface Cam       { x: number; y: number; zoom: number; }

type Phase = "boot" | "title_card" | "flythrough" | "aria_intro" | "reactor_reveal"
           | "void_breach" | "enemy_emergence" | "world_split"
           | "player_activation" | "aria_final" | "done";

// ─────────────────────────────────────────────────────────────────────────────
export class IntroScene extends Phaser.Scene {

  // State
  private _phase: Phase = "boot";
  private _elapsed  = 0;
  private _skipLocked = false;

  // World-space cinematic camera
  private _cam: Cam = { x: 0, y: 0, zoom: 1.0 };

  // Graphics layers
  private _bgGfx!:    Phaser.GameObjects.Graphics; // depth 0  — pure black fill
  private _archGfx!:  Phaser.GameObjects.Graphics; // depth 1  — architecture silhouettes
  private _lightGfx!: Phaser.GameObjects.Graphics; // depth 2  ADD — volumetric light
  private _fxGfx!:    Phaser.GameObjects.Graphics; // depth 4  ADD — reactor / VFX
  private _ovlGfx!:   Phaser.GameObjects.Graphics; // depth 10 — vignette / alarm

  // Animation state
  private _envAngle     = 0;
  private _pulse        = 0;   // 0..1 reactor heartbeat
  private _alarmT       = 0;   // 0..1 alarm strobe
  private _alarmOn      = false;
  private _voidT        = 0;   // 0..1 void tint
  private _lightsFailed = false;

  // Particles & enemies in world space
  private _particles: Particle[] = [];
  private _ptTimer: Phaser.Time.TimerEvent | null = null;
  private _enemies: { wx: number; wy: number; speed: number }[] = [];

  // UI refs (screen space)
  private _ariaGroup: Phaser.GameObjects.GameObject[] = [];
  private _uiObjs:    Phaser.GameObjects.GameObject[] = [];
  private _playerSprite: Phaser.GameObjects.Sprite | null = null;

  constructor() { super({ key: "IntroScene" }); }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  create(): void {
    this._reset();

    this._bgGfx    = this.add.graphics().setDepth(0);
    this._archGfx  = this.add.graphics().setDepth(1);
    this._lightGfx = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this._fxGfx    = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this._ovlGfx   = this.add.graphics().setDepth(10);

    AudioManager.instance.init();
    AudioManager.instance.setScene(this);

    this.input.keyboard?.on("keydown-SPACE",  () => this._skip());
    this.input.keyboard?.on("keydown-ENTER",  () => this._skip());
    this.input.keyboard?.on("keydown-ESCAPE", () => this._skip());
    this.input.once("pointerdown",            () => this._skip());

    this.cameras.main.fadeIn(700, 0, 0, 0);
    this.time.delayedCall(500, () => this.playBootSequence());
  }

  update(_t: number, delta: number): void {
    this._elapsed  += delta;
    this._envAngle += delta * 0.00042;
    this._pulse     = 0.5 + 0.5 * Math.sin(this._elapsed * 0.0022);
    if (this._alarmOn) this._alarmT = 0.5 + 0.5 * Math.sin(this._elapsed * 0.0065);
    if (this._voidT < 1 && this._phase === "void_breach")
      this._voidT = Math.min(1, this._voidT + delta * 0.0007);

    this._tickParticles(delta);
    this._tickEnemies(delta);
    this._render();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEQUENCES
  // ═══════════════════════════════════════════════════════════════════════════

  playBootSequence(): void {
    this._phase = "boot";
    this._cam   = { x: 60, y: -30, zoom: 2.6 };   // parked on reactor close-up

    const t = this._txt(CX, CY, "TNT  STUDIO", UI_ORBITRON, "18px", "#554433").setAlpha(0).setDepth(30);
    this.tweens.add({ targets: t, alpha: 1, duration: 550 });
    this.time.delayedCall(1900, () =>
      this.tweens.add({ targets: t, alpha: 0, duration: 400,
        onComplete: () => { t.destroy(); this._showTitleCard(); } }));
  }

  private _showTitleCard(): void {
    this._phase = "title_card";

    const t1 = this._txt(CX, CY - 42, "SCRAP  ARENA", UI_ORBITRON, "62px", C.amberS)
      .setAlpha(0).setDepth(30).setShadow(0, 0, C.amberS, 28, true, true);
    const t2 = this._txt(CX, CY + 30, "T H E   F R A C T U R E", UI_OXANIUM, "18px", C.cyanS)
      .setAlpha(0).setDepth(30).setShadow(0, 0, C.cyanS, 14, true, true);

    this.tweens.add({ targets: t1, alpha: 1, duration: 800, ease: "Sine.easeOut" });
    this.time.delayedCall(380, () => this.tweens.add({ targets: t2, alpha: 1, duration: 650 }));
    this.time.delayedCall(1500, () => this._glitch(t1, 5));

    this.time.delayedCall(3700, () =>
      this.tweens.add({ targets: [t1, t2], alpha: 0, duration: 800,
        onComplete: () => { t1.destroy(); t2.destroy(); this.playFacilityFlythrough(); } }));
  }

  playFacilityFlythrough(): void {
    this._phase = "flythrough";
    // Deep in corridor, zoomed in — camera reveals the industrial scale as it pulls back
    this._cam = { x: -480, y: 24, zoom: 1.65 };
    AudioManager.instance.startAmbient("foundry");
    this._startParticles("foundry");

    this.tweens.add({
      targets: this._cam, x: -195, y: 4, zoom: 1.12,
      duration: 8800, ease: "Sine.easeInOut",
    });

    this.time.delayedCall(2400, () => this.playARIAIntro());
  }

  playARIAIntro(): void {
    this._phase = "aria_intro";
    const lines = [
      { text: "Synchronization complete.",         delay: 0    },
      { text: "Operator link established.",         delay: 2100 },
      { text: "Machine Core — stability nominal.",  delay: 4000 },
      { text: "Power routing online.",              delay: 5600 },
    ];
    for (const l of lines)
      this.time.delayedCall(l.delay, () => { if (this._phase !== "done") this._aria(l.text); });
    this.time.delayedCall(7200, () => this.playReactorReveal());
  }

  playReactorReveal(): void {
    this._phase = "reactor_reveal";
    // Pull back to hero shot — reactor on right two-thirds, corridor dark on left
    this.tweens.add({ targets: this._cam, x: -55, y: -35, zoom: 0.76, duration: 4200, ease: "Quad.easeInOut" });
    this._aria("Reactor Core — power output nominal.");
    AudioManager.instance.startMusic("foundry");
    this.time.delayedCall(4800, () => this.playVoidBreach());
  }

  playVoidBreach(): void {
    this._phase     = "void_breach";
    this._alarmOn   = true;
    this._lightsFailed = true;

    AudioManager.instance.bossIntroStinger();
    this.time.delayedCall(500,  () => AudioManager.instance.reactorAlarm());
    this.time.delayedCall(900,  () => AudioManager.instance.dimensionBreach());

    this.cameras.main.flash(220, 255, 20, 20);
    this.cameras.main.shake(1200, 0.018);

    this._stopParticles();
    this._startParticles("void");
    this._aria("⚠  VOID BREACH DETECTED", C.redS);

    this.time.delayedCall(1900, () => {
      if (this._phase === "done") return;
      this._aria("Hostile entities converging on Reactor Core.", "#ff8844");
    });
    this.time.delayedCall(4600, () => this.playEnemyEmergence());
  }

  playEnemyEmergence(): void {
    this._phase = "enemy_emergence";
    this.tweens.add({ targets: this._cam, x: -100, y: -18, zoom: 0.70, duration: 3000, ease: "Quad.easeInOut" });

    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7;
      const d = 380 + Math.random() * 90;
      this._enemies.push({ wx: Math.cos(a) * d, wy: Math.sin(a) * d, speed: 22 + Math.random() * 15 });
    }

    this._aria("They ignore everything else.  Only the Reactor matters.", "#ff6644");
    this.time.delayedCall(3900, () => this.playWorldSplit());
  }

  playWorldSplit(): void {
    this._phase = "world_split";
    let count = 0;
    const flip = (): void => {
      if (count >= 6 || this._phase === "done") {
        this._voidT = 0;
        this.playPlayerActivation();
        return;
      }
      count++;
      const toVoid = count % 2 === 1;
      this._voidT = toVoid ? 1 : 0;
      AudioManager.instance.worldSwitch();
      this.cameras.main.flash(55, toVoid ? 80 : 200, 0, toVoid ? 180 : 28);
      this.time.delayedCall(580, flip);
    };
    this.time.delayedCall(200, flip);
  }

  playPlayerActivation(): void {
    this._phase = "player_activation";
    this._alarmOn      = false;
    this._lightsFailed = false;
    this._stopParticles();
    this._enemies = [];

    // Player in corridor left-third, reactor towering behind right
    this.tweens.add({ targets: this._cam, x: -215, y: 52, zoom: 1.38, duration: 2600, ease: "Quad.easeOut" });

    this._spawnPlayer();

    const boots = [
      { t: "SYSTEM ONLINE",            c: C.cyanS,   d: 900  },
      { t: "CORE LINK ACTIVE",         c: C.cyanS,   d: 1650 },
      { t: "REACTOR PROTOCOL ENGAGED", c: C.amberS,  d: 2400 },
      { t: "MISSION AUTHORIZED",       c: "#00ff88", d: 3200 },
    ];
    for (const b of boots)
      this.time.delayedCall(b.d, () => { if (this._phase !== "done") this._bootLine(b.t, b.c); });

    this.time.delayedCall(1100, () => this._hudRing("◈ RADAR",     C.cyan,  W - 88, 58));
    this.time.delayedCall(1800, () => this._hudRing("♥ HEALTH",    C.green, 62,     58));
    this.time.delayedCall(2500, () => this._hudRing("▲ HEAT",      C.amber, 62,     H - 58));
    this.time.delayedCall(3300, () => this._hudRing("✦ ABILITIES", C.void,  W - 88, H - 58));

    this.time.delayedCall(4400, () => this.playARIAFinal());
  }

  playARIAFinal(): void {
    this._phase = "aria_final";
    this._aria("Operator...", "#99ccff");
    this.time.delayedCall(2200, () => { if (this._phase !== "done") this._aria("They are here.", "#ff9944"); });
    this.time.delayedCall(3900, () => { if (this._phase !== "done") this._aria("Protect the reactor.", "#ffdd44"); });
    this.time.delayedCall(5500, () => { if (this._phase !== "done") this._aria("No matter the cost.", C.redS); });
    this.time.delayedCall(3400, () => { if (this._phase !== "done") this._missionCard(); });
    this.time.delayedCall(7400, () => this.beginGameplay());
  }

  beginGameplay(): void {
    if (this._phase === "done") return;
    this._phase     = "done";
    this._skipLocked = true;
    this._stopParticles();
    try { sessionStorage.setItem("scrapArenaIntroDone", "1"); } catch { /* ok */ }
    this.cameras.main.fadeOut(1100, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start("MainScene"));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  private _render(): void {
    this._bgGfx.clear();
    this._archGfx.clear();
    this._lightGfx.clear();
    this._fxGfx.clear();
    this._ovlGfx.clear();

    // Pure black canvas — darkness IS the atmosphere
    this._bgGfx.fillStyle(C.ink, 1);
    this._bgGfx.fillRect(0, 0, W, H);

    if (this._phase !== "boot" && this._phase !== "title_card") {
      this._drawArchitecture();
      this._drawReactor();
      this._drawParticlesGfx();
      if (this._enemies.length > 0) this._drawEnemies();
      if (this._playerSprite) this._positionPlayer();
    }

    this._drawVignette();
    if (this._alarmOn)    this._drawAlarm();
    if (this._voidT > 0)  this._drawVoidTint();
  }

  // World → screen transform
  private _s(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this._cam.x) * this._cam.zoom + CX,
      y: (wy - this._cam.y) * this._cam.zoom + CY,
    };
  }
  private _z(n: number): number { return n * this._cam.zoom; }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARCHITECTURE — silhouettes + accent light strips, no outlines
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawArchitecture(): void {
    const g   = this._archGfx;
    const lg  = this._lightGfx;
    const t   = this._envAngle;

    // ── Solid floor slab ───────────────────────────────────────────────────
    this._fillQuad(g, C.arch,
      -1400, 120,   1400, 120,
      1400, 600,   -1400, 600);

    // ── Solid ceiling slab ─────────────────────────────────────────────────
    this._fillQuad(g, C.arch,
      -1400, -340,  1400, -340,
      1400, -165,  -1400, -165);

    // ── Left corridor wall fill ────────────────────────────────────────────
    this._fillQuad(g, C.wall,
      -1400, -165,  -40, -165,
      -40,   120,  -1400, 120);

    // ── Right chamber back wall ────────────────────────────────────────────
    this._fillQuad(g, C.arch,
      300, -340,  1400, -340,
      1400, 120,   300,  120);

    // ── Ceiling light strips — amber wash pools on floor ───────────────────
    if (!this._lightsFailed) {
      for (let lx = -580; lx < -40; lx += 120) {
        const ls   = this._s(lx, -162);
        const le   = this._s(lx + 60, -162);
        const intns = 0.07 + 0.04 * Math.sin(t * 1.9 + lx * 0.011);
        lg.fillStyle(C.amber, intns);
        lg.fillRect(ls.x, ls.y, le.x - ls.x, this._z(7));
        // floor pool
        const fp = this._s(lx + 30, 120);
        lg.fillStyle(C.amber, intns * 0.28);
        lg.fillEllipse(fp.x, fp.y, this._z(90), this._z(16));
      }
    }

    // ── Server racks — left wall array ────────────────────────────────────
    const rackXs = [-580, -520, -460, -400, -340, -280];
    for (const rx of rackXs) {
      const rt = this._s(rx, -140);
      const rb = this._s(rx + 28, 112);
      g.fillStyle(0x0b0f18, 1);
      g.fillRect(rt.x, rt.y, rb.x - rt.x, rb.y - rt.y);
      // LED indicator strip
      const blinkA = this._lightsFailed
        ? 0.35 + this._alarmT * 0.45
        : 0.18 + 0.45 * (Math.sin(t * 2.4 + rx * 0.02) > 0.3 ? 1 : 0);
      const ledCol = this._lightsFailed ? C.red : C.cyan;
      lg.fillStyle(ledCol, blinkA);
      lg.fillRect(rt.x + this._z(2), rt.y + this._z(8), this._z(3), this._z(10));
    }

    // ── Doorway frame opening into reactor chamber ─────────────────────────
    const DW = 175, DH = 290;
    // left jamb
    this._fillQuad(g, 0x0c1420,
      -DW - 65, -DH,  -DW, -DH,
      -DW,  120, -DW - 65, 120);
    // right jamb
    this._fillQuad(g, 0x0c1420,
      DW, -DH,   DW + 65, -DH,
      DW + 65, 120,  DW, 120);
    // arch top
    this._fillQuad(g, 0x0c1420,
      -DW - 65, -DH,  DW + 65, -DH,
      DW + 65, -DH + 55,  -DW - 65, -DH + 55);

    // Door frame glow lines (only when reactor is visible)
    if (!["flythrough", "aria_intro"].includes(this._phase)) {
      const fc  = this._alarmOn ? C.red : C.amber;
      const fa  = (0.40 + this._pulse * 0.20) * (this._alarmOn ? 0.85 + this._alarmT * 0.15 : 1);
      const dl  = this._s(-DW, -DH);
      const dlb = this._s(-DW,  120);
      const dr  = this._s( DW, -DH);
      const drb = this._s( DW,  120);
      lg.lineStyle(this._z(2.5), fc, fa);
      lg.lineBetween(dl.x, dl.y, dlb.x, dlb.y);
      lg.lineBetween(dr.x, dr.y, drb.x, drb.y);
      lg.lineStyle(this._z(1.5), fc, fa * 0.6);
      lg.lineBetween(dl.x, dl.y, dr.x, dr.y);
    }

    // ── Heavy generator block — left foreground occlusion ─────────────────
    const gp = this._s(-680, -12);
    const gw = this._z(148), gh = this._z(136);
    g.fillStyle(0x060a10, 1);
    g.fillRect(gp.x, gp.y - gh, gw, gh);
    for (let v = 0; v < 5; v++) {
      const vx  = gp.x + this._z(16 + v * 24);
      const va  = 0.06 + 0.05 * Math.sin(t * 1.5 + v * 0.9);
      lg.fillStyle(C.amber, va);
      lg.fillRect(vx, gp.y - gh + this._z(18), this._z(12), this._z(66));
    }

    // ── Foreground pipe — horizontal, at eye level ─────────────────────────
    const pl = this._s(-720, 88);
    const pr = this._s( -36, 88);
    g.fillStyle(0x16202e, 1);
    g.fillRect(pl.x, pl.y - this._z(11), pr.x - pl.x, this._z(22));
    g.fillStyle(0x22303f, 1);
    g.fillRect(pl.x, pl.y - this._z(11), pr.x - pl.x, this._z(3));
    // flow pulse
    const fp2 = ((this._elapsed * 0.062) % 684) - 720;
    const fps = this._s(fp2, 88);
    if (fps.x > 0 && fps.x < W) {
      lg.fillStyle(C.cyan, 0.7);
      lg.fillCircle(fps.x, fps.y, this._z(4));
      lg.fillStyle(C.cyan, 0.18);
      lg.fillCircle(fps.x, fps.y, this._z(14));
    }

    // ── Floor channel lines — perspective lines leading to reactor ─────────
    for (let i = 0; i < 4; i++) {
      const frac = (i + 1) / 5;
      const fx1  = -1400 + frac * 2800;
      const ls2  = this._s(fx1, 120);
      const le2  = this._s(0, -55);
      g.lineStyle(this._z(1), 0x141c28, 0.6);
      g.lineBetween(ls2.x, ls2.y, le2.x, le2.y);
    }

    // ── Alarm strobes on walls ─────────────────────────────────────────────
    if (this._alarmOn) {
      const sa = this._alarmT * 0.7;
      lg.fillStyle(C.red, sa * 0.55);
      lg.fillCircle(this._s(-560, -140).x, this._s(-560, -140).y, this._z(14 + this._alarmT * 6));
      lg.fillStyle(C.red, sa * 0.45);
      lg.fillCircle(this._s(-280, -148).x, this._s(-280, -148).y, this._z(12 + this._alarmT * 5));
    }
  }

  // ── Reactor hero shot ──────────────────────────────────────────────────────
  private _drawReactor(): void {
    if (["boot", "title_card", "flythrough", "aria_intro"].includes(this._phase)) return;

    const lg  = this._lightGfx;
    const fx  = this._fxGfx;
    const arch = this._archGfx;
    const t   = this._envAngle;
    const p   = this._pulse;
    const rc  = this._s(0, -58);
    const col = this._alarmOn ? C.red : C.amber;

    // ── Massive ambient glow — the room is lit by the reactor ─────────────
    lg.fillStyle(col, 0.032 + p * 0.016);
    lg.fillCircle(rc.x, rc.y, this._z(380 + p * 24));
    lg.fillStyle(col, 0.048 + p * 0.022);
    lg.fillCircle(rc.x, rc.y, this._z(240 + p * 14));
    lg.fillStyle(col, 0.065 + p * 0.030);
    lg.fillCircle(rc.x, rc.y, this._z(140 + p * 8));

    // ── Structural support struts ─────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const a   = (Math.PI * 2 * i) / 6 + 0.26;
      const s1  = this._s(Math.cos(a) * 130, -58 + Math.sin(a) * 130);
      const s2  = this._s(Math.cos(a) * 230, -58 + Math.sin(a) * 230);
      arch.lineStyle(this._z(8), 0x0c1218, 1);
      arch.lineBetween(s1.x, s1.y, s2.x, s2.y);
      lg.lineStyle(this._z(1), C.amber, 0.09 + p * 0.04);
      lg.lineBetween(s1.x, s1.y, s2.x, s2.y);
    }

    // ── Outer rotating rings ──────────────────────────────────────────────
    for (let i = 5; i >= 0; i--) {
      const r   = this._z(88 + i * 32 + p * 7);
      const rot = t * (i % 2 === 0 ? 0.50 : -0.36) + i * 0.68;
      const arc = Math.PI * (1.08 + i * 0.055);
      const a   = (0.24 - i * 0.024) + p * 0.06 + (this._alarmOn ? this._alarmT * 0.04 : 0);
      const rc2 = i % 2 === 0 ? col : C.cyan;
      lg.lineStyle(this._z(i < 2 ? 3 : 1.5), rc2, a);
      lg.beginPath();
      lg.arc(rc.x, rc.y, r, rot, rot + arc, false);
      lg.strokePath();
    }

    // ── Core layers — outermost to innermost ─────────────────────────────
    fx.fillStyle(col,   0.07 + p * 0.05);
    fx.fillCircle(rc.x, rc.y, this._z(105 + p * 12));
    fx.fillStyle(col,   0.18 + p * 0.12);
    fx.fillCircle(rc.x, rc.y, this._z(56 + p * 8));
    fx.fillStyle(col,   0.52 + p * 0.22);
    fx.fillCircle(rc.x, rc.y, this._z(28 + p * 5));
    fx.fillStyle(C.white, 0.48 + p * 0.36);
    fx.fillCircle(rc.x, rc.y, this._z(9 + p * 4));

    // ── Five orbiting energy nodes ────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const a  = t * 0.85 + (Math.PI * 2 * i) / 5;
      const nr = this._z(118 + p * 9);
      const nx = rc.x + Math.cos(a) * nr;
      const ny = rc.y + Math.sin(a) * nr;
      fx.fillStyle(col, 0.9);
      fx.fillCircle(nx, ny, this._z(5.5));
      fx.fillStyle(col, 0.22);
      fx.fillCircle(nx, ny, this._z(16));
      lg.lineStyle(this._z(1), col, 0.16 + p * 0.06);
      lg.lineBetween(rc.x, rc.y, nx, ny);
    }

    // ── Spark arc — occasional electrical discharge ───────────────────────
    if (Math.sin(t * 3.8) > 0.62) {
      const sa  = t * 5.5;
      const sr1 = this._z(68), sr2 = this._z(98);
      fx.lineStyle(this._z(1.5), C.white, 0.55);
      fx.lineBetween(
        rc.x + Math.cos(sa) * sr1, rc.y + Math.sin(sa) * sr1,
        rc.x + Math.cos(sa + 0.9) * sr2, rc.y + Math.sin(sa + 0.9) * sr2,
      );
    }
  }

  // ── Enemies ────────────────────────────────────────────────────────────────

  private _drawEnemies(): void {
    const fx = this._fxGfx;
    for (const e of this._enemies) {
      const sp  = this._s(e.wx, e.wy);
      const dx  = -e.wx, dy = -e.wy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      fx.fillStyle(C.void, 0.14);
      fx.fillCircle(sp.x, sp.y, this._z(26));
      fx.fillStyle(C.void, 0.80);
      fx.fillCircle(sp.x, sp.y, this._z(7));
      fx.lineStyle(this._z(1.5), C.void, 0.55);
      fx.lineBetween(
        sp.x, sp.y,
        sp.x + (dx / dist) * this._z(18),
        sp.y + (dy / dist) * this._z(18),
      );
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private _startParticles(world: "foundry" | "void"): void {
    this._stopParticles();
    const col1 = world === "foundry" ? C.amber : C.void;
    const col2 = world === "foundry" ? C.cyan  : C.red;
    this._ptTimer = this.time.addEvent({ delay: 110, loop: true, callback: () => {
      if (this._phase === "done") return;
      for (let i = 0; i < 3; i++) {
        const spread = world === "foundry" ? 340 : 520;
        this._particles.push({
          wx: (Math.random() - 0.5) * spread,
          wy: -20 + (Math.random() - 0.5) * 200,
          vx: (Math.random() - 0.5) * 30,
          vy: -22 - Math.random() * 32,
          color: Math.random() > 0.5 ? col1 : col2,
          alpha: 0.45 + Math.random() * 0.45,
          size:  1.4 + Math.random() * 2.4,
          life:  1,
          decay: 0.00038 + Math.random() * 0.00058,
        });
      }
    }});
  }

  private _stopParticles(): void {
    if (this._ptTimer) { this._ptTimer.remove(false); this._ptTimer = null; }
  }

  private _tickParticles(delta: number): void {
    const dt = delta / 1000;
    this._particles = this._particles.filter(p => {
      p.wx += p.vx * dt; p.wy += p.vy * dt; p.vy -= 3 * dt;
      p.life -= p.decay * delta;
      return p.life > 0;
    });
  }

  private _drawParticlesGfx(): void {
    const fx = this._fxGfx;
    for (const p of this._particles) {
      const sp = this._s(p.wx, p.wy);
      if (sp.x < -20 || sp.x > W + 20 || sp.y < -20 || sp.y > H + 20) continue;
      const a = p.alpha * p.life;
      if (a < 0.02) continue;
      fx.fillStyle(p.color, a);
      fx.fillCircle(sp.x, sp.y, this._z(p.size) * Math.max(0.1, p.life));
    }
  }

  private _tickEnemies(delta: number): void {
    if (this._phase !== "enemy_emergence" && this._phase !== "world_split") return;
    for (const e of this._enemies) {
      const d = Math.sqrt(e.wx * e.wx + e.wy * e.wy);
      if (d > 12) {
        e.wx -= (e.wx / d) * e.speed * delta * 0.001;
        e.wy -= (e.wy / d) * e.speed * delta * 0.001;
      }
    }
  }

  // ── Overlays ───────────────────────────────────────────────────────────────

  private _drawVignette(): void {
    const g  = this._ovlGfx;
    // Cinematic letterbox bars
    const bar = H * 0.072;
    g.fillStyle(C.ink, 1);
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);
    // Corner darkening — four triangles
    const cs = H * 0.42;
    g.fillStyle(C.ink, 0.68);
    g.fillTriangle(0,   0,   cs, 0,   0,   cs);
    g.fillTriangle(W,   0,   W - cs, 0,   W, cs);
    g.fillTriangle(0,   H,   cs, H,   0,   H - cs);
    g.fillTriangle(W,   H,   W - cs, H,   W, H - cs);
    // Thin vignette edge bands
    const bw = W * 0.09;
    g.fillStyle(C.ink, 0.45);
    g.fillRect(0, 0, bw, H);
    g.fillRect(W - bw, 0, bw, H);
  }

  private _drawAlarm(): void {
    const g = this._ovlGfx;
    g.fillStyle(C.red, this._alarmT * 0.075);
    g.fillRect(0, 0, W, H);
    const bA = this._alarmT * 0.55;
    g.fillStyle(C.red, bA);
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, H - 3, W, 3);
    g.fillRect(0, 0, 3, H);
    g.fillRect(W - 3, 0, 3, H);
  }

  private _drawVoidTint(): void {
    const g = this._ovlGfx;
    g.fillStyle(C.void, this._voidT * 0.11);
    g.fillRect(0, 0, W, H);
    for (let sy = 0; sy < H; sy += 4) {
      g.fillStyle(C.void, this._voidT * 0.022);
      g.fillRect(0, sy, W, 1);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI HELPERS — all screen-space
  // ═══════════════════════════════════════════════════════════════════════════

  private _txt(x: number, y: number, str: string, font: string, size: string, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, {
      fontFamily: font, fontSize: size, color,
      stroke: "#000000", strokeThickness: 3, align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(22);
  }

  private _aria(text: string, color = C.cyanS): void {
    // Dismiss previous
    for (const o of this._ariaGroup)
      this.tweens.add({ targets: o, alpha: 0, duration: 240, onComplete: () => (o as Phaser.GameObjects.GameObject).destroy() });
    this._ariaGroup = [];

    const bar = this.add.graphics().setScrollFactor(0).setDepth(23).setAlpha(0);
    bar.fillStyle(0x000000, 0.86);
    bar.fillRect(0, H - 76, W, 76);
    bar.lineStyle(1, C.cyan, 0.14);
    bar.lineBetween(0, H - 76, W, H - 76);

    const label = this.add.text(26, H - 70, "A · R · I · A", {
      fontFamily: UI_OXANIUM, fontSize: "9px", color: "#334455",
    }).setScrollFactor(0).setDepth(24).setAlpha(0);

    const line = this.add.text(CX, H - 40, text, {
      fontFamily: UI_FONT, fontSize: "16px", color,
      stroke: "#000000", strokeThickness: 3, align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(24).setAlpha(0)
      .setShadow(0, 0, color, 10, true, true);

    this.tweens.add({ targets: [bar, label, line], alpha: 1, duration: 300 });
    this._ariaGroup.push(bar, label, line);

    this.time.delayedCall(4200, () => {
      this.tweens.add({ targets: [bar, label, line], alpha: 0, duration: 460,
        onComplete: () => {
          this._ariaGroup = this._ariaGroup.filter(o => o !== bar && o !== label && o !== line);
          bar.destroy(); label.destroy(); line.destroy();
        } });
    });
  }

  private _bootLine(text: string, color: string): void {
    const idx = this._uiObjs.filter(o => (o as { _isBoot?: boolean })._isBoot).length;
    const t = this.add.text(W * 0.60, CY + 14 + idx * 28, text, {
      fontFamily: UI_OXANIUM, fontSize: "13px", color,
      stroke: "#000000", strokeThickness: 3,
    }).setScrollFactor(0).setDepth(26).setAlpha(0);
    (t as unknown as { _isBoot: boolean })._isBoot = true;
    this.tweens.add({ targets: t, alpha: 1, x: W * 0.60 + 10, duration: 190, ease: "Sine.easeOut" });
    this._uiObjs.push(t);
    this.time.delayedCall(5500, () =>
      this.tweens.add({ targets: t, alpha: 0, duration: 400, onComplete: () => t.destroy() }));
  }

  private _hudRing(label: string, color: number, sx: number, sy: number): void {
    const g = this.add.graphics().setScrollFactor(0).setDepth(25).setAlpha(0);
    const r = 20;
    g.lineStyle(1, color, 0.50); g.strokeCircle(sx, sy, r);
    g.lineStyle(1, color, 0.22); g.strokeCircle(sx, sy, r + 6);
    g.fillStyle(color, 0.07);    g.fillCircle(sx, sy, r);
    const hex = "#" + color.toString(16).padStart(6, "0");
    const t = this.add.text(sx, sy + r + 8, label, {
      fontFamily: UI_OXANIUM, fontSize: "9px", color: hex,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(26).setAlpha(0);
    this.tweens.add({ targets: [g, t], alpha: 1, duration: 360 });
    this._uiObjs.push(g, t);
  }

  private _spawnPlayer(): void {
    if (!this.textures.exists("player_idle_sheet") || !this.anims.exists("player_idle")) return;
    const sp = this.add.sprite(0, 0, "player_idle_sheet", 0)
      .setScale(2.5).setDepth(5).setAlpha(0).setTint(0x223355);
    sp.play("player_idle");
    this._playerSprite = sp;
    this.tweens.add({ targets: sp, alpha: 0.88, duration: 1500, ease: "Sine.easeIn" });
  }

  private _positionPlayer(): void {
    if (!this._playerSprite) return;
    const sc = this._s(-222, 82);
    this._playerSprite.setPosition(sc.x, sc.y).setScale(this._z(2.5));
    const p = this._pulse;
    this._playerSprite.setTint(Phaser.Display.Color.GetColor(
      Math.round(28 + p * 22), Math.round(55 + p * 42), Math.round(95 + p * 82),
    ));
    // suit glow on floor
    this._fxGfx.fillStyle(C.cyan, 0.03 + p * 0.035);
    this._fxGfx.fillEllipse(sc.x, sc.y + this._z(20), this._z(90), this._z(18));
  }

  private _missionCard(): void {
    const bx = CX - 218, by = CY - 92, bw = 436, bh = 184;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(28).setAlpha(0);
    bg.fillStyle(0x000000, 0.94);
    bg.fillRect(bx, by, bw, bh);
    bg.lineStyle(1, C.amber, 0.42);
    bg.strokeRect(bx, by, bw, bh);
    bg.lineStyle(2, C.amber, 0.72);
    bg.lineBetween(bx + 22, by, bx + bw - 22, by);
    const sz = 14;
    bg.lineStyle(2, C.amber, 0.9);
    [[bx,by],[bx+bw-sz,by],[bx,by+bh-sz],[bx+bw-sz,by+bh-sz]]
      .forEach(([px, py]) => bg.strokeRect(px, py, sz, sz));

    const objs = [
      this._txt(CX, by + 28,  "M I S S I O N",                               UI_OXANIUM, "11px", "#334455" ).setAlpha(0).setDepth(29),
      this._txt(CX, by + 63,  "Protect the Machine Core",                     UI_FONT, "19px",    C.amberS  ).setAlpha(0).setDepth(29).setShadow(0,0,C.amberS,10,true,true),
      this._txt(CX, by + 97,  "Survive 5 Waves  ·  Destroy the Void Commander", UI_FONT,"12px",   "#888888" ).setAlpha(0).setDepth(29),
      this._txt(CX, by + 123, "Failure is not an option.",                    UI_FONT, "13px",    C.redS    ).setAlpha(0).setDepth(29),
      this._txt(CX, by + 159, "SPACE · ENTER · CLICK — skip intro",           UI_OXANIUM, "9px",  "#2a2a3a" ).setAlpha(0).setDepth(29),
    ];

    this.tweens.add({ targets: bg, alpha: 1, duration: 260 });
    objs.forEach((o, i) => this.tweens.add({ targets: o, alpha: 1, duration: 250, delay: i * 120 }));
    this._uiObjs.push(bg, ...objs);
  }

  // ── Shared draw helper ─────────────────────────────────────────────────────

  private _fillQuad(
    g: Phaser.GameObjects.Graphics, color: number,
    wx1: number, wy1: number, wx2: number, wy2: number,
    wx3: number, wy3: number, wx4: number, wy4: number,
  ): void {
    const p1 = this._s(wx1, wy1), p2 = this._s(wx2, wy2);
    const p3 = this._s(wx3, wy3), p4 = this._s(wx4, wy4);
    g.fillStyle(color, 1);
    g.fillPoints([p1, p2, p3, p4], true);
  }

  private _glitch(t: Phaser.GameObjects.Text, n: number): void {
    if (n <= 0) return;
    const ox = t.x;
    t.x = ox + (Math.random() - 0.5) * 14;
    t.setAlpha(0.52);
    this.time.delayedCall(50, () => {
      t.x = ox; t.setAlpha(1);
      this.time.delayedCall(80 + Math.random() * 125, () => this._glitch(t, n - 1));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════════════════════════════════════

  private _reset(): void {
    this._phase        = "boot";
    this._elapsed      = 0;
    this._skipLocked   = false;
    this._cam          = { x: 0, y: 0, zoom: 1.0 };
    this._envAngle     = 0;
    this._pulse        = 0;
    this._alarmT       = 0;
    this._alarmOn      = false;
    this._voidT        = 0;
    this._lightsFailed = false;
    this._particles    = [];
    this._enemies      = [];
    this._ariaGroup    = [];
    this._uiObjs       = [];
    this._playerSprite = null;
  }

  private _skip(): void {
    if (this._phase === "done" || this._skipLocked) return;
    this._phase      = "done";
    this._skipLocked = true;
    this._stopParticles();
    try { sessionStorage.setItem("scrapArenaIntroDone", "1"); } catch { /* ok */ }
    AudioManager.instance.stopMusic();
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start("MainScene"));
  }
}
