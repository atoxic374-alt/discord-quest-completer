<script setup lang="ts">
import { ref, computed, useTemplateRef, shallowRef, provide, onMounted, watch } from 'vue';
import { onClickOutside, refDebounced } from '@vueuse/core';
import { useFuse } from '@vueuse/integrations/useFuse';
import { randomString } from '@/utils/random-string';
import { GameActionsProvider, GameExecutable, type Game } from '@/types/types';
import IconVerified from '@/components/IconVerified.vue';
import GameExecutables from '@/components/GameExecutables.vue';
import { GameActionsKey } from '@/constants/constants';
import { useFetchGameList } from '@/composables/fetch-gamelist';
import { UseFuseOptions } from '@vueuse/integrations';
import Fuse from 'fuse.js';
import { useGlobalState } from '@/composables/app-state';
import { useGatewayManager } from '@/composables/use-gateway';

const { addLog } = useGlobalState();
const gateway = useGatewayManager();

const {
  gameDB, isLoadingGH, isReadyGH, allFetchDone, fetchGameList
} = useFetchGameList();

// ── Search ──────────────────────────────────────────────
const searchQuery    = shallowRef('');
const debouncedQuery = refDebounced(searchQuery, 250);
const searchOpen     = ref(false);
const isOnResults    = ref(false);
const searchRef      = useTemplateRef<HTMLElement>('searchRef');

onClickOutside(searchRef, () => { searchOpen.value = false; });

const COPYRIGHT_SYMBOL  = '\u00A9';
const TRADEMARK_SYMBOL  = '\u2122';
const REGISTERED_SYMBOL = '\u00AE';
const ignoredRe = new RegExp(`[${[COPYRIGHT_SYMBOL, TRADEMARK_SYMBOL, REGISTERED_SYMBOL].join('')}]`, 'g');

const fuseOpts = computed<UseFuseOptions<Game>>(() => ({
  fuseOptions: {
    keys: [
      { name: 'name',             weight: 0.7 },
      { name: 'aliases',          weight: 0.2 },
      { name: 'executables.name', weight: 0.1 },
    ],
    getFn: (obj: any, path: string[] | string) => {
      const v = Fuse.config.getFn(obj, path);
      return typeof v === 'string' ? v.replace(ignoredRe, '') : v;
    },
    isCaseSensitive: false,
    threshold:       0.4,
    includeScore:    true,
  },
  resultLimit:          15,
  matchAllWhenSearchEmpty: false,
}));

const { results: searchResults } = useFuse(debouncedQuery, gameDB, fuseOpts);

// ── Selected games ───────────────────────────────────────
const gameList       = ref<Game[]>([]);
const selectedGameId = ref<string | null | undefined>(null);
const currentlyPlayingUid = ref<string | null>(null);
const forceKey       = ref(0);

const selectedGame = computed(() =>
  gameList.value.find(g => g.uid === selectedGameId.value) ?? null
);
const playingGame = computed(() =>
  gameList.value.find(g => g.uid === currentlyPlayingUid.value) ?? null
);

function addGame(game: Game) {
  if (!gameList.value.some(g => g.id === game.id)) {
    gameList.value.push({ ...game, uid: randomString(), is_installed: false, is_running: false });
  }
  searchOpen.value = false;
  searchQuery.value = '';
}

function removeGame(game: Game) {
  if (game.uid === currentlyPlayingUid.value) {
    stopPlaying({ game, executable: game.executables[0] ?? { name: '', os: '', is_launcher: false } });
  }
  gameList.value = gameList.value.filter(g => g.uid !== game.uid);
  if (selectedGame.value?.uid === game.uid) { selectedGameId.value = null; forceKey.value++; }
}

function selectGame(game: Game) {
  selectedGameId.value = game.uid;
  searchOpen.value     = false;
}

// ── Load pending games from QuestsView (sessionStorage) ────────────────
onMounted(() => {
  try {
    const raw = sessionStorage.getItem('pendingGames');
    if (raw) {
      const pending: Game[] = JSON.parse(raw);
      for (const g of pending) {
        if (!gameList.value.some(x => x.id === g.id)) {
          gameList.value.push({ ...g, uid: g.uid || randomString(), is_installed: false, is_running: false });
        }
      }
      if (pending.length) {
        addLog('info', `📥 Loaded ${pending.length} game(s) from Quests tab`);
        sessionStorage.removeItem('pendingGames');
      }
    }
  } catch { /* ignore */ }
});

// ── Game actions ─────────────────────────────────────────
async function createDummy(game: Game, exe: GameExecutable): Promise<boolean> {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === exe.name);
  if (g && e) {
    g.is_installed = true;
    e.is_installed = true;
    addLog('info', `✓ Ready: ${g.name}`);
    return true;
  }
  return false;
}

async function playGame({ game, executable }: { game: Game; executable: GameExecutable }) {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === executable.name);
  if (!g || !e) return;

  // Stop any currently running game first
  if (currentlyPlayingUid.value && currentlyPlayingUid.value !== game.uid) {
    const old = gameList.value.find(x => x.uid === currentlyPlayingUid.value);
    if (old) {
      old.is_running = false;
      old.executables.forEach(ex => { ex.is_running = false; });
    }
  }

  g.is_running = true;
  e.is_running = true;
  currentlyPlayingUid.value = g.uid!;

  const ok = gateway.startPlaying({
    name:           g.name,
    application_id: g.id,
    type:           0,
  });

  if (ok) {
    addLog('info', `▶ Now playing: ${g.name} — Discord presence active`);
  } else {
    addLog('warning', `▶ Playing ${g.name} locally — connect Discord token to show status`);
  }
}

async function stopPlaying({ game, executable }: { game: Game; executable: GameExecutable }) {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === executable.name);
  if (g) {
    g.is_running = false;
    g.executables.forEach(ex => { ex.is_running = false; });
  }
  if (currentlyPlayingUid.value === game.uid) {
    currentlyPlayingUid.value = null;
    gateway.stopPlaying();
  }
  addLog('info', `■ Stopped: ${game.name}`);
}

async function installAndPlay({ game, executable }: { game: Game; executable: GameExecutable }) {
  await createDummy(game, executable);
  await playGame({ game, executable });
}

// ── Providers ────────────────────────────────────────────
provide<GameActionsProvider>(GameActionsKey, {
  canPlayGame:              (g) => (g?.is_installed && !g?.is_running) ?? false,
  isGameInstalled:          (g) => g?.is_installed ?? false,
  isExecutableRunning:      (e) => e?.is_running ?? false,
  isGameExecutableInstalled:(e) => e?.is_installed ?? false,
});

// ── Token / connection panel ──────────────────────────────
const showTokenPanel = ref(false);
const tokenInput     = ref(gateway.token.value);
const showTokenText  = ref(false);

watch(gateway.token, (v) => { tokenInput.value = v; });

function connectDiscord() {
  if (!tokenInput.value.trim()) {
    addLog('error', 'Please enter your Discord token first.');
    return;
  }
  gateway.connect(tokenInput.value.trim());
}

function disconnectDiscord() {
  gateway.disconnect();
}

function saveTokenOnly() {
  gateway.saveToken(tokenInput.value);
  addLog('info', 'Token saved.');
}

const statusColor = computed(() => ({
  connected:    'text-emerald-400',
  connecting:   'text-amber-400',
  identifying:  'text-amber-400',
  disconnected: 'text-slate-500',
  error:        'text-red-400',
}[gateway.status.value] ?? 'text-slate-500'));

const statusLabel = computed(() => ({
  connected:    `✅ متصل كـ ${gateway.username.value ?? ''}`,
  connecting:   '⏳ جاري الاتصال…',
  identifying:  '🔑 جاري التحقق…',
  disconnected: '⚫ غير متصل',
  error:        `❌ خطأ: ${gateway.errorMsg.value ?? 'فشل الاتصال'}`,
}[gateway.status.value] ?? '⚫ غير متصل'));
</script>

<template>
  <div class="min-h-full bg-slate-950 text-slate-100">

    <!-- ── Loading banner ──────────────────────────────── -->
    <Transition enter-from-class="opacity-0 -translate-y-2" enter-active-class="transition-all duration-300"
                leave-to-class="opacity-0 -translate-y-2" leave-active-class="transition-all duration-300">
      <div v-if="!allFetchDone" class="bg-violet-950/60 border-b border-violet-800/30 px-5 py-2 flex items-center gap-3 text-xs text-violet-300">
        <div class="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full spin-slow"></div>
        <span v-if="isLoadingGH">جاري تحميل قائمة الألعاب…</span>
        <span v-else-if="isReadyGH">✓ تم تحميل {{ gameDB.length.toLocaleString() }} لعبة</span>
      </div>
    </Transition>

    <div class="container mx-auto px-4 py-6 max-w-6xl space-y-4">

      <!-- ── Discord Connection Panel ─────────────────── -->
      <div class="card-glass rounded-xl border"
        :class="gateway.status.value === 'connected'
          ? 'border-emerald-500/20'
          : gateway.status.value === 'error'
          ? 'border-red-500/20'
          : 'border-slate-700/40'">

        <!-- Header row -->
        <button class="w-full flex items-center justify-between px-4 py-3 text-left"
          @click="showTokenPanel = !showTokenPanel">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              :class="gateway.status.value === 'connected' ? 'bg-emerald-500/15' : 'bg-slate-800'">
              🔌
            </div>
            <div>
              <div class="text-xs font-semibold text-slate-300">اتصال Discord</div>
              <div class="text-xs mt-0.5" :class="statusColor">{{ statusLabel }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div v-if="gateway.status.value === 'connected'"
              class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            <span class="text-slate-500 text-xs">{{ showTokenPanel ? '▲' : '▼' }}</span>
          </div>
        </button>

        <!-- Expandable token form -->
        <Transition enter-from-class="opacity-0 -translate-y-1" enter-active-class="transition-all duration-200"
                    leave-to-class="opacity-0 -translate-y-1" leave-active-class="transition-all duration-150">
          <div v-if="showTokenPanel" class="px-4 pb-4 space-y-3 border-t border-slate-800/50 pt-3">

            <!-- Warning -->
            <div class="flex items-start gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/15 rounded-lg">
              <span class="text-sm shrink-0">⚠️</span>
              <p class="text-xs text-amber-400/80 leading-relaxed">
                <strong class="text-amber-400">تحذير أمني:</strong>
                لا تشارك توكنك مع أي أحد. احصل عليه من DevTools في Discord Web (Network → /api requests → Authorization header).
              </p>
            </div>

            <!-- Token input -->
            <div class="flex gap-2">
              <div class="relative flex-1">
                <input
                  v-model="tokenInput"
                  :type="showTokenText ? 'text' : 'password'"
                  placeholder="أدخل توكن Discord هنا…"
                  class="w-full px-3 py-2 bg-slate-900 border border-slate-700/60 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 transition-all pr-10 font-mono"
                  @keydown.enter="connectDiscord"
                />
                <button @click="showTokenText = !showTokenText"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-xs">
                  {{ showTokenText ? '🙈' : '👁️' }}
                </button>
              </div>
              <button
                v-if="gateway.status.value === 'disconnected' || gateway.status.value === 'error'"
                @click="connectDiscord"
                :disabled="!tokenInput.trim()"
                class="px-4 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-lg text-xs font-medium text-violet-300 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                اتصال
              </button>
              <button
                v-else-if="gateway.status.value === 'connected'"
                @click="disconnectDiscord"
                class="px-4 py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 rounded-lg text-xs font-medium text-red-400 transition-all duration-150 shrink-0">
                قطع
              </button>
              <button
                v-else
                disabled
                class="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-500 shrink-0 cursor-not-allowed">
                <span class="inline-block spin-slow">⏳</span>
              </button>
            </div>

            <p class="text-xs text-slate-600 text-center">
              الاتصال يتيح ظهور "Playing …" على ملفك الشخصي في Discord في الوقت الفعلي
            </p>
          </div>
        </Transition>
      </div>

      <!-- ── Quest timer (active) ────────────────────── -->
      <Transition enter-from-class="opacity-0 scale-95" enter-active-class="transition-all duration-300"
                  leave-to-class="opacity-0 scale-95" leave-active-class="transition-all duration-200">
        <div v-if="gateway.questGameName.value"
          class="card-glass rounded-xl p-4 border"
          :class="gateway.questCompleted.value ? 'border-emerald-400/40 quest-complete-glow' : 'border-violet-500/20 quest-active-glow'">

          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ gateway.questCompleted.value ? '🎉' : '⏱️' }}</span>
              <div>
                <div class="text-xs font-bold" :class="gateway.questCompleted.value ? 'text-emerald-400' : 'text-violet-300'">
                  {{ gateway.questCompleted.value ? 'الكويست مكتمل! 🎁 احصل على مكافأتك' : 'تقدم الكويست' }}
                </div>
                <div class="text-xs text-slate-400 truncate max-w-[200px]">{{ gateway.questGameName.value }}</div>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm font-bold font-mono"
                :class="gateway.questCompleted.value ? 'text-emerald-400' : 'text-violet-300'">
                {{ gateway.questTimeElapsed.value }}
                <span class="text-slate-500 font-normal text-xs"> / 15:00</span>
              </div>
              <div v-if="!gateway.questCompleted.value" class="text-xs text-slate-500">
                {{ gateway.questTimeLeft.value }} متبقي
              </div>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-1000"
              :class="gateway.questCompleted.value ? 'bg-emerald-400' : 'bg-violet-500'"
              :style="{ width: gateway.questProgress.value + '%' }"
            ></div>
          </div>
          <div class="flex justify-between text-xs text-slate-600 mt-1">
            <span>0:00</span>
            <span>{{ Math.round(gateway.questProgress.value) }}%</span>
            <span>15:00</span>
          </div>
        </div>
      </Transition>

      <!-- ── Hero search ──────────────────────────────── -->
      <div class="relative" ref="searchRef">
        <div class="relative flex items-center">
          <span class="absolute left-4 text-slate-400 text-lg pointer-events-none">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ابحث عن أي لعبة في العالم…"
            class="w-full pl-11 pr-32 py-3.5 bg-slate-900 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/70 focus:ring-2 focus:ring-violet-500/20 transition-all duration-200 text-sm"
            @focus="searchOpen = true"
            @blur="setTimeout(() => { if (!isOnResults) searchOpen = false }, 200)"
          />
          <button @click="fetchGameList()"
            class="absolute right-2 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs text-slate-300 transition-colors duration-150">
            <span>🔄</span> تحديث
          </button>
        </div>

        <!-- Search dropdown -->
        <Transition enter-from-class="opacity-0 translate-y-1" enter-active-class="transition-all duration-150"
                    leave-to-class="opacity-0 translate-y-1" leave-active-class="transition-all duration-150">
          <div v-if="searchOpen && searchQuery.length > 0"
            class="absolute z-50 mt-2 w-full card-glass rounded-xl shadow-2xl shadow-black/50 overflow-hidden border border-slate-700/40"
            @mouseenter="isOnResults = true" @mouseleave="isOnResults = false">
            <div v-if="searchResults.length > 0" class="max-h-72 overflow-y-auto">
              <div v-for="r in searchResults" :key="r.item.id"
                class="flex items-center justify-between px-4 py-3 hover:bg-slate-800/80 border-b border-slate-800/50 last:border-0 transition-colors duration-100 cursor-pointer fade-slide-in"
                @click="addGame(r.item)">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-base">🎮</div>
                  <div class="min-w-0">
                    <div class="font-medium text-sm text-white truncate flex items-center gap-1.5">
                      {{ r.item.name }}
                      <IconVerified class="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    </div>
                    <div class="text-xs text-slate-500">ID: {{ r.item.id }} • {{ r.item.executables?.length ?? 0 }} ملف تنفيذي</div>
                  </div>
                </div>
                <button class="shrink-0 ml-3 px-3 py-1 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 rounded-lg text-xs text-violet-300 transition-colors duration-150">
                  + إضافة
                </button>
              </div>
            </div>
            <div v-else class="px-4 py-6 text-center text-sm text-slate-500">
              <span class="text-2xl block mb-2">🔎</span>
              لا توجد نتائج لـ "{{ searchQuery }}"
            </div>
          </div>
        </Transition>
      </div>

      <!-- ── Main 2-col layout ────────────────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">

        <!-- LEFT: Selected games ──────────────────────── -->
        <div class="lg:col-span-2 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <span>📋</span> ألعابي المختارة
              <span class="px-1.5 py-0.5 bg-slate-800 rounded-md text-xs text-slate-400">{{ gameList.length }}</span>
            </h2>
          </div>

          <!-- Empty state -->
          <div v-if="gameList.length === 0"
            class="card-glass rounded-xl p-8 text-center border border-dashed border-slate-700/50">
            <div class="text-3xl mb-3 float-anim">🎯</div>
            <p class="text-sm text-slate-400">ابحث عن لعبة وأضفها للقائمة</p>
          </div>

          <!-- Game cards -->
          <TransitionGroup name="game-list" tag="div" class="space-y-2">
            <div v-for="game in gameList" :key="game.uid"
              class="card-glass rounded-xl px-4 py-3 cursor-pointer transition-all duration-200 hover:border-slate-600/60"
              :class="[
                selectedGame?.uid === game.uid ? 'selected-glow border-violet-500/30' : 'border-transparent',
                game.is_running ? 'playing-glow' : ''
              ]"
              @click="selectGame(game)">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="relative shrink-0">
                    <div class="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-base">🎮</div>
                    <div v-if="game.is_running"
                      class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 glow-green"></div>
                  </div>
                  <div class="min-w-0">
                    <div class="font-medium text-sm text-white truncate flex items-center gap-1.5">
                      {{ game.name }}
                      <IconVerified class="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    </div>
                    <div class="text-xs mt-0.5" :class="game.is_running ? 'text-emerald-400' : 'text-slate-500'">
                      {{ game.is_running ? '▶ يعمل الآن' : 'معطل' }}
                    </div>
                  </div>
                </div>
                <button v-if="!game.is_running"
                  @click.stop="removeGame(game)"
                  class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors duration-150 text-sm">
                  ✕
                </button>
              </div>
            </div>
          </TransitionGroup>
        </div>

        <!-- RIGHT: Actions ────────────────────────────── -->
        <div class="lg:col-span-3 space-y-4" :key="forceKey">

          <!-- Now Playing status ─────────────────────── -->
          <Transition enter-from-class="opacity-0 scale-95" enter-active-class="transition-all duration-300"
                      leave-to-class="opacity-0 scale-95" leave-active-class="transition-all duration-200">
            <div v-if="playingGame"
              class="card-glass rounded-xl p-4 playing-glow border border-emerald-500/20">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl shrink-0">🟢</div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-emerald-400 font-medium mb-0.5">يعمل الآن</div>
                  <div class="font-semibold text-white truncate">{{ playingGame.name }}</div>
                  <div class="text-xs mt-0.5"
                    :class="gateway.status.value === 'connected' ? 'text-emerald-400' : 'text-amber-400'">
                    {{ gateway.status.value === 'connected'
                      ? '✅ ظاهر في Discord كـ Playing'
                      : '⚠️ محلي فقط — أدخل التوكن لإظهاره في Discord' }}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 text-xs text-emerald-400">
                  <div class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  مباشر
                </div>
              </div>
            </div>
          </Transition>

          <!-- No game selected ───────────────────────── -->
          <div v-if="!selectedGame" class="card-glass rounded-xl p-8 text-center">
            <div class="text-3xl mb-3">👈</div>
            <p class="text-sm text-slate-400">اختر لعبة من القائمة لعرض الإجراءات</p>
          </div>

          <!-- Game actions panel ─────────────────────── -->
          <div v-if="selectedGame" class="card-glass rounded-xl p-5 space-y-5 fade-slide-in">

            <!-- Game header -->
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center text-2xl shrink-0">🎮</div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold text-white flex items-center gap-2 flex-wrap">
                  {{ selectedGame.name }}
                  <IconVerified class="w-4 h-4 text-violet-400 shrink-0" />
                </h3>
                <div class="text-xs text-slate-500 mt-0.5">App ID: {{ selectedGame.id }}</div>
              </div>
              <div v-if="selectedGame.is_running"
                class="px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 font-medium shrink-0">
                ▶ يعمل
              </div>
            </div>

            <!-- Aliases -->
            <div v-if="selectedGame.aliases && selectedGame.aliases.length > 0"
              class="flex flex-wrap gap-1.5">
              <span v-for="a in selectedGame.aliases.slice(0, 6)" :key="a"
                class="px-2 py-0.5 bg-slate-800/80 rounded-md text-xs text-slate-400 font-mono">
                {{ a }}
              </span>
            </div>

            <!-- Divider -->
            <div class="border-t border-slate-800/60"></div>

            <!-- Executables / Play section -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-sm">⚙️</span>
                <h4 class="text-sm font-medium text-slate-300">ملفات التشغيل</h4>
              </div>
              <GameExecutables
                :game="selectedGame"
                @play="playGame"
                @stop="stopPlaying"
                @install_and_play="installAndPlay"
              />
            </div>

            <!-- Gateway status hint -->
            <div v-if="gateway.status.value !== 'connected'"
              class="flex items-start gap-2.5 px-3 py-2.5 bg-violet-500/8 border border-violet-500/15 rounded-lg">
              <span class="text-base shrink-0 mt-0.5">💡</span>
              <p class="text-xs text-violet-400/80 leading-relaxed">
                لإظهار حالة "Playing" في Discord، افتح لوحة الاتصال أعلاه وأدخل توكنك.
              </p>
            </div>
          </div>

          <!-- Status card ───────────────────────────── -->
          <div class="card-glass rounded-xl p-5">
            <div class="flex items-center gap-2 mb-4">
              <span class="text-sm">📊</span>
              <h3 class="text-sm font-semibold text-slate-300">الإحصائيات</h3>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-slate-800/50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-violet-400">{{ gameDB.length.toLocaleString() }}</div>
                <div class="text-xs text-slate-500 mt-0.5">لعبة متاحة</div>
              </div>
              <div class="bg-slate-800/50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-slate-200">{{ gameList.length }}</div>
                <div class="text-xs text-slate-500 mt-0.5">مضافة</div>
              </div>
              <div class="bg-slate-800/50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold" :class="currentlyPlayingUid ? 'text-emerald-400' : 'text-slate-600'">
                  {{ currentlyPlayingUid ? '1' : '0' }}
                </div>
                <div class="text-xs text-slate-500 mt-0.5">يعمل الآن</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../theme/style.css";

.game-list-enter-active { animation: fadeSlideIn 0.25s ease both; }
.game-list-leave-active { transition: all 0.2s ease; }
.game-list-leave-to     { opacity: 0; transform: translateX(-10px); }

.quest-active-glow {
  box-shadow: 0 0 20px 0 rgb(139 92 246 / 0.12);
}
.quest-complete-glow {
  box-shadow: 0 0 24px 0 rgb(52 211 153 / 0.18);
}
</style>
