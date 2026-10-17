import { openDatabase } from "@server/db";
import { loadConfig } from "@server/config";
import { log } from "@server/lib/log";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";

const config = loadConfig(process.env as unknown as Record<string, string>);
const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
const backupsDir = join(dirname(config.dbPath), "backups");
const target = join(backupsDir, `app-${stamp}.db`);

mkdirSync(backupsDir, { recursive: true });

const db = openDatabase(config.dbPath);
try {
  db.run(`VACUUM INTO '${target}'`);
  log.info(`backup written: ${target}`);
} catch (error) {
  log.error(`backup failed: ${String(error)}`);
  process.exit(1);
} finally {
  db.close();
}
