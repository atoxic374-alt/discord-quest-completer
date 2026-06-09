import { createGlobalState } from '@vueuse/core';
import { ref, computed, shallowRef } from 'vue';
import { useDiscordGateway, type PresenceActivity } from './discord-gateway';
import { useGlobalState } from './app-state';

const TOKENS_KEY      = 'ens_tokens';
const QUEST_DURATION  = 15 * 60;

export interface TokenEntry {
  id:     string;
  token:  string;
  label?: string;
}

export interface TokenAccount {
  id:        string;
  token:     string;
  label?:    string;
  gateway:   ReturnType<typeof useDiscordGateway>;
}

function loadTokenEntries(): TokenEntry[] {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTokenEntries(entries: TokenEntry[]) {
  try { localStorage.setItem(TOKENS_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export const useGatewayManager = createGlobalState(() => {
  const { addLog } = useGlobalState();

  // ── Accounts ─────────────────────────────────────────────────────────
  const accounts = shallowRef<TokenAccount[]>([]);

  function _syncAccounts(next: TokenAccount[]) {
    accounts.value = [...next];
  }

  function loadAndConnect() {
    const entries = loadTokenEntries();
    const accts: TokenAccount[] = entries.map(e => {
      const gw = useDiscordGateway();
      return { id: e.id, token: e.token, label: e.label, gateway: gw };
    });
    _syncAccounts(accts);
    // Connect each
    for (const a of accts) {
      a.gateway.connect(a.token);
    }
  }

  function addToken(token: string, label?: string) {
    const trimmed = token.trim();
    if (!trimmed) { addLog('error', 'Please enter a valid token.'); return; }
    // Check duplicate
    const existing = accounts.value.find(a => a.token === trimmed);
    if (existing) { addLog('warning', 'This token is already added.'); return; }

    const id  = randomId();
    const gw  = useDiscordGateway();
    const acct: TokenAccount = { id, token: trimmed, label, gateway: gw };

    const next = [...accounts.value, acct];
    _syncAccounts(next);

    const entries: TokenEntry[] = next.map(a => ({ id: a.id, token: a.token, label: a.label }));
    saveTokenEntries(entries);

    gw.connect(trimmed);
    addLog('info', `Token added — connecting…`);
  }

  function removeToken(id: string) {
    const acct = accounts.value.find(a => a.id === id);
    if (!acct) return;
    acct.gateway.disconnect();
    const next = accounts.value.filter(a => a.id !== id);
    _syncAccounts(next);
    saveTokenEntries(next.map(a => ({ id: a.id, token: a.token, label: a.label })));
    addLog('info', 'Token removed.');
  }

  function reconnectToken(id: string) {
    const acct = accounts.value.find(a => a.id === id);
    if (!acct) return;
    acct.gateway.connect(acct.token);
  }

  function disconnectToken(id: string) {
    const acct = accounts.value.find(a => a.id === id);
    if (!acct) return;
    acct.gateway.disconnect();
  }

  // ── Primary account (first connected) ────────────────────────────────
  const primaryAccount = computed(() =>
    accounts.value.find(a => a.gateway.status.value === 'connected') ?? accounts.value[0] ?? null
  );

  const status   = computed(() => primaryAccount.value?.gateway.status.value  ?? 'disconnected');
  const username = computed(() => primaryAccount.value?.gateway.username.value ?? null);
  const errorMsg = computed(() => primaryAccount.value?.gateway.errorMsg.value ?? null);

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
        addLog('info', `Quest completed for "${gameName}"! Claim your reward.`);
      }
    }, 1000);
  }

  function stopQuestTimer() {
    if (questTimerHandle) { clearInterval(questTimerHandle); questTimerHandle = null; }
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
    const r = Math.max(0, QUEST_DURATION - questElapsed.value);
    return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
  });
  const questTimeElapsed = computed(() => {
    const m = Math.floor(questElapsed.value / 60);
    const s = questElapsed.value % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  // ── Presence helpers ──────────────────────────────────────────────────
  function startPlaying(activity: PresenceActivity) {
    const connected = accounts.value.filter(a => a.gateway.status.value === 'connected');
    if (connected.length === 0) {
      addLog('warning', 'No connected accounts — add a Discord token first.');
      return false;
    }
    for (const a of connected) a.gateway.sendPresence(activity);
    startQuestTimer(activity.name, activity.application_id);
    return true;
  }

  function stopPlaying() {
    for (const a of accounts.value) {
      if (a.gateway.status.value === 'connected') a.gateway.clearPresence();
    }
    stopQuestTimer();
  }

  // ── Legacy compat (single token) ─────────────────────────────────────
  const token = computed(() => primaryAccount.value?.token ?? '');
  function saveToken(t: string) { addToken(t); }
  function connect(t: string)   { addToken(t); }
  function disconnect()         {
    for (const a of [...accounts.value]) removeToken(a.id);
  }

  // Init
  loadAndConnect();

  return {
    accounts,
    addToken, removeToken, reconnectToken, disconnectToken,
    primaryAccount,
    status, username, errorMsg,
    token, saveToken, connect, disconnect,
    startPlaying, stopPlaying,
    questStartTime, questGameName, questGameId,
    questElapsed, questProgress, questCompleted,
    questTimeLeft, questTimeElapsed,
    QUEST_DURATION,
  };
});
