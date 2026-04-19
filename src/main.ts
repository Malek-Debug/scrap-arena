import Phaser from "phaser";
import { createGameConfig } from "./core";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { TitleScene } from "./scenes/TitleScene";
import { MainScene } from "./scenes/MainScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { VictoryScene } from "./scenes/VictoryScene";
import { PostFXScene } from "./rendering/PostFXScene";

const config = createGameConfig([PreloaderScene, TitleScene, MainScene, GameOverScene, VictoryScene, PostFXScene]);
new Phaser.Game(config);
