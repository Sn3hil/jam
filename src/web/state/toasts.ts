import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  action?: () => void;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
const TTL_MS = 4500;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((prev) => ({ toasts: [...prev.toasts.filter((x) => x.text !== t.text), { id, ...t }] }));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        set((prev) => ({ toasts: prev.toasts.filter((x) => x.id !== id) }));
      }, TTL_MS),
    );
    return id;
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((prev) => ({ toasts: prev.toasts.filter((x) => x.id !== id) }));
  },
}));

export function pushToast(text: string, actionLabel?: string, action?: () => void): void {
  useToastStore.getState().push({ text, actionLabel, action });
}
