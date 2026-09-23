import fs from "node:fs";

const PLACEHOLDER_PATTERN = /change[-_ ]?me|replace[-_ ]?me|development[-_ ]?only|demo[-_ ]?secret/i;

export function readSecret(name: string, fallback = "") {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch (error) {
      throw new Error(`Unable to read ${name}_FILE at ${file}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return process.env[name]?.trim() || fallback;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function internalMetricsPort(apiPort: number) {
  const raw = process.env.INTERNAL_METRICS_PORT?.trim();
  if (!raw) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === apiPort) {
    throw new Error("INTERNAL_METRICS_PORT must be a valid port different from PORT.");
  }
  return port;
}

export function allowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean);
  if (configured?.length) return configured;
  return isProduction() ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
}

function assertStrongSecret(name: string, value: string) {
  if (value.length < 32 || PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${name} must be a non-placeholder secret of at least 32 characters in production.`);
  }
}

export function validateProductionConfiguration() {
  if (!isProduction()) return;
  const databaseUrl = readSecret("DATABASE_URL");
  const jwtSecret = readSecret("JWT_SECRET");
  const fileSigningSecret = readSecret("FILE_SIGNING_SECRET");
  const metricsToken = readSecret("METRICS_TOKEN");

  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("Production requires a managed PostgreSQL DATABASE_URL (or DATABASE_URL_FILE). Embedded database fallback is disabled.");
  }
  if (process.env.REQUIRE_DATABASE_TLS === "true") {
    let sslMode = "";
    let hostname = "";
    try {
      const parsedUrl = new URL(databaseUrl);
      sslMode = parsedUrl.searchParams.get("sslmode") || "";
      hostname = parsedUrl.hostname;
    } catch {}
    if (/\.(supabase\.co|supabase\.com)$/i.test(hostname)) {
      if (!readSecret("DATABASE_CA_CERT")) throw new Error("Supabase production connections require the project CA certificate via DATABASE_CA_CERT_FILE.");
    } else if (!["require", "verify-ca", "verify-full"].includes(sslMode)) {
      throw new Error("The managed database connection must require TLS using sslmode=require, verify-ca, or verify-full.");
    }
  }
  assertStrongSecret("JWT_SECRET", jwtSecret);
  assertStrongSecret("FILE_SIGNING_SECRET", fileSigningSecret);
  assertStrongSecret("METRICS_TOKEN", metricsToken);
  if (jwtSecret === fileSigningSecret) throw new Error("JWT_SECRET and FILE_SIGNING_SECRET must be different secrets.");
  if (process.env.REQUIRE_MALWARE_SCANNER !== "true") {
    throw new Error("Production requires REQUIRE_MALWARE_SCANNER=true so uploads fail closed when scanning is unavailable.");
  }
  if (allowedOrigins().length === 0) {
    throw new Error("Production requires ALLOWED_ORIGINS with the public HTTPS origin.");
  }
  if (allowedOrigins().some((origin) => !origin.startsWith("https://")) && process.env.ALLOW_INSECURE_ORIGINS !== "true") {
    throw new Error("Production ALLOWED_ORIGINS must use HTTPS unless ALLOW_INSECURE_ORIGINS=true is explicitly set for an isolated test.");
  }
}
