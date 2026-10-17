import type { RoomEvent, ServerMsg, UserDTO } from "@shared/protocol";
import { useRoomStore } from "../state/room";
import { pushToast } from "../state/toasts";

const ERROR_COPY: Record<keyof typeof import("@shared/protocol").STATUS_CODE_BY_ERROR, string> = {
  VALIDATION: "Something looked wrong in that request.",
  UNAUTHENTICATED: "Please sign in again.",
  FORBIDDEN: "That isn't yours to touch.",
  NOT_FOUND: "That item is gone.",
  RATE_LIMITED: "Slow down a little and try again.",
  BAD_INVITE: "That invite code isn't right.",
  USERNAME_TAKEN: "That username is taken.",
  BAD_CREDENTIALS: "Wrong username or password.",
  QUEUE_FULL: "Queue limit reached.",
  DUPLICATE: "Already in the queue.",
  TOO_LONG: "That one's too long for the room.",
  LIVE_NOT_ALLOWED: "Live streams aren't allowed here.",
  PLAYLIST_NOT_SUPPORTED: "Playlists aren't supported — pick a single video.",
  NOT_LISTENING: "Join listening first.",
  NOTHING_PLAYING: "Nothing is playing right now.",
  AGE_RESTRICTED: "That video is age-restricted.",
  UNAVAILABLE: "That video is unavailable.",
  REGION_LOCKED: "That video is region-locked.",
  YOUTUBE_ERROR: "YouTube is misbehaving — try again shortly.",
};

export function describeApiError(e: unknown): string {
  const code = (e as { code?: ErrorCode }).code;
  return code ? copyForCode(code) : "Network hiccup — try again.";
}

type ErrorCode = keyof typeof import("@shared/protocol").STATUS_CODE_BY_ERROR;

export function copyForCode(code: ErrorCode): string {
  return ERROR_COPY[code] ?? ERROR_COPY.VALIDATION;
}

function toastForEvent(ev: RoomEvent): string {
  const who = ev.actor?.displayName ?? "Someone";
  switch (ev.kind) {
    case "queued":
      return ev.title ? `${who} queued ${ev.title}` : `${who} queued a song`;
    case "removed":
      return ev.title ? `${who} removed ${ev.title}` : `${who} removed a song`;
    case "skipped":
      return ev.title ? `${who} skipped ${ev.title}` : `${who} skipped the song`;
    case "skip_vote":
      return ev.title
        ? `${who} voted to skip ${ev.title}${ev.detail ? ` (${ev.detail})` : ""}`
        : `${who} voted to skip`;
    case "track_failed":
      return ev.title ? `${ev.title} failed to load — skipped` : "A track failed to load — skipped";
    case "joined":
      return `${who} joined the room`;
    case "left":
      return `${who} left the room`;
    case "paused":
      return ev.title ? `${who} paused ${ev.title}` : `${who} paused playback`;
    case "resumed":
      return ev.title ? `${who} resumed ${ev.title}` : `${who} resumed playback`;
  }
}

export interface WsManager {
  dispose: () => void;
}

export function startWs(user: UserDTO): WsManager {
  let disposed = false;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const clearPing = (): void => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (disposed) return;
    useRoomStore.getState().setConnection("down");
    const delay = Math.min(1000 * 2 ** attempt, 15000);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  const handleMessage = (raw: MessageEvent): void => {
    if (typeof raw.data !== "string") return;
    let msg: ServerMsg;
    try {
      msg = JSON.parse(raw.data) as ServerMsg;
    } catch {
      return;
    }
    if (msg.t === "state") {
      useRoomStore.getState().setState(msg.state);
      return;
    }
    if (msg.t === "event") {
      const ev = msg.ev;
      useRoomStore.getState().markEvent(ev);
      if (ev.actor && ev.actor.id === user.id) return;
      pushToast(toastForEvent(ev));
    }
  };

  const connect = (): void => {
    if (disposed) return;
    useRoomStore.getState().setConnection("connecting");
    const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      useRoomStore.getState().setConnection("open");
      clearPing();
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping" }));
      }, 15000);
    };
    ws.onmessage = handleMessage;
    ws.onclose = () => scheduleReconnect();
    ws.onerror = () => ws.close();
  };

  connect();

  return {
    dispose: () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearPing();
      socket?.close();
    },
  };
}
