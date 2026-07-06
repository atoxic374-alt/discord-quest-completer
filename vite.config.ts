import path from 'node:path'
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from '@tailwindcss/vite'

const PORT = parseInt(process.env.PORT ?? '5000', 10);
const isReplit = !!process.env.REPLIT_DEV_DOMAIN;

export default defineConfig({
  plugins: [vue(), tailwindcss()],

  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, 'src')}/`,
    },
  },

  clearScreen: false,

  server: {
    port: PORT,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: isReplit ? {
      protocol: 'wss',
      clientPort: 443,
      host: process.env.REPLIT_DEV_DOMAIN,
    } : true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      '/discord-api': {
        target: 'https://discord.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/discord-api/, '/api'),
        secure: true,
      },
    },
  },
});
