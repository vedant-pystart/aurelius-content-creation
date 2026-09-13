# Aurelius Content Creation

An editorial motion-graphics studio for creating animated text over a color, image, GIF, or video backdrop.

## Requirements

- Node.js 22+
- npm

## Install and run

```bash
git clone https://github.com/vedant-pystart/aurelius-content-creation.git
cd aurelius-content-creation
npm install
npm run dev --workspace=@aurelius/editor
```

Open the local URL Vite prints in the terminal (normally `http://localhost:5173`).

## Useful commands

```bash
# Browser end-to-end test
npm run e2e

# Type-check every workspace
npm run typecheck

# Create a production build
npm run build
```

## Push changes to GitHub

From the project folder:

```bash
git status
git add -A
git commit -m "Describe the change"
git push origin main
```

Before starting a new change on another machine, pull the latest version:

```bash
git pull origin main
```

## Project structure

- `apps/editor` — the Vite/React editor application.
- `packages/*` — composition, export, media, and project-model utilities.
- `e2e` — browser-level tests.
