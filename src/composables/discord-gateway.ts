/**
 * Discord Gateway WebSocket — real presence update via user token.
 * Protocol: OP10 HELLO → OP2 IDENTIFY → OP0 READY → OP3 PRESENCE
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
const OP_HEARTBEAT = 1;
const OP_IDENTIFY  = 2;
const OP_PRESENCE  = 3;
const OP_DISPATCH  = 0;
const OP_HELLO     = 10;
const OP_HB_ACK    = 11;
const OP_INVALID   = 9;
const OP_RECONNECT = 7;

export interface PresenceActivity {
  name:           string;
  application_id: string;
  type?:          number;
}

export function useDiscordGateway() {
  const { addLog } = useGlobalState();

  const status    = ref<GatewayStatus>('disconnected');
  const username  = ref<string | null>(null);
  const userId    = ref<string | null>(null);
  const avatarUrl = ref<string | null>(null);
  const errorMsg  = ref<string | null>(null);
  const ws        = shallowRef<WebSocket | null>(null);

  let heartbeatTimer:     ReturnType<typeof setInterval> | null = null;
  let reconnectTimer:     ReturnType<typeof setTimeout>  | null = null;
  let sequence:           number | null = null;
  let token:              string | null = null;
  let currentActivity:    PresenceActivity | null = null;
  let intentionalClose =  false; // prevents auto-reconnect on manual disconnect or bad token

  function _clearReconnectTimer() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function send(op: number, d: unknown) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ op, d }));
    }
  }

  function startHeartbeat(interval: number) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => send(OP_HEARTBEAT, sequence), interval);
    send(OP_HEARTBEAT, sequence);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function identify() {
    status.value = 'identifying';
    send(OP_IDENTIFY, {
      token,
      properties: { os: 'Windows', browser: 'Chrome', device: '' },
      compress:   false,
      intents:    0,
      presence: currentActivity
        ? buildPresencePayload(currentActivity)
        : { status: 'online', afk: false, since: null, activities: [] },
    });
  }

  function buildPresencePayload(activity: PresenceActivity | null) {
    if (!activity) return { status: 'online', afk: false, since: null, activities: [] };
    return {
      status: 'online', afk: false, since: null,
      activities: [{ name: activity.name, type: activity.type ?? 0, application_id: activity.application_id }],
    };
  }

  function connect(userToken: string) {
    if (!userToken?.trim()) return;
    if (ws.value) disconnect();
    token = userToken;
    intentionalClose = false;
    _clearReconnectTimer();
    status.value   = 'connecting';
    errorMsg.value = null;
    addLog('info', 'Connecting to Discord Gateway…');

    const socket = new WebSocket(GATEWAY_URL);
    ws.value = socket;

    socket.onmessage = (event) => {
      let payload: { op: number; d: any; s: number | null; t: string | null };
      try { payload = JSON.parse(event.data as string); } catch { return; }
      if (payload.s !== null) sequence = payload.s;

      switch (payload.op) {
        case OP_HELLO: {
          const { heartbeat_interval } = payload.d as { heartbeat_interval: number };
          startHeartbeat(heartbeat_interval);
          identify();
          break;
        }
        case OP_HB_ACK: break;
        case OP_DISPATCH: {
          if (payload.t === 'READY') {
            const user = payload.d?.user;
            username.value  = user?.global_name || user?.username || 'Unknown';
            userId.value    = user?.id ?? null;
            avatarUrl.value = user?.id && user?.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`
              : null;
            status.value = 'connected';
            addLog('info', `Connected as ${username.value}`);
            if (currentActivity) sendPresence(currentActivity);
          }
          break;
        }
        case OP_INVALID: {
          addLog('error', 'Invalid Session — check your token');
          status.value   = 'error';
          errorMsg.value = 'Invalid session — check your token.';
          intentionalClose = true; // don't auto-reconnect on bad token
          token = null;
          _clearReconnectTimer(); // cancel any pending reconnect before closing
          disconnect();
          break;
        }
        case OP_RECONNECT: {
          addLog('warning', 'Reconnect requested by Discord');
          const savedToken = token;
          intentionalClose = false; // reconnect is expected
          disconnect();
          if (savedToken) {
            _clearReconnectTimer();
            reconnectTimer = setTimeout(() => connect(savedToken), 2000);
          }
          break;
        }
      }
    };

    socket.onerror = () => {
      // onerror is always followed by onclose — handle reconnect there
      if (status.value !== 'error') {
        status.value   = 'error';
        errorMsg.value = 'Connection error — check your network.';
        addLog('error', 'WebSocket connection error');
      }
    };

    socket.onclose = (e) => {
      stopHeartbeat();
      if (status.value !== 'error') status.value = 'disconnected';

      // Auto-reconnect only on unexpected drops — not on intentional close or bad token
      if (!e.wasClean && token && !intentionalClose) {
        addLog('warning', `Connection lost (${e.code}), reconnecting in 5s…`);
        _clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
          if (token && !intentionalClose) connect(token);
        }, 5000);
      }
    };
  }

  function disconnect() {
    stopHeartbeat();
    _clearReconnectTimer();
    intentionalClose = true;
    token = null;
    ws.value?.close(1000, 'User disconnected');
    ws.value        = null;
    status.value    = 'disconnected';
    username.value  = null;
    userId.value    = null;
    avatarUrl.value = null;
    addLog('info', 'Disconnected from Discord Gateway');
  }

  function sendPresence(activity: PresenceActivity | null) {
    currentActivity = activity;
    if (status.value !== 'connected') return;
    send(OP_PRESENCE, buildPresencePayload(activity));
    if (activity) addLog('info', `Presence set: Playing "${activity.name}"`);
    else           addLog('info', 'Presence cleared');
  }

  function clearPresence() { sendPresence(null); }

  return { status, username, userId, avatarUrl, errorMsg, connect, disconnect, sendPresence, clearPresence };
}
