import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const secretsDir = path.resolve(process.env.SECRETS_DIR || path.join(root, ".secrets"));
const failures = [];

function read(name) {
  const target = path.join(secretsDir, name);
  if (!fs.existsSync(target)) {
    failures.push(`Missing ${target}`);
    return "";
  }
  const value = fs.readFileSync(target, "utf8").trim();
  if (!value) failures.push(`${name} is empty`);
  return value;
}

const jwt = read("jwt_secret");
const signing = read("file_signing_secret");
const metrics = read("metrics_token");
const database = read("database_url");
read("restic_password");
const alertUrl = read("alert_webhook_url");

for (const [name, value] of [["jwt_secret", jwt], ["file_signing_secret", signing], ["metrics_token", metrics]]) {
  if (value && value.length < 32) failures.push(`${name} must contain at least 32 characters`);
}
if (jwt && jwt === signing) failures.push("jwt_secret and file_signing_secret must be different");
if (database && !/^postgres(?:ql)?:\/\//i.test(database)) failures.push("database_url must be a PostgreSQL connection URL");
if (alertUrl && !/^https:\/\//i.test(alertUrl)) failures.push("alert_webhook_url must use HTTPS");
if (!process.env.DOMAIN || !/^[a-z0-9.-]+$/i.test(process.env.DOMAIN)) failures.push("DOMAIN must be set to the public hostname");
if (!process.env.RESTIC_REPOSITORY) failures.push("RESTIC_REPOSITORY must point to encrypted off-host storage");

if (failures.length) {
  console.error("Production configuration is not ready:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Production configuration passed secret, database, TLS hostname, alerting, and backup checks.");
