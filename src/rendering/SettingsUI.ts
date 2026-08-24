import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";
import { AudioManager } from "../audio/AudioManager";
import { C, UI_FONT, UI_MONO } from "./UITheme";

const STORAGE_KEY = "scrap_settings_v1";

interface SettingsData {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const DEFAULTS: SettingsData = { master: 0.12, music: 1.0, sfx: 1.0, muted: false };

export class SettingsUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private _isOpen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._applyStored();
  }

  get isOpen(): boolean { return this._isOpen; }

  // ── Persistence ───────────────────────────────────────────────────────────

  static load(): SettingsData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { return { ...DEFAULTS }; }
  }

  static save(data: SettingsData): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  private _applyStored(): void {
    const s = SettingsUI.load();
    const audio = AudioManager.instance;
    audio.setMasterVolume(s.master);
    audio.setMusicVolume(s.music);
    audio.setSFXVolume(s.sfx);
    if (s.muted) audio.setMute(true);
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  open(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this._build();
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.container?.destroy();
    this.container = null;
  }

  toggle(): void {
    this._isOpen ? this.close() : this.open();
  }

  destroy(): void {
    this.close();
  }

  // ── Build UI ──────────────────────────────────────────────────────────────

  private _build(): void {
    const scene = this.scene;
    const s = SettingsUI.load();
    const audio = AudioManager.instance;

    const PW = 480;
    const PH = 400;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    const con = scene.add.container(0, 0).setDepth(700).setScrollFactor(0);
    this.container = con;

    // ── Backdrop (click-outside to close) ────────────────────────────────────
    const backdrop = scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65)
      .setInteractive();
    backdrop.on("pointerdown", () => this.close());
    con.add(backdrop);

    // ── Panel ─────────────────────────────────────────────────────────────────
    const frameGfx = scene.add.graphics();
    // Main fill
    frameGfx.fillStyle(0x020b14, 0.97);
    frameGfx.fillRoundedRect(px, py, PW, PH, 12);
    // Header accent
    frameGfx.fillStyle(C.cyan, 0.07);
    frameGfx.fillRoundedRect(px, py, PW, 52, { tl: 12, tr: 12, bl: 0, br: 0 });
    // Outer border
    frameGfx.lineStyle(2, C.cyan, 0.70);
    frameGfx.strokeRoundedRect(px, py, PW, PH, 12);
    // Inner border
    frameGfx.lineStyle(1, C.cyan, 0.12);
    frameGfx.strokeRoundedRect(px + 4, py + 4, PW - 8, PH - 8, 9);
    // Corner marks
    const marks: [number, number][] = [[px + 14, py + 14], [px + PW - 14, py + 14], [px + 14, py + PH - 14], [px + PW - 14, py + PH - 14]];
    frameGfx.lineStyle(2, C.cyan, 0.50);
    for (const [mx, my] of marks) {
      frameGfx.beginPath(); frameGfx.moveTo(mx - 7, my); frameGfx.lineTo(mx, my); frameGfx.lineTo(mx, my - 7); frameGfx.strokePath();
      frameGfx.beginPath(); frameGfx.moveTo(mx + 7, my); frameGfx.lineTo(mx, my); frameGfx.lineTo(mx, my + 7); frameGfx.strokePath();
    }
    con.add(frameGfx);

    // Header divider
    const hdivGfx = scene.add.graphics();
    hdivGfx.lineStyle(1, C.cyan, 0.30);
    hdivGfx.lineBetween(px + 14, py + 52, px + PW - 14, py + 52);
    con.add(hdivGfx);

    // Title
    const title = scene.add.text(cx, py + 26, "SETTINGS", {
      fontFamily: UI_FONT, fontSize: "20px", color: C.cyanH,
      fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 0, color: C.cyanH, blur: 8, fill: true },
    }).setOrigin(0.5, 0.5);
    con.add(title);

    // ── Volume sliders ─────────────────────────────────────────────────────────
    const sliders: { label: string; sub: string; key: keyof Pick<SettingsData, "master" | "music" | "sfx">; apply: (v: number) => void; y: number }[] = [
      { label: "MASTER VOLUME",  sub: "Overall audio level",    key: "master", apply: v => audio.setMasterVolume(v), y: py + 82 },
      { label: "MUSIC",          sub: "Background music level", key: "music",  apply: v => audio.setMusicVolume(v),  y: py + 174 },
      { label: "SFX",            sub: "Sound effects level",    key: "sfx",    apply: v => audio.setSFXVolume(v),    y: py + 266 },
    ];

    for (const sl of sliders) {
      this._addSlider(con, s, px, PW, sl.label, sl.sub, sl.key, sl.apply, sl.y);
    }

    // ── Mute toggle ────────────────────────────────────────────────────────────
    const muteY = py + PH - 80;
    const muteDivGfx = scene.add.graphics();
    muteDivGfx.lineStyle(1, C.cyan, 0.15);
    muteDivGfx.lineBetween(px + 24, muteY - 14, px + PW - 24, muteY - 14);
    con.add(muteDivGfx);

    const muteLbl = scene.add.text(px + 28, muteY, "MUTE ALL AUDIO", {
      fontFamily: UI_MONO, fontSize: "11px", color: "#6f8990",
    }).setOrigin(0, 0.5);
    con.add(muteLbl);

    // Toggle pill
    const TOG_W = 52, TOG_H = 24, TOG_X = px + PW - 70;
    const togBg = scene.add.graphics();
    const togKnob = scene.add.circle(0, 0, 9, 0xffffff, 1);
    const togLabel = scene.add.text(TOG_X + TOG_W / 2, muteY, "", {
      fontFamily: UI_MONO, fontSize: "9px", color: "#ffffff",
    }).setOrigin(0.5, 0.5);
    con.add([togBg, togKnob, togLabel]);

    const drawToggle = (muted: boolean) => {
      togBg.clear();
      const col = muted ? C.red : C.green;
      togBg.fillStyle(col, 0.25);
      togBg.fillRoundedRect(TOG_X, muteY - TOG_H / 2, TOG_W, TOG_H, TOG_H / 2);
      togBg.lineStyle(1.5, col, 0.80);
      togBg.strokeRoundedRect(TOG_X, muteY - TOG_H / 2, TOG_W, TOG_H, TOG_H / 2);
      const kx = muted ? TOG_X + TOG_W - 14 : TOG_X + 14;
      togKnob.setPosition(kx, muteY).setFillStyle(muted ? C.red : C.green, 1);
      togLabel.setText(muted ? "ON" : "OFF").setColor(muted ? C.redH : C.greenH);
      togLabel.setPosition(muted ? TOG_X + 14 : TOG_X + TOG_W - 14, muteY);
    };
    drawToggle(s.muted);

    // Invisible hit zone over toggle
    const togHit = scene.add.zone(TOG_X + TOG_W / 2, muteY, TOG_W + 16, TOG_H + 12)
      .setInteractive({ useHandCursor: true });
    con.add(togHit);
    togHit.on("pointerdown", () => {
      const cur = SettingsUI.load();
      cur.muted = !cur.muted;
      audio.setMute(cur.muted);
      SettingsUI.save(cur);
      drawToggle(cur.muted);
      // Knob spring animation
      scene.tweens.add({
        targets: togKnob,
        scaleX: 0.75, scaleY: 1.25,
        duration: 80, ease: "Quad.easeOut", yoyo: true,
      });
    });

    // ── Close button ───────────────────────────────────────────────────────────
    const closeY = py + PH - 32;
    const closeBtnW = 160, closeBtnH = 38;
    const closeBg = scene.add.graphics();
    const drawClose = (hov: boolean) => {
      closeBg.clear();
      closeBg.fillStyle(hov ? C.cyan : 0x000000, hov ? 0.18 : 0.70);
      closeBg.fillRoundedRect(cx - closeBtnW / 2, closeY - closeBtnH / 2, closeBtnW, closeBtnH, 6);
      closeBg.lineStyle(1.5, C.cyan, hov ? 0.90 : 0.40);
      closeBg.strokeRoundedRect(cx - closeBtnW / 2, closeY - closeBtnH / 2, closeBtnW, closeBtnH, 6);
    };
    drawClose(false);
    const closeTxt = scene.add.text(cx, closeY, "CLOSE", {
      fontFamily: UI_FONT, fontSize: "15px", color: C.cyanH, fontStyle: "bold",
    }).setOrigin(0.5, 0.5);
    const closeHit = scene.add.zone(cx, closeY, closeBtnW, closeBtnH).setInteractive({ useHandCursor: true });
    con.add([closeBg, closeTxt, closeHit]);

    closeHit.on("pointerover",  () => { drawClose(true);  closeTxt.setColor("#ffffff"); });
    closeHit.on("pointerout",   () => { drawClose(false); closeTxt.setColor(C.cyanH); });
    closeHit.on("pointerdown",  () => {
      drawClose(true);
      scene.time.delayedCall(80, () => this.close());
    });

    // ESC closes
    const escHandler = (ev: KeyboardEvent) => { if (ev.key === "Escape") this.close(); };
    window.addEventListener("keydown", escHandler, { once: true });

    // ── Entrance fade ──────────────────────────────────────────────────────────
    con.setAlpha(0);
    con.setScale(0.96);
    scene.tweens.add({
      targets: con, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 160, ease: "Back.easeOut",
    });
  }

  private _addSlider(
    con: Phaser.GameObjects.Container,
    s: SettingsData,
    px: number,
    PW: number,
    label: string,
    sub: string,
    key: keyof Pick<SettingsData, "master" | "music" | "sfx">,
    apply: (v: number) => void,
    baseY: number,
  ): void {
    const scene = this.scene;
    const TRACK_X = px + 28;
    const TRACK_W = PW - 100;
    const TRACK_Y = baseY + 40;
    const THUMB_R  = 7;

    // Label row
    const lbl = scene.add.text(TRACK_X, baseY, label, {
      fontFamily: UI_MONO, fontSize: "11px", color: C.cyanH, fontStyle: "bold",
      letterSpacing: 1,
    }).setOrigin(0, 0);
    const subLbl = scene.add.text(TRACK_X, baseY + 16, sub, {
      fontFamily: UI_MONO, fontSize: "9px", color: "#3d5555",
    }).setOrigin(0, 0);
    const valTxt = scene.add.text(TRACK_X + TRACK_W + 20, TRACK_Y, _fmtPct(s[key]), {
      fontFamily: UI_MONO, fontSize: "13px", color: C.cyanH,
    }).setOrigin(0.5, 0.5);
    con.add([lbl, subLbl, valTxt]);

    // Track background
    const trackGfx = scene.add.graphics();
    trackGfx.fillStyle(0x0a1a1a, 0.90);
    trackGfx.fillRoundedRect(TRACK_X, TRACK_Y - 4, TRACK_W, 8, 4);
    trackGfx.lineStyle(1, C.cyan, 0.18);
    trackGfx.strokeRoundedRect(TRACK_X, TRACK_Y - 4, TRACK_W, 8, 4);
    con.add(trackGfx);

    // Filled portion
    const fillGfx = scene.add.graphics();
    const thumb = scene.add.circle(0, TRACK_Y, THUMB_R, C.cyan, 1)
      .setStrokeStyle(2, 0x002233, 1);
    const thumbGlow = scene.add.circle(0, TRACK_Y, THUMB_R + 4, C.cyan, 0.20)
      .setBlendMode(Phaser.BlendModes.ADD);
    con.add([fillGfx, thumbGlow, thumb]);

    const redrawFill = (v: number) => {
      const tx = TRACK_X + v * TRACK_W;
      fillGfx.clear();
      fillGfx.fillStyle(C.cyan, 0.55);
      fillGfx.fillRoundedRect(TRACK_X, TRACK_Y - 3, v * TRACK_W, 6, 3);
      thumb.setPosition(tx, TRACK_Y);
      thumbGlow.setPosition(tx, TRACK_Y);
      valTxt.setText(_fmtPct(v));
    };
    redrawFill(s[key]);

    // Hit zone
    const hitZone = scene.add.zone(TRACK_X + TRACK_W / 2, TRACK_Y, TRACK_W + 20, 28)
      .setInteractive({ useHandCursor: true, draggable: true });
    con.add(hitZone);

    const setVal = (screenX: number) => {
      // screenX is already in screen-space (pointer.x), no camera offset needed
      // because this container is scrollFactor(0) and placed at world 0,0.
      const raw = (screenX - TRACK_X) / TRACK_W;
      const v = Phaser.Math.Clamp(raw, 0, 1);
      redrawFill(v);
      apply(v);
      const cur = SettingsUI.load();
      cur[key] = v;
      SettingsUI.save(cur);
    };

    // Hover: brighten thumb
    hitZone.on("pointerover", () => {
      thumb.setScale(1.2);
      thumbGlow.setAlpha(0.35);
    });
    hitZone.on("pointerout", () => {
      thumb.setScale(1);
      thumbGlow.setAlpha(0.20);
    });

    let dragging = false;
    hitZone.on("pointerdown", (p: Phaser.Input.Pointer) => { dragging = true; setVal(p.x); });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => { if (dragging) setVal(p.x); });
    scene.input.on("pointerup", () => { dragging = false; });
  }
}

function _fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
