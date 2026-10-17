import { create } from "zustand";

interface UiStore {
  volume: number;
  muted: boolean;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const useUiStore = create<UiStore>((set) => ({
  volume: loadVolume(),
  muted: localStorage.getItem("lr:muted") === "1",
  setVolume: (v) => {
    const vol = clamp01(v);
    localStorage.setItem("lr:volume", String(vol));
    if (vol > 0) {
      localStorage.setItem("lr:muted", "0");
      set({ volume: vol, muted: false });
    } else {
      set({ volume: vol });
    }
  },
  setMuted: (m) => {
    localStorage.setItem("lr:muted", m ? "1" : "0");
    set({ muted: m });
  },
}));

function loadVolume(): number {
  const raw = localStorage.getItem("lr:volume");
  const v = raw === null ? 1 : Number(raw);
  return Number.isFinite(v) ? clamp01(v) : 1;
}
