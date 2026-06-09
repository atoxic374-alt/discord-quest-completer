import { Game } from '@/types/types';
import { tryOnMounted } from '@vueuse/core';
import { ref } from 'vue';
import { useGlobalState } from './app-state';

const GH_MIRROR_URL         = 'https://markterence.github.io/discord-quest-completer/detectable.json';
const DISCORD_DETECTABLE_URL = 'https://discord.com/api/applications/detectable';
const FETCH_TIMEOUT          = 12_000;
const DONE_DELAY             = 600; // ms to wait after fetch before marking done

export function useFetchGameList() {
  const { addLog } = useGlobalState();

  const gameDB        = ref<Game[]>([]);
  const fetchError    = ref<string | null>(null);
  const isLoading     = ref(false);
  const allFetchDone  = ref(false);

  function isValidGameList(data: unknown): data is Game[] {
    return Array.isArray(data) && data.length > 0
      && typeof (data[0] as any)?.name === 'string'
      && Array.isArray((data[0] as any)?.executables);
  }

  async function _tryFetch(url: string, label: string): Promise<Game[] | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isValidGameList(data)) throw new Error('invalid format');
      addLog('info', `${data.length.toLocaleString()} games loaded from ${label}`);
      return data;
    } catch (e: any) {
      addLog('warning', `${label} failed: ${e.message}`);
      return null;
    }
  }

  async function fetchGameList() {
    if (isLoading.value) return;
    isLoading.value   = true;
    allFetchDone.value = false;
    fetchError.value  = null;
    addLog('info', 'Loading game database…');

    // 1. Try GitHub mirror and bundled fallback in parallel
    const [mirrorResult, bundledModule] = await Promise.all([
      _tryFetch(GH_MIRROR_URL, 'GitHub mirror'),
      import('../assets/gamelist.json').then(m => m.default as unknown as Game[]).catch(() => null),
    ]);

    if (mirrorResult) {
      gameDB.value = mirrorResult;
    } else {
      // 2. Try Discord API directly
      const discordResult = await _tryFetch(DISCORD_DETECTABLE_URL, 'Discord API');
      if (discordResult) {
        gameDB.value = discordResult;
      } else if (bundledModule && isValidGameList(bundledModule)) {
        // 3. Bundled JSON fallback
        gameDB.value = bundledModule;
        addLog('warning', `Using bundled fallback: ${bundledModule.length} games`);
      } else {
        fetchError.value = 'Could not load game database from any source';
        addLog('error', fetchError.value);
      }
    }

    isLoading.value = false;
    // Small delay so the UI shows the final count before hiding the banner
    setTimeout(() => { allFetchDone.value = true; }, DONE_DELAY);
  }

  tryOnMounted(() => fetchGameList());

  return {
    gameDB,
    fetchError,
    isLoading,
    allFetchDone,
    fetchGameList,
    // Legacy compat aliases
    isLoadingGH: isLoading,
    isLoadingDiscord: isLoading,
    isLoadingBundled: isLoading,
  };
}
