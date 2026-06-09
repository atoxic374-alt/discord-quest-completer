<template>
  <div class="space-y-2">
    <div v-if="filteredExecutables.length === 0" class="text-xs text-slate-500 py-2 text-center">
      لا توجد ملفات تنفيذية لنظام Windows
    </div>
    <div v-for="exe in filteredExecutables" :key="exe.name"
      class="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/30 transition-all duration-150">

      <!-- OS badge -->
      <div class="shrink-0 px-2 py-0.5 bg-slate-700/60 rounded text-xs text-slate-400 font-mono">
        {{ exe.os }}
      </div>

      <!-- Path breadcrumbs -->
      <div class="flex-1 min-w-0 overflow-hidden">
        <div class="flex flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none fade-right">
          <template v-for="(seg, i) in splitName(exe)" :key="i">
            <span v-if="i > 0" class="text-slate-600 shrink-0 text-xs">/</span>
            <span class="shrink-0 px-1.5 py-0.5 bg-slate-900/60 rounded text-xs font-mono text-slate-300 whitespace-nowrap">{{ seg }}</span>
          </template>
        </div>
      </div>

      <!-- Action button -->
      <button
        class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
        :class="[
          exe.is_running
            ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400'
            : 'bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300'
        ]"
        @click="handleLaunch(exe)">
        <span>{{ exe.is_running ? '■' : '▶' }}</span>
        {{ exe.is_running ? 'إيقاف' : 'تشغيل' }}
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
.fade-right { -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); mask-image: linear-gradient(to right, black 85%, transparent 100%); }
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
