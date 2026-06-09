<script setup lang="ts">
import EnsIcons from './EnsIcons.vue';
import { useGlobalState, Pages } from '@/composables/app-state';

const { page, setPage } = useGlobalState();

const navItems = [
  { id: Pages.HOME,       label: 'Home',        icon: 'gamepad'  },
  { id: Pages.QUESTS,     label: 'Quests',       icon: 'trophy'   },
  { id: Pages.PLAYGROUND, label: 'Logs',         icon: 'terminal' },
] as const;
</script>

<template>
  <div class="flex flex-col min-h-dvh" style="background:var(--bg-0);color:var(--text-0);">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <header class="shrink-0 z-50 sticky top-0"
      style="background:rgba(14,5,16,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(180,60,100,0.15);">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

        <!-- Logo + Brand -->
        <div class="flex items-center gap-3 shrink-0">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center logo-glow shrink-0"
            style="background:linear-gradient(135deg,#7c1d4a,#c4356b);">
            <EnsIcons name="gamepad" :size="16" style="color:#fff;"/>
          </div>
          <span class="font-bold text-sm tracking-wide" style="color:var(--text-0);">Ens Quests</span>
        </div>

        <!-- Navigation tabs (center) -->
        <nav class="flex items-center gap-1 rounded-xl p-1" style="background:var(--bg-2);">
          <button
            v-for="item in navItems"
            :key="item.id"
            @click="setPage(item.id)"
            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            :style="page === item.id
              ? 'background:rgba(212,64,110,0.2);border:1px solid rgba(212,64,110,0.3);color:var(--accent-b);'
              : 'background:transparent;border:1px solid transparent;color:var(--text-3);'"
            @mouseenter="if(page!==item.id){($event.currentTarget as HTMLElement).style.color='var(--text-1)';}"
            @mouseleave="if(page!==item.id){($event.currentTarget as HTMLElement).style.color='var(--text-3)';}">
            <EnsIcons :name="item.icon" :size="13"/>
            <span class="hidden sm:inline">{{ item.label }}</span>
          </button>
        </nav>

        <!-- Credits (right) -->
        <div class="hidden sm:flex items-center gap-3 text-xs credit-float shrink-0" style="color:var(--text-2);">
          <span class="font-semibold" style="color:var(--accent-b);">Ahmed. (4_3a)</span>
          <span style="color:var(--text-3);">|</span>
          <a href="https://discord.gg/ens" target="_blank" rel="noopener"
            class="flex items-center gap-1 transition-all duration-200 hover:opacity-80"
            style="color:#7289da;text-decoration:none;">
            <EnsIcons name="discord" :size="13"/>
            <span>discord.gg/ens</span>
          </a>
          <span style="color:var(--text-3);">|</span>
          <a href="https://instagram.com/a_13qn" target="_blank" rel="noopener"
            class="flex items-center gap-1 transition-all duration-200 hover:opacity-80"
            style="color:#e1306c;text-decoration:none;">
            <EnsIcons name="instagram" :size="13"/>
            <span>a_13qn</span>
          </a>
        </div>

        <!-- Mobile icons only -->
        <div class="flex sm:hidden items-center gap-2 text-xs">
          <a href="https://discord.gg/ens" target="_blank" rel="noopener" style="color:#7289da;">
            <EnsIcons name="discord" :size="15"/>
          </a>
          <a href="https://instagram.com/a_13qn" target="_blank" rel="noopener" style="color:#e1306c;">
            <EnsIcons name="instagram" :size="15"/>
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
      style="color:var(--text-3);border-top:1px solid rgba(180,60,100,0.1);">
      <span class="font-medium" style="color:var(--accent-b);">Ahmed. (4_3a)</span>
      <span class="mx-2">·</span>
      <a href="https://discord.gg/ens" target="_blank" rel="noopener"
        class="hover:opacity-80 transition-opacity" style="color:#7289da;text-decoration:none;">
        discord.gg/ens
      </a>
      <span class="mx-2">·</span>
      <a href="https://instagram.com/a_13qn" target="_blank" rel="noopener"
        class="hover:opacity-80 transition-opacity" style="color:#e1306c;text-decoration:none;">
        @a_13qn
      </a>
    </footer>

  </div>
</template>
