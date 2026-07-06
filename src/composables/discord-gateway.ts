/**
 * Discord Gateway WebSocket — real presence update via user token.
 * Protocol: OP10 HELLO → OP2 IDENTIFY → OP0 READY → OP3 PRESENCE
 *           OP7  RECONNECT → OP6 RESUME (preferred over fresh IDENTIFY)
 *           OP9  INVALID_SESSION → resume if d=true, else fresh IDENTIFY
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
const OP_RESUME    = 6;
const OP_RECONNECT = 7;
const OP_DISPATCH  = 0;
const OP_HELLO     = 10;
const OP_HB_ACK    = 11;
const OP_INVALID   = 9;

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
  let heartbeatJitter:    ReturnType<typeof setTimeout>  | null = null;
  let reconnectTimer:     ReturnType<typeof setTimeout>  | null = null;
  let sequence:           number | null = null;
  let token:              string | null = null;
  let sessionId:          string | null = null;
  let resumeGatewayUrl:   string | null = null;
  let currentActivity:    PresenceActivity | null = null;
  let intentionalClose =  false;

  function _clearReconnectTimer() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function _clearHeartbeat() {
    if (heartbeatJitter) { clearTimeout(heartbeatJitter); heartbeatJitter = null; }
    if (heartbeatTimer)  { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function send(op: number, d: unknown) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ op, d }));
    }
  }

  // First heartbeat uses random jitter (0 - interval) per Discord spec.
  // This avoids bot-like perfect timing that triggers suspicious connection flags.
  function startHeartbeat(interval: number) {
    _clearHeartbeat();
    const jitter = Math.floor(Math.random() * interval);
    heartbeatJitter = setTimeout(() => {
      send(OP_HEARTBEAT, sequence);
      heartbeatTimer = setInterval(() => send(OP_HEARTBEAT, sequence), interval);
    }, jitter);
  }

  function identify() {
    status.value = 'identifying';
    send(OP_IDENTIFY, {
      token,
      properties:   { os: 'Windows', browser: 'Chrome', device: '' },
      compress:     false,
      capabilities: 30717,
      presence: currentActivity
        ? buildPresencePayload(currentActivity)
        : { status: 'online', afk: false, since: null, activities: [] },
    });
  }

  function resume() {
    if (!token || !sessionId || sequence === null) { identify(); return; }
    status.value = 'identifying';
    addLog('info', 'Resuming session…');
    send(OP_RESUME, { token, session_id: sessionId, seq: sequence });
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
    sessionId = null;
    resumeGatewayUrl = null;
    intentionalClose = false;
    _clearReconnectTimer();
    status.value   = 'connecting';
    errorMsg.value = null;
    addLog('info', 'Connecting to Discord Gateway…');
    _openSocket(GATEWAY_URL);
  }

  function _openSocket(url: string) {
    const socket = new WebSocket(url);
    ws.value = socket;

    socket.onmessage = (event) => {
      let payload: { op: number; d: any; s: number | null; t: string | null };
      try { payload = JSON.parse(event.data as string); } catch { return; }
      if (payload.s !== null) sequence = payload.s;

      switch (payload.op) {
        case OP_HELLO: {
          const { heartbeat_interval } = payload.d as { heartbeat_interval: number };
          startHeartbeat(heartbeat_interval);
          // If we have a saved session, try to resume first
          if (sessionId && sequence !== null) resume();
          else identify();
          break;
        }
        case OP_HB_ACK: break;
        case OP_DISPATCH: {
          if (payload.t === 'READY') {
            const user = payload.d?.user;
            sessionId        = payload.d?.session_id ?? null;
            resumeGatewayUrl = payload.d?.resume_gateway_url ?? null;
            username.value   = user?.global_name || user?.username || 'Unknown';
            userId.value     = user?.id ?? null;
            avatarUrl.value  = user?.id && user?.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`
              : null;
            status.value = 'connected';
            addLog('info', `Connected as ${username.value}`);
            if (currentActivity) sendPresence(currentActivity);
          } else if (payload.t === 'RESUMED') {
            status.value = 'connected';
            addLog('info', `Session resumed as ${username.value ?? 'user'}`);
            if (currentActivity) sendPresence(currentActivity);
          }
          break;
        }
        case OP_INVALID: {
          const resumable = payload.d === true;
          if (resumable && sessionId) {
            addLog('warning', 'Session invalidated — attempting resume…');
            const savedToken = token;
            intentionalClose = false;
            disconnect();
            if (savedToken) {
              _clearReconnectTimer();
              // Random 1-5s delay per Discord spec before resuming
              reconnectTimer = setTimeout(() => {
                token = savedToken;
                intentionalClose = false;
                status.value = 'connecting';
                errorMsg.value = null;
                _openSocket(resumeGatewayUrl ?? GATEWAY_URL);
              }, 1000 + Math.random() * 4000);
            }
          } else {
            addLog('error', 'Invalid Session — token may be invalid or session expired');
            status.value   = 'error';
            errorMsg.value = 'Invalid session — check your token.';
            intentionalClose = true;
            sessionId = null;
            token = null;
            disconnect();
          }
          break;
        }
        case OP_RECONNECT: {
          addLog('warning', 'Reconnect requested by Discord — resuming session…');
          const savedToken   = token;
          const savedSession = sessionId;
          intentionalClose   = false;
          disconnect();
          if (savedToken) {
            _clearReconnectTimer();
            reconnectTimer = setTimeout(() => {
              token     = savedToken;
              sessionId = savedSession;
              intentionalClose = false;
              status.value = 'connecting';
              errorMsg.value = null;
              _openSocket(resumeGatewayUrl ?? GATEWAY_URL);
            }, 1000 + Math.random() * 3000);
          }
          break;
        }
      }
    };

    socket.onerror = () => {
      if (status.value !== 'error') {
        status.value   = 'error';
        errorMsg.value = 'Connection error — check your network.';
        addLog('error', 'WebSocket connection error');
      }
    };

    socket.onclose = (e) => {
      _clearHeartbeat();
      if (status.value !== 'error') status.value = 'disconnected';

      // Auto-reconnect only on unexpected drops
      if (!e.wasClean && token && !intentionalClose) {
        addLog('warning', `Connection lost (${e.code}), reconnecting in 5s…`);
        _clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
          if (token && !intentionalClose) {
            // Try resume if we have session data
            if (sessionId && sequence !== null) {
              const savedToken   = token;
              const savedSession = sessionId;
              token = savedToken;
              sessionId = savedSession;
              intentionalClose = false;
              status.value = 'connecting';
              errorMsg.value = null;
              _openSocket(resumeGatewayUrl ?? GATEWAY_URL);
            } else {
              connect(token);
            }
          }
        }, 5000);
      }
    };
  }

  function disconnect() {
    _clearHeartbeat();
    _clearReconnectTimer();
    intentionalClose = true;
    token = null;
    ws.value?.close(1000, 'User disconnected');
    ws.value        = null;
    status.value    = 'disconnected';
    username.value  = null;
    userId.value    = null;
    avatarUrl.value = null;
    sessionId       = null;
    resumeGatewayUrl = null;
    sequence        = null;
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
