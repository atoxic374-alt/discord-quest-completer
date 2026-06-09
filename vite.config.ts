import path from 'node:path'
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],

  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, 'src')}/`,
    },
  },

  clearScreen: false,

  server: {
    port: 5000,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: process.env.REPLIT_DEV_DOMAIN ? {
      protocol: 'wss',
      clientPort: 443,
      host: process.env.REPLIT_DEV_DOMAIN,
    } : { clientPort: 443 },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
