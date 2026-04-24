# GitHub Pages Configuration

This repository is configured to deploy to GitHub Pages.

## Configuration

- **Source Branch**: `main`
- **Build Tool**: Vite + npm
- **Output Directory**: `dist/` (also tracked in repo for instant serving)
- **Entry Point**: `index.html`

## Status

✅ **Live at**: https://malek-debug.github.io/scrap-arena/

## Deployment

The game is deployed automatically when:
1. Code is pushed to `main` branch
2. GitHub Actions workflow builds the project
3. Built files are deployed to GitHub Pages

## Manual Configuration

If Pages isn't automatically enabled:

1. Go to: https://github.com/Malek-Debug/scrap-arena/settings/pages
2. Set **Source** to **GitHub Actions**
5. Click **Save**

Pages will be live within 1-2 minutes.
