---
name: Replit startup fix
description: How to get bun install working when rust-analyzer consumes all RAM
---

## The problem
rust-analyzer (PID varies) consumes ~5 GB of the 8 GB RAM because src-tauri/ is in the workspace. This leaves < 100 MB free, causing every package manager (npm, pnpm, bun) to be OOM-killed silently (exit code -1).

## The fix
1. `kill -9 <rust-analyzer PID>` — frees ~5 GB immediately
2. Run `bun install` right after (before rust-analyzer restarts)
3. Workflow command must be `bun install && bun run dev`

## Why bun, not npm/pnpm
- `packageManager: "pnpm@8.15.3"` in package.json forced pnpm to download a different version — caused silent crash
- npm install timed out at 90s even with flags
- bun install completed in 851ms once memory was free

## What was removed from package.json
- Removed `packageManager` field (was pinning pnpm@8.15.3 — mismatched with system pnpm@10.26.1)
- Removed `@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-*` — not needed for web preview, caused slow install
- Removed `rust-stable` from .replit modules (reduces rust-analyzer activation) — done via configureWorkflow

**Why:** The desktop Tauri build is separate; the Replit environment only needs the Vue/Vite web frontend.

## HMR fix for Replit proxy
```ts
hmr: process.env.REPLIT_DEV_DOMAIN ? {
  protocol: 'wss',
  clientPort: 443,
  host: process.env.REPLIT_DEV_DOMAIN,
} : { clientPort: 443 },
```
