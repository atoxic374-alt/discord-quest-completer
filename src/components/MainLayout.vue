<script setup lang="ts">
import { Pages, useGlobalState } from '@/composables/app-state';
const { page, setPage } = useGlobalState();

const tabs = [
  { id: Pages.HOME,       label: 'Library',  icon: '🎯' },
  { id: Pages.QUESTS,     label: 'Quests',   icon: '🏆' },
  { id: Pages.PLAYGROUND, label: 'Logs',     icon: '📋' },
]
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-slate-950">

    <header class="shrink-0 border-b border-slate-800/60 bg-slate-900/80 backdrop-blur-md z-40">
      <div class="container mx-auto px-5 h-14 flex items-center justify-between">

        <!-- Logo -->
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
            <span class="text-base leading-none select-none">🎮</span>
          </div>
          <span class="font-bold text-white text-sm tracking-wide">Quest Handler</span>
        </div>

        <!-- Tabs -->
        <nav class="flex items-center gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="setPage(tab.id)"
            :class="[
              'relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
              page === tab.id
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            ]"
          >
            <span>{{ tab.icon }}</span>
            {{ tab.label }}
          </button>
        </nav>

        <!-- Status -->
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
          <span>Online</span>
        </div>

      </div>
    </header>

    <main class="flex-grow overflow-y-auto">
      <slot />
    </main>

  </div>
</template>
