import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { log } from "@server/lib/log";

function userVersion(db: Database): number {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  return row?.user_version ?? 0;
}

function setUserVersion(db: Database, version: number): void {
  db.run(`PRAGMA user_version = ${Math.trunc(version)}`);
}

export function runMigrations(db: Database, migrationsDir: string): void {
  const applied = userVersion(db);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ f, n: Number.parseInt(basename(f).split("_")[0] ?? "0", 10) }))
    .filter((x) => Number.isInteger(x.n) && x.n > applied)
    .sort((a, b) => a.n - b.n);

  for (const { f, n } of files) {
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    db.transaction(() => {
      db.exec(sql);
      setUserVersion(db, n);
    })();
    log.info(`db migration applied: ${f} (user_version=${n})`);
  }
}
