export interface Mutex {
  runExclusive<T>(fn: () => T | Promise<T>): Promise<T>;
  isLocked(): boolean;
}

export function createMutex(): Mutex {
  let tail: Promise<void> = Promise.resolve();
  let locked = false;

  const runExclusive = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = tail;
    tail = next;

    try {
      await previous;
      locked = true;
      return await fn();
    } finally {
      locked = false;
      release();
    }
  };

  return { runExclusive, isLocked: () => locked };
}
