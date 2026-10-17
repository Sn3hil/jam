import { openDatabase } from "@server/db";
import { runMigrations } from "@server/db/migrate";
import { makeUsersRepo } from "@server/db/repos/users";
import { hashPassword } from "@server/auth/password";
import { loadConfig } from "@server/config";
import { log } from "@server/lib/log";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";

const usage = "usage: bun scripts/reset-password <username> <newPassword>";

const [username, password] = process.argv.slice(2);
if (!username || !password || process.argv.length !== 4) {
  log.error(usage);
  process.exit(1);
}
if (password.length < 8) {
  log.error("password must be at least 8 characters");
  process.exit(1);
}

const config = loadConfig(process.env as unknown as Record<string, string>);
mkdirSync(dirname(config.dbPath), { recursive: true });
const db = openDatabase(config.dbPath);
runMigrations(
  db,
  join(dirname(new URL(import.meta.url).pathname), "..", "src", "server", "db", "migrations"),
);
const users = makeUsersRepo(db);

try {
  const user = users.getByUsername(username);
  if (!user) {
    log.error(`no user named "${username}"`);
    process.exit(1);
  }
  users.setPassword(user.id, await hashPassword(password));
  log.info(`password reset for "${user.username}" (#${user.id})`);
} finally {
  db.close();
}
