/**
 * Discord Gateway WebSocket — real presence update via user token.
 *
 * Protocol flow:
 *  ← OP 10  HELLO         (receive heartbeat_interval)
 *  → OP 1   HEARTBEAT     (send every heartbeat_interval ms)
 *  → OP 2   IDENTIFY      (authenticate with token)
 *  ← OP 0   DISPATCH/READY (authenticated ✓)
 *  → OP 3   UPDATE_PRESENCE (set "Playing …")
 *  ← OP 11  HEARTBEAT_ACK
 */

import { ref, shallowRef } from 'vue';
import { useGlobalState } from './app-state';

export type GatewayStatus =
  | 'disconnected'
  | 'connecting'
  | 'identifying'
  | 'connected'
  | 'error';

const GATEWAY_URL  = 'wss://gateway.discord.gg/?v=10&encoding=json';
const OP_DISPATCH  = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY  = 2;
const OP_PRESENCE  = 3;
const OP_HELLO     = 10;
const OP_HB_ACK    = 11;
const OP_INVALID   = 9;
const OP_RECONNECT = 7;

export interface PresenceActivity {
  name: string;
  application_id: string;
  type?: number; // 0 = Playing
}

export function useDiscordGateway() {
  const { addLog } = useGlobalState();

  const status      = ref<GatewayStatus>('disconnected');
  const username    = ref<string | null>(null);
  const errorMsg    = ref<string | null>(null);
  const ws          = shallowRef<WebSocket | null>(null);

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let sequence: number | null = null;
  let token: string | null = null;
  let currentActivity: PresenceActivity | null = null;

  // ── internals ────────────────────────────────────────────────────────
  function send(op: number, d: unknown) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ op, d }));
    }
  }

  function startHeartbeat(interval: number) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      send(OP_HEARTBEAT, sequence);
    }, interval);
    // Send first one immediately
    send(OP_HEARTBEAT, sequence);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function identify() {
    status.value = 'identifying';
    send(OP_IDENTIFY, {
      token,
      properties: { os: 'windows', browser: 'Discord Client', device: 'discord' },
      compress: false,
      presence: currentActivity
        ? buildPresencePayload(currentActivity)
        : { status: 'online', afk: false, since: null, activities: [] },
    });
    addLog('info', '🔑 Identifying with Discord Gateway…');
  }

  function buildPresencePayload(activity: PresenceActivity | null) {
    if (!activity) {
      return { status: 'online', afk: false, since: null, activities: [] };
    }
    return {
      status: 'online',
      afk: false,
      since: null,
      activities: [
        {
          name: activity.name,
          type: activity.type ?? 0,
          application_id: activity.application_id,
        },
      ],
    };
  }

  // ── public API ───────────────────────────────────────────────────────
  function connect(userToken: string) {
    if (ws.value) disconnect();

    token  = userToken;
    status.value = 'connecting';
    errorMsg.value = null;
    addLog('info', '🔌 Connecting to Discord Gateway…');

    const socket = new WebSocket(GATEWAY_URL);
    ws.value = socket;

    socket.onopen = () => {
      addLog('debug', 'WebSocket open');
    };

    socket.onmessage = (event) => {
      let payload: { op: number; d: any; s: number | null; t: string | null };
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (payload.s !== null) sequence = payload.s;

      switch (payload.op) {
        case OP_HELLO: {
          const { heartbeat_interval } = payload.d as { heartbeat_interval: number };
          addLog('debug', `OP 10 HELLO — heartbeat every ${heartbeat_interval}ms`);
          startHeartbeat(heartbeat_interval);
          identify();
          break;
        }
        case OP_HB_ACK: {
          addLog('debug', 'OP 11 HEARTBEAT_ACK ✓');
          break;
        }
        case OP_DISPATCH: {
          if (payload.t === 'READY') {
            const user = payload.d?.user;
            username.value = user?.global_name || user?.username || 'Unknown';
            status.value   = 'connected';
            addLog('info', `✅ Connected as ${username.value}`);
            // If a game was queued before connect, send it now
            if (currentActivity) {
              sendPresence(currentActivity);
            }
          }
          break;
        }
        case OP_INVALID: {
          const resumable = payload.d as boolean;
          addLog('error', `OP 9 Invalid Session (resumable=${resumable}) — bad token or session`);
          status.value  = 'error';
          errorMsg.value = 'Invalid session — check your token.';
          disconnect();
          break;
        }
        case OP_RECONNECT: {
          addLog('warning', 'OP 7 Reconnect requested by Discord');
          disconnect();
          if (token) connect(token);
          break;
        }
      }
    };

    socket.onerror = () => {
      addLog('error', 'WebSocket error');
      status.value  = 'error';
      errorMsg.value = 'Connection error — check your network.';
    };

    socket.onclose = (e) => {
      stopHeartbeat();
      if (status.value !== 'error') {
        status.value = 'disconnected';
      }
      addLog(
        e.wasClean ? 'info' : 'warning',
        `WebSocket closed (code ${e.code}${e.reason ? ' — ' + e.reason : ''})`
      );
    };
  }

  function disconnect() {
    stopHeartbeat();
    ws.value?.close(1000, 'User disconnected');
    ws.value = null;
    status.value   = 'disconnected';
    username.value = null;
    token = null;
    addLog('info', '🔌 Disconnected from Discord Gateway');
  }

  function sendPresence(activity: PresenceActivity | null) {
    currentActivity = activity;
    if (status.value !== 'connected') {
      addLog('warning', 'Gateway not connected — presence will apply after connect');
      return;
    }
    send(OP_PRESENCE, buildPresencePayload(activity));
    if (activity) {
      addLog('info', `▶ Presence sent → Playing "${activity.name}" (ID: ${activity.application_id})`);
    } else {
      addLog('info', '■ Presence cleared — no longer playing');
    }
  }

  function clearPresence() {
    sendPresence(null);
  }

  return {
    status,
    username,
    errorMsg,
    connect,
    disconnect,
    sendPresence,
    clearPresence,
  };
}
