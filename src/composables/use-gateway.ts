import { createGlobalState } from '@vueuse/core';
import { ref, computed } from 'vue';
import { useDiscordGateway, type PresenceActivity } from './discord-gateway';
import { useGlobalState } from './app-state';

const STORAGE_KEY = 'dqc_token';
const QUEST_DURATION = 15 * 60; // 15 minutes in seconds

export const useGatewayManager = createGlobalState(() => {
  const { addLog } = useGlobalState();
  const gateway = useDiscordGateway();

  // ── Token management ─────────────────────────────────────────────────
  const token = ref<string>('');

  function loadToken() {
    try {
      token.value = localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      token.value = '';
    }
  }

  function saveToken(t: string) {
    token.value = t.trim();
    try {
      if (token.value) {
        localStorage.setItem(STORAGE_KEY, token.value);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      addLog('warning', 'Could not persist token to localStorage');
    }
  }

  function clearToken() {
    saveToken('');
  }

  // Load on creation
  loadToken();

  // ── Gateway connection ────────────────────────────────────────────────
  function connect(overrideToken?: string) {
    const t = overrideToken ?? token.value;
    if (!t.trim()) {
      addLog('error', 'No token provided. Enter your Discord token to connect.');
      return false;
    }
    if (overrideToken) saveToken(overrideToken);
    gateway.connect(t.trim());
    return true;
  }

  function disconnect() {
    gateway.disconnect();
    stopPlaying();
  }

  // ── Quest timer ───────────────────────────────────────────────────────
  const questStartTime  = ref<number | null>(null);
  const questGameName   = ref<string | null>(null);
  const questGameId     = ref<string | null>(null);
  const questElapsed    = ref(0);
  const questCompleted  = ref(false);
  let   questTimerHandle: ReturnType<typeof setInterval> | null = null;

  function startQuestTimer(gameName: string, gameId: string) {
    stopQuestTimer();
    questStartTime.value = Date.now();
    questGameName.value  = gameName;
    questGameId.value    = gameId;
    questElapsed.value   = 0;
    questCompleted.value = false;

    questTimerHandle = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questStartTime.value!) / 1000);
      questElapsed.value = elapsed;
      if (!questCompleted.value && elapsed >= QUEST_DURATION) {
        questCompleted.value = true;
        addLog('info', `🎉 Quest completed for "${gameName}"! You can now claim your reward.`);
      }
    }, 1000);
  }

  function stopQuestTimer() {
    if (questTimerHandle) {
      clearInterval(questTimerHandle);
      questTimerHandle = null;
    }
    questStartTime.value = null;
    questGameName.value  = null;
    questGameId.value    = null;
    questElapsed.value   = 0;
    questCompleted.value = false;
  }

  const questProgress = computed(() =>
    Math.min(100, (questElapsed.value / QUEST_DURATION) * 100)
  );

  const questTimeLeft = computed(() => {
    const remaining = Math.max(0, QUEST_DURATION - questElapsed.value);
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  const questTimeElapsed = computed(() => {
    const m = Math.floor(questElapsed.value / 60);
    const s = questElapsed.value % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  // ── Presence helpers ──────────────────────────────────────────────────
  function startPlaying(activity: PresenceActivity) {
    if (gateway.status.value !== 'connected') {
      addLog('warning', 'Not connected to Discord Gateway — connect first with your token.');
      return false;
    }
    gateway.sendPresence(activity);
    startQuestTimer(activity.name, activity.application_id);
    return true;
  }

  function stopPlaying() {
    gateway.clearPresence();
    stopQuestTimer();
  }

  return {
    // token
    token,
    saveToken,
    clearToken,
    loadToken,
    // gateway
    connect,
    disconnect,
    status:   gateway.status,
    username: gateway.username,
    errorMsg: gateway.errorMsg,
    // presence
    startPlaying,
    stopPlaying,
    // quest timer
    questStartTime,
    questGameName,
    questGameId,
    questElapsed,
    questProgress,
    questCompleted,
    questTimeLeft,
    questTimeElapsed,
    QUEST_DURATION,
  };
});
