---
name: Vite config complexity
description: Adding async middleware plugins to vite.config.ts breaks the dev server startup in Replit.
---

**Rule:** Keep vite.config.ts simple and synchronous. Do not add async express-style middleware or complex configureServer plugins — they prevent Vite from binding to port 5000 in time for the workflow health check.

**Why:** Replit workflow tool waits for the port to open within a timeout. Complex startup logic delays this and triggers a DIDNT_OPEN_A_PORT failure.

**How to apply:** If API proxying is needed, use Vite's built-in `server.proxy` config (simple object form), not custom `configureServer` middleware.
