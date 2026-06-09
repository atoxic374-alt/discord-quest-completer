import { Game } from '@/types/types';
import { tryOnMounted, useAsyncState } from '@vueuse/core';
import { ref, watch } from 'vue';
import { useGlobalState } from './app-state';

const GH_MIRROR_URL = 'https://markterence.github.io/discord-quest-completer/detectable.json';
const DISCORD_DETECTABLE_URL = 'https://discord.com/api/applications/detectable';

export function useFetchGameList() {
    const { addLog } = useGlobalState();

    async function fetchGameListGHMirror(): Promise<Game[]> {
        addLog('Fetching game list from GitHub mirror...');
        const res = await fetch(GH_MIRROR_URL, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`GitHub mirror error: ${res.status}`);
        return res.json();
    }

    async function fetchGameListFromDiscord(): Promise<Game[]> {
        addLog('Fetching game list directly from Discord...');
        const res = await fetch(DISCORD_DETECTABLE_URL, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`Discord API error: ${res.status}`);
        return res.json();
    }

    const {
        state: gameListGHMirror,
        error: errorGH,
        isReady: isReadyGH,
        execute: executeGH,
        isLoading: isLoadingGH
    } = useAsyncState<Game[]>(fetchGameListGHMirror, [], {
        immediate: false,
        resetOnExecute: true,
    });

    const {
        state: gameListFromDiscord,
        error: errorDiscord,
        isReady: isReadyDiscord,
        execute: executeDiscord,
        isLoading: isLoadingDiscord
    } = useAsyncState<Game[]>(fetchGameListFromDiscord, [], {
        immediate: false,
        resetOnExecute: true,
    });

    const {
        state: bundledGameList,
        error: errorBundled,
        isReady: isReadyBundled,
        execute: executeBundled,
        isLoading: isLoadingBundled
    } = useAsyncState<Game[]>(() => {
        addLog('Loading bundled game list as fallback...');
        return import('../assets/gamelist.json').then(res => res.default as unknown as Game[]);
    }, [], {
        immediate: false,
        resetOnExecute: true,
    });

    const fetchError = ref<string | null>(null);
    const gameDB = ref<Game[]>([]);
    const allFetchDone = ref(false);

    function isValidGameList(data: any): boolean {
        return Array.isArray(data) && data.length > 0 && 'executables' in data[0] && 'name' in data[0];
    }

    watch(() => isReadyGH.value, (v) => addLog('debug', 'isReadyGH: ' + v));
    watch(() => isReadyDiscord.value, (v) => addLog('debug', 'isReadyDiscord: ' + v));
    watch(() => isReadyBundled.value, (v) => addLog('debug', 'isReadyBundled: ' + v));

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function fetchGameList() {
        allFetchDone.value = false;
        fetchError.value = null;
        addLog('Fetching game list...');

        try {
            await Promise.all([executeGH(), executeBundled()]);
        } catch {
            addLog('error', 'Error during initial fetch.');
        }

        if (errorGH.value) {
            addLog('warning', 'GitHub mirror failed, trying Discord API directly...');
            try { await executeDiscord(); } catch { /* ignore */ }
            if (errorDiscord.value) {
                addLog('error', 'Discord API also failed. Using bundled fallback.');
            }
        }

        if (isValidGameList(gameListGHMirror.value)) {
            gameDB.value = gameListGHMirror.value;
            addLog('✓ ' + gameListGHMirror.value.length + ' games loaded from GitHub mirror.');
        } else if (isValidGameList(gameListFromDiscord.value)) {
            gameDB.value = gameListFromDiscord.value;
            addLog('✓ ' + gameListFromDiscord.value.length + ' games loaded from Discord.');
        } else {
            gameDB.value = bundledGameList.value;
            addLog('⚠ Using bundled fallback: ' + bundledGameList.value.length + ' games.');
        }

        timeoutId = setTimeout(() => { allFetchDone.value = true; }, 1800);
    }

    watch(allFetchDone, (v) => {
        if (v && timeoutId) clearTimeout(timeoutId);
    });

    tryOnMounted(async () => { await fetchGameList(); });

    return {
        gameListGHMirror,
        gameListFromDiscord,
        bundledGameList,
        fetchError,
        isReadyGH,
        isReadyDiscord,
        isReadyBundled,
        gameDB,
        fetchGameList,
        isLoadingGH,
        isLoadingDiscord,
        isLoadingBundled,
        allFetchDone,
    };
}
