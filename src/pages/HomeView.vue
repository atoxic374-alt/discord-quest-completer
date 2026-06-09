<script setup lang="ts">
import { ref, computed, useTemplateRef, shallowRef, provide, onMounted, watch, nextTick } from 'vue';
import { onClickOutside, refDebounced }   from '@vueuse/core';
import { useFuse }                        from '@vueuse/integrations/useFuse';
import { randomString }                   from '@/utils/random-string';
import { GameActionsProvider, GameExecutable, type Game } from '@/types/types';
import { GameActionsKey }                 from '@/constants/constants';
import { useFetchGameList }               from '@/composables/fetch-gamelist';
import { UseFuseOptions }                 from '@vueuse/integrations';
import Fuse                               from 'fuse.js';
import { useGlobalState }                 from '@/composables/app-state';
import { useGatewayManager }              from '@/composables/use-gateway';
import { useQuestManager }               from '@/composables/quest-manager';
import IconVerified                       from '@/components/IconVerified.vue';
import GameExecutables                    from '@/components/GameExecutables.vue';
import EnsIcons                           from '@/components/EnsIcons.vue';

// ── State ─────────────────────────────────────────────────────────────
const { addLog, logs, clearLogs } = useGlobalState();
const gateway   = useGatewayManager();
const questMgr  = useQuestManager();
const { gameDB, isLoadingGH, allFetchDone, fetchGameList } = useFetchGameList();

// ── Persistent storage ────────────────────────────────────────────────
const LIBRARY_KEY = 'ens_library';
const QUEUE_KEY   = 'ens_queue';
function loadLibrary(): Game[] { try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]'); } catch { return []; } }
function saveLibrary(l: Game[]) { try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(l)); } catch {} }
function loadQueue():   Game[] { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); } catch { return []; } }
function saveQueue(l: Game[]) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(l)); } catch {} }

const gameList            = ref<Game[]>(loadLibrary());
const gameQueue           = ref<Game[]>(loadQueue());
const selectedGameId      = ref<string | null>(null);
const currentlyPlayingUid = ref<string | null>(null);
const forceKey            = ref(0);

watch(gameList, v => saveLibrary(v), { deep: true });
watch(gameQueue, v => saveQueue(v), { deep: true });

const selectedGame = computed(() => gameList.value.find(g => g.uid === selectedGameId.value) ?? null);
const playingGame  = computed(() => gameList.value.find(g => g.uid === currentlyPlayingUid.value) ?? null);

// ── Queue auto-advance ─────────────────────────────────────────────────
watch(() => gateway.questCompleted.value, (done) => {
  if (done && gameQueue.value.length > 0) {
    setTimeout(() => {
      stopCurrentGame();
      const next = gameQueue.value[0];
      gameQueue.value = gameQueue.value.slice(1);
      if (next) {
        const exe = next.executables[0];
        if (exe) installAndPlay({ game: next, executable: exe });
        addLog('info', `Queue: Auto-starting "${next.name}"`);
      }
    }, 1500);
  }
});

// ── Search ────────────────────────────────────────────────────────────
const searchQuery    = shallowRef('');
const debouncedQuery = refDebounced(searchQuery, 250);
const searchOpen     = ref(false);
const isOnResults    = ref(false);
const searchRef      = useTemplateRef<HTMLElement>('searchRef');
onClickOutside(searchRef, () => { searchOpen.value = false; });

const ignoredRe = new RegExp(`[\u00A9\u2122\u00AE]`, 'g');
const fuseOpts = computed<UseFuseOptions<Game>>(() => ({
  fuseOptions: {
    keys: [{ name: 'name', weight: 0.7 }, { name: 'aliases', weight: 0.2 }, { name: 'executables.name', weight: 0.1 }],
    getFn: (obj: any, path: string[] | string) => {
      const v = Fuse.config.getFn(obj, path);
      return typeof v === 'string' ? v.replace(ignoredRe, '') : v;
    },
    isCaseSensitive: false, threshold: 0.4, includeScore: true,
  },
  resultLimit: 15, matchAllWhenSearchEmpty: false,
}));
const { results: searchResults } = useFuse(debouncedQuery, gameDB, fuseOpts);

function addGame(game: Game) {
  if (!gameList.value.some(g => g.id === game.id)) {
    gameList.value.push({ ...game, uid: randomString(), is_installed: false, is_running: false });
  }
  searchOpen.value = false; searchQuery.value = '';
}
function removeGame(game: Game) {
  if (game.uid === currentlyPlayingUid.value) stopCurrentGame();
  gameList.value = gameList.value.filter(g => g.uid !== game.uid);
  if (selectedGame.value?.uid === game.uid) { selectedGameId.value = null; forceKey.value++; }
}
function selectGame(game: Game) { selectedGameId.value = game.uid; searchOpen.value = false; }

// ── Queue ────────────────────────────────────────────────────────────
function addToQueue(game: Game) {
  if (!gameQueue.value.some(g => g.uid === game.uid || g.id === game.id)) {
    const g = gameList.value.find(x => x.id === game.id) ?? { ...game, uid: game.uid || randomString() };
    gameQueue.value = [...gameQueue.value, g];
    addLog('info', `Added "${game.name}" to queue`);
  }
}
function removeFromQueue(uid: string) { gameQueue.value = gameQueue.value.filter(g => g.uid !== uid); }
function moveQueueUp(idx: number) {
  if (idx === 0) return;
  const q = [...gameQueue.value]; [q[idx-1], q[idx]] = [q[idx], q[idx-1]]; gameQueue.value = q;
}
function moveQueueDown(idx: number) {
  if (idx >= gameQueue.value.length - 1) return;
  const q = [...gameQueue.value]; [q[idx], q[idx+1]] = [q[idx+1], q[idx]]; gameQueue.value = q;
}
function clearQueue() { gameQueue.value = []; }

// ── Game actions ──────────────────────────────────────────────────────
function stopCurrentGame() {
  if (!currentlyPlayingUid.value) return;
  const old = gameList.value.find(x => x.uid === currentlyPlayingUid.value);
  if (old) { old.is_running = false; old.executables.forEach(e => { e.is_running = false; }); }
  currentlyPlayingUid.value = null;
  gateway.stopPlaying();
  questMgr.stopAllHeartbeats();
}

async function createDummy(game: Game, exe: GameExecutable): Promise<boolean> {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === exe.name);
  if (g && e) { g.is_installed = true; e.is_installed = true; return true; }
  return false;
}

async function playGame({ game, executable }: { game: Game; executable: GameExecutable }) {
  const g = gameList.value.find(x => x.uid === game.uid);
  const e = g?.executables.find(x => x.name === executable.name);
  if (!g || !e) return;
  if (currentlyPlayingUid.value && currentlyPlayingUid.value !== game.uid) stopCurrentGame();
  g.is_running = true; e.is_running = true;
  currentlyPlayingUid.value = g.uid!;

  // Look up the active enrolled quest for this game to get its real duration
  const matchingQuest = questMgr.liveQuests.value.find(q =>
    questMgr.getQuestApplicationId(q) === g.id &&
    questMgr.isEnrolled(q) &&
    !questMgr.isCompleted(q)
  );
  const durationSecs = matchingQuest ? questMgr.getQuestDuration(matchingQuest) : undefined;

  const ok = gateway.startPlaying({ name: g.name, application_id: g.id, type: 0 }, durationSecs);
  if (ok) addLog('info', `Now playing: ${g.name} — presence active`);
  else    addLog('warning', `Playing ${g.name} locally — add a token to show on Discord`);

  // Auto heartbeat for matching quests
  _startHeartbeatsForGame(g.id);
}

function _startHeartbeatsForGame(appId: string) {
  const connectedTokens = gateway.accounts.value
    .filter(a => a.gateway.status.value === 'connected')
    .map(a => a.token);
  if (!connectedTokens.length) return;

  for (const q of questMgr.liveQuests.value) {
    if (
      questMgr.getQuestApplicationId(q) === appId &&
      questMgr.isEnrolled(q) &&
      !questMgr.isCompleted(q)
    ) {
      questMgr.startHeartbeat(q.id, connectedTokens);
    }
  }
}

async function stopPlaying({ game }: { game: Game; executable: GameExecutable }) {
  const g = gameList.value.find(x => x.uid === game.uid);
  if (g) { g.is_running = false; g.executables.forEach(e => { e.is_running = false; }); }
  if (currentlyPlayingUid.value === game.uid) {
    currentlyPlayingUid.value = null;
    gateway.stopPlaying();
    questMgr.stopAllHeartbeats();
  }
  addLog('info', `Stopped: ${game.name}`);
}

async function installAndPlay({ game, executable }: { game: Game; executable: GameExecutable }) {
  await createDummy(game, executable);
  await playGame({ game, executable });
}

provide<GameActionsProvider>(GameActionsKey, {
  canPlayGame:               g => (g?.is_installed && !g?.is_running) ?? false,
  isGameInstalled:           g => g?.is_installed ?? false,
  isExecutableRunning:       e => e?.is_running ?? false,
  isGameExecutableInstalled: e => e?.is_installed ?? false,
});

// ── Token panel ───────────────────────────────────────────────────────
const showTokenPanel   = ref(false);
const newTokenInput    = ref('');
const newTokenLabel    = ref('');
const showNewTokenText = ref(false);

function submitNewToken() {
  if (!newTokenInput.value.trim()) return;
  gateway.addToken(newTokenInput.value.trim(), newTokenLabel.value.trim() || undefined);
  newTokenInput.value = ''; newTokenLabel.value = '';
}

const statusColors: Record<string, string> = {
  connected:   'var(--success)', connecting:  'var(--warn)',
  identifying: 'var(--warn)',    disconnected:'var(--text-3)', error: 'var(--error)',
};
const statusLabels: Record<string, string> = {
  connected:   'Connected',   connecting:  'Connecting…',
  identifying: 'Identifying…', disconnected:'Disconnected', error: 'Error',
};

// ── Quest manager integration ─────────────────────────────────────────
const questsSection = ref<'live' | 'suggested'>('live');

// Watch for any account becoming connected → auto-fetch quests
watch(
  () => gateway.accounts.value.map(a => a.gateway.status.value).join(','),
  async () => {
    const accounts = gateway.accounts.value.map(a => ({
      id: a.id, token: a.token, status: a.gateway.status.value,
    }));
    const hasConnected = accounts.some(a => a.status === 'connected');
    if (hasConnected && questMgr.fetchStatus.value !== 'loading') {
      await questMgr.fetchQuestsForAccounts(accounts);
    }
  }
);

async function refreshQuests() {
  const accounts = gateway.accounts.value.map(a => ({
    id: a.id, token: a.token, status: a.gateway.status.value,
  }));
  await questMgr.fetchQuestsForAccounts(accounts);
}

// Build a synthetic Game entry from quest data when not in gameDB
function createSyntheticGame(appId: string, name: string): Game {
  const exeName = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.exe';
  return {
    id: appId,
    name,
    executables: [{ name: exeName, os: 'win32', is_launcher: false, is_running: false, is_installed: false }],
    is_running: false,
    is_installed: false,
  };
}

async function enrollAndPlay(questId: string, appId: string | null, gameName: string) {
  const connectedTokens = gateway.accounts.value
    .filter(a => a.gateway.status.value === 'connected')
    .map(a => a.token);
  if (!connectedTokens.length) {
    addLog('warning', 'No connected accounts — add a Discord token first');
    return;
  }
  // Enroll
  await questMgr.autoEnroll(questId, connectedTokens);
  // Find or add game to library — always succeeds (synthetic fallback)
  if (appId) {
    let libGame = gameList.value.find(g => g.id === appId);
    if (!libGame) {
      // 1. Try exact match by ID in gameDB
      const dbGame = gameDB.value.find(g => g.id === appId)
        ?? gameDB.value.find(g => g.name.toLowerCase().includes(gameName.toLowerCase().split(' ')[0]));
      if (dbGame) {
        addGame(dbGame);
      } else {
        // 2. Create synthetic game so the quest always works
        const synthetic = createSyntheticGame(appId, gameName);
        addGame(synthetic);
        addLog('info', `Created entry for "${gameName}" (new/unlisted game)`);
      }
      libGame = gameList.value.find(g => g.id === appId);
    }
    if (libGame) {
      selectGame(libGame);
      const exe = libGame.executables[0];
      if (exe) await installAndPlay({ game: libGame, executable: exe });
      questMgr.startHeartbeat(questId, connectedTokens);
    }
  }
  setTimeout(() => refreshQuests(), 2000);
}

async function handleClaimReward(questId: string) {
  const tokens = gateway.accounts.value
    .filter(a => a.gateway.status.value === 'connected')
    .map(a => a.token);
  await questMgr.claimReward(questId, tokens);
  setTimeout(() => refreshQuests(), 2000);
}

function timeUntil(dateStr?: string) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000); const hours = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h left`;
}

// ── Suggested quest games (expanded list) ─────────────────────────────
const KNOWN_QUEST_NAMES = [
  // Battle Royale / Shooters
  'Fortnite', 'Apex Legends', 'PUBG', 'Warzone', 'Call of Duty', 'Counter-Strike 2',
  'Valorant', 'Rainbow Six Siege', 'XDefiant', 'The Finals', 'Delta Force',
  'Battlefield', 'Halo Infinite', 'Overwatch', 'Team Fortress',
  // MOBA / Strategy
  'League of Legends', 'Dota 2', 'Smite', 'Heroes of the Storm',
  // MMORPG / RPG
  'World of Warcraft', 'Final Fantasy XIV', 'Black Desert', 'Lost Ark',
  'Guild Wars 2', 'Elder Scrolls Online', 'Star Wars: The Old Republic',
  'Neverwinter', 'Dungeons & Dragons Online', 'Runescape',
  // Action / Adventure
  'Elden Ring', 'Diablo IV', 'Path of Exile', 'Genshin Impact', 'Honkai: Star Rail',
  'Wuthering Waves', 'Monster Hunter', 'Destiny 2', 'Warframe', 'Dauntless',
  'The First Descendant', 'Marvel Rivals', 'Naraka: Bladepoint',
  // Survival / Sandbox
  'Minecraft', 'Rust', 'Palworld', 'Helldivers 2', 'Once Human',
  'New World', 'Sea of Thieves', 'Skull and Bones', 'Dark and Darker',
  'Escape from Tarkov', 'Hunt: Showdown',
  // Horror / Asymmetric
  'Dead by Daylight', 'Phasmophobia', 'Back 4 Blood',
  // Other popular
  'Grand Theft Auto V', 'Rocket League', 'Fall Guys', 'Among Us',
  'For Honor', 'BattleBit', 'Albion Online',
];

const suggestedQuestGames = computed<Game[]>(() => {
  if (!allFetchDone.value || gameDB.value.length === 0) return [];
  const set = new Set<string>();
  const result: Game[] = [];
  for (const game of gameDB.value) {
    const name = game.name.toLowerCase();
    if (KNOWN_QUEST_NAMES.some(n => name.includes(n.toLowerCase()))) {
      if (!set.has(game.id)) {
        set.add(game.id);
        result.push(game);
      }
    }
    if (result.length >= 48) break;
  }
  return result;
});

// Auto-match: always returns a game — synthetic if not in gameDB
const liveQuestsWithDBMatch = computed(() =>
  questMgr.liveQuests.value.map(q => {
    const appId = questMgr.getQuestApplicationId(q);
    const questName = questMgr.getQuestName(q);
    const dbMatch = appId
      ? (gameDB.value.find(g => g.id === appId)
          ?? gameDB.value.find(g => g.name.toLowerCase().includes(questName.toLowerCase().split(' ')[0]))
          ?? createSyntheticGame(appId, questName))
      : null;
    const libMatch = appId ? gameList.value.find(g => g.id === appId) : null;
    const isSynthetic = dbMatch ? !gameDB.value.find(g => g.id === dbMatch.id) : false;
    return { quest: q, dbMatch, libMatch, isSynthetic };
  })
);

// ── Log panel ─────────────────────────────────────────────────────────
const logEl     = useTemplateRef<HTMLElement>('logEl');
const logFilter = ref<'all' | 'info' | 'warning' | 'error' | 'debug'>('all');
const filteredLogs = computed(() =>
  logFilter.value === 'all' ? logs.value : logs.value.filter(l => l.type === logFilter.value)
);
watch(filteredLogs, async () => {
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
}, { flush: 'post' });

function formatLogTime(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// ── Init ──────────────────────────────────────────────────────────────
onMounted(() => {
  for (const g of gameList.value) { g.is_running = false; g.executables.forEach(e => { e.is_running = false; }); }
  currentlyPlayingUid.value = null;
  // Try fetching quests if any token is already connected
  const accts = gateway.accounts.value.map(a => ({ id: a.id, token: a.token, status: a.gateway.status.value }));
  if (accts.some(a => a.status === 'connected')) questMgr.fetchQuestsForAccounts(accts);
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

    <!-- ── Loading banner ──────────────────────────────────────────────── -->
    <Transition enter-from-class="opacity-0 -translate-y-2" enter-active-class="transition-all duration-300"
                leave-to-class="opacity-0 -translate-y-2"   leave-active-class="transition-all duration-300">
      <div v-if="!allFetchDone" class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
        style="background:rgba(124,29,74,0.15);border:1px solid rgba(212,64,110,0.2);color:var(--text-1);">
        <div class="w-4 h-4 rounded-full border-2 border-t-transparent spin-anim shrink-0"
          style="border-color:var(--accent-b);border-top-color:transparent;"></div>
        <span>Loading game database…</span>
        <span v-if="gameDB.length" class="ml-auto text-xs" style="color:var(--accent-b);">{{ gameDB.length.toLocaleString() }} games</span>
      </div>
    </Transition>

    <!-- ══ TOKENS ════════════════════════════════════════════════════════ -->
    <section class="card-glass rounded-2xl overflow-hidden">
      <button class="w-full flex items-center justify-between px-5 py-4"
        :style="`background:${showTokenPanel?'rgba(124,29,74,0.12)':'transparent'}`"
        @click="showTokenPanel=!showTokenPanel">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style="background:rgba(124,29,74,0.25);color:var(--accent-b);">
            <EnsIcons name="plug" :size="17"/>
          </div>
          <div class="text-left">
            <div class="font-semibold text-sm" style="color:var(--text-0);">Discord Tokens</div>
            <div class="text-xs mt-0.5" style="color:var(--text-2);">
              {{ gateway.accounts.value.length }} token{{ gateway.accounts.value.length!==1?'s':'' }} ·
              {{ gateway.accounts.value.filter(a=>a.gateway.status.value==='connected').length }} connected
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex -space-x-1">
            <div v-for="a in gateway.accounts.value.slice(0,6)" :key="a.id"
              class="w-2.5 h-2.5 rounded-full border-2"
              :style="`background:${statusColors[a.gateway.status.value]||'var(--text-3)'};border-color:var(--bg-2);`"></div>
          </div>
          <EnsIcons :name="showTokenPanel?'chevron-up':'chevron-down'" :size="16" style="color:var(--text-2);"/>
        </div>
      </button>

      <Transition enter-from-class="opacity-0 -translate-y-1" enter-active-class="transition-all duration-200"
                  leave-to-class="opacity-0 -translate-y-1"   leave-active-class="transition-all duration-150">
        <div v-if="showTokenPanel" class="px-5 pb-5 space-y-4"
          style="border-top:1px solid rgba(180,60,100,0.15);">

          <!-- Warning -->
          <div class="flex items-start gap-2.5 px-4 py-3 rounded-xl mt-4"
            style="background:rgba(196,122,24,0.08);border:1px solid rgba(196,122,24,0.18);">
            <EnsIcons name="warning" :size="15" style="color:var(--warn);flex-shrink:0;margin-top:1px;"/>
            <p class="text-xs leading-relaxed" style="color:rgba(212,138,30,0.9);">
              <strong style="color:var(--warn);">Security:</strong>
              لا تشارك توكنك مع أي أحد. احصل عليه من DevTools في Discord Web (Network → Authorization header).
            </p>
          </div>

          <!-- Accounts list -->
          <div v-if="gateway.accounts.value.length" class="space-y-2">
            <div v-for="account in gateway.accounts.value" :key="account.id"
              class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
              :class="account.gateway.status.value==='connected'?'token-glow-connected':account.gateway.status.value==='error'?'token-glow-error':''"
              :style="`background:var(--bg-3);border:1px solid ${account.gateway.status.value==='connected'?'rgba(31,138,90,0.25)':account.gateway.status.value==='error'?'rgba(196,48,64,0.25)':'rgba(180,60,100,0.12)'};`">

              <!-- Avatar -->
              <div class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                style="background:var(--bg-4);border:1px solid rgba(180,60,100,0.2);">
                <img v-if="account.gateway.avatarUrl.value" :src="account.gateway.avatarUrl.value" class="w-full h-full object-cover"/>
                <EnsIcons v-else name="user" :size="18" style="color:var(--text-2);"/>
              </div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate" style="color:var(--text-0);">
                  {{ account.gateway.username.value ?? account.label ?? 'Token' }}
                </div>
                <div class="text-xs mt-0.5 flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full"
                    :style="`background:${statusColors[account.gateway.status.value]||'var(--text-3)'}`"></div>
                  <span :style="`color:${statusColors[account.gateway.status.value]||'var(--text-3)'}`">
                    {{ statusLabels[account.gateway.status.value]||'Unknown' }}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button v-if="['disconnected','error'].includes(account.gateway.status.value)"
                  @click="gateway.reconnectToken(account.id)"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                  style="background:rgba(124,29,74,0.25);border:1px solid rgba(212,64,110,0.25);color:var(--accent-b);">
                  Reconnect
                </button>
                <button v-else-if="account.gateway.status.value==='connected'"
                  @click="gateway.disconnectToken(account.id)"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                  style="background:rgba(196,48,64,0.12);border:1px solid rgba(196,48,64,0.25);color:#e05060;">
                  Disconnect
                </button>
                <button @click="gateway.removeToken(account.id)"
                  class="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150"
                  style="color:var(--text-3);"
                  @mouseenter="($event.currentTarget as HTMLElement).style.color='#e05060'"
                  @mouseleave="($event.currentTarget as HTMLElement).style.color='var(--text-3)'">
                  <EnsIcons name="trash" :size="14"/>
                </button>
              </div>
            </div>
          </div>

          <!-- Add token form -->
          <div class="space-y-2">
            <div class="text-xs font-medium" style="color:var(--text-2);">Add token</div>
            <div class="flex gap-2 flex-wrap sm:flex-nowrap">
              <input v-model="newTokenLabel" placeholder="Label (optional)"
                class="w-full sm:w-32 px-3 py-2 rounded-xl text-sm outline-none"
                style="background:var(--bg-3);border:1px solid rgba(180,60,100,0.2);color:var(--text-0);"
                @focus="($event.target as HTMLInputElement).style.borderColor='rgba(212,64,110,0.5)'"
                @blur="($event.target as HTMLInputElement).style.borderColor='rgba(180,60,100,0.2)'"/>
              <div class="relative flex-1">
                <input v-model="newTokenInput" :type="showNewTokenText?'text':'password'"
                  placeholder="Discord token…"
                  class="w-full pl-3 pr-10 py-2 rounded-xl text-sm font-mono outline-none"
                  style="background:var(--bg-3);border:1px solid rgba(180,60,100,0.2);color:var(--text-0);"
                  @focus="($event.target as HTMLInputElement).style.borderColor='rgba(212,64,110,0.5)'"
                  @blur="($event.target as HTMLInputElement).style.borderColor='rgba(180,60,100,0.2)'"
                  @keydown.enter="submitNewToken"/>
                <button @click="showNewTokenText=!showNewTokenText"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2" style="color:var(--text-3);">
                  <EnsIcons :name="showNewTokenText?'eye-off':'eye'" :size="15"/>
                </button>
              </div>
              <button @click="submitNewToken" :disabled="!newTokenInput.trim()"
                class="px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-40"
                style="background:rgba(124,29,74,0.35);border:1px solid rgba(212,64,110,0.3);color:var(--accent-b);">
                <EnsIcons name="plus" :size="14"/> Add
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </section>

    <!-- ══ QUEST TIMER ═══════════════════════════════════════════════════ -->
    <Transition enter-from-class="opacity-0 scale-95" enter-active-class="transition-all duration-300"
                leave-to-class="opacity-0 scale-95"   leave-active-class="transition-all duration-200">
      <section v-if="gateway.questGameName.value" class="card-glass rounded-2xl p-5"
        :class="gateway.questCompleted.value?'quest-complete-glow':'quest-active-glow'"
        :style="`border:1px solid ${gateway.questCompleted.value?'rgba(31,138,90,0.35)':'rgba(212,64,110,0.25)'}`">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              :style="`background:${gateway.questCompleted.value?'rgba(31,138,90,0.2)':'rgba(212,64,110,0.15)'}`">
              <EnsIcons :name="gateway.questCompleted.value?'check':'timer'" :size="18"
                :style="`color:${gateway.questCompleted.value?'var(--success)':'var(--accent-b)'}`"/>
            </div>
            <div>
              <div class="font-semibold text-sm"
                :style="`color:${gateway.questCompleted.value?'var(--success)':'var(--text-0)'}`">
                {{ gateway.questCompleted.value?'Quest Completed! Claim your reward.':'Quest in progress' }}
              </div>
              <div class="text-xs mt-0.5 truncate max-w-xs" style="color:var(--text-2);">
                {{ gateway.questGameName.value }}
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-bold text-xl font-mono"
              :style="`color:${gateway.questCompleted.value?'var(--success)':'var(--accent-b)'}`">
              {{ gateway.questTimeElapsed.value }}
              <span class="text-sm font-normal" style="color:var(--text-3);"> / 15:00</span>
            </div>
            <div v-if="!gateway.questCompleted.value" class="text-xs mt-0.5" style="color:var(--text-2);">
              {{ gateway.questTimeLeft.value }} remaining
            </div>
          </div>
        </div>
        <!-- Heartbeat badges -->
        <div v-if="questMgr.activeHeartbeatQuestIds.value.length" class="mb-3 flex items-center gap-2 text-xs flex-wrap">
          <div v-for="qid in questMgr.activeHeartbeatQuestIds.value" :key="qid"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style="background:rgba(31,138,90,0.12);border:1px solid rgba(31,138,90,0.25);color:var(--success);">
            <div class="w-1.5 h-1.5 rounded-full dot-blink" style="background:var(--success);"></div>
            Heartbeat · {{ questMgr.heartbeatCounts.value[qid] ?? 0 }} sent
          </div>
        </div>
        <!-- Progress bar -->
        <div class="h-2 rounded-full overflow-hidden" style="background:var(--bg-4);">
          <div class="h-full rounded-full transition-all duration-1000"
            :style="`width:${gateway.questProgress.value}%;background:${gateway.questCompleted.value?'var(--success)':'linear-gradient(90deg,var(--accent),var(--accent-b))'}`"></div>
        </div>
        <div class="flex justify-between text-xs mt-1.5" style="color:var(--text-3);">
          <span>0:00</span><span>{{ Math.round(gateway.questProgress.value) }}%</span><span>15:00</span>
        </div>
        <div v-if="gameQueue.length" class="mt-3 flex items-center gap-2 text-xs" style="color:var(--text-2);">
          <EnsIcons name="library" :size="13" style="color:var(--accent-b);"/>
          {{ gameQueue.length }} game{{ gameQueue.length!==1?'s':'' }} in queue — auto-starts next
        </div>
      </section>
    </Transition>

    <!-- ══ LIBRARY + QUEUE + ACTIONS ═════════════════════════════════════ -->
    <section>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">

        <!-- LEFT: Library & Queue -->
        <div class="lg:col-span-2 space-y-4">

          <!-- Search bar -->
          <div class="relative" ref="searchRef">
            <div class="relative flex items-center">
              <div class="absolute left-3.5 pointer-events-none" style="color:var(--text-2);">
                <EnsIcons name="search" :size="17"/>
              </div>
              <input v-model="searchQuery" type="text" placeholder="Search any game…"
                class="w-full pl-10 pr-24 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                style="background:var(--bg-2);border:1px solid rgba(180,60,100,0.2);color:var(--text-0);"
                @focus="searchOpen=true;($event.target as HTMLInputElement).style.borderColor='rgba(212,64,110,0.45)'"
                @blur="($event.target as HTMLInputElement).style.borderColor='rgba(180,60,100,0.2)';setTimeout(()=>{if(!isOnResults)searchOpen=false},200)"/>
              <button @click="fetchGameList()"
                class="absolute right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150"
                style="background:var(--bg-3);border:1px solid rgba(180,60,100,0.2);color:var(--text-2);">
                <EnsIcons name="refresh" :size="12"/> Reload
              </button>
            </div>
            <Transition enter-from-class="opacity-0 translate-y-1" enter-active-class="transition-all duration-150"
                        leave-to-class="opacity-0 translate-y-1"   leave-active-class="transition-all duration-150">
              <div v-if="searchOpen && searchQuery.length>0"
                class="absolute z-50 mt-2 w-full card-glass rounded-xl shadow-2xl overflow-hidden"
                style="border:1px solid rgba(180,60,100,0.25);box-shadow:0 8px 32px rgba(0,0,0,0.5);"
                @mouseenter="isOnResults=true" @mouseleave="isOnResults=false">
                <div v-if="searchResults.length" class="max-h-72 overflow-y-auto">
                  <div v-for="r in searchResults" :key="r.item.id"
                    class="flex items-center justify-between px-4 py-3 border-b transition-colors cursor-pointer fade-slide-in"
                    style="border-color:rgba(180,60,100,0.1);"
                    @mouseenter="($event.currentTarget as HTMLElement).style.background='rgba(124,29,74,0.15)'"
                    @mouseleave="($event.currentTarget as HTMLElement).style.background='transparent'"
                    @click="addGame(r.item)">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                        style="background:var(--bg-3);color:var(--text-2);">
                        <EnsIcons name="gamepad" :size="15"/>
                      </div>
                      <div class="min-w-0">
                        <div class="font-medium text-sm truncate flex items-center gap-1.5" style="color:var(--text-0);">
                          {{ r.item.name }}
                          <IconVerified class="w-3.5 h-3.5 shrink-0" style="color:var(--accent-b);"/>
                        </div>
                        <div class="text-xs mt-0.5" style="color:var(--text-3);">{{ r.item.executables?.length??0 }} exe</div>
                      </div>
                    </div>
                    <button class="shrink-0 ml-3 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style="background:rgba(124,29,74,0.25);border:1px solid rgba(212,64,110,0.25);color:var(--accent-b);">Add</button>
                  </div>
                </div>
                <div v-else class="px-4 py-6 text-center text-sm" style="color:var(--text-3);">
                  <EnsIcons name="search" :size="28" class="mx-auto mb-2 opacity-30"/>
                  No results for "{{ searchQuery }}"
                </div>
              </div>
            </Transition>
          </div>

          <!-- Library -->
          <div class="card-glass rounded-2xl p-4 space-y-3">
            <div class="flex items-center gap-2">
              <EnsIcons name="library" :size="15" style="color:var(--accent-b);"/>
              <span class="text-sm font-semibold" style="color:var(--text-0);">Library</span>
              <span class="px-1.5 py-0.5 rounded-md text-xs" style="background:var(--bg-3);color:var(--text-2);">{{ gameList.length }}</span>
            </div>
            <div v-if="!gameList.length" class="py-7 text-center"
              style="border:1px dashed rgba(180,60,100,0.2);border-radius:12px;">
              <EnsIcons name="gamepad" :size="30" class="mx-auto mb-2 float-anim" style="color:var(--text-3);"/>
              <p class="text-sm" style="color:var(--text-3);">Search and add games above</p>
            </div>
            <TransitionGroup name="game-list" tag="div" class="space-y-1.5">
              <div v-for="game in gameList" :key="game.uid"
                class="rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 flex items-center gap-3"
                :class="[selectedGame?.uid===game.uid?'selected-glow':'',game.is_running?'playing-glow':'']"
                :style="`background:var(--bg-3);border:1px solid ${selectedGame?.uid===game.uid?'rgba(212,64,110,0.3)':game.is_running?'rgba(31,138,90,0.25)':'rgba(180,60,100,0.1)'};`"
                @click="selectGame(game)">
                <div class="relative shrink-0">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center"
                    style="background:var(--bg-4);color:var(--text-2);">
                    <EnsIcons name="gamepad" :size="16"/>
                  </div>
                  <div v-if="game.is_running"
                    class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 glow-green"
                    style="background:var(--success);border-color:var(--bg-0);"></div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate flex items-center gap-1" style="color:var(--text-0);">
                    {{ game.name }}<IconVerified class="w-3 h-3 shrink-0" style="color:var(--accent-b);"/>
                  </div>
                  <div class="text-xs mt-0.5"
                    :style="`color:${game.is_running?'var(--success)':'var(--text-3)'}`">
                    {{ game.is_running?'Running':'Idle' }}
                  </div>
                </div>
                <button v-if="!game.is_running" @click.stop="addToQueue(game)"
                  :title="gameQueue.some(q=>q.uid===game.uid||q.id===game.id)?'In queue':'Add to queue'"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all"
                  :style="`background:${gameQueue.some(q=>q.uid===game.uid||q.id===game.id)?'rgba(31,138,90,0.15)':'transparent'};border:1px solid ${gameQueue.some(q=>q.uid===game.uid||q.id===game.id)?'rgba(31,138,90,0.25)':'rgba(180,60,100,0.15)'};color:${gameQueue.some(q=>q.uid===game.uid||q.id===game.id)?'var(--success)':'var(--text-3)'};`">
                  <EnsIcons name="library" :size="12"/>
                </button>
                <button v-if="!game.is_running" @click.stop="removeGame(game)"
                  class="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                  style="color:var(--text-3);"
                  @mouseenter="($event.currentTarget as HTMLElement).style.color='#e05060'"
                  @mouseleave="($event.currentTarget as HTMLElement).style.color='var(--text-3)'">
                  <EnsIcons name="x" :size="13"/>
                </button>
              </div>
            </TransitionGroup>
          </div>

          <!-- Queue -->
          <div class="card-glass rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <EnsIcons name="timer" :size="15" style="color:var(--accent-b);"/>
                <span class="text-sm font-semibold" style="color:var(--text-0);">Auto Queue</span>
                <span class="px-1.5 py-0.5 rounded-md text-xs" style="background:var(--bg-3);color:var(--text-2);">{{ gameQueue.length }}</span>
              </div>
              <button v-if="gameQueue.length" @click="clearQueue"
                class="text-xs px-2.5 py-1 rounded-lg transition-all"
                style="color:var(--text-3);border:1px solid rgba(180,60,100,0.15);"
                @mouseenter="($event.currentTarget as HTMLElement).style.color='#e05060'"
                @mouseleave="($event.currentTarget as HTMLElement).style.color='var(--text-3)'">
                Clear
              </button>
            </div>
            <div v-if="!gameQueue.length" class="py-5 text-center text-sm" style="color:var(--text-3);">
              <EnsIcons name="timer" :size="24" class="mx-auto mb-2 opacity-25"/>
              <p>Add games to queue — auto-plays after each 15 min</p>
            </div>
            <div v-else class="space-y-1.5">
              <div v-for="(game,idx) in gameQueue" :key="game.uid??game.id"
                class="flex items-center gap-2.5 px-3 py-2 rounded-xl fade-slide-in"
                style="background:var(--bg-3);border:1px solid rgba(180,60,100,0.1);">
                <span class="text-xs font-mono shrink-0 w-5 text-center" style="color:var(--text-3);">{{ idx+1 }}</span>
                <div class="flex-1 min-w-0 text-sm truncate" style="color:var(--text-1);">{{ game.name }}</div>
                <div class="flex items-center gap-0.5 shrink-0">
                  <button @click="moveQueueUp(idx)" :disabled="idx===0"
                    class="w-6 h-6 flex items-center justify-center rounded transition-all disabled:opacity-20"
                    style="color:var(--text-3);"><EnsIcons name="chevron-up" :size="12"/></button>
                  <button @click="moveQueueDown(idx)" :disabled="idx===gameQueue.length-1"
                    class="w-6 h-6 flex items-center justify-center rounded transition-all disabled:opacity-20"
                    style="color:var(--text-3);"><EnsIcons name="chevron-down" :size="12"/></button>
                  <button @click="removeFromQueue(game.uid??game.id)"
                    class="w-6 h-6 flex items-center justify-center rounded transition-all"
                    style="color:var(--text-3);"
                    @mouseenter="($event.currentTarget as HTMLElement).style.color='#e05060'"
                    @mouseleave="($event.currentTarget as HTMLElement).style.color='var(--text-3)'">
                    <EnsIcons name="x" :size="11"/></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Game actions -->
        <div class="lg:col-span-3 space-y-4" :key="forceKey">

          <!-- Now playing banner -->
          <Transition enter-from-class="opacity-0 scale-95" enter-active-class="transition-all duration-300"
                      leave-to-class="opacity-0 scale-95"   leave-active-class="transition-all duration-200">
            <div v-if="playingGame" class="card-glass rounded-2xl p-4 playing-glow"
              style="border:1px solid rgba(31,138,90,0.3);">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style="background:rgba(31,138,90,0.18);">
                  <EnsIcons name="play" :size="18" style="color:var(--success);"/>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium mb-0.5" style="color:var(--success);">Now Playing</div>
                  <div class="font-semibold truncate" style="color:var(--text-0);">{{ playingGame.name }}</div>
                  <div class="text-xs mt-0.5"
                    :style="`color:${gateway.accounts.value.some(a=>a.gateway.status.value==='connected')?'var(--success)':'var(--warn)'}`">
                    {{ gateway.accounts.value.filter(a=>a.gateway.status.value==='connected').length > 0
                      ? `Showing on ${gateway.accounts.value.filter(a=>a.gateway.status.value==='connected').length} Discord account(s)`
                      : 'Local only — add a token to show on Discord' }}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <div class="w-2 h-2 rounded-full dot-blink" style="background:var(--success);"></div>
                  <span class="text-xs font-medium" style="color:var(--success);">Live</span>
                </div>
              </div>
            </div>
          </Transition>

          <div v-if="!selectedGame && !playingGame" class="card-glass rounded-2xl p-10 text-center">
            <EnsIcons name="gamepad" :size="40" class="mx-auto mb-3 float-anim" style="color:var(--text-3);"/>
            <p class="text-sm" style="color:var(--text-2);">Select a game from the library</p>
          </div>

          <div v-if="selectedGame" class="card-glass rounded-2xl p-5 space-y-5 fade-slide-in">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style="background:rgba(124,29,74,0.2);border:1px solid rgba(212,64,110,0.2);color:var(--accent-b);">
                <EnsIcons name="gamepad" :size="22"/>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold truncate flex items-center gap-2 flex-wrap" style="color:var(--text-0);">
                  {{ selectedGame.name }}
                  <IconVerified class="w-4 h-4 shrink-0" style="color:var(--accent-b);"/>
                </h3>
                <div class="text-xs mt-0.5" style="color:var(--text-3);">App ID: {{ selectedGame.id }}</div>
              </div>
              <div v-if="selectedGame.is_running" class="px-2.5 py-1 rounded-lg text-xs font-medium shrink-0"
                style="background:rgba(31,138,90,0.15);border:1px solid rgba(31,138,90,0.3);color:var(--success);">Running</div>
            </div>
            <div v-if="selectedGame.aliases?.length" class="flex flex-wrap gap-1.5">
              <span v-for="a in selectedGame.aliases.slice(0,6)" :key="a"
                class="px-2 py-0.5 rounded-md text-xs font-mono"
                style="background:var(--bg-3);color:var(--text-2);">{{ a }}</span>
            </div>
            <div style="border-top:1px solid rgba(180,60,100,0.12);"></div>
            <div>
              <div class="flex items-center gap-2 mb-3">
                <EnsIcons name="play" :size="14" style="color:var(--accent-b);"/>
                <span class="text-sm font-medium" style="color:var(--text-1);">Executables</span>
              </div>
              <GameExecutables :game="selectedGame" @play="playGame" @stop="stopPlaying" @install_and_play="installAndPlay"/>
            </div>
            <button @click="addToQueue(selectedGame)"
              :disabled="gameQueue.some(q=>q.uid===selectedGame.uid||q.id===selectedGame.id)"
              class="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style="background:var(--bg-3);border:1px solid rgba(180,60,100,0.2);color:var(--text-2);">
              <EnsIcons name="library" :size="15"/>
              {{ gameQueue.some(q=>q.uid===selectedGame.uid||q.id===selectedGame.id)?'Already in Queue':'Add to Queue' }}
            </button>
            <div v-if="!gateway.accounts.value.some(a=>a.gateway.status.value==='connected')"
              class="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
              style="background:rgba(124,29,74,0.1);border:1px solid rgba(212,64,110,0.15);">
              <EnsIcons name="key" :size="15" style="color:var(--accent-b);flex-shrink:0;margin-top:1px;"/>
              <p class="text-xs leading-relaxed" style="color:rgba(212,64,110,0.8);">
                Add a Discord token to show "Playing" on your profile and enable quest heartbeats.
              </p>
            </div>
          </div>

          <!-- Stats -->
          <div class="card-glass rounded-2xl p-4">
            <div class="flex items-center gap-2 mb-4">
              <EnsIcons name="chart" :size="15" style="color:var(--accent-b);"/>
              <span class="text-sm font-semibold" style="color:var(--text-0);">Stats</span>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-xl p-3 text-center" style="background:var(--bg-3);">
                <div class="text-2xl font-bold" style="color:var(--accent-b);">{{ gameDB.length.toLocaleString() }}</div>
                <div class="text-xs mt-0.5" style="color:var(--text-3);">Games in DB</div>
              </div>
              <div class="rounded-xl p-3 text-center" style="background:var(--bg-3);">
                <div class="text-2xl font-bold" style="color:var(--text-0);">{{ gameList.length }}</div>
                <div class="text-xs mt-0.5" style="color:var(--text-3);">Library</div>
              </div>
              <div class="rounded-xl p-3 text-center" style="background:var(--bg-3);">
                <div class="text-2xl font-bold" :style="`color:${currentlyPlayingUid?'var(--success)':'var(--text-3)'}`">
                  {{ currentlyPlayingUid?'1':'0' }}
                </div>
                <div class="text-xs mt-0.5" style="color:var(--text-3);">Playing</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ ENS QUESTS ════════════════════════════════════════════════════ -->
    <section class="card-glass rounded-2xl overflow-hidden">
      <div class="px-5 py-4 flex items-center justify-between flex-wrap gap-3"
        style="border-bottom:1px solid rgba(180,60,100,0.15);">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style="background:rgba(196,122,24,0.15);color:var(--warn);">
            <EnsIcons name="trophy" :size="17"/>
          </div>
          <div>
            <div class="font-semibold text-sm" style="color:var(--text-0);">Ens Quests</div>
            <div class="text-xs mt-0.5" style="color:var(--text-2);">
              <template v-if="questMgr.fetchStatus.value==='loaded'">
                {{ questMgr.liveQuests.value.length }} live quest{{ questMgr.liveQuests.value.length!==1?'s':'' }} from Discord API
              </template>
              <template v-else-if="questMgr.fetchStatus.value==='auth_required'">
                Connect a token to auto-fetch live quests
              </template>
              <template v-else>Play 15 minutes to earn Discord rewards</template>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Tabs: Live vs Suggested -->
          <div class="flex items-center gap-1 rounded-lg p-0.5" style="background:var(--bg-3);">
            <button @click="questsSection='live'"
              class="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              :style="questsSection==='live'?'background:rgba(212,64,110,0.2);color:var(--accent-b);':'color:var(--text-3);'">
              Live
            </button>
            <button @click="questsSection='suggested'"
              class="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              :style="questsSection==='suggested'?'background:rgba(212,64,110,0.2);color:var(--accent-b);':'color:var(--text-3);'">
              All Quest Games
            </button>
          </div>
          <span v-if="questMgr.lastFetched.value" class="text-xs" style="color:var(--text-3);">
            {{ questMgr.lastFetched.value.toLocaleTimeString() }}
          </span>
          <button @click="refreshQuests" :disabled="questMgr.fetchStatus.value==='loading'"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
            style="background:rgba(196,122,24,0.12);border:1px solid rgba(196,122,24,0.25);color:var(--warn);">
            <EnsIcons name="refresh" :size="14" :class="questMgr.fetchStatus.value==='loading'?'spin-anim':''"/>
            Refresh
          </button>
        </div>
      </div>

      <div class="p-5">

        <!-- ── LIVE TAB ──────────────────────────────────────────────── -->
        <template v-if="questsSection==='live'">

          <!-- Loading -->
          <div v-if="questMgr.fetchStatus.value==='loading'" class="flex flex-col items-center gap-3 py-10">
            <div class="w-8 h-8 rounded-full border-2 border-t-transparent spin-anim"
              style="border-color:var(--warn);border-top-color:transparent;"></div>
            <p class="text-sm" style="color:var(--text-2);">Fetching quests from Discord API…</p>
          </div>

          <!-- Auth required hint -->
          <div v-else-if="questMgr.fetchStatus.value==='auth_required' || questMgr.fetchStatus.value==='idle'"
            class="flex items-start gap-3 py-4 px-4 rounded-xl"
            style="background:rgba(124,29,74,0.1);border:1px solid rgba(212,64,110,0.15);">
            <EnsIcons name="key" :size="17" style="color:var(--accent-b);flex-shrink:0;margin-top:1px;"/>
            <div>
              <p class="text-sm font-medium" style="color:var(--text-0);">Connect a Discord token to see live quests</p>
              <p class="text-xs mt-1" style="color:var(--text-2);">
                Once connected, the app fetches your active quests directly from Discord's API — no guessing needed.
                Switch to "All Quest Games" tab to browse the full list while connecting.
              </p>
            </div>
          </div>

          <!-- Live quests from API -->
          <template v-else-if="questMgr.fetchStatus.value==='loaded' && liveQuestsWithDBMatch.length">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-2 h-2 rounded-full dot-blink" style="background:var(--success);"></div>
              <span class="text-sm font-medium" style="color:var(--success);">
                {{ questMgr.liveQuests.value.length }} Active Quest{{ questMgr.liveQuests.value.length!==1?'s':'' }}
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div v-for="{quest, dbMatch, libMatch, isSynthetic} in liveQuestsWithDBMatch" :key="quest.id"
                class="rounded-xl p-4 fade-slide-in transition-all duration-200"
                :style="`background:var(--bg-3);border:1px solid ${questMgr.isCompleted(quest)?'rgba(31,138,90,0.3)':questMgr.isEnrolled(quest)?'rgba(212,64,110,0.25)':'rgba(196,122,24,0.2)'};`">

                <!-- Quest header -->
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    :style="`background:${questMgr.isCompleted(quest)?'rgba(31,138,90,0.15)':'rgba(196,122,24,0.12)'};color:${questMgr.isCompleted(quest)?'var(--success)':'var(--warn)'};`">
                    <EnsIcons :name="questMgr.isCompleted(quest)?'check':'trophy'" :size="18"/>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-sm leading-tight" style="color:var(--text-0);">
                      {{ questMgr.getQuestName(quest) }}
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                      <span v-if="timeUntil(quest.expires_at)" class="text-xs" style="color:var(--warn);">
                        {{ timeUntil(quest.expires_at) }}
                      </span>
                      <!-- Game status badge — always shows something positive -->
                      <span v-if="isSynthetic" class="text-xs px-1.5 py-0.5 rounded-full"
                        style="background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.25);color:#7289da;">
                        New Game
                      </span>
                      <span v-else class="text-xs px-1.5 py-0.5 rounded-full"
                        style="background:rgba(31,138,90,0.12);border:1px solid rgba(31,138,90,0.2);color:var(--success);">
                        In database
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Rewards -->
                <div v-if="quest.config?.rewards?.length" class="mb-3 flex flex-wrap gap-1.5">
                  <span v-for="r in quest.config.rewards" :key="r.name"
                    class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    style="background:rgba(196,122,24,0.1);border:1px solid rgba(196,122,24,0.2);color:rgba(212,138,30,0.9);">
                    <EnsIcons name="gift" :size="11"/> {{ r.name }}
                  </span>
                </div>

                <!-- Progress (if enrolled) -->
                <div v-if="questMgr.isEnrolled(quest) && !questMgr.isCompleted(quest)" class="mb-3">
                  <div class="flex justify-between text-xs mb-1" style="color:var(--text-2);">
                    <span>Progress</span>
                    <span>{{ Math.floor(questMgr.getProgressSeconds(quest)/60) }}m / {{ Math.floor(questMgr.getQuestDuration(quest)/60) }}m</span>
                  </div>
                  <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--bg-4);">
                    <div class="h-full rounded-full transition-all duration-500"
                      :style="`width:${Math.min(100,(questMgr.getProgressSeconds(quest)/questMgr.getQuestDuration(quest))*100)}%;background:linear-gradient(90deg,var(--accent),var(--accent-b));`"></div>
                  </div>
                </div>

                <!-- Heartbeat badge -->
                <div v-if="questMgr.heartbeatCounts.value[quest.id]" class="mb-3 flex items-center gap-1.5 text-xs"
                  style="color:var(--success);">
                  <div class="w-1.5 h-1.5 rounded-full dot-blink" style="background:var(--success);"></div>
                  Heartbeat active · {{ questMgr.heartbeatCounts.value[quest.id] }} sent
                </div>

                <!-- Actions -->
                <div class="space-y-2">
                  <button v-if="questMgr.isCompleted(quest)"
                    @click="handleClaimReward(quest.id)"
                    class="w-full py-2 rounded-lg text-xs font-medium transition-all"
                    style="background:rgba(31,138,90,0.2);border:1px solid rgba(31,138,90,0.35);color:var(--success);">
                    Claim Reward
                  </button>
                  <button v-else
                    @click="enrollAndPlay(quest.id, questMgr.getQuestApplicationId(quest), questMgr.getQuestName(quest))"
                    class="w-full py-2 rounded-lg text-xs font-medium transition-all"
                    :style="questMgr.isEnrolled(quest)
                      ? 'background:rgba(212,64,110,0.15);border:1px solid rgba(212,64,110,0.25);color:var(--accent-b);'
                      : 'background:rgba(196,122,24,0.15);border:1px solid rgba(196,122,24,0.25);color:var(--warn);'">
                    {{ questMgr.isEnrolled(quest) ? 'Resume Playing' : 'Enroll & Play' }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- No quests -->
          <div v-else-if="questMgr.fetchStatus.value==='loaded' && !questMgr.liveQuests.value.length"
            class="py-8 text-center" style="color:var(--text-3);">
            <EnsIcons name="trophy" :size="32" class="mx-auto mb-2 opacity-25"/>
            <p class="text-sm">No active quests right now</p>
            <p class="text-xs mt-1 opacity-60">Check back later or browse "All Quest Games"</p>
          </div>

        </template>

        <!-- ── ALL QUEST GAMES TAB ────────────────────────────────────── -->
        <template v-else>
          <div v-if="!allFetchDone" class="flex items-center gap-3 py-6 justify-center" style="color:var(--text-3);">
            <div class="w-4 h-4 rounded-full border-2 border-t-transparent spin-anim"
              style="border-color:var(--accent-b);border-top-color:transparent;"></div>
            <span class="text-sm">Loading game database…</span>
          </div>
          <div v-else>
            <div class="flex items-center gap-2 mb-4">
              <span class="text-xs" style="color:var(--text-2);">
                {{ suggestedQuestGames.length }} games historically known to appear in quests
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div v-for="game in suggestedQuestGames" :key="game.id"
                class="flex items-center gap-3 p-3 rounded-xl transition-all fade-slide-in cursor-pointer"
                style="background:var(--bg-3);border:1px solid rgba(180,60,100,0.1);"
                @mouseenter="($event.currentTarget as HTMLElement).style.borderColor='rgba(212,64,110,0.25)'"
                @mouseleave="($event.currentTarget as HTMLElement).style.borderColor='rgba(180,60,100,0.1)'">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style="background:rgba(124,29,74,0.15);color:var(--accent-b);">
                  <EnsIcons name="gamepad" :size="18"/>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate" style="color:var(--text-0);">{{ game.name }}</div>
                  <div class="text-xs mt-0.5" style="color:var(--text-3);">{{ game.executables?.length??0 }} exe</div>
                </div>
                <button @click="addGame(game)"
                  class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                  style="background:var(--bg-4);border:1px solid rgba(180,60,100,0.2);color:var(--text-2);"
                  @mouseenter="($event.currentTarget as HTMLElement).style.color='var(--accent-b)';($event.currentTarget as HTMLElement).style.borderColor='rgba(212,64,110,0.3)'"
                  @mouseleave="($event.currentTarget as HTMLElement).style.color='var(--text-2)';($event.currentTarget as HTMLElement).style.borderColor='rgba(180,60,100,0.2)'">
                  <EnsIcons name="plus" :size="14"/>
                </button>
              </div>
            </div>
          </div>
        </template>

      </div>
    </section>

    <!-- ══ LIVE LOG ══════════════════════════════════════════════════════ -->
    <section class="card-glass rounded-2xl overflow-hidden">
      <div class="px-5 py-3.5 flex items-center justify-between flex-wrap gap-2"
        style="border-bottom:1px solid rgba(180,60,100,0.15);">
        <div class="flex items-center gap-2">
          <EnsIcons name="terminal" :size="16" style="color:var(--accent-b);"/>
          <span class="text-sm font-semibold" style="color:var(--text-0);">Live Log</span>
          <span class="px-1.5 py-0.5 rounded-md text-xs" style="background:var(--bg-3);color:var(--text-2);">{{ filteredLogs.length }}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1 rounded-lg p-0.5" style="background:var(--bg-3);">
            <button v-for="f in ['all','info','warning','error','debug']" :key="f"
              @click="logFilter=f as any"
              class="px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize"
              :style="logFilter===f?'background:rgba(212,64,110,0.2);color:var(--accent-b);':'color:var(--text-3);'">
              {{ f }}
            </button>
          </div>
          <button @click="clearLogs"
            class="px-3 py-1.5 rounded-lg text-xs transition-all"
            style="color:var(--text-3);border:1px solid rgba(180,60,100,0.15);"
            @mouseenter="($event.currentTarget as HTMLElement).style.color='#e05060'"
            @mouseleave="($event.currentTarget as HTMLElement).style.color='var(--text-3)'">
            Clear
          </button>
        </div>
      </div>
      <div ref="logEl" class="h-64 overflow-y-auto p-4 space-y-1 font-mono text-xs" style="background:var(--bg-0);">
        <div v-if="!filteredLogs.length" class="h-full flex items-center justify-center" style="color:var(--text-3);">
          Waiting for events…
        </div>
        <div v-for="(log,idx) in filteredLogs" :key="idx" class="flex items-start gap-2 fade-slide-in">
          <span class="log-time shrink-0 mt-0.5">{{ formatLogTime(log.timestamp) }}</span>
          <span class="shrink-0 w-12 text-right font-semibold" :class="`log-${log.type}`">{{ log.type }}</span>
          <span class="flex-1 leading-relaxed break-all" :class="`log-${log.type}`">{{ log.message }}</span>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
@reference "../theme/style.css";
.game-list-enter-active { animation: fadeSlideIn 0.25s ease both; }
.game-list-leave-active { transition: all 0.2s ease; }
.game-list-leave-to     { opacity: 0; transform: translateX(-10px); }
</style>
