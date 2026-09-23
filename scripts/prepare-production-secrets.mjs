import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const secretsDir = path.resolve(process.env.PROD_SECRETS_DIR || path.join(root, ".secrets"));
fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });

function writeOnce(name, value) {
  const target = path.join(secretsDir, name);
  if (fs.existsSync(target)) return { name, status: "preserved" };
  fs.writeFileSync(target, `${value}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { name, status: "created" };
}

const generated = [
  writeOnce("jwt_secret", crypto.randomBytes(64).toString("base64url")),
  writeOnce("file_signing_secret", crypto.randomBytes(64).toString("base64url")),
  writeOnce("metrics_token", crypto.randomBytes(48).toString("base64url")),
  writeOnce("restic_password", crypto.randomBytes(48).toString("base64url")),
  writeOnce("log_sink_url", process.env.LOG_SINK_URL || ""),
  writeOnce("log_sink_token", process.env.LOG_SINK_TOKEN || ""),
  writeOnce("ai_api_key", process.env.AI_API_KEY || process.env.OPENAI_API_KEY || ""),
  writeOnce("s3_access_key_id", process.env.AWS_ACCESS_KEY_ID || ""),
  writeOnce("s3_secret_access_key", process.env.AWS_SECRET_ACCESS_KEY || ""),
  writeOnce("restore_database_url", process.env.RESTORE_DATABASE_URL || ""),
];

if (process.env.PRODUCTION_DATABASE_URL) generated.push(writeOnce("database_url", process.env.PRODUCTION_DATABASE_URL));
if (process.env.ALERT_WEBHOOK_URL) generated.push(writeOnce("alert_webhook_url", process.env.ALERT_WEBHOOK_URL));

console.log(`Production secret directory prepared: ${secretsDir}`);
for (const item of generated) console.log(`- ${item.name}: ${item.status}`);
for (const required of ["database_url", "alert_webhook_url"]) {
  if (!fs.existsSync(path.join(secretsDir, required))) console.log(`- ${required}: OPERATOR VALUE REQUIRED`);
}
console.log("Secret values were not printed. Back up this directory securely; never commit it.");
