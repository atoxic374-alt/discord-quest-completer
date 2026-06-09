<script setup lang="ts">
import { ref, computed, useTemplateRef, shallowRef, provide } from 'vue';
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

const { addLog } = useGlobalState();

const {
  gameDB, isLoadingGH, isReadyGH, allFetchDone, fetchGameList
} = useFetchGameList();

// ── Search ──────────────────────────────────────────────
const searchQuery      = shallowRef('');
const debouncedQuery   = refDebounced(searchQuery, 250);
const searchOpen       = ref(false);
const isOnResults      = ref(false);
const searchRef        = useTemplateRef<HTMLElement>('searchRef');

onClickOutside(searchRef, () => { searchOpen.value = false; });

const COPYRIGHT_SYMBOL = '\u00A9';
const TRADEMARK_SYMBOL = '\u2122';
const REGISTERED_SYMBOL = '\u00AE';
const ignoredRe = new RegExp(`[${[COPYRIGHT_SYMBOL, TRADEMARK_SYMBOL, REGISTERED_SYMBOL].join('')}]`, 'g');

const fuseOpts = computed<UseFuseOptions<Game>>(() => ({
  fuseOptions: {
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'aliases', weight: 0.2 },
      { name: 'executables.name', weight: 0.1 },
    ],
    getFn: (obj: any, path: string[] | string) => {
      const v = Fuse.config.getFn(obj, path);
      return typeof v === 'string' ? v.replace(ignoredRe, '') : v;
    },
    isCaseSensitive: false,
    threshold: 0.4,
    includeScore: true,
  },
  resultLimit: 15,
  matchAllWhenSearchEmpty: false,
}));

const { results: searchResults } = useFuse(debouncedQuery, gameDB, fuseOpts);

// ── Selected games ───────────────────────────────────────
const gameList       = ref<Game[]>([]);
const selectedGameId = ref<string | null | undefined>(null);
const currentlyPlaying = ref<string | null>(null);
const forceKey       = ref(0);

const selectedGame = computed(() =>
  gameList.value.find(g => g.uid === selectedGameId.value) ?? null
);

function addGame(game: Game) {
  if (!gameList.value.some(g => g.id === game.id)) {
    gameList.value.push({ uid: randomString(), ...game });
  }
  searchOpen.value = false;
  searchQuery.value = '';
}
function removeGame(game: Game) {
  gameList.value = gameList.value.filter(g => g.uid !== game.uid);
  if (selectedGame.value?.uid === game.uid) { selectedGameId.value = null; forceKey.value++; }
}
function selectGame(game: Game) { selectedGameId.value = game.uid; searchOpen.value = false; }

// ── Game actions (browser stubs) ─────────────────────────
async function createDummy(game: Game, exe: GameExecutable): Promise<boolean> {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === exe.name);
  if (g && e) { g.is_installed = true; e.is_installed = true; addLog('info', `✓ Marked as installed: ${g.name}`); return true; }
  return false;
}
async function playGame({ game, executable }: { game: Game; executable: GameExecutable }) {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === executable.name);
  if (g && e) {
    g.is_running   = true;
    e.is_running   = true;
    currentlyPlaying.value = g.id;
    addLog('info', `▶ Now playing: ${g.name} (${executable.name})`);
  }
}
async function stopPlaying({ game, executable }: { game: Game; executable: GameExecutable }) {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === executable.name);
  if (g && e) { g.is_running = false; e.is_running = false; }
  if (currentlyPlaying.value === game.id) currentlyPlaying.value = null;
  addLog('info', `■ Stopped: ${game.name}`);
}
async function installAndPlay({ game, executable }: { game: Game; executable: GameExecutable }) {
  await createDummy(game, executable);
  await playGame({ game, executable });
}

// ── Providers ────────────────────────────────────────────
provide<GameActionsProvider>(GameActionsKey, {
  canPlayGame: (g) => (g?.is_installed && !g?.is_running) ?? false,
  isGameInstalled: (g) => g?.is_installed ?? false,
  isExecutableRunning: (e) => e?.is_running ?? false,
  isGameExecutableInstalled: (e) => e?.is_installed ?? false,
});

const playingGame = computed(() => gameList.value.find(g => g.id === currentlyPlaying.value));
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

    <div class="container mx-auto px-4 py-6 max-w-6xl space-y-6">

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

            <!-- Info note -->
            <div class="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/8 border border-amber-500/15 rounded-lg">
              <span class="text-base shrink-0 mt-0.5">⚠️</span>
              <p class="text-xs text-amber-400/80 leading-relaxed">
                ربط Discord RPC يتطلب تشغيل التطبيق على Windows. في المتصفح تظهر حالة التشغيل داخل الواجهة فقط.
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
                <div class="text-xl font-bold" :class="currentlyPlaying ? 'text-emerald-400' : 'text-slate-600'">
                  {{ currentlyPlaying ? '1' : '0' }}
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
</style>
