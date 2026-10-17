import { describe, expect, test } from "bun:test";
import { signupSchema, loginSchema, queueSchema, historyQuerySchema, skipVoteSchema } from "./schemas";

describe("auth schemas", () => {
  test("signup rules", () => {
    const valid = { username: "kshiyo", displayName: "  K  ", password: "8-charmin", inviteCode: "inv" };
    const parsed = signupSchema.parse(valid);
    expect(parsed.displayName).toBe("K");
    expect(() => signupSchema.parse({ ...valid, username: "no spaces here" })).toThrow();
    expect(() => signupSchema.parse({ ...valid, username: "ab" })).toThrow();
    expect(() => signupSchema.parse({ ...valid, password: "short1" })).toThrow();
    expect(() => signupSchema.parse({ ...valid, extra: true })).toThrow();
  });

  test("login rules", () => {
    expect(loginSchema.parse({ username: "kshiyo", password: "x" })).toBeTruthy();
    expect(() => loginSchema.parse({ username: "", password: "x" })).toThrow();
  });
});

describe("queue schema", () => {
  test("exactly one source", () => {
    expect(queueSchema.parse({ videoId: "dQw4w9WgXcQ" })).toBeTruthy();
    expect(queueSchema.parse({ historyId: 5 })).toBeTruthy();
    expect(queueSchema.parse({ url: "https://youtu.be/dQw4w9WgXcQ" })).toBeTruthy();
    expect(() => queueSchema.parse({})).toThrow();
    expect(() => queueSchema.parse({ videoId: "dQw4w9WgXcQ", historyId: 5 })).toThrow();
    expect(() => queueSchema.parse({ videoId: "short" })).toThrow();
  });
});

describe("vote schema", () => {
  test("boolean required", () => {
    expect(skipVoteSchema.parse({ vote: true })).toBeTruthy();
    expect(() => skipVoteSchema.parse({ vote: "yes" })).toThrow();
  });
});

describe("history query schema", () => {
  test("defaults and types", () => {
    const q = historyQuerySchema.parse({});
    expect(q.view).toBe("recent");
    expect(q.limit).toBe(30);
    expect(q.q).toBe("");
    expect(historyQuerySchema.parse({ cursor: "45", view: "top", offset: "2" })).toEqual({
      view: "top",
      q: "",
      cursor: 45,
      offset: 2,
      limit: 30,
    });
    expect(() => historyQuerySchema.parse({ cursor: "abc" })).toThrow();
    expect(() => historyQuerySchema.parse({ limit: "500" })).toThrow();
  });
});
