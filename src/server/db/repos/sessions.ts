import type { Database } from "bun:sqlite";

export interface SessionRow {
  tokenHash: string;
  userId: number;
  createdAt: number;
  expiresAt: number;
}

interface SessionRowDb {
  token_hash: string;
  user_id: number;
  created_at: number;
  expires_at: number;
}

function toSession(r: SessionRowDb): SessionRow {
  return { tokenHash: r.token_hash, userId: r.user_id, createdAt: r.created_at, expiresAt: r.expires_at };
}

export function makeSessionsRepo(db: Database) {
  const insert = db.query<SessionRowDb, [string, number, number]>(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?) RETURNING *",
  );
  const getByHash = db.query<SessionRowDb, [string, number]>(
    "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?",
  );
  const touch = db.query<void, [number, string]>("UPDATE sessions SET expires_at = ? WHERE token_hash = ?");
  const deleteByHash = db.query<void, [string]>("DELETE FROM sessions WHERE token_hash = ?");
  const purgeExpired = db.query<{ removed: number }, [number]>(
    "DELETE FROM sessions WHERE expires_at <= ? RETURNING 1 AS removed",
  );

  return {
    create(tokenHash: string, userId: number, expiresAt: number): SessionRow {
      const row = insert.get(tokenHash, userId, expiresAt);
      if (!row) throw new Error("insert session failed");
      return toSession(row);
    },
    get(tokenHash: string, nowSec: number): SessionRow | null {
      const row = getByHash.get(tokenHash, nowSec);
      return row ? toSession(row) : null;
    },
    updateExpires(tokenHash: string, expiresAtSec: number): void {
      touch.run(expiresAtSec, tokenHash);
    },
    delete(tokenHash: string): void {
      deleteByHash.run(tokenHash);
    },
    purgeExpired(nowSec: number): number {
      return purgeExpired.all(nowSec).length;
    },
  };
}

export type SessionsRepo = ReturnType<typeof makeSessionsRepo>;
