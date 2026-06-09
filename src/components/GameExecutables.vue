<template>
  <div class="space-y-2">
    <div v-if="filteredExecutables.length === 0"
      class="text-xs py-3 text-center rounded-lg"
      style="color: var(--text-3); background: var(--bg-3); border: 1px dashed rgba(180,60,100,0.2);">
      No Windows executables found
    </div>
    <div v-for="exe in filteredExecutables" :key="exe.name"
      class="flex items-center gap-3 p-3 rounded-xl transition-all duration-150"
      style="background: var(--bg-3); border: 1px solid rgba(180,60,100,0.12);"
      @mouseenter="($event.currentTarget as HTMLElement).style.borderColor='rgba(212,64,110,0.22)'"
      @mouseleave="($event.currentTarget as HTMLElement).style.borderColor='rgba(180,60,100,0.12)'">

      <!-- OS badge -->
      <div class="shrink-0 px-2 py-0.5 rounded-md text-xs font-mono"
        style="background: var(--bg-4); color: var(--text-2); border: 1px solid rgba(180,60,100,0.15);">
        {{ exe.os }}
      </div>

      <!-- Path breadcrumbs -->
      <div class="flex-1 min-w-0 overflow-hidden">
        <div class="flex flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none fade-right">
          <template v-for="(seg, i) in splitName(exe)" :key="i">
            <span v-if="i > 0" class="shrink-0 text-xs" style="color: var(--text-3);">/</span>
            <span class="shrink-0 px-1.5 py-0.5 rounded text-xs font-mono whitespace-nowrap"
              style="background: rgba(124,29,74,0.15); color: var(--text-1);">
              {{ seg }}
            </span>
          </template>
        </div>
      </div>

      <!-- Action button -->
      <button
        class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
        :style="exe.is_running
          ? 'background: rgba(196,48,64,0.15); border: 1px solid rgba(196,48,64,0.3); color: #e05060;'
          : 'background: rgba(124,29,74,0.25); border: 1px solid rgba(212,64,110,0.25); color: var(--accent-b);'"
        @click="handleLaunch(exe)">
        <svg v-if="exe.is_running" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
        {{ exe.is_running ? 'Stop' : 'Play' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EXECUTABLE_OS, GameActionsKey } from '@/constants/constants';
import { GameActionsProvider, type Game, type GameExecutable } from '@/types/types';
import { computed, inject } from 'vue';

const props = defineProps<{ game: Game }>();
const emit  = defineEmits<{
  play:            [{ game: Game; executable: GameExecutable }]
  stop:            [{ game: Game; executable: GameExecutable }]
  install_and_play:[{ game: Game; executable: GameExecutable }]
}>();

const gameActions = inject<GameActionsProvider>(GameActionsKey);

const filteredExecutables = computed(() =>
  props.game.executables.filter(e =>
    e.os !== EXECUTABLE_OS.LINUX &&
    e.os !== EXECUTABLE_OS.DARWIN &&
    !hasIllegalChars(e.name)
  )
);

function splitName(exe: GameExecutable) {
  const parts = exe.name.split(/\\|\//);
  const last  = parts.pop()!;
  const name  = last.includes('.') ? last.split('.').slice(0, -1).join('.') : last;
  return [...parts, name].filter(Boolean);
}

function getPath(exe: GameExecutable) {
  return exe.name.split(/\\|\//).slice(0, -1).join('\\');
}

function getFilename(exe: GameExecutable) {
  return exe.name.split(/\\|\//).pop();
}

function hasIllegalChars(p: string) {
  return ['>', '<', ':', '"', '|', '?', '*'].some(c => p.includes(c));
}

function handleLaunch(exe: GameExecutable) {
  const payload = { game: props.game, executable: { ...exe, path: getPath(exe), segments: splitName(exe).length, filename: getFilename(exe) } };
  if (exe.is_running) emit('stop', payload);
  else if (!gameActions?.isGameExecutableInstalled(exe)) emit('install_and_play', payload);
  else emit('play', payload);
}
</script>

<style scoped>
.fade-right  { -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); mask-image: linear-gradient(to right, black 85%, transparent 100%); }
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
