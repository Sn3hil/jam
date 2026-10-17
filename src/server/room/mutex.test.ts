import { describe, expect, test } from "bun:test";
import { createMutex } from "./mutex";

describe("createMutex", () => {
  test("sequential execution in FIFO order", async () => {
    const mutex = createMutex();
    const order: number[] = [];

    const p1 = mutex.runExclusive(async () => {
      await Bun.sleep(20);
      order.push(1);
      return "one";
    });

    const p2 = mutex.runExclusive(async () => {
      order.push(2);
      return "two";
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("one");
    expect(r2).toBe("two");
    expect(order).toEqual([1, 2]);
  });

  test("rejected tasks propagate error cleanly without unhandled rejection or deadlock", async () => {
    const mutex = createMutex();

    let unhandledTriggered = false;
    const onUnhandled = () => {
      unhandledTriggered = true;
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      // First task throws
      expect(async () => {
        await mutex.runExclusive(() => {
          throw new Error("duplicate!");
        });
      }).toThrow(/duplicate!/);

      // Wait a tick for any microtask-level unhandled rejection
      await Bun.sleep(10);
      expect(unhandledTriggered).toBe(false);

      // Mutex is unlocked and next task runs successfully
      const nextResult = await mutex.runExclusive(() => "recovered");
      expect(nextResult).toBe("recovered");
      expect(mutex.isLocked()).toBe(false);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
