import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@server/db";
import { runMigrations } from "@server/db/migrate";
import { makeUsersRepo } from "@server/db/repos/mod";
import { hashPassword, verifyPassword } from "@server/auth/password";
import { timingSafeEq, sha256Hex, randomTokenBase64url } from "@server/auth/invite";
import { SessionManager } from "./sessions";
import { createRateLimiter } from "@server/lib/rateLimit";

const dir = mkdtempSync(join(tmpdir(), "lr-auth-"));
const db = openDatabase(join(dir, "test.db"));
runMigrations(db, join(import.meta.dir, "../db/migrations"));
const users = makeUsersRepo(db);

beforeAll(async () => {
  users.create("kshiyo", "Kshiyo", await hashPassword("correct-horse-1"));
  users.create("ana", "Ana", await hashPassword("battery-staple-2"));
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function reqWithCookie(cookie: string | null, url = "http://x/api/auth/me"): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(url, { headers });
}

describe("invite comparison", () => {
  test("timing safe equality", () => {
    expect(timingSafeEq("secret-invite-code-1", "secret-invite-code-1")).toBe(true);
    expect(timingSafeEq("secret-invite-code-1", "secret-invite-code-2")).toBe(false);
    expect(timingSafeEq("short", "shorter-th")).toBe(false);
    expect(sha256Hex("abc")).toHaveLength(64);
  });

  test("random tokens are url-safe and unique", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => randomTokenBase64url()));
    expect(tokens.size).toBe(20);
    for (const t of tokens) expect(t).not.toMatch(/[+/=]/);
  });
});

describe("password hashing", () => {
  test("hash and verify", async () => {
    const hash = await hashPassword("some-password-9");
    expect(hash).not.toBe("some-password-9");
    expect(await verifyPassword("some-password-9", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("sessions", () => {
  test("cookie round trip, sliding, revoke", () => {
    const sm = new SessionManager({ db, ttlSeconds: 1000 });
    const cookie = sm.createCookie(1, false);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    const token = /lr_session=([^;]+)/.exec(cookie)?.[1] ?? "";
    const req = reqWithCookie(`lr_session=${token}`);
    const user = sm.getUser(req);
    expect(user?.username).toBe("kshiyo");
    expect(sm.getUser(reqWithCookie("lr_session=garbage"))).toBeNull();
    expect(sm.getUser(reqWithCookie(null))).toBeNull();
    const clear = sm.revoke(req);
    expect(clear).toContain("Max-Age=0");
    expect(sm.getUser(req)).toBeNull();
  });

  test("secure cookie when public origin is https", () => {
    const sm = new SessionManager({ db, ttlSeconds: 1000 });
    expect(sm.createCookie(1, true)).toContain("Secure");
  });

  test("expired sessions are rejected and purged", () => {
    const sm = new SessionManager({ db, ttlSeconds: 1200 });
    const cookie = sm.createCookie(1, false);
    const token = /lr_session=([^;]+)/.exec(cookie)?.[1] ?? "";
    db.run(`UPDATE sessions SET expires_at = unixepoch() - 10 WHERE token_hash = '${sha256Hex(token)}'`);
    expect(sm.getUser(reqWithCookie(`lr_session=${token}`))).toBeNull();
    expect(sm.clearExpired()).toBeGreaterThanOrEqual(1);
  });
});

describe("rate limiter", () => {
  test("limits within window and resets on new window", async () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 5; i++) expect(limiter.hit("ip", 5, 100)).toBe(true);
    expect(limiter.hit("ip", 5, 100)).toBe(false);
    await Bun.sleep(120);
    expect(limiter.hit("ip", 5, 100)).toBe(true);
  });

  test("independent keys", () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 3; i++) expect(limiter.hit("a", 3, 60_000)).toBe(true);
    expect(limiter.hit("a", 3, 60_000)).toBe(false);
    expect(limiter.hit("b", 3, 60_000)).toBe(true);
  });
});
