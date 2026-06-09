<template>
  <div class="min-h-full bg-slate-950 text-slate-100">
    <div class="container mx-auto px-4 py-6 max-w-5xl space-y-5">

      <!-- Quest Games section -->
      <div class="card-glass rounded-xl p-5 border border-slate-800/40">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">🏆</span>
            <div>
              <h2 class="font-bold text-white text-sm">ألعاب Discord Quest الحالية</h2>
              <p class="text-xs text-slate-500 mt-0.5">ألعاب تحتاج ١٥ دقيقة للحصول على المكافأة</p>
            </div>
          </div>
          <button @click="loadQuests"
            class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-xs text-amber-400 transition-colors duration-150">
            <span class="text-sm">🔄</span> تحديث
          </button>
        </div>

        <!-- Loading -->
        <div v-if="isLoadingQuests" class="flex items-center gap-3 py-6 justify-center text-slate-500">
          <div class="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full spin-slow"></div>
          <span class="text-sm">جاري تحميل الكويستات…</span>
        </div>

        <!-- Error / note -->
        <div v-else-if="questNote" class="flex items-start gap-3 p-4 bg-slate-800/50 rounded-lg">
          <span class="text-lg shrink-0">ℹ️</span>
          <div>
            <p class="text-sm text-slate-300 mb-1">{{ questNote }}</p>
            <p class="text-xs text-slate-500">ألعاب Quest تتغير بانتظام. استخدم قسم Library للبحث عن أي لعبة وإضافتها.</p>
          </div>
        </div>

        <!-- Quest cards -->
        <div v-else-if="quests.length > 0" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="q in quests" :key="q.id"
            class="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/30 hover:border-amber-500/20 transition-all duration-200 quest-card-glow fade-slide-in">
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl shrink-0">🏅</div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm text-white truncate">
                {{ q.config?.application_name || q.config?.name || 'Unknown Game' }}
              </div>
              <div class="text-xs text-slate-500 mt-0.5">
                {{ q.expires_at ? 'تنتهي: ' + new Date(q.expires_at).toLocaleDateString('ar-SA') : 'نشطة' }}
              </div>
            </div>
            <div class="shrink-0 w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-slate-500">
          <div class="text-3xl mb-2">🏆</div>
          <p class="text-sm">لا توجد كويستات نشطة حالياً</p>
        </div>
      </div>

      <!-- Logs -->
      <div class="card-glass rounded-xl p-5 border border-slate-800/40">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <span>📋</span>
            <h2 class="font-bold text-sm text-white">السجلات</h2>
            <span class="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-slate-400">{{ logs.length }}</span>
          </div>
          <button @click="clearLogs"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-400 transition-colors duration-150">
            مسح
          </button>
        </div>

        <div class="max-h-80 overflow-y-auto space-y-1 font-mono text-xs">
          <div v-if="logs.length === 0" class="text-center py-6 text-slate-600">لا توجد سجلات</div>
          <div v-for="(log, i) in [...logs].reverse()" :key="i"
            class="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-slate-900/40 fade-slide-in">
            <span class="text-slate-600 shrink-0 pt-px">{{ new Date(log.timestamp).toLocaleTimeString('ar') }}</span>
            <span class="shrink-0 font-semibold" :class="{
              'text-sky-400':    log.type === 'info',
              'text-red-400':    log.type === 'error',
              'text-amber-400':  log.type === 'warning',
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
import { onMounted, ref } from 'vue';
import { useGlobalState } from '@/composables/app-state';

const { logs, clearLogs } = useGlobalState();

interface DiscordQuest {
  id: string;
  expires_at?: string;
  config?: { application_id?: string; application_name?: string; name?: string; };
}

const quests         = ref<DiscordQuest[]>([]);
const isLoadingQuests = ref(false);
const questNote      = ref<string | null>(null);

async function loadQuests() {
  isLoadingQuests.value = true;
  questNote.value = null;
  quests.value   = [];
  try {
    const res = await fetch('https://discord.com/api/v10/quests?locale=en-US', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      quests.value = Array.isArray(data) ? data : (data.quests ?? []);
      if (quests.value.length === 0) questNote.value = 'لا توجد كويستات نشطة حالياً على Discord.';
    } else if (res.status === 401 || res.status === 403) {
      questNote.value = 'Discord يتطلب تسجيل الدخول لعرض الكويستات. افتح Discord وأكمل الكويست من هناك.';
    } else {
      questNote.value = `خطأ من Discord (${res.status}). حاول لاحقاً.`;
    }
  } catch {
    questNote.value = 'تعذّر الوصول إلى Discord Quest API. تحقق من الاتصال.';
  } finally {
    isLoadingQuests.value = false;
  }
}

onMounted(loadQuests);
</script>

<style scoped>
@reference "../theme/style.css";
</style>
