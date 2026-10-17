import { timingSafeEq } from "@server/auth/invite";
import { hashPassword, verifyPassword } from "@server/auth/password";
import type { UsersRepo } from "@server/db/repos/users";
import { log } from "@server/lib/log";
import type { DetailedRateLimiter } from "@server/lib/rateLimit";
import { fail, json, noContent, handle } from "./errors";
import { assertMutationAllowed, clientIp, readJsonBody, type Ctx } from "./middleware";
import { loginSchema, signupSchema } from "@shared/schemas";
import type { UserDTO } from "@shared/protocol";

export interface AuthRouteDeps extends Ctx {
  users: UsersRepo;
  inviteCode: string;
  limiter: DetailedRateLimiter;
}

function toDTO(user: { id: number; username: string; displayName: string }): UserDTO {
  return { id: user.id, username: user.username, displayName: user.displayName };
}

export function makeAuthRoutes(deps: AuthRouteDeps) {
  const signup = handle(async (req) => {
    assertMutationAllowed(deps, req);
    if (!deps.limiter.hit(`signup:${clientIp(req)}`, 5, 60_000)) {
      throw fail(429, "RATE_LIMITED", "Too many attempts. Wait a minute.");
    }
    const body = signupSchema.parse(await readJsonBody(deps, req));
    if (!timingSafeEq(body.inviteCode, deps.inviteCode)) {
      throw fail(403, "BAD_INVITE", "That invite code is not valid.");
    }
    if (deps.users.getByUsername(body.username)) {
      throw fail(409, "USERNAME_TAKEN", "That name is already taken.");
    }
    const passwordHash = await hashPassword(body.password);
    try {
      const user = deps.users.create(body.username, body.displayName, passwordHash);
      const isSecure = deps.publicOrigin.startsWith("https://") || req.headers.get("x-forwarded-proto") === "https";
      const cookie = deps.session.createCookie(user.id, isSecure);
      log.info(`signup: new user ${user.username} (#${user.id})`);
      return json(201, { user: toDTO(user) }, { "set-cookie": cookie });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw fail(409, "USERNAME_TAKEN", "That name is already taken.");
      }
      throw error;
    }
  });

  const login = handle(async (req) => {
    assertMutationAllowed(deps, req);
    if (!deps.limiter.hit(`login-ip:${clientIp(req)}`, 5, 60_000)) {
      throw fail(429, "RATE_LIMITED", "Too many attempts. Wait a minute.");
    }
    const body = loginSchema.parse(await readJsonBody(deps, req));
    const user = deps.users.getByUsername(body.username);
    let ok: boolean;
    try {
      ok = user !== null && (await verifyPassword(body.password, user.passwordHash));
    } catch {
      ok = false;
    }
    if (!ok) {
      if (!deps.limiter.hit(`login-fail:${body.username.toLowerCase()}`, 10, 3_600_000)) {
        throw fail(429, "RATE_LIMITED", "Too many failed attempts for this account. Try again later.");
      }
      throw fail(401, "BAD_CREDENTIALS", "Wrong username or password.");
    }
    if (!user) throw fail(401, "BAD_CREDENTIALS", "Wrong username or password.");
    const fresh = deps.users.getById(user.id) ?? user;
    const isSecure = deps.publicOrigin.startsWith("https://") || req.headers.get("x-forwarded-proto") === "https";
    const cookie = deps.session.createCookie(fresh.id, isSecure);
    return json(200, { user: toDTO(fresh) }, { "set-cookie": cookie });
  });

  const logout = handle(async (req) => {
    assertMutationAllowed(deps, req);
    const clearCookie = deps.session.revoke(req);
    return noContent({ "set-cookie": clearCookie });
  });

  const me = handle(async (req) => {
    const user = deps.session.getUser(req);
    if (!user) throw fail(401, "UNAUTHENTICATED", "Sign in to continue.");
    return json(200, { user: toDTO(user) });
  });

  return {
    "/api/auth/signup": { POST: signup },
    "/api/auth/login": { POST: login },
    "/api/auth/logout": { POST: logout },
    "/api/auth/me": { GET: me },
  };
}
