<script setup lang="ts">
import EnsIcons from './EnsIcons.vue';
</script>

<template>
  <div class="flex flex-col min-h-dvh" style="background: var(--bg-0); color: var(--text-0);">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <header class="shrink-0 z-50 sticky top-0"
      style="background: rgba(14,5,16,0.92); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(180,60,100,0.15);">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

        <!-- Logo + Brand -->
        <div class="flex items-center gap-3 shrink-0">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center logo-glow shrink-0"
            style="background: linear-gradient(135deg, #7c1d4a, #c4356b);">
            <EnsIcons name="gamepad" :size="16" style="color: #fff;" />
          </div>
          <span class="font-bold text-sm tracking-wide" style="color: var(--text-0);">Ens Quests</span>
        </div>

        <!-- Credits (center) -->
        <div class="hidden sm:flex items-center gap-3 text-xs credit-float" style="color: var(--text-2);">
          <span class="font-semibold" style="color: var(--accent-b);">Ahmed. (4_3a)</span>
          <span style="color: var(--text-3);">|</span>
          <!-- Discord -->
          <a href="https://discord.gg/ens" target="_blank" rel="noopener"
            class="flex items-center gap-1 transition-all duration-200 hover:opacity-80"
            style="color: #7289da; text-decoration: none;">
            <EnsIcons name="discord" :size="13" />
            <span>discord.gg/ens</span>
          </a>
          <span style="color: var(--text-3);">|</span>
          <!-- Instagram -->
          <a href="https://instagram.com/a_13qn" target="_blank" rel="noopener"
            class="flex items-center gap-1 transition-all duration-200 hover:opacity-80"
            style="color: #e1306c; text-decoration: none;">
            <EnsIcons name="instagram" :size="13" />
            <span>a_13qn</span>
          </a>
        </div>

        <!-- Mobile credits -->
        <div class="flex sm:hidden items-center gap-2 text-xs">
          <a href="https://discord.gg/ens" target="_blank" rel="noopener" style="color: #7289da;">
            <EnsIcons name="discord" :size="15" />
          </a>
          <a href="https://instagram.com/a_13qn" target="_blank" rel="noopener" style="color: #e1306c;">
            <EnsIcons name="instagram" :size="15" />
          </a>
        </div>

      </div>
    </header>

    <!-- ── Main Content ───────────────────────────────────────────────── -->
    <main class="flex-grow overflow-y-auto">
      <slot />
    </main>

    <!-- ── Footer ─────────────────────────────────────────────────────── -->
    <footer class="shrink-0 py-4 px-6 text-center text-xs"
      style="color: var(--text-3); border-top: 1px solid rgba(180,60,100,0.1);">
      <span class="font-medium" style="color: var(--accent-b);">Ahmed. (4_3a)</span>
      <span class="mx-2">·</span>
      <a href="https://discord.gg/ens" target="_blank" rel="noopener"
        class="hover:opacity-80 transition-opacity" style="color: #7289da; text-decoration: none;">
        discord.gg/ens
      </a>
      <span class="mx-2">·</span>
      <a href="https://instagram.com/a_13qn" target="_blank" rel="noopener"
        class="hover:opacity-80 transition-opacity" style="color: #e1306c; text-decoration: none;">
        @a_13qn
      </a>
    </footer>

  </div>
</template>
