# SCRAP ARENA: THE FRACTURE

> **Gamedev.js Jam 2026** — Theme: **MACHINES** — Built with Phaser 3 + TypeScript

[Live Demo](<!-- placeholder -->) | [Itch.io Page](<!-- placeholder -->)

---

## 🎮 About

**SCRAP ARENA: THE FRACTURE** is a top-down dual-world arena shooter where you fight relentless machine armies across two parallel dimensions — the rust-and-fire **FOUNDRY** and the cold-blue **CIRCUIT**. You are the only thing standing between reality and total machine domination.

The core twist: enemies don't just exist in one world. Guards and Collectors can _breach_ the dimensional boundary after lurking as ghosts long enough, phasing directly into your world and turning any safe haven into a kill zone. Flipping between dimensions with **Q** is both your greatest weapon and your greatest risk — enemies you ignored in the other world may already be charging their breach.

Every run escalates. Waves bring new machine types, a procedurally scaling DDA system adapts difficulty to your performance, and an upgrade shop lets you spend scrap between waves to push your stats. Chain kills for score multipliers, manage your heat bar to avoid weapon lockout, and survive long enough to face the **FRACTURE BOSS** — a multi-phase mechanical nightmare that reads your movement and adapts its attack patterns in real time.

---

## ✨ Features

- **⚡ Dual Dimension System** — Seamlessly phase-shift between the FOUNDRY (industrial, molten) and CIRCUIT (electronic, neon) worlds. Each dimension has its own visual palette, atmosphere, and enemy population.
- **🧠 Adaptive AI — PlayerPredictor** — A real-time behavioral tracker samples your position every 150 ms into a 30-entry circular buffer, computing your predicted position, average speed, movement entropy, preferred world, and strafe bias. Enemies use this to lead-shot and flank; the Boss switches between lead-shot and saturation fire based on how chaotically you move.
- **👻 Dimension Breach** — Guards and Collectors accumulate breach energy while ghosting in the wrong world. After 6 seconds they enter a 1.8s glowing charge-up, then fully materialize in YOUR dimension for 4 seconds. Neither world is safe.
- **🔥 Heat Management** — Rapid firing builds heat on a visible bar. Overheat triggers a 2.4s weapon lockout — timing your bursts is as important as your aim.
- **🤖 6 Enemy Types + Boss**:
  - **Drone** — fast, fragile, swarms in formation
  - **Guard** — armored patrol unit with Dimension Breach capability
  - **Collector** — scrap-hungry unit that steals resources; can also breach
  - **Turret** — stationary but deadly; leads shots using PlayerPredictor data
  - **Sawblade** — high-speed melee unit that carves arena paths
  - **Welder** — mid-range arc-attack unit with repair subroutines
  - **FRACTURE BOSS** — multi-phase, entropy-aware, deploys shadow doubles
- **🛒 Upgrade Shop** — Between waves, spend collected scrap on Speed, Damage, Max HP, Fire Rate, Projectile Speed, and Pickup Range upgrades.
- **💥 Combo System** — Build kill chains for escalating score multipliers.
- **🎲 DDA (Dynamic Difficulty Adjustment)** — The game watches your performance and subtly adjusts enemy aggression and spawn rates to keep the pressure just right.
- **🌪️ Arena Hazards** — Environmental dangers that evolve with the waves.
- **✨ Full Juice** — Screen shake, death FX, glitch events, fracture VFX, dimension background parallax, and glow effects — all procedurally rendered.

---

## 🕹️ Controls

| Key / Input      | Action                                      |
|------------------|---------------------------------------------|
| `W A S D`        | Move                                        |
| `Mouse` / `LMB`  | Aim & Shoot                                 |
| `SHIFT` / `RMB`  | Dash                                        |
| `Q`              | Phase-Shift between worlds (4s cooldown)    |
| `M`              | Toggle audio mute                           |

---

## 🤖 AI System

SCRAP ARENA's AI is what sets it apart. Rather than scripted patterns, enemies respond to **you specifically**.

### PlayerPredictor
Every 150 ms, the `PlayerPredictor` snapshots your `(x, y, world, timestamp)` into a circular ring buffer (30 entries ≈ 4.5 seconds of history). From this it derives:

| Metric | Description |
|---|---|
| `predictedPosition(t)` | Where you'll be in `t` ms, using velocity extrapolation |
| `avgSpeed` | Rolling average of your movement speed |
| `movementEntropy` | 0 = predictably linear · 1 = pure chaos |
| `preferredWorld` | Which dimension you tend to stay in |
| `strafePattern` | Dominant clockwise vs. counter-clockwise dodge bias |

Turrets and Guards use `predictedPosition()` for intercept aiming. The **Boss** reads `movementEntropy` directly: low entropy → lead-shot precision mode; high entropy → wide saturation fire that punishes randomness.

### DimensionBreach
Guards and Collectors run a per-instance `DimensionBreach` state machine:

```
IDLE (6s ghost) → CHARGING (1.8s glow) → ACTIVE (4s in your world) → COOLDOWN (8s)
```

During `ACTIVE`, the enemy is fully opaque and dangerous in your current dimension regardless of its native world. The glowing charge-up is your only warning.

### DDA (Dynamic Difficulty Adjustment)
`DDASystem` monitors kill rate, damage taken, and wave clear speed, then modulates enemy health, speed, and spawn density to maintain a target challenge curve — keeping veterans under pressure without crushing newcomers.

### Steering & Skills
Each agent composes reusable `ShootSkill` / `DashSkill` behaviors with `SteeringBehaviors` (seek, flee, flank, formation). The `ShadowDouble` agent is a Boss-spawned phantom that mirrors the Boss's own behavior tree, forcing you to track multiple threats simultaneously.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Engine** | [Phaser 3.87](https://phaser.io/) |
| **Language** | TypeScript 5.7 |
| **Bundler** | Vite 6.2 |
| **Audio** | Procedural Web Audio API — zero external audio files |
| **Graphics** | Procedural Canvas 2D rendering — zero external image assets |

No sprites. No sound files. Everything you see and hear is generated at runtime.

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

Production output lands in `dist/`. Preview with `npm run preview`.

---

## 📁 Project Structure

```
src/
├── main.ts              # Phaser game bootstrap
├── scenes/              # Game scenes (Preloader, Title, Main, GameOver)
├── agents/              # Enemy agent classes (EnemyAgent, GuardAgent, BossAgent…)
├── ai/                  # PlayerPredictor, DimensionBreach, SteeringBehaviors, skills/
├── audio/               # AudioManager (procedural Web Audio synthesis)
├── core/                # Engine systems: WaveManager, ScrapManager, UpgradeSystem,
│                        #   WorldManager, ComboSystem, ArenaHazards, DDASystem, SpatialGrid…
├── input/               # InputMultiplexer (keyboard + mouse unified)
└── rendering/           # Juice, GameJuice, FractureFX, DimensionBackground,
                         #   GlitchEvents, DeathFX, UpgradeUI
```

---

## 🏆 Jam Challenges

| Challenge | Status |
|---|---|
| ✅ **Open Source by GitHub** | Full source available in this repository |
| ✅ **Build it with Phaser** | Built with Phaser 3.87 |
| 🎯 **Deploy to Wavedash** | [Link coming soon] |

---

## 🎨 Art & Audio

All visuals are rendered procedurally with **Canvas 2D API** — no sprites, no texture atlases, no image files. Every glow, particle, arena tile, and UI element is drawn at runtime.

All audio is synthesised procedurally with the **Web Audio API** — no `.mp3`, `.ogg`, or `.wav` files. Shoot sounds, explosions, dimension-shift drones, and boss cues are generated from oscillators, noise buffers, and gain envelopes on-demand.

This makes the entire game a **single, self-contained JavaScript bundle** with zero binary assets.

---

## License

MIT © 2026
