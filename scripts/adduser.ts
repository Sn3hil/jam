import { openDatabase } from "@server/db";
import { runMigrations } from "@server/db/migrate";
import { makeUsersRepo } from "@server/db/repos/users";
import { hashPassword } from "@server/auth/password";
import { loadConfig } from "@server/config";
import { log } from "@server/lib/log";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";

const usage = "usage: bun scripts/adduser <username> <displayName> <password>";

const [username, displayName, password] = process.argv.slice(2);
if (!username || !displayName || !password || process.argv.length !== 5) {
  log.error(usage);
  process.exit(1);
}
if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
  log.error("username must be 3-24 chars of [A-Za-z0-9_.-]");
  process.exit(1);
}
if (displayName.trim().length < 1 || displayName.trim().length > 32) {
  log.error("displayName must be 1-32 characters");
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
  const user = users.create(username, displayName.trim(), await hashPassword(password));
  log.info(`created user "${user.username}" (#${user.id})`);
} catch (error) {
  if (String(error).includes("UNIQUE")) {
    log.error(`username "${username}" is already taken`);
  } else {
    log.error(`failed: ${String(error)}`);
  }
  process.exit(1);
} finally {
  db.close();
}
