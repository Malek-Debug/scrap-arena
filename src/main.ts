import Phaser from "phaser";
import { createGameConfig, IntegrityGuard } from "./core";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { TitleScene } from "./scenes/TitleScene";
import { MainScene } from "./scenes/MainScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { VictoryScene } from "./scenes/VictoryScene";
import { PostFXScene } from "./rendering/PostFXScene";

// ── Init integrity guard early so all timing baselines are stable ──────────
const _guard = IntegrityGuard.instance;
// Periodic clock-drift sweep (cheap; once per second) — flags speedhacks.
setInterval(() => _guard.checkClockDrift(), 1000);

const config = createGameConfig([PreloaderScene, TitleScene, MainScene, GameOverScene, VictoryScene, PostFXScene]);
const game = new Phaser.Game(config);

// Discourage casual snooping in production builds. We don't try to defeat
// determined attackers — they can defeat any client-side check.
if ((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD) {
  try {
    window.addEventListener("contextmenu", (e) => e.preventDefault(), { passive: false });
  } catch { /* ignore */ }
}

// YouTube Playables SDK hooks — safe no-op outside of YouTube
if (typeof ytgame !== "undefined") {
  ytgame.system.onPause(() => {
    game.sound.pauseAll();
    game.scene.scenes.forEach(s => { if (s.scene.isActive()) s.scene.pause(); });
  });
  ytgame.system.onResume(() => {
    game.sound.resumeAll();
    game.scene.scenes.forEach(s => { if (s.scene.isPaused()) s.scene.resume(); });
  });
  ytgame.system.onAudioVolumeChange(({ volume }) => {
    game.sound.volume = volume;
  });
}
