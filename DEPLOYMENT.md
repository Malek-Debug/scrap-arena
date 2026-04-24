# 🚀 SCRAP ARENA - GitHub Pages Deployment Guide

Your game is **production-ready** and prepared for safe deployment to GitHub Pages!

## ✅ What's Complete

- ✅ Game built and optimized (`npm run build` executed)
- ✅ All TypeScript compiled to JavaScript
- ✅ Assets minified and hashed for cache busting
- ✅ GitHub Actions workflow configured for auto-deploy
- ✅ Git repository initialized with deployment commits
- ✅ No Node.js dependencies in dist/ (pure static files)
- ✅ Nothing deleted - full source control

## 📋 Deployment Steps

### Step 1: Create GitHub Repository

1. Go to **https://github.com/new**
2. Fill in:
   - **Repository name:** `scrap-arena` (or your preferred name)
   - **Description:** "SCRAP ARENA: THE FRACTURE - Gamedev.js Jam 2026"
   - **Visibility:** **PUBLIC** (required for free GitHub Pages)
3. **Do NOT** check "Initialize with README, gitignore, or license"
4. Click **Create repository**

### Step 2: Connect Your Local Repository

Copy your repository HTTPS URL from GitHub (looks like `https://github.com/YOUR_USERNAME/scrap-arena.git`), then run:

```bash
cd C:\Users\malek\Desktop\GameJam

git remote add origin https://github.com/YOUR_USERNAME/scrap-arena.git

git branch -M main

git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

**This will:**
- Connect your local repo to GitHub
- Rename branch to `main` (GitHub Pages standard)
- Upload all code and commits to GitHub

### Step 3: Enable GitHub Pages

1. Go to your repository: `https://github.com/YOUR_USERNAME/scrap-arena`
2. Click **Settings** (top-right)
3. Scroll to **Pages** in the left sidebar
4. Under **Build and deployment:**
   - **Source:** Select "Deploy from a branch"
   - **Branch:** Select `main`
   - **Folder:** Select `/ (root)`
5. Click **Save**

GitHub will show: **"Your site is published at https://YOUR_USERNAME.github.io/scrap-arena/"**

Wait 1-2 minutes for the first deployment to complete.

### Step 4: Access Your Game

Visit: **https://YOUR_USERNAME.github.io/scrap-arena/**

Your game is now live and playable directly in the browser!

## 🎮 Game Features

- **9-Room Arena Complex** - Hub, Bio Lab, Armory, Data Lab, Reactor Core, Quarantine, Cmd Center, Supply Depot, Vault
- **Adaptive AI Enemies** - Predictive targeting, flanking behaviors
- **Multi-Phase Boss Fight** - Challenging Reactor Man encounter
- **Upgrade Shop** - Enhance speed, damage, HP, fire rate, projectile speed, pickup range
- **MetaMask Integration** - Connect wallet and sign scores
- **YouTube Playables SDK** - Ready for YouTube submission
- **Original Soundtrack** - Custom music and SFX

## 🕹️ Controls

| Input | Action |
|-------|--------|
| `W A S D` | Move |
| `Mouse` / `LMB` | Aim & Shoot |
| `SHIFT` | Dash |
| `M` | Toggle Audio |
| `SPACE / ENTER` | Start Game |

## 🔄 Making Updates

After you make changes to the game:

```bash
cd C:\Users\malek\Desktop\GameJam

npm run build

git add .

git commit -m "Update: [describe your changes]"

git push
```

GitHub Actions will automatically:
1. Run the build
2. Deploy to GitHub Pages
3. Your game updates live (1-2 minutes)

## 📦 Build Output

Your `dist/` folder contains:

```
dist/
├── index.html                 # Entry point (2.96 KB)
├── assets/
│   ├── [hash].js             # Phaser chunk (250 KB)
│   ├── [hash].js             # Ethers chunk (416 KB)
│   ├── [hash].js             # Game chunk (1,187 KB)
│   ├── audio/                # 30+ audio files (85 MB)
│   ├── enemies/              # Enemy sprites
│   ├── bullets/              # Bullet sprites
│   ├── effects/              # Effect sprites
│   ├── guns/                 # Weapon sprites
│   └── player/               # Player sprites
```

**Total size:** ~1.85 MB (JavaScript), ~85 MB (Audio)  
**Load time:** ~2-5 seconds depending on connection

## 🔒 Safety & Security

- ✅ All code version-controlled in Git
- ✅ No sensitive data or secrets in repo
- ✅ No Node modules deployed (clean, minimal)
- ✅ Assets have hash filenames (cache busting)
- ✅ Production build: minified, no source maps, no console logs
- ✅ HTTPS automatically enabled by GitHub Pages

## 🆘 Troubleshooting

### "404 - File not found" Error
- **Solution:** Ensure GitHub Pages is enabled in Settings → Pages
- Check that branch is set to `main` and folder to `/`
- Wait another minute for deployment

### Game Assets Not Loading
- **Solution:** Check browser DevTools Console (F12) for errors
- Verify `dist/` folder exists locally
- Ensure GitHub Pages deployment is complete

### Want a Custom Domain?
- Settings → Pages → Custom domain
- Point your domain's CNAME to `YOUR_USERNAME.github.io`

## 📝 Project Structure

```
GameJam/
├── src/                      # TypeScript source
│   ├── main.ts
│   ├── scenes/              # Game scenes
│   ├── agents/              # Enemy AI
│   ├── ai/                  # Prediction & steering
│   ├── audio/               # Audio manager
│   ├── core/                # Game logic
│   ├── input/               # Input handling
│   ├── rendering/           # UI & rendering
│   ├── systems/             # Game systems
│   ├── types/               # Type definitions
│   └── web3/                # Wallet integration
├── public/                   # Static assets
├── dist/                     # Production build (deployed)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .github/
    └── workflows/
        └── deploy.yml       # Auto-deploy configuration
```

## 🎯 Next Steps After Deployment

1. **Test your game** - Play it on the live URL
2. **Share with friends** - Copy the URL and share
3. **Submit to jam** - Add the GitHub Pages link to your submission
4. **YouTube Playables** - Use the dist/ folder for submission
5. **Keep updating** - Push changes anytime, they deploy automatically

## 📞 Quick Reference

**Your Game URL:** `https://YOUR_USERNAME.github.io/scrap-arena/`

**GitHub Repository:** `https://github.com/YOUR_USERNAME/scrap-arena`

**Local Folder:** `C:\Users\malek\Desktop\GameJam`

**Build Command:** `npm run build`

**Deploy:** `git push`

---

**Your game is ready to ship! 🎮✨**
