---
name: Game list source
description: Where to fetch Discord detectable games list and CORS situation.
---

**Rule:** Fetch the Discord detectable games list directly from `https://markterence.github.io/discord-quest-completer/detectable.json` — no proxy needed.

**Why:** GitHub Pages serves static files with `Access-Control-Allow-Origin: *`, so browser fetch works without a proxy. The Discord direct API (`https://discord.com/api/applications/detectable`) may have CORS issues in browser context.

**How to apply:** Primary source = GitHub mirror. Fallback = Discord direct API. Last resort = bundled `src/assets/gamelist.json`.
