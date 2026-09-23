import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");

async function counts(databaseDir: string) {
  const db = new PGlite(databaseDir);
  await db.waitReady;
  const result = await db.query<{ users: number; challenges: number; projects: number }>(
    `SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM challenges) AS challenges,
      (SELECT COUNT(*)::int FROM projects) AS projects`
  );
  await db.close();
  return result.rows[0];
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "civicforge-restore-drill-"));
const source = path.join(tempRoot, "source");
const backups = path.join(tempRoot, "backups");
try {
  await run(process.execPath, [path.join(root, "backend", "dist", "db", "seed.js")], {
    cwd: path.join(root, "backend"),
    env: { ...process.env, DATABASE_URL: "", DATABASE_URL_FILE: "", DB_PROVIDER: "pglite", REQUIRE_POSTGRES: "false", NODE_ENV: "test", PGLITE_DATA_DIR: source, DEMO_ENV: "true" },
    windowsHide: true,
  });
  const before = await counts(source);
  await run(process.execPath, [path.join(root, "scripts", "backup.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PGLITE_DATA_DIR: source,
      PGLITE_BACKUP_ACKNOWLEDGE_QUIESCED: "true",
      BACKUP_DIR: backups,
      BACKUP_RETENTION_DAYS: "1",
    },
    windowsHide: true,
  });
  const snapshot = fs.readdirSync(backups).map((entry) => path.join(backups, entry)).find((entry) => fs.statSync(entry).isDirectory());
  if (!snapshot) throw new Error("Backup snapshot was not created");
  const restored = path.join(tempRoot, "restored");
  fs.cpSync(snapshot, restored, { recursive: true, errorOnExist: true });
  const after = await counts(restored);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Restored record counts differ: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  console.log(JSON.stringify({ ok: true, exercise: "local-pglite-backup-restore", before, after, checked_at: new Date().toISOString() }));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
