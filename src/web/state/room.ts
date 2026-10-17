import { create } from "zustand";
import type { RoomEvent, RoomState } from "@shared/protocol";

export type ConnectionState = "connecting" | "open" | "down";

interface RoomStore {
  state: RoomState | null;
  connection: ConnectionState;
  clockOffsetMs: number;
  joined: boolean;
  latestEvent: RoomEvent | null;
  setState: (state: RoomState) => void;
  setConnection: (c: ConnectionState) => void;
  setJoined: (j: boolean) => void;
  markEvent: (ev: RoomEvent) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  state: null,
  connection: "connecting",
  clockOffsetMs: 0,
  joined: false,
  latestEvent: null,
  setState: (state) =>
    set((prev) => {
      if (prev.state && state.version <= prev.state.version) return prev;
      const clockOffsetMs = state.serverTimeMs - Date.now();
      return { state, clockOffsetMs };
    }),
  setConnection: (connection) => set({ connection }),
  setJoined: (joined) => set({ joined }),
  markEvent: (ev) => set({ latestEvent: ev }),
}));
