import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(process.env.BACKUP_DIR || path.join(root, "backups"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync(outputRoot, { recursive: true });

if (process.env.DATABASE_URL) {
  const output = path.join(outputRoot, `civicforge-${stamp}.sql`);
  await run(process.env.PG_DUMP_COMMAND || "pg_dump", ["--no-owner", "--no-privileges", "--file", output, process.env.DATABASE_URL], { windowsHide: true });
  console.log(`PostgreSQL backup created: ${output}`);
} else {
  if (process.env.PGLITE_BACKUP_ACKNOWLEDGE_QUIESCED !== "true") {
    throw new Error("Stop the local API, then set PGLITE_BACKUP_ACKNOWLEDGE_QUIESCED=true before copying a PGlite store.");
  }
  const source = path.resolve(process.env.PGLITE_DATA_DIR || path.join(root, "backend", "data", "pglite"));
  if (!fs.existsSync(source)) throw new Error(`PGlite data directory not found: ${source}`);
  const output = path.join(outputRoot, `civicforge-pglite-${stamp}`);
  fs.cpSync(source, output, { recursive: true, errorOnExist: true });
  fs.writeFileSync(path.join(output, "BACKUP-METADATA.json"), JSON.stringify({ created_at: new Date().toISOString(), host: os.hostname(), source }, null, 2));
  console.log(`PGlite backup created: ${output}`);
}

const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14));
const cutoff = Date.now() - retentionDays * 86_400_000;
for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
  const target = path.join(outputRoot, entry.name);
  if (fs.statSync(target).mtimeMs < cutoff) fs.rmSync(target, { recursive: true, force: true });
}
