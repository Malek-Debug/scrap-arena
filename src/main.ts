import Phaser from "phaser";
import { createGameConfig, IntegrityGuard } from "./core";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { IntroScene } from "./scenes/IntroScene";
import { TitleScene } from "./scenes/TitleScene";
import { MainScene } from "./scenes/MainScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { VictoryScene } from "./scenes/VictoryScene";
import { PostFXScene } from "./rendering/PostFXScene";
import { MultiplayerMenuScene, LobbyScene, CharacterSelectScene, MultiplayerArenaScene, MatchResultsScene } from "./multiplayer/scenes";
import { NetworkClient } from "./multiplayer/network/NetworkClient";

// ── Init integrity guard early so all timing baselines are stable ──────────
const _guard = IntegrityGuard.instance;
// Periodic clock-drift sweep (cheap; once per second) — flags speedhacks.
setInterval(() => _guard.checkClockDrift(), 1000);

const config = createGameConfig([
  PreloaderScene, IntroScene, TitleScene, MainScene, GameOverScene, VictoryScene, PostFXScene,
  MultiplayerMenuScene, LobbyScene, CharacterSelectScene, MultiplayerArenaScene, MatchResultsScene,
]);
const game = new Phaser.Game(config);
const viteEnv = (import.meta as unknown as { env?: { DEV?: boolean; PROD?: boolean; VITE_SERVER_URL?: string } }).env;

// Initialize multiplayer networking
const serverUrl = viteEnv?.VITE_SERVER_URL || (viteEnv?.PROD ? "" : "ws://localhost:3001");
game.registry.set("serverUrl", serverUrl);
game.registry.set("networkClient", new NetworkClient());

declare global {
  interface Window {
    __SCRAP_ARENA_GAME__?: Phaser.Game;
  }
}

// Expose game hook in both dev and prod for investigation
window.__SCRAP_ARENA_GAME__ = game;

// Discourage casual snooping in production builds. We don't try to defeat
// determined attackers — they can defeat any client-side check.
if (viteEnv?.PROD) {
  try {
    window.addEventListener("contextmenu", (e) => e.preventDefault(), { passive: false });
  } catch { /* ignore */ }
}

// YouTube Playables SDK hooks — safe no-op outside of YouTube
if (typeof ytgame !== "undefined") {
  ytgame.system?.onPause?.(() => {
    game.sound.pauseAll();
    game.scene.scenes.forEach(s => { if (s.scene.isActive()) s.scene.pause(); });
  });
  ytgame.system?.onResume?.(() => {
    game.sound.resumeAll();
    game.scene.scenes.forEach(s => { if (s.scene.isPaused()) s.scene.resume(); });
  });
  ytgame.system?.onAudioVolumeChange?.(({ volume }) => {
    game.sound.volume = volume;
  });
}
