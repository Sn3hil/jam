export interface PresenceDeps {
  graceMs: number;
}

export interface PresenceUser {
  userId: number;
  displayName: string;
}

type GraceTimer = ReturnType<typeof setTimeout>;

export interface Presence {
  register(userId: number, displayName: string, clientId: number): void;
  unregister(userId: number, clientId: number): void;
  isListener(userId: number): boolean;
  listListeners(): PresenceUser[];
  listenerCount(): number;
  stopAll(): void;
  onJoin?: (user: PresenceUser) => void;
  onLeave?: (user: PresenceUser) => void;
}

export function createPresence(deps: PresenceDeps): Presence {
  const connections = new Map<number, { displayName: string; count: number }>();
  const grace = new Map<number, { user: PresenceUser; timer: GraceTimer }>();

  const fireLeave = (userId: number): void => {
    const known = connections.get(userId);
    const pending = grace.get(userId);
    const user: PresenceUser | null = known
      ? { userId, displayName: known.displayName }
      : (pending?.user ?? null);
    if (!user) return;
    connections.delete(userId);
    if (pending) {
      clearTimeout(pending.timer);
      grace.delete(userId);
    }
    presence.onLeave?.(user);
  };

  const presence: Presence = {
    onJoin: undefined,
    onLeave: undefined,
    register(userId, displayName, clientId): void {
      void clientId;
      const existing = connections.get(userId);
      if (existing) {
        existing.count += 1;
        const pending = grace.get(userId);
        if (pending) {
          clearTimeout(pending.timer);
          grace.delete(userId);
        }
        return;
      }
      const pending = grace.get(userId);
      connections.set(userId, { displayName, count: 1 });
      if (pending) {
        clearTimeout(pending.timer);
        grace.delete(userId);
        connections.get(userId)!.count = 1;
        return;
      }
      presence.onJoin?.({ userId, displayName });
    },
    unregister(userId, clientId): void {
      void clientId;
      const existing = connections.get(userId);
      if (!existing) return;
      existing.count -= 1;
      if (existing.count > 0) return;
      connections.delete(userId);
      const timer = setTimeout(() => {
        fireLeave(userId);
      }, deps.graceMs);
      grace.set(userId, {
        user: { userId, displayName: existing.displayName },
        timer,
      });
    },
    isListener(userId: number): boolean {
      return connections.has(userId) || grace.has(userId);
    },
    listListeners(): PresenceUser[] {
      const users: PresenceUser[] = [];
      for (const [userId, info] of connections) {
        users.push({ userId, displayName: info.displayName });
      }
      for (const [userId, entry] of grace) {
        if (!connections.has(userId)) users.push(entry.user);
      }
      return users;
    },
    listenerCount(): number {
      return connections.size + grace.size;
    },
    stopAll(): void {
      for (const { timer } of grace.values()) clearTimeout(timer);
      grace.clear();
      connections.clear();
    },
  };
  return presence;
}
