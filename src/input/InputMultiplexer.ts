import Phaser from "phaser";

export interface InputState {
  /** Normalized movement vector — magnitude clamped to 1 */
  moveX: number;
  moveY: number;
  /** Primary action (Space / LMB / A button) */
  action1: boolean;
  action1JustDown: boolean;
  /** Secondary action (Shift / RMB / B button) */
  action2: boolean;
  action2JustDown: boolean;
  /** Pointer world position */
  pointerX: number;
  pointerY: number;
  /** Angle from player to pointer in radians */
  aimAngle: number;
  /** Any input device is actively providing input */
  hasInput: boolean;
}

/**
 * Unified input handler — merges Keyboard, Mouse, and Gamepad into one InputState.
 * Gamepad deadzone and axis remapping handled internally.
 * Call `update()` once per frame to refresh state.
 */
export class InputMultiplexer {
  private scene: Phaser.Scene;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveKeys!: {
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    Z: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
  };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;

  private readonly deadzone = 0.15;
  readonly state: InputState;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.state = {
      moveX: 0, moveY: 0,
      action1: false, action1JustDown: false,
      action2: false, action2JustDown: false,
      pointerX: 0, pointerY: 0,
      aimAngle: 0,
      hasInput: false,
    };

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.moveKeys = {
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        Z: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
        Q: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      };
      this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.shiftKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    }
  }

  update(playerX = 0, playerY = 0): InputState {
    const s = this.state;

    // Reset
    s.moveX = 0;
    s.moveY = 0;
    s.action1 = false;
    s.action1JustDown = false;
    s.action2 = false;
    s.action2JustDown = false;
    s.hasInput = false;

    // --- Keyboard ---
    this.readKeyboard(s);

    // --- Mouse ---
    this.readMouse(s, playerX, playerY);

    // --- Gamepad (first connected pad) ---
    this.readGamepad(s);

    // Clamp movement vector to unit length
    const mag = Math.sqrt(s.moveX * s.moveX + s.moveY * s.moveY);
    if (mag > 1) {
      s.moveX /= mag;
      s.moveY /= mag;
    }

    s.hasInput = mag > 0.01 || s.action1 || s.action2;
    return s;
  }

  private readKeyboard(s: InputState): void {
    if (!this.cursors) return;

    if (this.cursors.left.isDown || this.moveKeys.Q.isDown) s.moveX -= 1;
    if (this.cursors.right.isDown || this.moveKeys.D.isDown) s.moveX += 1;
    if (this.cursors.up.isDown || this.moveKeys.Z.isDown) s.moveY -= 1;
    if (this.cursors.down.isDown || this.moveKeys.S.isDown) s.moveY += 1;

    if (this.spaceKey.isDown) s.action1 = true;
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) s.action1JustDown = true;
    if (this.shiftKey.isDown) s.action2 = true;
    if (Phaser.Input.Keyboard.JustDown(this.shiftKey)) s.action2JustDown = true;
  }

  private readMouse(s: InputState, playerX: number, playerY: number): void {
    const pointer = this.scene.input.activePointer;
    s.pointerX = pointer.worldX;
    s.pointerY = pointer.worldY;
    s.aimAngle = Math.atan2(pointer.worldY - playerY, pointer.worldX - playerX);

    if (pointer.isDown) {
      if (pointer.button === 0) s.action1 = true;
      if (pointer.button === 2) s.action2 = true;
    }
    // JustDown for mouse handled via pointer events
    if (pointer.button === 0 && pointer.getDuration() < 100) s.action1JustDown = true;
  }

  private readGamepad(s: InputState): void {
    const pad = this.scene.input.gamepad?.getPad(0);
    if (!pad) return;

    // Left stick → movement
    const lx = this.applyDeadzone(pad.axes[0]?.getValue() ?? 0);
    const ly = this.applyDeadzone(pad.axes[1]?.getValue() ?? 0);
    if (Math.abs(lx) > Math.abs(s.moveX)) s.moveX = lx;
    if (Math.abs(ly) > Math.abs(s.moveY)) s.moveY = ly;

    // Right stick → aim (overrides mouse if active)
    const rx = this.applyDeadzone(pad.axes[2]?.getValue() ?? 0);
    const ry = this.applyDeadzone(pad.axes[3]?.getValue() ?? 0);
    if (Math.abs(rx) > 0.1 || Math.abs(ry) > 0.1) {
      s.aimAngle = Math.atan2(ry, rx);
    }

    // A button (index 0) → action1, B button (index 1) → action2
    if (pad.buttons[0]?.pressed) s.action1 = true;
    if (pad.buttons[0]?.value === 1 && !pad.buttons[0]?.pressed) s.action1JustDown = true;
    if (pad.buttons[1]?.pressed) s.action2 = true;
  }

  private applyDeadzone(value: number): number {
    return Math.abs(value) < this.deadzone ? 0 : value;
  }

  destroy(): void {
    // Phaser handles key cleanup on scene shutdown
  }
}
