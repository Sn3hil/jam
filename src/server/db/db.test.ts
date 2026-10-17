import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./index";
import { runMigrations } from "./migrate";
import { makeUsersRepo, makeSessionsRepo, makeHistoryRepo, escapeLikePattern } from "./repos/mod";

const dir = mkdtempSync(join(tmpdir(), "lr-db-"));
const dbPath = join(dir, "test.db");
const db = openDatabase(dbPath);
const migrationsDir = join(import.meta.dir, "migrations");
runMigrations(db, migrationsDir);

function must<T>(value: T | null): T {
  if (value === null) throw new Error("missing test fixture");
  return value;
}

const users = makeUsersRepo(db);
const sessions = makeSessionsRepo(db);
const history = makeHistoryRepo(db);

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  test("apply and track user_version", () => {
    expect(db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(1);
  });
});

describe("users", () => {
  test("create and case-insensitive uniqueness", () => {
    const u = users.create("kshiyo", "Kshiyo", "hash-a");
    expect(u.id).toBeGreaterThan(0);
    expect(users.getByUsername("KSHIYO")?.id).toBe(u.id);
    const insert = () => users.create("kshiyo", "Other", "hash-b");
    let threw = false;
    try {
      insert();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("password update and lookup by id", () => {
    const u = users.create("ana", "Ana", "hash-x");
    users.setPassword(u.id, "hash-y");
    expect(users.getById(u.id)?.passwordHash).toBe("hash-y");
    expect(users.getById(999_999)).toBeNull();
  });

  test("cascade deletes sessions and history", () => {
    const u = users.create("sumi", "Sumi", "h");
    sessions.create("tok1", u.id, 9_999_999);
    history.append({
      userId: u.id,
      videoId: "dQw4w9WgXcQ",
      title: "t",
      channel: null,
      durationSec: 1,
      seedArgb: null,
    });
    users.delete(u.id);
    expect(sessions.get("tok1", 0)).toBeNull();
    expect(history.listRecent(u.id, null, null, 10)).toHaveLength(0);
  });
});

describe("sessions", () => {
  test("create, get, expiry, sliding", () => {
    const u = users.getById(1) ?? users.create("session-user", "S", "h");
    sessions.create("tok2", u.id, 1_500_000_000);
    expect(sessions.get("tok2", Math.floor(Date.now() / 1000))).toBeNull();
    const now = Math.floor(Date.now() / 1000);
    sessions.create("tok3", u.id, now + 1000);
    expect(sessions.get("tok3", now)?.userId).toBe(u.id);
    sessions.updateExpires("tok3", now + 5000);
    expect(sessions.get("tok3", now)?.expiresAt).toBe(now + 5000);
    sessions.delete("tok3");
    expect(sessions.get("tok3", now)).toBeNull();
  });

  test("purgeExpired removes only expired", () => {
    const u = users.getById(1) ?? users.create("session-user", "S", "h");
    const now = Math.floor(Date.now() / 1000);
    sessions.create("tok-old", u.id, now - 10);
    sessions.create("tok-new", u.id, now + 10_000);
    const removed = sessions.purgeExpired(now);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(sessions.get("tok-new", now)).not.toBeNull();
  });
});

describe("history", () => {
  let u1: NonNullable<ReturnType<typeof users.getById>>;
  let u2: NonNullable<ReturnType<typeof users.getById>>;
  const ids: number[] = [];

  test("append returns monotonic ids with duplicates allowed", () => {
    u1 = must(users.getById(1));
    u2 = must(users.getById(2));
    ids.push(
      history.append({
        userId: u1.id,
        videoId: "aaaaaaaaaaa",
        title: "Song A",
        channel: "Chan",
        durationSec: 100,
        seedArgb: 0xff112233,
      }).id,
    );
    ids.push(
      history.append({
        userId: u1.id,
        videoId: "aaaaaaaaaaa",
        title: "Song A",
        channel: "Chan",
        durationSec: 100,
        seedArgb: 0xff112233,
      }).id,
    );
    ids.push(
      history.append({
        userId: u2.id,
        videoId: "bbbbbbbbbbb",
        title: "100% Hits",
        channel: "a_b C",
        durationSec: null,
        seedArgb: null,
      }).id,
    );
    expect(ids[1] ?? 0).toBeGreaterThan(ids[0] ?? 0);
  });

  test("recent keyset pagination newest-first", () => {
    const page1 = history.listRecent(u1.id, null, null, 1);
    expect(page1).toHaveLength(1);
    expect(page1[0]?.id).toBe(ids[1]);
    const page2 = history.listRecent(u1.id, null, page1[0]?.id ?? null, 10);
    expect(page2).toHaveLength(1);
    expect(page2[0]?.id).toBe(ids[0]);
  });

  test("search escapes LIKE wildcards", () => {
    expect(history.listRecent(u1.id, escapeLikePattern("100%"), null, 10)).toHaveLength(0);
    expect(history.listRecent(u2.id, escapeLikePattern("100%"), null, 10)).toHaveLength(1);
    expect(history.listRecent(u2.id, escapeLikePattern("a_b"), null, 10)).toHaveLength(1);
    expect(history.listRecent(u2.id, escapeLikePattern("ab"), null, 10)).toHaveLength(0);
  });

  test("user scoping: other users' rows are invisible", () => {
    expect(history.listRecent(u1.id, null, null, 10)).toHaveLength(2);
    expect(history.listRecent(u2.id, null, null, 10)).toHaveLength(1);
    expect(history.getOwn(ids[2] ?? 0, u1.id)).toBeNull();
    expect(history.getOwn(ids[2] ?? 0, u2.id)).not.toBeNull();
  });

  test("top view groups by video with times and latest title", () => {
    history.append({
      userId: u1.id,
      videoId: "aaaaaaaaaaa",
      title: "Song A v2",
      channel: "Chan",
      durationSec: 100,
      seedArgb: null,
    });
    const top = history.listTop(u1.id, null, 10, 0);
    expect(top).toHaveLength(1);
    expect(top[0]?.times).toBe(3);
    expect(top[0]?.title).toBe("Song A v2");
    expect(history.listTop(u1.id, escapeLikePattern("v2"), 10, 0)[0]?.times).toBe(1);
  });

  test("deleteOwn only removes own rows", () => {
    expect(history.deleteOwn(ids[0] ?? 0, u2.id)).toBe(false);
    expect(history.deleteOwn(ids[0] ?? 0, u1.id)).toBe(true);
    expect(history.getOwn(ids[0] ?? 0, u1.id)).toBeNull();
  });
});
