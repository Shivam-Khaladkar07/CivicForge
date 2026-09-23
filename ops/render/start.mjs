import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

// Render disks cannot be shared between services, so the backup process runs
// with the API. Both processes run as the unprivileged civicforge user.
const secretDir = process.env.SECRETS_DIR || "/etc/secrets";
for (const name of ["database_url", "supabase-ca.crt", "restic_password", "s3_access_key_id", "s3_secret_access_key"]) {
  let present = false;
  try { present = fs.readFileSync(path.join(secretDir, name), "utf8").trim().length > 0; } catch {}
  if (!present) {
    console.error(`Required Render secret file is missing or empty: ${name}`);
    process.exit(1);
  }
}
if (!process.env.RESTIC_REPOSITORY?.startsWith("s3:https://")) {
  console.error("RESTIC_REPOSITORY must identify an HTTPS S3-compatible off-host repository.");
  process.exit(1);
}

const children = new Set();
let stopping = false;
let exitCode = 1;

function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  if (!children.size) process.exit(code);
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(exitCode);
  }, 8000).unref();
}

function launch(command, args, name) {
  const child = spawn(command, args, { stdio: "inherit" });
  children.add(child);
  child.on("error", () => {
    children.delete(child);
    console.error(`${name} could not be started.`);
    stop(1);
    if (stopping && !children.size) process.exit(exitCode);
  });
  child.on("exit", () => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} stopped; restarting the service is required.`);
      stop(1);
    }
    if (!children.size) process.exit(exitCode);
  });
}

process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
launch(process.execPath, ["dist/index.js"], "CivicForge API");

// Do not dump a database while its initial migration and seed are running.
let ready = false;
for (let attempt = 0; attempt < 120 && !stopping; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || 10000}/api/health/ready`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) { ready = true; break; }
  } catch {}
  await delay(1000);
}
if (!ready && !stopping) {
  console.error("API readiness timed out; backups have not started.");
  stop(1);
}
if (ready && !stopping) launch("bash", ["/usr/local/bin/backup-loop.sh"], "Encrypted backup process");
