<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useFetchGameList }           from '@/composables/fetch-gamelist';
import { useGatewayManager }          from '@/composables/use-gateway';
import { useQuestManager }            from '@/composables/quest-manager';
import { useGlobalState }             from '@/composables/app-state';
import { randomString }               from '@/utils/random-string';
import type { Game }                  from '@/types/types';
import EnsIcons                       from '@/components/EnsIcons.vue';

const { addLog }               = useGlobalState();
const { gameDB, allFetchDone } = useFetchGameList();
const gateway                  = useGatewayManager();
const questMgr                 = useQuestManager();

// ── Connected tokens ──────────────────────────────────────────────────────
const connectedAccounts = computed(() =>
  gateway.accounts.value.filter(a => a.gateway.status.value === 'connected')
);
const connectedTokens = computed(() => connectedAccounts.value.map(a => a.token));
const hasToken        = computed(() => connectedTokens.value.length > 0);

// ── Fetch quests via the real token ───────────────────────────────────────
async function fetchQuests() {
  const accounts = gateway.accounts.value.map(a => ({
    id: a.id, token: a.token, status: a.gateway.status.value,
  }));
  await questMgr.fetchQuestsForAccounts(accounts);
}

// Auto-fetch when a token connects
watch(
  () => gateway.accounts.value.map(a => a.gateway.status.value).join(','),
  () => { if (hasToken.value && questMgr.fetchStatus.value === 'idle') fetchQuests(); }
);

// ── Dynamic quest ↔ game matching ─────────────────────────────────────────
// For each live quest: look up game by application_id from the full gameDB
const questsWithGame = computed(() =>
  questMgr.liveQuests.value.map(q => {
    const appId = questMgr.getQuestApplicationId(q);
    const name  = questMgr.getQuestName(q).toLowerCase();

    // 1. Exact ID match
    let match = appId ? gameDB.value.find(g => g.id === appId) ?? null : null;

    // 2. Name fuzzy match (first word of quest name)
    if (!match && name) {
      const firstWord = name.split(' ')[0];
      match = gameDB.value.find(g =>
        g.name.toLowerCase().includes(firstWord) || firstWord.includes(g.name.toLowerCase().split(' ')[0])
      ) ?? null;
    }

    return { quest: q, game: match };
  })
);

// ── Quick-add to library via sessionStorage ───────────────────────────────
function getAddedIds(): Set<string> {
  try { return new Set((JSON.parse(sessionStorage.getItem('pendingGames') ?? '[]') as Game[]).map(g => g.id)); }
  catch { return new Set(); }
}

function quickAdd(game: Game) {
  const stored: Game[] = JSON.parse(sessionStorage.getItem('pendingGames') ?? '[]');
  if (stored.some(g => g.id === game.id)) return;
  stored.push({ ...game, uid: randomString() });
  sessionStorage.setItem('pendingGames', JSON.stringify(stored));
  addLog('info', `Added to library: ${game.name}`);
}

// ── Enroll & start heartbeat ──────────────────────────────────────────────
async function enrollAndPlay(questId: string, appId: string | null, gameName: string) {
  if (!hasToken.value) { addLog('warning', 'No connected token.'); return; }
  const enrolled = await questMgr.autoEnroll(questId, connectedTokens.value);
  if (enrolled) {
    questMgr.startHeartbeat(questId, connectedTokens.value);
    // Add matching game to library
    const game = appId
      ? gameDB.value.find(g => g.id === appId)
      : gameDB.value.find(g => g.name.toLowerCase().includes(gameName.toLowerCase().split(' ')[0]));
    if (game) {
      quickAdd(game);
      addLog('info', `Enrolled in "${gameName}" — go to Home tab to play it.`);
    }
    setTimeout(() => fetchQuests(), 2000);
  }
}

async function handleClaim(questId: string) {
  await questMgr.claimReward(questId, connectedTokens.value);
  setTimeout(() => fetchQuests(), 2000);
}

function timeUntil(dateStr?: string) {
  if (!dateStr) return null;
  const ms   = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days  = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
}

onMounted(() => {
  if (hasToken.value && questMgr.fetchStatus.value === 'idle') fetchQuests();
});
</script>

<template>
  <div class="min-h-full" style="background:var(--bg-0);color:var(--text-0);">
    <div class="max-w-5xl mx-auto px-4 py-6 space-y-6">

      <!-- ── Header ──────────────────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-bold flex items-center gap-2">
            <span>🏆</span> Discord Quests
          </h1>
          <p class="text-sm mt-1" style="color:var(--text-2);">
            <template v-if="questMgr.fetchStatus.value==='loaded'">
              {{ questMgr.liveQuests.value.length }} كويست نشط — يتم اكتشاف الألعاب تلقائياً من الـ API
            </template>
            <template v-else>
              الكويستات تُجلب تلقائياً بتوكنك وتُطابق مع قاعدة بيانات Discord للألعاب
            </template>
          </p>
        </div>
        <button @click="fetchQuests" :disabled="questMgr.fetchStatus.value==='loading' || !hasToken"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
          style="background:rgba(124,29,74,0.2);border:1px solid rgba(212,64,110,0.25);color:var(--accent-b);">
          <EnsIcons name="refresh" :size="14" :class="questMgr.fetchStatus.value==='loading'?'spin-anim':''"/>
          Refresh
        </button>
      </div>

      <!-- ── No token ─────────────────────────────────────────────────────── -->
      <div v-if="!hasToken"
        class="card-glass rounded-xl p-6 flex items-start gap-4"
        style="border:1px solid rgba(212,64,110,0.2);">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style="background:rgba(124,29,74,0.2);color:var(--accent-b);">
          <EnsIcons name="key" :size="22"/>
        </div>
        <div>
          <p class="font-semibold text-sm" style="color:var(--text-0);">مطلوب توكن Discord</p>
          <p class="text-xs mt-2 leading-relaxed" style="color:var(--text-2);">
            أضف توكنك في تبويب <strong style="color:var(--accent-b);">Home</strong> حتى:
          </p>
          <ul class="mt-2 space-y-1 text-xs" style="color:var(--text-2);">
            <li class="flex items-center gap-2">
              <span style="color:var(--success);">✓</span> يُجلب الكويستات النشطة بحسابك من Discord API مباشرة
            </li>
            <li class="flex items-center gap-2">
              <span style="color:var(--success);">✓</span> يكتشف اللعبة المطلوبة لكل كويست تلقائياً
            </li>
            <li class="flex items-center gap-2">
              <span style="color:var(--success);">✓</span> يُسجّلك (Enroll) ويبدأ الـ Heartbeat للكويست
            </li>
          </ul>
        </div>
      </div>

      <!-- ── Loading ──────────────────────────────────────────────────────── -->
      <div v-else-if="questMgr.fetchStatus.value==='loading'"
        class="card-glass rounded-xl p-12 flex flex-col items-center gap-4">
        <div class="w-8 h-8 border-2 border-t-transparent rounded-full spin-anim"
          style="border-color:var(--accent-b);border-top-color:transparent;"></div>
        <p class="text-sm" style="color:var(--text-2);">جاري جلب كويستاتك من Discord API…</p>
      </div>

      <!-- ── Live quests — auto-detected games ────────────────────────────── -->
      <template v-else-if="questMgr.fetchStatus.value==='loaded' && questMgr.liveQuests.value.length">

        <!-- DB loading notice -->
        <div v-if="!allFetchDone"
          class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style="background:rgba(124,29,74,0.1);border:1px solid rgba(212,64,110,0.15);">
          <div class="w-4 h-4 border-2 border-t-transparent rounded-full spin-anim shrink-0"
            style="border-color:var(--accent-b);border-top-color:transparent;"></div>
          <span style="color:var(--text-2);">جاري تحميل قاعدة بيانات الألعاب لمطابقة الكويستات…</span>
        </div>

        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full dot-blink" style="background:var(--success);"></div>
          <span class="text-sm font-semibold" style="color:var(--success);">
            {{ questMgr.liveQuests.value.length }} كويست نشط
          </span>
          <span v-if="allFetchDone" class="text-xs" style="color:var(--text-3);">
            — تم اكتشاف الألعاب من {{ gameDB.length.toLocaleString() }} لعبة في قاعدة Discord
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div v-for="{quest, game} in questsWithGame" :key="quest.id"
            class="card-glass rounded-xl p-5 transition-all duration-200 fade-slide-in"
            :style="`border:1px solid ${questMgr.isCompleted(quest)?'rgba(31,138,90,0.35)':questMgr.isEnrolled(quest)?'rgba(212,64,110,0.3)':'rgba(196,122,24,0.2)'}`">

            <!-- Quest name + expiry -->
            <div class="flex items-start gap-3 mb-4">
              <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                :style="`background:${questMgr.isCompleted(quest)?'rgba(31,138,90,0.15)':'rgba(196,122,24,0.1)'};color:${questMgr.isCompleted(quest)?'var(--success)':'var(--warn)'}`">
                <EnsIcons :name="questMgr.isCompleted(quest)?'check':'trophy'" :size="20"/>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm" style="color:var(--text-0);">
                  {{ questMgr.getQuestName(quest) }}
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span v-if="timeUntil(quest.expires_at)" class="text-xs" style="color:var(--warn);">
                    ⏳ {{ timeUntil(quest.expires_at) }}
                  </span>
                  <span v-if="questMgr.isCompleted(quest)"
                    class="text-xs px-1.5 py-0.5 rounded-full"
                    style="background:rgba(31,138,90,0.12);border:1px solid rgba(31,138,90,0.2);color:var(--success);">
                    ✓ مكتمل
                  </span>
                  <span v-else-if="questMgr.isEnrolled(quest)"
                    class="text-xs px-1.5 py-0.5 rounded-full"
                    style="background:rgba(212,64,110,0.1);border:1px solid rgba(212,64,110,0.2);color:var(--accent-b);">
                    مسجل
                  </span>
                </div>
              </div>
            </div>

            <!-- Rewards -->
            <div v-if="quest.config?.rewards?.length" class="mb-3 flex flex-wrap gap-1.5">
              <span v-for="r in quest.config.rewards" :key="r.name"
                class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style="background:rgba(196,122,24,0.1);border:1px solid rgba(196,122,24,0.2);color:rgba(212,138,30,0.9);">
                🎁 {{ r.name }}
              </span>
            </div>

            <!-- Auto-detected game ─────────── -->
            <div class="mb-4 rounded-xl p-3"
              :style="game
                ? 'background:rgba(31,138,90,0.08);border:1px solid rgba(31,138,90,0.18);'
                : 'background:rgba(196,48,64,0.06);border:1px solid rgba(196,48,64,0.15);'">
              <div class="flex items-center gap-2">
                <EnsIcons :name="game?'gamepad':'search'" :size="14"
                  :style="`color:${game?'var(--success)':'var(--text-3)'}`"/>
                <span class="text-xs font-semibold"
                  :style="`color:${game?'var(--success)':'var(--text-3)'}`">
                  {{ game ? 'لعبة مكتشفة تلقائياً' : 'لم يُعثر في قاعدة البيانات' }}
                </span>
              </div>
              <template v-if="game">
                <div class="mt-2 flex items-center gap-2 justify-between">
                  <div>
                    <div class="text-sm font-bold" style="color:var(--text-0);">{{ game.name }}</div>
                    <div class="text-xs mt-0.5 font-mono" style="color:var(--text-3);">ID: {{ game.id }}</div>
                  </div>
                  <button @click="quickAdd(game)"
                    :disabled="getAddedIds().has(game.id)"
                    class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
                    :style="getAddedIds().has(game.id)
                      ? 'background:rgba(31,138,90,0.15);border:1px solid rgba(31,138,90,0.25);color:var(--success);'
                      : 'background:rgba(124,29,74,0.25);border:1px solid rgba(212,64,110,0.25);color:var(--accent-b);'">
                    {{ getAddedIds().has(game.id) ? '✓ في المكتبة' : '+ أضف للمكتبة' }}
                  </button>
                </div>
                <div class="mt-2 text-xs" style="color:var(--text-3);">
                  {{ game.executables?.length ?? 0 }} executable{{ (game.executables?.length ?? 0) !== 1 ? 's' : '' }}
                </div>
              </template>
              <template v-else>
                <p class="text-xs mt-1.5" style="color:var(--text-3);">
                  App ID: {{ questMgr.getQuestApplicationId(quest) ?? 'غير معروف' }} — ابحث عنه يدوياً في تبويب Home
                </p>
              </template>
            </div>

            <!-- Progress bar (if enrolled) -->
            <div v-if="questMgr.isEnrolled(quest) && !questMgr.isCompleted(quest)" class="mb-4">
              <div class="flex justify-between text-xs mb-1.5" style="color:var(--text-2);">
                <span>{{ Math.floor(questMgr.getProgressSeconds(quest) / 60) }}m تقدم</span>
                <span>الهدف {{ Math.floor(questMgr.getQuestDuration(quest) / 60) }}m</span>
              </div>
              <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--bg-4);">
                <div class="h-full rounded-full transition-all duration-500"
                  :style="`width:${Math.min(100,(questMgr.getProgressSeconds(quest)/questMgr.getQuestDuration(quest))*100)}%;background:linear-gradient(90deg,var(--accent),var(--accent-b));`"></div>
              </div>
            </div>

            <!-- Heartbeat badge -->
            <div v-if="questMgr.heartbeatCounts.value[quest.id]"
              class="mb-3 flex items-center gap-1.5 text-xs"
              style="color:var(--success);">
              <div class="w-1.5 h-1.5 rounded-full dot-blink" style="background:var(--success);"></div>
              Heartbeat نشط · {{ questMgr.heartbeatCounts.value[quest.id] }} مرسل
            </div>

            <!-- Action button -->
            <button v-if="questMgr.isCompleted(quest)"
              @click="handleClaim(quest.id)"
              class="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
              style="background:rgba(31,138,90,0.2);border:1px solid rgba(31,138,90,0.35);color:var(--success);">
              🎁 Claim Reward
            </button>
            <button v-else
              @click="enrollAndPlay(quest.id, questMgr.getQuestApplicationId(quest), questMgr.getQuestName(quest))"
              class="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
              :style="questMgr.isEnrolled(quest)
                ? 'background:rgba(212,64,110,0.15);border:1px solid rgba(212,64,110,0.25);color:var(--accent-b);'
                : 'background:rgba(196,122,24,0.15);border:1px solid rgba(196,122,24,0.25);color:var(--warn);'">
              {{ questMgr.isEnrolled(quest) ? '▶ تابع اللعب + Heartbeat' : '⚡ Enroll & Start Heartbeat' }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── No active quests ─────────────────────────────────────────────── -->
      <div v-else-if="hasToken && questMgr.fetchStatus.value==='loaded' && !questMgr.liveQuests.value.length"
        class="card-glass rounded-xl p-10 text-center">
        <EnsIcons name="trophy" :size="40" class="mx-auto mb-3 opacity-20 float-anim"/>
        <p class="font-semibold" style="color:var(--text-2);">لا توجد كويستات نشطة الآن</p>
        <p class="text-xs mt-2" style="color:var(--text-3);">
          يفتح Discord كويستات جديدة بشكل دوري. تحقق لاحقاً أو اضغط Refresh.
        </p>
      </div>

      <!-- ── Error ────────────────────────────────────────────────────────── -->
      <div v-else-if="hasToken && questMgr.fetchStatus.value==='error'"
        class="card-glass rounded-xl p-6 flex items-center gap-3"
        style="border:1px solid rgba(196,48,64,0.25);">
        <EnsIcons name="warning" :size="20" style="color:#e05060;flex-shrink:0;"/>
        <div>
          <p class="text-sm font-semibold" style="color:#e05060;">خطأ في الاتصال بـ Discord API</p>
          <p class="text-xs mt-1" style="color:var(--text-3);">تحقق من التوكن أو الاتصال ثم اضغط Refresh.</p>
        </div>
      </div>

      <!-- ── How it works ─────────────────────────────────────────────────── -->
      <div class="card-glass rounded-xl p-5">
        <h3 class="text-sm font-semibold flex items-center gap-2 mb-4" style="color:var(--text-1);">
          📖 كيف يعمل نظام الكشف التلقائي؟
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div v-for="(step, i) in [
            { icon: '🔑', title: 'أضف التوكن', desc: 'البرنامج يستخدم توكنك لطلب قائمة الكويستات من Discord API مباشرة.' },
            { icon: '🔍', title: 'كشف تلقائي', desc: 'كل كويست فيه application_id — البرنامج يبحث عن اللعبة المقابلة في قاعدة Discord (آلاف الألعاب).' },
            { icon: '⚡', title: 'Enroll + Heartbeat', desc: 'بضغطة واحدة: يُسجّلك في الكويست، يُضيف اللعبة للمكتبة، ويبدأ Heartbeat لـ Discord API.' },
          ]" :key="i"
            class="flex flex-col items-center text-center p-4 rounded-xl gap-2"
            style="background:var(--bg-3);">
            <div class="text-2xl float-anim" :style="`animation-delay:${i*0.3}s`">{{ step.icon }}</div>
            <div class="font-semibold text-sm" style="color:var(--text-0);">{{ step.title }}</div>
            <div class="text-xs leading-relaxed" style="color:var(--text-3);">{{ step.desc }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@reference "../theme/style.css";
</style>
