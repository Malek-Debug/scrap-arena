# 🎮 SCRAP ARENA: THE FRACTURE

> **🏆 Gamedev.js Jam 2026** — Theme: **⚙️ MACHINES** — Built with **Phaser 3** + **TypeScript**

[![Play Now](https://img.shields.io/badge/🎮%20PLAY%20NOW-Live%20on%20GitHub%20Pages-brightgreen?style=for-the-badge)](https://malek-debug.github.io/scrap-arena/) | [![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) | [![Built with Phaser](https://img.shields.io/badge/Built%20with-Phaser%203-blueviolet.svg)](https://phaser.io)

---

## 🎮 About the Game

**SCRAP ARENA: THE FRACTURE** is an intense **top-down arena shooter** where you battle endless waves of killer machines across a corrupted laboratory complex. Explore **9 interconnected rooms**, master adaptive AI enemies, defeat the **multi-phase boss**, and unlock powerful upgrades to survive the onslaught!

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **🏭 9-Room Lab** | Hub, Bio Lab, Armory, Data Lab, Reactor Core, Quarantine, Cmd Center, Supply Depot, Vault |
| **🧠 Adaptive AI** | Predictive targeting (150ms sampling), flanking behaviors, lead-shot mechanics |
| **⚡ Boss Battle** | Multi-phase Reactor Man boss with dynamic attack patterns |
| **🛒 Upgrade Shop** | Speed, Damage, HP, Fire Rate, Projectile Speed, Pickup Range |
| **🎵 Original Soundtrack** | Custom music & 30+ sound effects with audio toggle |
| **⬡ Web3 Ready** | MetaMask integration, sign scores on-chain (gasless attestation) |
| **▶ YouTube Playables** | Full SDK support: firstFrameReady, gameReady, sendScore, pause/resume |

---

## 🕹️ How to Play

### Controls

| Input | Action | 
|-------|--------|
| **W A S D** | Move around the arena |
| **🖱️ Mouse / LMB** | Aim & shoot at enemies |
| **SHIFT** | Dash (quick escape move) |
| **Q** | Phase-shift between Foundry and Circuit worlds |
| **E / R / F / C** | Special abilities |
| **M** | Toggle audio mute |
| **SPACE / ENTER** | Start game (on title screen) |

### Gameplay Loop

1. **Survive Waves** - Each room has progressive enemy waves
2. **Collect Upgrades** - Pick up dropped items to boost stats
3. **Visit Shop** - Between waves, spend resources on permanent upgrades
4. **Defeat Boss** - Reactor Core boss has 3 phases, each with unique attacks
5. **Dominate** - Reach your highest wave and top the leaderboard!

### Tips & Tricks

- 💡 **Predict enemy movement** - Watch patterns and use cover
- 💡 **Manage your upgrades** - Fire rate early, HP late game
- 💡 **Dash strategically** - Save dash for critical moments
- 💡 **Audio helps** - Sound effects cue enemy spawns and attacks
- 💡 **Sign your score** - Use MetaMask to record your achievement on-chain

---

## 🛠️ Tech Stack

```
┌─ Frontend Engine ────────────────────────┐
│ Phaser 3.87    - WebGL/Canvas rendering │
│ TypeScript 5.7 - Type-safe game code    │
│ Vite 6.2       - Lightning-fast build   │
└──────────────────────────────────────────┘

┌─ Web3 & Blockchain ──────────────────────┐
│ ethers.js 6.16 - Ethereum interaction   │
│ MetaMask       - Wallet & signing       │
│ EIP-191        - Gasless attestation    │
└──────────────────────────────────────────┘

┌─ Audio & Media ──────────────────────────┐
│ Web Audio API  - Game sounds            │
│ MP3/OGG/WAV    - High-quality audio     │
│ Pixel Art      - Custom sprite graphics │
└──────────────────────────────────────────┘

┌─ YouTube Integration ────────────────────┐
│ Playables SDK  - firstFrameReady hook   │
│               - gameReady event         │
│               - sendScore reporting     │
│               - pause/resume lifecycle  │
└──────────────────────────────────────────┘
```

---

## 🏆 Jam Challenges - All 5 Complete ✅

| Challenge | Status | Notes |
|-----------|--------|-------|
| **Build it with Phaser** | ✅ Complete | Phaser 3.87 - Full engine integration |
| **Open Source by GitHub** | ✅ Complete | MIT licensed, full source code public |
| **YouTube Playables** | ✅ Integrated | SDK hooks: firstFrameReady, gameReady, sendScore, pause/resume |
| **Deploy to Wavedash** | ✅ Ready | dist/ folder optimized for deployment |
| **Ethereum by OP Guild** | ✅ Integrated | MetaMask + signed score attestation |

---

## 🚀 Quick Start

### Play Online (No Installation!)
👉 **[🎮 PLAY NOW - Live on GitHub Pages](https://malek-debug.github.io/scrap-arena/)**

### Run Locally

```bash
# Clone the repository
git clone https://github.com/Malek-Debug/scrap-arena.git
cd scrap-arena

# Install dependencies
npm install

# Start dev server (opens in browser)
npm run dev
```

Visit **http://localhost:5173** and start playing!

### Build for Production

```bash
# Compile and optimize
npm run build

# Output: dist/ folder (ready for deployment)

# Preview production build
npm run preview
```

---

## 🌐 Web3 Integration

### MetaMask Wallet
- **Connect button** on title screen (bottom-left)
- **Sign scores** on Victory/GameOver screens
- **Gasless signing** - EIP-191 off-chain attestation
- **Score proof** - Permanently verifiable record

```
Signed message format:
SCRAP ARENA | score: 15250 | wave: 32 | player: 0x1234...5678
```

### Deployment Platforms

**🔴 GitHub Pages** (Live Now!)
- 👉 https://malek-debug.github.io/scrap-arena/
- Instant, free, automatic updates

**🌊 Wavedash** (Ready to Deploy)
1. `npm run build`
2. Zip `dist/` folder
3. Upload to [Wavedash Portal](https://docs.wavedash.games/)

**▶ YouTube Playables** (Ready to Deploy)
1. `npm run build`
2. Zip `dist/` folder
3. Submit to [YouTube Portal](https://developers.google.com/youtube/gaming/playables/developer_portal)

---

## 📁 Project Architecture

```
scrap-arena/
├── src/
│   ├── main.ts                    # Phaser game bootstrap
│   ├── scenes/                    # Game scenes (Title, Preload, Main, Victory, GameOver)
│   ├── agents/                    # Enemy AI classes (CollectorAgent, GuardAgent, WelderAgent, etc.)
│   ├── ai/                        # AI utilities (PlayerPredictor, SteeringBehaviors)
│   ├── audio/                     # AudioManager with Web Audio API
│   ├── core/                      # Game logic (WaveManager, UpgradeSystem, MapObstacles)
│   ├── input/                     # Input handling (InputMultiplexer, mouse/keyboard)
│   ├── rendering/                 # UI & visual effects (HUD, DialogueUI, ParticleEffects)
│   ├── systems/                   # Game systems (WaveOrchestrator, StoryController)
│   ├── types/                     # TypeScript definitions (YouTube SDK types)
│   └── web3/                      # Blockchain integration (WalletManager, ethers.js)
├── public/
│   └── assets/                    # Game sprites, audio, images
├── dist/                          # Production build (deployed to GitHub Pages)
├── package.json                   # Dependencies & scripts
├── vite.config.ts                 # Build configuration
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file!
```

---

## 📄 License

MIT © 2026 — Built for Gamedev.js Jam 2026

---

## 🙏 Credits

- **Engine**: [Phaser 3](https://phaser.io) - Richard Davey & contributors
- **Web3**: [ethers.js](https://ethers.org) - Ethereum integration
- **Build**: [Vite](https://vitejs.dev) - Next generation frontend tooling
- **Type Safety**: [TypeScript](https://www.typescriptlang.org)

---

## 🎯 Roadmap

- [x] Core gameplay loop
- [x] 9-room map system
- [x] Adaptive enemy AI
- [x] Boss fight mechanics
- [x] Upgrade shop system
- [x] Audio system with SFX
- [x] MetaMask integration
- [x] YouTube Playables SDK
- [x] GitHub Pages deployment
- [ ] Mobile touch controls
- [ ] Leaderboard system
- [ ] Additional enemy types
- [ ] More visual effects

---

## 📞 Support

Found a bug? Have a feature request?
- Open an issue: https://github.com/Malek-Debug/scrap-arena/issues
- Visit the repository: https://github.com/Malek-Debug/scrap-arena

---

## 🎮 Play Now!

**[👾 LAUNCH GAME 👾](https://malek-debug.github.io/scrap-arena/)**

*Built with passion for Gamedev.js Jam 2026*

