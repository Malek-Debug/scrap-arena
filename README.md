# SCRAP ARENA: THE FRACTURE

> **Gamedev.js Jam 2026** — Theme: **MACHINES** — Built with Phaser 3 + TypeScript

[Live Demo](<!-- add after deployment -->) | [Itch.io Page](<!-- add when submitting -->)

---

## 🎮 About

**SCRAP ARENA: THE FRACTURE** is a top-down arena shooter where you fight machine waves across a corrupted laboratory complex. Navigate 9 interconnected rooms, fight escalating waves, and take down the boss to stop the Machine Core.

---

## ✨ Features

- **🏭 9-Room Lab Complex** — Hub, Bio Lab, Armory, Data Lab, Reactor Core, Quarantine, Cmd Center, Supply Depot, Vault. Each room unlocks progressively.
- **🧠 Adaptive AI** — `PlayerPredictor` samples your position every 150ms into a 30-entry ring buffer and computes predicted position, avg speed, movement entropy. Enemies lead-shot and flank.
- **⚡ Boss Fight** — Multi-phase boss at the Reactor Core with adaptive attack patterns.
- **🛒 Shop System** — Upgrade Speed, Damage, Max HP, Fire Rate, Projectile Speed, and Pickup Range.
- **🎵 Original Audio** — Custom lobby, gameplay, and boss music with full SFX.
- **⬡ Ethereum Integration** — Connect MetaMask wallet, sign your score on-chain as a gasless off-chain attestation.
- **▶ YouTube Playables** — Full SDK integration: firstFrameReady, gameReady, sendScore, pause/resume hooks.

---

## 🕹️ Controls

| Key / Input      | Action                    |
|------------------|---------------------------|
| `W A S D`        | Move                      |
| `Mouse` / `LMB`  | Aim & Shoot               |
| `SHIFT`          | Dash                      |
| `M`              | Toggle audio mute         |
| `SPACE / ENTER`  | Start game (title screen) |

---

## 🛠️ Tech Stack

| Layer      | Technology              |
|------------|-------------------------|
| Engine     | Phaser 3.87             |
| Language   | TypeScript 5.7          |
| Bundler    | Vite 6.2                |
| Web3       | ethers.js (EIP-1193)    |
| Audio      | Web Audio API + MP3s    |

---

## 🏆 Jam Challenges

| Challenge | Status | Notes |
|---|---|---|
| ✅ **Build it with Phaser** | Complete | Built with Phaser 3.87 |
| ✅ **Open Source by GitHub** | Complete | Full source in this repo, MIT license |
| ✅ **YouTube Playables** | Integrated | SDK calls: firstFrameReady, gameReady, sendScore, pause/resume |
| ✅ **Deploy to Wavedash** | Ready to deploy | See deployment section below |
| ✅ **Ethereum by OP Guild** | Integrated | MetaMask wallet connect + signed score attestation |

---

## 🚀 Run Locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173**

---

## 🏗️ Build

```bash
npm run build
```

Output in `dist/`. Preview with `npm run preview`.

---

## 🌊 Deploy to Wavedash

1. Build the project: `npm run build`
2. Zip the `dist/` folder contents (not the folder itself — `index.html` must be at root)
3. Go to [Wavedash Developer Portal](https://docs.wavedash.games/)
4. Create a new game entry and upload the ZIP
5. Submit the Wavedash URL to the jam along with your itch.io entry

---

## ▶ YouTube Playables Submission

1. Build: `npm run build`
2. Zip the `dist/` folder (index.html at root)
3. Submit via the [YouTube Playables Developer Portal](https://developers.google.com/youtube/gaming/playables/developer_portal)
4. The SDK is loaded from `https://www.youtube.com/game_api/v1` — already in `index.html`

SDK integration points:
- `ytgame.game.firstFrameReady()` — called at start of `PreloaderScene.preload()`
- `ytgame.game.gameReady()` — called when `TitleScene` finishes building
- `ytgame.engagement.sendScore()` — called in `VictoryScene` and `GameOverScene`

---

## ⬡ Ethereum / Web3

Connect MetaMask from the title screen (bottom-left button) or from the Victory/GameOver screens. Signing your score is gasless — it creates an off-chain EIP-191 signed message proving your score, stored locally.

Signed attestation format:
```
SCRAP ARENA | score: <N> | wave: <W> | player: <address>
```

---

## 📁 Project Structure

```
src/
├── main.ts              # Phaser bootstrap
├── scenes/              # TitleScene, PreloaderScene, MainScene, VictoryScene, GameOverScene
├── agents/              # Enemy agent classes
├── ai/                  # PlayerPredictor, SteeringBehaviors, skills/
├── audio/               # AudioManager
├── core/                # WaveManager, UpgradeSystem, MapObstacles, StorySystem…
├── input/               # InputMultiplexer
├── rendering/           # Juice, GameJuice, DialogueUI, PlaceholderTextures…
├── systems/             # WaveOrchestrator, StoryController, GameContext
├── types/               # ytgame.d.ts (YouTube Playables types)
└── web3/                # WalletManager (ethers.js, EIP-1193)
```

---

## License

MIT © 2026

