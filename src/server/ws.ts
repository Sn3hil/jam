import type { ServerWebSocket, WebSocketHandler } from "bun";
import type { ServerMsg } from "@shared/protocol";

export interface WsData {
  userId: number;
  displayName: string;
  unsub?: () => void;
}

export interface WsRoom {
  subscribe(listener: (msg: ServerMsg) => void): () => void;
}

export const wsMessageHandlers = (room: WsRoom): WebSocketHandler<WsData> => ({
  open(ws: ServerWebSocket<WsData>): void {
    void ws.subscribe("room");
    const data = ws.data as WsData;
    const unsub = room.subscribe((msg) => {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* closing */
      }
    });
    data.unsub = unsub;
  },
  message(ws: ServerWebSocket<WsData>, message: string | Uint8Array): void {
    const text = typeof message === "string" ? message : Buffer.from(message).toString("utf8");
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && (parsed as { t?: unknown }).t === "ping") {
        ws.send(JSON.stringify({ t: "pong" }));
      }
    } catch {
      /* ignore bad frames */
    }
  },
  close(ws: ServerWebSocket<WsData>): void {
    const data = ws.data as WsData;
    data?.unsub?.();
  },
});
