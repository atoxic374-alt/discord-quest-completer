<template>
  <div class="min-h-full bg-slate-950 text-slate-100">
    <div class="container mx-auto px-4 py-6 max-w-4xl">

      <div class="card-glass rounded-xl p-5 border border-slate-800/40">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <span>📋</span>
            <h2 class="font-bold text-sm text-white">Activity Logs</h2>
            <span class="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-slate-400">{{ logs.length }}</span>
          </div>
          <button @click="clearLogs"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-400 transition-colors duration-150">
            Clear
          </button>
        </div>

        <div class="max-h-[calc(100vh-220px)] overflow-y-auto space-y-1 font-mono text-xs">
          <div v-if="logs.length === 0" class="text-center py-12 text-slate-600">
            <div class="text-3xl mb-2">📭</div>
            <p>No logs yet</p>
          </div>
          <div v-for="(log, i) in [...logs].reverse()" :key="i"
            class="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-900 transition-colors duration-100 fade-slide-in">
            <span class="text-slate-600 shrink-0 tabular-nums">
              {{ new Date(log.timestamp).toLocaleTimeString() }}
            </span>
            <span class="shrink-0 font-bold w-14" :class="{
              'text-sky-400':     log.type === 'info',
              'text-red-400':     log.type === 'error',
              'text-amber-400':   log.type === 'warning',
              'text-emerald-400': log.type === 'debug',
            }">[{{ log.type.toUpperCase() }}]</span>
            <span class="text-slate-300 break-all">{{ log.message }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { useGlobalState } from '@/composables/app-state';
const { logs, clearLogs } = useGlobalState();
</script>

<style scoped>
@reference "../theme/style.css";
</style>
