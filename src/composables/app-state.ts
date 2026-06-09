import { createGlobalState } from '@vueuse/core'
import { computed, ComputedRef, Ref, ShallowRef, shallowRef } from 'vue'

export const Pages = {
  HOME: 'home',
  QUESTS: 'quests',
  PLAYGROUND: 'playground',
} as const
export type Pages = typeof Pages[keyof typeof Pages]

export interface AppLogObject {
  type:      'info' | 'error' | 'warning' | 'debug';
  message:   string;
  timestamp: Date;
}

const LOG_STORAGE_KEY = 'ens_logs';
const MAX_LOGS        = 200;

function loadLogsFromStorage(): AppLogObject[] {
  try {
    const raw = sessionStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { type: string; message: string; timestamp: string }[];
    return parsed.map(l => ({ ...l, timestamp: new Date(l.timestamp) })) as AppLogObject[];
  } catch { return []; }
}

function saveLogsToStorage(logs: AppLogObject[]) {
  try {
    const trimmed = logs.slice(-MAX_LOGS);
    sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export interface UseGlobalStateReturn {
  page:      ShallowRef<Pages>;
  setPage:   (newPage: Pages) => void;
  logs:      ShallowRef<AppLogObject[]>;
  addLog: {
    (type: 'info' | 'error' | 'warning' | 'debug', newLog: string): void;
    (newLog: string): void;
  };
  clearLogs: () => void;
}

export const useGlobalState = createGlobalState(() => {
  const page = shallowRef<Pages>(Pages.HOME);
  const logs = shallowRef<AppLogObject[]>(loadLogsFromStorage());

  function setPage(newPage: Pages) { page.value = newPage; }

  function addLog(type: string | 'info' | 'error' | 'warning' | 'debug', newLog?: string) {
    if (!newLog) { newLog = type; type = 'info'; }
    const entry: AppLogObject = {
      type:      type as AppLogObject['type'],
      message:   newLog,
      timestamp: new Date(),
    };
    const next = [...logs.value, entry].slice(-MAX_LOGS);
    logs.value = next;
    saveLogsToStorage(next);
  }

  function clearLogs() {
    logs.value = [];
    try { sessionStorage.removeItem(LOG_STORAGE_KEY); } catch { /* ignore */ }
  }

  return { page, setPage, logs, addLog, clearLogs } as UseGlobalStateReturn;
});
