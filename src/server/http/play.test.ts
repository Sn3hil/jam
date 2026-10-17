import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@server/db";
import { runMigrations } from "@server/db/migrate";
import { makeUsersRepo } from "@server/db/repos/mod";
import { hashPassword } from "@server/auth/password";
import { SessionManager } from "@server/auth/sessions";
import { makeQueueRoutes, type RoomApi } from "./queue.routes";
import type { QueueItem } from "@shared/protocol";

const dir = mkdtempSync(join(tmpdir(), "jam-play-test-"));
const db = openDatabase(join(dir, "test.db"));
runMigrations(db, join(import.meta.dir, "../db/migrations"));
const users = makeUsersRepo(db);

const TEST_API_TOKEN = "super-secret-test-token-123";

beforeAll(async () => {
  users.create("alice", "Alice Wonder", await hashPassword("pass-1"));
  users.create("bob", "Bob Builder", await hashPassword("pass-2"));
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function setupRoutes(
  apiToken = TEST_API_TOKEN,
  listenerIds: number[] = [1, 2],
  mockEnqueue?: (u: any, v: string) => Promise<QueueItem>,
) {
  const session = new SessionManager({ db, ttlSeconds: 1000 });
  const enqueued: Array<{ user: any; videoId: string }> = [];
  const listeners = new Set(listenerIds);

  const room: RoomApi = {
    isListener: (userId: number) => listeners.has(userId),
    enqueue: mockEnqueue ?? (async (u, v) => {
      enqueued.push({ user: u, videoId: v });
      const item: QueueItem = {
        itemId: "item-12345678",
        videoId: v,
        title: "Test Track",
        channel: "Test Channel",
        durationSec: 180,
        seedArgb: null,
        requestedBy: u,
        queuedAt: Date.now(),
      };
      return item;
    }),
    enqueueFromHistory: async () => {
      throw new Error("not implemented");
    },
    resolveEnqueueTarget: async (data) => {
      if ("url" in data) {
        if (data.url.includes("dQw4w9WgXcQ")) {
          return { kind: "video", videoId: "dQw4w9WgXcQ" };
        }
        if (data.url === "invalid-url") {
          return { kind: "video", videoId: "invalid" };
        }
      }
      return { kind: "video", videoId: "dQw4w9WgXcQ" };
    },
    removeOwn: async () => {},
    skipVote: async () => ({ votes: 0, votesNeeded: 1 }),
    setPlaybackPaused: async () => "playing",
  };

  const routes = makeQueueRoutes({
    session,
    publicOrigin: "http://localhost:3000",
    maxBodyBytes: 4096,
    room,
    limiterEnqueue: () => true,
    users,
    apiToken,
  });

  return { routes, enqueued };
}

describe("POST /api/play", () => {
  test("rejects when API token is not configured on server", async () => {
    const { routes } = setupRoutes("");
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TEST_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "alice" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe("UNAUTHENTICATED");
  });

  test("rejects when Authorization header is missing", async () => {
    const { routes } = setupRoutes();
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "alice" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe("UNAUTHENTICATED");
  });

  test("rejects when Bearer token is invalid", async () => {
    const { routes } = setupRoutes();
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": "Bearer wrong-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "alice" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe("UNAUTHENTICATED");
  });

  test("rejects when body is missing user or url", async () => {
    const { routes } = setupRoutes();
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TEST_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION");
  });

  test("rejects when user does not exist in database", async () => {
    const { routes } = setupRoutes();
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TEST_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "nonexistentuser" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
    expect(data.error.message.toLowerCase()).toContain("user");
    expect(data.error.message.toLowerCase()).toContain("exist");
  });

  test("rejects when user is not in the room", async () => {
    // alice (id: 1) is not in the room; only bob (id: 2) is listening
    const { routes } = setupRoutes(TEST_API_TOKEN, [2]);
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TEST_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "alice" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_LISTENING");
    expect(data.error.message.toLowerCase()).toContain("user is not in the room");
  });

  test("successfully enqueues song for existing user with valid bearer token who joined the room", async () => {
    const { routes, enqueued } = setupRoutes(TEST_API_TOKEN, [1, 2]);
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TEST_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "alice" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.item.videoId).toBe("dQw4w9WgXcQ");
    expect(data.item.requestedBy.displayName).toBe("Alice Wonder");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.videoId).toBe("dQw4w9WgXcQ");
    expect(enqueued[0]!.user.displayName).toBe("Alice Wonder");
  });

  test("handles case-insensitive username lookup", async () => {
    const { routes, enqueued } = setupRoutes(TEST_API_TOKEN, [1, 2]);
    const req = new Request("http://localhost:3000/api/play", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TEST_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", user: "ALICE" }),
    });

    const res = await routes["/api/play"].POST(req, null as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.item.requestedBy.displayName).toBe("Alice Wonder");
    expect(enqueued).toHaveLength(1);
  });

  test("OPTIONS preflight returns 204 with CORS headers", async () => {
    const { routes } = setupRoutes();
    const res = await routes["/api/play"].OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
