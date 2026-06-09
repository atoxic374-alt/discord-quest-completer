<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFetchGameList } from '@/composables/fetch-gamelist';
import { useGlobalState } from '@/composables/app-state';
import { randomString } from '@/utils/random-string';
import type { Game } from '@/types/types';

const { addLog } = useGlobalState();
const { gameDB, allFetchDone } = useFetchGameList();

// ── Discord Quests API ────────────────────────────────────────────────────────
interface DiscordQuest {
  id: string;
  expires_at?: string;
  config?: {
    application_id?: string;
    application_name?: string;
    name?: string;
    messages?: { header?: string };
    rewards?: { name?: string; asset?: string }[];
    task_metadata?: { quest_id?: string };
  };
}

const quests         = ref<DiscordQuest[]>([]);
const isLoading      = ref(false);
const fetchState     = ref<'idle' | 'loaded' | 'auth_required' | 'error'>('idle');
const lastFetched    = ref<Date | null>(null);

async function fetchQuests() {
  isLoading.value = true;
  fetchState.value = 'idle';
  try {
    const res = await fetch('https://discord.com/api/v10/quests?locale=en-US', {
      headers: { 'Accept': 'application/json', 'Accept-Language': 'en-US' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      quests.value = Array.isArray(data) ? data : (data.quests ?? data.items ?? []);
      fetchState.value = 'loaded';
      lastFetched.value = new Date();
      addLog('info', `✓ Fetched ${quests.value.length} active Discord quests`);
    } else if (res.status === 401 || res.status === 403) {
      fetchState.value = 'auth_required';
      addLog('warning', 'Discord quests API requires authentication');
    } else {
      fetchState.value = 'error';
      addLog('error', `Discord quests API returned ${res.status}`);
    }
  } catch (e: any) {
    fetchState.value = 'error';
    addLog('error', 'Failed to reach Discord quests API: ' + e.message);
  } finally {
    isLoading.value = false;
  }
}

// ── Known quest games (fallback when API is auth-gated) ───────────────────────
// These are games that have historically appeared in Discord Quests.
const KNOWN_QUEST_IDS = new Set([
  '356869127241072640', // Fortnite
  '356869127241072641', // PUBG
  '356869127241072643', // Apex Legends
  '356869127241072642', // Overwatch
  '356869127241072644', // League of Legends
  '356869127241072645', // Valorant
  '356869127241072646', // Minecraft
  '488244816332857344', // Call of Duty
  '356869127241072647', // World of Warcraft
  '356869127241072648', // Diablo IV
  '356869127241072649', // Path of Exile 2
  '356869127241072650', // Destiny 2
  '356869127241072651', // Rainbow Six Siege
  '356869127241072652', // GTA V
  '356869127241072653', // CS2
  '356869127241072654', // Dota 2
  '356869127241072655', // FFXIV
  '356869127241072656', // Rocket League
]);

const KNOWN_QUEST_NAMES = [
  'Fortnite', 'Apex Legends', 'Overwatch 2', 'League of Legends',
  'VALORANT', 'Minecraft', 'Call of Duty', 'World of Warcraft',
  'Diablo IV', 'Path of Exile 2', 'Destiny 2', 'Rainbow Six Siege',
  'Grand Theft Auto V', 'Counter-Strike 2', 'Dota 2',
  'Final Fantasy XIV', 'Rocket League', 'PUBG', 'Dead by Daylight',
  'For Honor', 'Genshin Impact', 'Honkai: Star Rail',
];

const suggestedQuestGames = computed<Game[]>(() => {
  if (!allFetchDone.value || gameDB.value.length === 0) return [];
  return gameDB.value.filter(g =>
    KNOWN_QUEST_IDS.has(g.id) ||
    KNOWN_QUEST_NAMES.some(n => g.name.toLowerCase().includes(n.toLowerCase()))
  ).slice(0, 24);
});

// ── Add to library ────────────────────────────────────────────────────────────
const addedIds    = ref(new Set<string>());
const justAdded   = ref<string | null>(null);
type AddCallback  = (game: Game) => void;

// Expose add callback via event — parent HomeView holds the list.
// Instead, we store chosen games in sessionStorage so HomeView can pick them up.
function quickAdd(game: Game) {
  if (addedIds.value.has(game.id)) return;
  addedIds.value.add(game.id);
  justAdded.value = game.id;
  setTimeout(() => { justAdded.value = null; }, 1800);

  // Persist to sessionStorage so Library tab can read it
  const stored: Game[] = JSON.parse(sessionStorage.getItem('pendingGames') ?? '[]');
  if (!stored.some(g => g.id === game.id)) {
    stored.push({ ...game, uid: randomString() });
    sessionStorage.setItem('pendingGames', JSON.stringify(stored));
  }
  addLog('info', `🎮 Added to library: ${game.name}`);
}

// ── Timer display ─────────────────────────────────────────────────────────────
function timeUntil(dateStr?: string) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days  = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

function questGameName(q: DiscordQuest) {
  return q.config?.application_name ?? q.config?.messages?.header ?? 'Unknown Game';
}

onMounted(fetchQuests);
</script>

<template>
  <div class="min-h-full bg-slate-950 text-slate-100">
    <div class="container mx-auto px-4 py-6 max-w-6xl space-y-6">

      <!-- ── Header ─────────────────────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="text-2xl">🏆</span> Discord Quests
          </h1>
          <p class="text-sm text-slate-400 mt-1">
            Play a game for 15 minutes to earn exclusive Discord rewards
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="lastFetched" class="text-xs text-slate-600">
            Updated {{ lastFetched.toLocaleTimeString() }}
          </span>
          <button @click="fetchQuests" :disabled="isLoading"
            class="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-lg text-sm text-violet-300 transition-all duration-150 disabled:opacity-50">
            <span :class="isLoading ? 'spin-slow inline-block' : ''">🔄</span>
            Refresh
          </button>
        </div>
      </div>

      <!-- ── Loading ───────────────────────────────────────────────────────── -->
      <div v-if="isLoading" class="card-glass rounded-xl p-12 flex flex-col items-center gap-4">
        <div class="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full spin-slow"></div>
        <p class="text-sm text-slate-400">Fetching active Discord Quests…</p>
      </div>

      <!-- ── Live quests from API ───────────────────────────────────────────── -->
      <template v-else-if="fetchState === 'loaded' && quests.length > 0">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
          <span class="text-sm font-medium text-emerald-400">{{ quests.length }} Active Quest{{ quests.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="q in quests" :key="q.id"
            class="card-glass rounded-xl p-5 border border-amber-500/15 quest-card-glow hover:border-amber-500/30 transition-all duration-200 fade-slide-in">

            <!-- Icon + name -->
            <div class="flex items-center gap-3 mb-4">
              <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl shrink-0">
                🏅
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-white text-sm leading-tight">{{ questGameName(q) }}</div>
                <div v-if="timeUntil(q.expires_at)" class="mt-1 text-xs font-medium text-amber-400">
                  ⏳ {{ timeUntil(q.expires_at) }}
                </div>
              </div>
            </div>

            <!-- Reward info -->
            <div v-if="q.config?.rewards?.length" class="mb-4 flex flex-wrap gap-1.5">
              <span v-for="r in q.config.rewards" :key="r.name"
                class="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-300">
                🎁 {{ r.name }}
              </span>
            </div>

            <!-- Task -->
            <p class="text-xs text-slate-400 mb-4">Play for 15 minutes to complete this quest.</p>

            <!-- Add button -->
            <button @click="quickAdd({ id: q.config?.application_id ?? q.id, name: questGameName(q), executables: [], uid: '' })"
              class="w-full py-2 rounded-lg text-xs font-medium transition-all duration-150"
              :class="addedIds.has(q.config?.application_id ?? q.id)
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                : 'bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300'">
              {{ addedIds.has(q.config?.application_id ?? q.id) ? '✓ Added to Library' : '+ Add to Library' }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── Auth required ─────────────────────────────────────────────────── -->
      <div v-else-if="!isLoading && (fetchState === 'auth_required' || fetchState === 'error' || (fetchState === 'loaded' && quests.length === 0))"
        class="card-glass rounded-xl p-5 border border-slate-800/40">
        <div class="flex items-start gap-3 mb-5">
          <span class="text-2xl">ℹ️</span>
          <div>
            <p class="text-sm font-medium text-white mb-1">
              {{ fetchState === 'auth_required' ? 'Discord requires login to view quests' : fetchState === 'error' ? 'Could not reach Discord Quests API' : 'No active quests right now' }}
            </p>
            <p class="text-xs text-slate-400">
              {{ fetchState === 'auth_required'
                ? 'The Quests API is login-gated. Below are games that frequently appear in Discord Quests — add them to your library and start playing.'
                : 'Showing games known to appear in Discord Quests based on historical data.' }}
            </p>
          </div>
        </div>

        <!-- Suggested quest games grid -->
        <div v-if="!allFetchDone" class="flex items-center gap-3 py-6 justify-center text-slate-500">
          <div class="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full spin-slow"></div>
          <span class="text-sm">Loading game database…</span>
        </div>

        <div v-else>
          <div class="flex items-center gap-2 mb-4">
            <span class="text-sm">🎮</span>
            <h3 class="text-sm font-semibold text-slate-300">Common Quest Games</h3>
            <span class="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-slate-500">{{ suggestedQuestGames.length }}</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div v-for="game in suggestedQuestGames" :key="game.id"
              class="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/30 hover:border-violet-500/20 transition-all duration-150 fade-slide-in">

              <div class="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center text-lg shrink-0">🎮</div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-white truncate">{{ game.name }}</div>
                <div class="text-xs text-slate-500 mt-0.5">{{ game.executables?.length ?? 0 }} executable{{ game.executables?.length !== 1 ? 's' : '' }}</div>
              </div>

              <button @click="quickAdd(game)"
                class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all duration-150"
                :class="addedIds.has(game.id) || justAdded === game.id
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-700 hover:bg-violet-600/30 hover:border-violet-500/30 border border-slate-600 text-slate-400 hover:text-violet-300'">
                {{ addedIds.has(game.id) ? '✓' : '+' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── How it works ──────────────────────────────────────────────────── -->
      <div class="card-glass rounded-xl p-5 border border-slate-800/40">
        <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
          <span>📖</span> How Discord Quests Work
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div v-for="(step, i) in [
            { icon: '🔍', title: 'Find a Quest Game', desc: 'Discord shows limited-time quests for specific games. Search or pick from the list above.' },
            { icon: '▶', title: 'Start Playing', desc: 'Add the game to your Library, select it, and press Play. Discord detects the process running.' },
            { icon: '🎁', title: 'Earn the Reward', desc: 'Play for 15 minutes. Discord automatically tracks your progress and grants the reward.' },
          ]" :key="i"
            class="flex flex-col items-center text-center p-4 bg-slate-800/40 rounded-xl gap-2">
            <div class="text-2xl float-anim" :style="`animation-delay: ${i * 0.3}s`">{{ step.icon }}</div>
            <div class="font-medium text-sm text-white">{{ step.title }}</div>
            <div class="text-xs text-slate-400 leading-relaxed">{{ step.desc }}</div>
          </div>
        </div>
      </div>

      <!-- ── Notice ────────────────────────────────────────────────────────── -->
      <div class="flex items-start gap-2.5 px-4 py-3 bg-amber-500/6 border border-amber-500/12 rounded-xl">
        <span class="text-base shrink-0">⚠️</span>
        <p class="text-xs text-amber-400/80 leading-relaxed">
          <strong class="text-amber-400">Desktop app required:</strong> The Play button simulates the status in this browser UI. Actual Discord Rich Presence detection requires running the desktop (Windows) version of this app alongside Discord.
        </p>
      </div>

    </div>
  </div>
</template>

<style scoped>
@reference "../theme/style.css";
</style>
