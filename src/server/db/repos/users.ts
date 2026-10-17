import type { Database } from "bun:sqlite";

export interface User {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: number;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: number;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
  };
}

export function makeUsersRepo(db: Database) {
  const insert = db.query<UserRow, [string, string, string]>(
    "INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?) RETURNING *",
  );
  const byUsername = db.query<UserRow, [string]>("SELECT * FROM users WHERE username = ? COLLATE NOCASE");
  const byId = db.query<UserRow, [number]>("SELECT * FROM users WHERE id = ?");
  const updatePassword = db.query<void, [string, number]>("UPDATE users SET password_hash = ? WHERE id = ?");
  const deleteById = db.query<void, [number]>("DELETE FROM users WHERE id = ?");

  return {
    create(username: string, displayName: string, passwordHash: string): User {
      const row = insert.get(username, displayName, passwordHash);
      if (!row) throw new Error("insert user failed");
      return toUser(row);
    },
    getByUsername(username: string): User | null {
      const row = byUsername.get(username);
      return row ? toUser(row) : null;
    },
    getById(id: number): User | null {
      const row = byId.get(id);
      return row ? toUser(row) : null;
    },
    setPassword(userId: number, passwordHash: string): void {
      updatePassword.run(passwordHash, userId);
    },
    delete(id: number): void {
      deleteById.run(id);
    },
  };
}

export type UsersRepo = ReturnType<typeof makeUsersRepo>;
