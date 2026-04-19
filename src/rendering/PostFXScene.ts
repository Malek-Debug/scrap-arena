import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../core";

export class PostFXScene extends Phaser.Scene {
  constructor() {
    super({ key: "PostFX", active: false });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    this.cameras.main.setAlpha(1);
    // Disable input on this overlay scene so it doesn't block clicks
    this.input.enabled = false;

    // 1. Static scanlines — drawn once
    const scanGfx = this.add.graphics().setScrollFactor(0).setDepth(9990);
    for (let y = 0; y < GAME_HEIGHT; y += 3) {
      scanGfx.fillStyle(0x000000, 0.05);
      scanGfx.fillRect(0, y, GAME_WIDTH, 1);
    }

    // 2. Vignette — very subtle corner darkening (reduced to avoid edge darkness)
    const vigGfx = this.add.graphics().setScrollFactor(0).setDepth(9991);
    const vigSteps = 12;
    for (let i = 0; i < vigSteps; i++) {
      const frac = i / vigSteps;
      const a = 0.04 * (1 - frac) * (1 - frac);
      const size = (GAME_WIDTH * 0.3) * (1 - frac);
      vigGfx.fillStyle(0x000000, a);
      vigGfx.fillRect(0, 0, size, size);
      vigGfx.fillRect(GAME_WIDTH - size, 0, size, size);
      vigGfx.fillRect(0, GAME_HEIGHT - size, size, size);
      vigGfx.fillRect(GAME_WIDTH - size, GAME_HEIGHT - size, size, size);
    }

    // 3. Grain — reduced to 30 dots, redrawn every 150ms (was 80 dots / 80ms)
    const grainGfx = this.add.graphics().setScrollFactor(0).setDepth(9992);
    this.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        grainGfx.clear();
        for (let i = 0; i < 30; i++) {
          const gx = Math.random() * GAME_WIDTH;
          const gy = Math.random() * GAME_HEIGHT;
          grainGfx.fillStyle(0xffffff, 0.02 + Math.random() * 0.02);
          grainGfx.fillRect(gx, gy, 1, 1);
        }
      },
    });

    // 4. CRT flicker — brief full-screen flash every 5 seconds
    const flickerGfx = this.add.graphics().setScrollFactor(0).setDepth(9993).setAlpha(0);
    flickerGfx.fillStyle(0x00ff88, 0.04);
    flickerGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        flickerGfx.setAlpha(1);
        this.time.delayedCall(60, () => flickerGfx.setAlpha(0));
      },
    });

    // 5. Edge glow — green CRT lines at top and bottom
    const edgeGfx = this.add.graphics().setScrollFactor(0).setDepth(9994);
    edgeGfx.fillStyle(0x00ff88, 0.04);
    edgeGfx.fillRect(0, GAME_HEIGHT - 2, GAME_WIDTH, 2);
    edgeGfx.fillRect(0, 0, GAME_WIDTH, 1);
  }
}
