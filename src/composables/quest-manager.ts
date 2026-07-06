/**
 * Discord Quest Manager
 * Handles: fetch quests (with user token), enroll, heartbeat, claim reward.
 *
 * Endpoints (undocumented / reverse-engineered — community docs: docs.discord.food/resources/quests):
 *   GET  /api/v10/quests                          — list active quests for current user
 *   POST /api/v10/quests/{quest_id}/enroll        — enroll in a quest
 *   POST /api/v10/quests/{quest_id}/heartbeat     — send play-progress heartbeat (every ~60s)
 *   POST /api/v10/quests/{quest_id}/claim-reward  — claim completed reward
 */
import { ref, computed } from 'vue';
import { createGlobalState } from '@vueuse/core';
import { useGlobalState } from './app-state';

const API_BASE = '/discord-api/v10';

// ── Discord headers that mimic the client ──────────────────────────────────
function discordHeaders(token: string) {
  return {
    'Authorization':    token,
    'Content-Type':     'application/json',
    'X-Discord-Locale': 'en-US',
    'Accept':           'application/json',
    'X-Super-Properties': btoa(unescape(encodeURIComponent(JSON.stringify({
      os: 'Windows', browser: 'Chrome', browser_version: '124.0.0.0',
      os_version: '10', release_channel: 'stable', client_event_source: null,
      system_locale: 'en-US', browser_user_agent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })))),
  };
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface QuestReward {
  name:  string;
  asset?: string;
  type?: string;
}

export interface QuestTaskMetadata {
  quest_id?:                   string;
  task_duration?:              number;
  stream_duration_requirement?: number;
}

export interface QuestConfig {
  application_id?:   string;
  application_name?: string;
  name?:             string;
  messages?:         { header?: string; instructions?: string };
  rewards?:          QuestReward[];
  task_metadata?:    QuestTaskMetadata;
}

export interface QuestTaskProgress {
  task_id?:         string;
  progress_seconds?: number;
}

export interface QuestUserStatus {
  quest_id?:        string;
  user_id?:         string;
  enrolled_at?:     string | null;
  completed_at?:    string | null;
  claimed_at?:      string | null;
  progress?: {
    task_progressions?: QuestTaskProgress[];
  };
}

export interface DiscordQuest {
  id:           string;
  expires_at?:  string;
  config?:      QuestConfig;
  user_status?: QuestUserStatus;
}

// ── Quest fetch for a single token ────────────────────────────────────────
export async function fetchQuestsWithToken(token: string): Promise<DiscordQuest[]> {
  const res = await fetch(`${API_BASE}/quests`, {
    headers:  discordHeaders(token),
    signal:   AbortSignal.timeout(12000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('auth_required');
  // 404 = no active quests for this account (Discord's documented behavior)
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.quests ?? data.items ?? []);
}

// ── Enroll in a quest ────────────────────────────────────────────────────
export async function enrollQuest(questId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/quests/${questId}/enroll`, {
      method:  'POST',
      headers: discordHeaders(token),
      body:    '{}',
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

// ── Send heartbeat (play progress) ───────────────────────────────────────
export async function sendQuestHeartbeat(questId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/quests/${questId}/heartbeat`, {
      method:  'POST',
      headers: discordHeaders(token),
      body:    '{}',
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok || res.status === 204;
  } catch { return false; }
}

// ── Claim reward ──────────────────────────────────────────────────────────
export async function claimQuestReward(questId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/quests/${questId}/claim-reward`, {
      method:  'POST',
      headers: discordHeaders(token),
      body:    '{}',
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

// ── Global Quest Manager ──────────────────────────────────────────────────
const HEARTBEAT_INTERVAL     = 60_000;
const HEARTBEAT_JITTER_MAX   = 15_000; // ±15s random variation — avoids bot-like perfect timing

export const useQuestManager = createGlobalState(() => {
  const { addLog } = useGlobalState();

  const liveQuests     = ref<DiscordQuest[]>([]);
  const fetchStatus    = ref<'idle' | 'loading' | 'loaded' | 'auth_required' | 'error'>('idle');
  const lastFetched    = ref<Date | null>(null);

  const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  const heartbeatCounts = ref<Record<string, number>>({});

  // ── Fetch quests for all connected accounts ─────────────────────────────
  async function fetchQuestsForAccounts(accounts: { id: string; token: string; status: string }[]) {
    const connectedTokens = accounts.filter(a => a.status === 'connected').map(a => a.token);
    if (connectedTokens.length === 0) {
      fetchStatus.value = 'auth_required';
      return;
    }
    fetchStatus.value = 'loading';
    try {
      const quests = await fetchQuestsWithToken(connectedTokens[0]);
      liveQuests.value  = quests;
      fetchStatus.value = 'loaded';
      lastFetched.value = new Date();
      addLog('info', `Fetched ${quests.length} active quests from Discord API`);
    } catch (e: any) {
      if (e.message === 'auth_required') {
        fetchStatus.value = 'auth_required';
        addLog('warning', 'Quest API auth required — token may be invalid');
      } else {
        fetchStatus.value = 'error';
        addLog('error', `Quest API error: ${e.message}`);
      }
    }
  }

  // ── Auto-enroll in a quest ──────────────────────────────────────────────
  async function autoEnroll(questId: string, tokens: string[]) {
    if (!tokens.length) {
      addLog('warning', 'No tokens available for enrollment');
      return false;
    }
    let enrolled = false;
    for (const t of tokens) {
      const ok = await enrollQuest(questId, t);
      if (ok) {
        enrolled = true;
        addLog('info', `Enrolled in quest ${questId}`);
      }
    }
    return enrolled;
  }

  // ── Start heartbeat for a quest ─────────────────────────────────────────
  function startHeartbeat(questId: string, tokens: string[]) {
    if (!tokens.length) {
      addLog('warning', `Cannot start heartbeat for quest ${questId} — no tokens`);
      return;
    }
    const quest = liveQuests.value.find(q => q.id === questId);
    if (quest && isCompleted(quest)) {
      addLog('info', `Quest ${questId} already completed — heartbeat not needed`);
      return;
    }
    if (heartbeatTimers.has(questId)) return;

    // Random initial delay (0–15s) so multiple quests don't all fire at once
    const initialDelay = Math.floor(Math.random() * HEARTBEAT_JITTER_MAX);
    const initTimer = setTimeout(() => {
      _sendHeartbeatAll(questId, tokens);
      _scheduleNextHeartbeat(questId, tokens);
    }, initialDelay);

    heartbeatTimers.set(questId, initTimer as unknown as ReturnType<typeof setInterval>);
    addLog('info', `Heartbeat started for quest ${questId} (first in ${Math.round(initialDelay / 1000)}s)`);
  }

  function _scheduleNextHeartbeat(questId: string, tokens: string[]) {
    const q = liveQuests.value.find(x => x.id === questId);
    if (q && isCompleted(q)) {
      stopHeartbeat(questId);
      addLog('info', `Heartbeat auto-stopped — quest ${questId} completed`);
      return;
    }
    // Jitter: 60s ± up to 7.5s — avoids perfectly timed bot-like requests
    const jitter = Math.floor((Math.random() - 0.5) * HEARTBEAT_JITTER_MAX);
    const delay  = HEARTBEAT_INTERVAL + jitter;
    const timer  = setTimeout(() => {
      _sendHeartbeatAll(questId, tokens);
      _scheduleNextHeartbeat(questId, tokens);
    }, delay);
    heartbeatTimers.set(questId, timer as unknown as ReturnType<typeof setInterval>);
  }

  async function _sendHeartbeatAll(questId: string, tokens: string[]) {
    let anyOk = false;
    for (const t of tokens) {
      const ok = await sendQuestHeartbeat(questId, t);
      if (ok) anyOk = true;
    }
    if (!anyOk) {
      addLog('warning', `Heartbeat failed for quest ${questId} — will retry next cycle`);
    }
    heartbeatCounts.value = {
      ...heartbeatCounts.value,
      [questId]: (heartbeatCounts.value[questId] ?? 0) + 1,
    };
  }

  function stopHeartbeat(questId: string) {
    const timer = heartbeatTimers.get(questId);
    if (timer) {
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
      clearInterval(timer);
      heartbeatTimers.delete(questId);
      addLog('info', `Heartbeat stopped for quest ${questId}`);
    }
  }

  function stopAllHeartbeats() {
    for (const [, timer] of heartbeatTimers) {
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
      clearInterval(timer);
    }
    heartbeatTimers.clear();
    heartbeatCounts.value = {};
  }

  // ── Claim reward ────────────────────────────────────────────────────────
  async function claimReward(questId: string, tokens: string[]) {
    if (!tokens.length) {
      addLog('error', 'No tokens available to claim reward');
      return false;
    }
    for (const t of tokens) {
      const ok = await claimQuestReward(questId, t);
      if (ok) {
        addLog('info', `Reward claimed for quest ${questId}!`);
        stopHeartbeat(questId);
        return true;
      }
    }
    addLog('error', `Could not claim reward for quest ${questId}`);
    return false;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function getQuestApplicationId(q: DiscordQuest): string | null {
    return q.config?.application_id ?? null;
  }

  function getQuestName(q: DiscordQuest): string {
    return q.config?.application_name ?? q.config?.messages?.header ?? q.config?.name ?? 'Unknown Quest';
  }

  function getQuestDuration(q: DiscordQuest): number {
    return q.config?.task_metadata?.task_duration ?? 900;
  }

  function isEnrolled(q: DiscordQuest): boolean {
    return !!q.user_status?.enrolled_at;
  }

  function isCompleted(q: DiscordQuest): boolean {
    return !!q.user_status?.completed_at;
  }

  function isClaimed(q: DiscordQuest): boolean {
    return !!q.user_status?.claimed_at;
  }

  function getProgressSeconds(q: DiscordQuest): number {
    const progressions = q.user_status?.progress?.task_progressions;
    if (!progressions?.length) return 0;
    return progressions[0].progress_seconds ?? 0;
  }

  const activeHeartbeatQuestIds = computed(() => Object.keys(heartbeatCounts.value));

  return {
    liveQuests,
    fetchStatus,
    lastFetched,
    heartbeatCounts,
    activeHeartbeatQuestIds,
    fetchQuestsForAccounts,
    autoEnroll,
    startHeartbeat,
    stopHeartbeat,
    stopAllHeartbeats,
    claimReward,
    getQuestApplicationId,
    getQuestName,
    getQuestDuration,
    isEnrolled,
    isCompleted,
    isClaimed,
    getProgressSeconds,
  };
});
