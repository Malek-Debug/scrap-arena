import Phaser from "phaser";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const ROOM_COLS = 3;
export const ROOM_ROWS = 4;  // Row 0 = mini-rooms (Reactor + Armory) above hub; rows 1-3 = main grid
export const CELL_W = GAME_WIDTH;   // Each room = one screen
export const CELL_H = GAME_HEIGHT;
export const WALL_T = 24;           // Wall thickness in pixels (must match MapObstacles)
export const DOOR_W = 300;          // Door gap width in pixels (must match MapObstacles)
export const WORLD_WIDTH = ROOM_COLS * CELL_W;   // 3840
export const WORLD_HEIGHT = ROOM_ROWS * CELL_H;  // 2160
export const AI_TICK_RATE = 1 / 10; // 10Hz fixed-step AI evaluation
export const MAX_AGENTS = 512;
export const PHYSICS_DEBUG = false;

export function createGameConfig(scenes: Phaser.Types.Scenes.SceneType[]): Phaser.Types.Core.GameConfig {
  return Object.freeze({
    type: Phaser.AUTO,
    parent: "game-container",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#000000",
    disableContextMenu: true,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: PHYSICS_DEBUG,
        tileBias: 16,
        maxEntries: 16,
        fps: 60,
      },
    },
    scene: scenes,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      powerPreference: "high-performance",
      transparent: false,
      batchSize: 4096,
      maxLights: 4,
      mipmapFilter: "NEAREST",
    },
    input: {
      activePointers: 2,
      smoothFactor: 0,
      windowEvents: true,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
      smoothStep: true,
    },
    autoMobilePipeline: true,
    banner: false,
  }) as Phaser.Types.Core.GameConfig;
}
