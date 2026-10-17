import type { Database } from "bun:sqlite";
import { makeSessionsRepo } from "@server/db/repos/sessions";
import { makeUsersRepo, type User } from "@server/db/repos/users";
import { log } from "@server/lib/log";
import { randomTokenBase64url, sha256Hex } from "./invite";

export interface SessionDeps {
  db: Database;
  ttlSeconds: number;
}

export interface SessionCookieParts {
  token: string;
  maxAgeSeconds: number;
  secure: boolean;
}

export class SessionManager {
  private sessions;
  private users;
  private ttl: number;

  constructor(deps: SessionDeps) {
    this.sessions = makeSessionsRepo(deps.db);
    this.users = makeUsersRepo(deps.db);
    this.ttl = deps.ttlSeconds;
  }

  createCookie(userId: number, secure: boolean): string {
    const token = randomTokenBase64url(32);
    const expiresAt = Math.floor(Date.now() / 1000) + this.ttl;
    this.sessions.create(sha256Hex(token), userId, expiresAt);
    return cookieString(token, this.ttl, secure);
  }

  /** Resolves the signed-in user from the request cookie; keeps TTL sliding. */
  getUser(req: Request): User | null {
    const token = readSessionCookie(req);
    if (!token) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const row = this.sessions.get(sha256Hex(token), nowSec);
    if (!row) return null;
    const remainingSec = row.expiresAt - nowSec;
    if (remainingSec < this.ttl / 2) {
      this.sessions.updateExpires(row.tokenHash, nowSec + this.ttl);
    }
    return this.users.getById(row.userId);
  }

  revoke(req: Request): string {
    const token = readSessionCookie(req);
    if (token) this.sessions.delete(sha256Hex(token));
    return cookieString("", 0, false, true);
  }

  clearExpired(): number {
    return this.sessions.purgeExpired(Math.floor(Date.now() / 1000));
  }

  purgeLoop(): () => void {
    const t = setInterval(() => {
      try {
        this.clearExpired();
      } catch (err) {
        log.error(`session purge failed: ${String(err)}`);
      }
    }, 3600_000);
    return () => clearInterval(t);
  }
}

function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === "lr_session") return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function cookieString(token: string, maxAgeSeconds: number, secure: boolean, expired = false): string {
  const parts = [
    `lr_session=${token}`,
    `Path=/`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${expired ? 0 : maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export const SESSION_COOKIE_NAME = "lr_session";
