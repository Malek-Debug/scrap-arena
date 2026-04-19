import Phaser from "phaser";
import { createGameConfig } from "./core";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { TitleScene } from "./scenes/TitleScene";
import { MainScene } from "./scenes/MainScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { VictoryScene } from "./scenes/VictoryScene";
import { PostFXScene } from "./rendering/PostFXScene";

const config = createGameConfig([PreloaderScene, TitleScene, MainScene, GameOverScene, VictoryScene, PostFXScene]);
const game = new Phaser.Game(config);

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
