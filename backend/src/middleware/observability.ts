import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { readSecret } from "../config.js";

type LogRecord = Record<string, string | number | boolean | null | undefined>;

const requests = new Map<string, { count: number; durationSeconds: number }>();
let inFlight = 0;

function escapeLabel(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

export function emitStructuredLog(record: LogRecord) {
  const entry = { timestamp: new Date().toISOString(), ...record };
  console.log(JSON.stringify(entry));
  const sinkUrl = readSecret("LOG_SINK_URL");
  if (!sinkUrl) return;
  const token = readSecret("LOG_SINK_TOKEN");
  void fetch(sinkUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(entry),
    signal: AbortSignal.timeout(2_000),
  }).catch(() => {
    // The primary stdout log remains available even when the optional external sink is unavailable.
  });
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const suppliedRequestId = req.headers["x-request-id"];
  const requestId = typeof suppliedRequestId === "string" && /^[a-zA-Z0-9._:-]{1,100}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
  const started = performance.now();
  inFlight += 1;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    inFlight = Math.max(0, inFlight - 1);
    const durationSeconds = (performance.now() - started) / 1_000;
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    const group = req.route?.path
      ? `${req.baseUrl || ""}${String(req.route.path)}`
      : "/unmatched";
    const key = JSON.stringify([req.method, group, statusClass]);
    const current = requests.get(key) ?? { count: 0, durationSeconds: 0 };
    current.count += 1;
    current.durationSeconds += durationSeconds;
    requests.set(key, current);
    const record = {
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      event: "http_request",
      request_id: requestId,
      method: req.method,
      route_group: group,
      status: res.statusCode,
      duration_ms: Math.round(durationSeconds * 100_000) / 100,
    };
    emitStructuredLog(record);
  });
  next();
}

export function prometheusMetrics() {
  const lines = [
    "# HELP civicforge_http_requests_total Total HTTP requests handled by the API.",
    "# TYPE civicforge_http_requests_total counter",
  ];
  for (const [key, value] of requests) {
    const [method, group, statusClass] = JSON.parse(key) as string[];
    const labels = `method="${escapeLabel(method)}",route_group="${escapeLabel(group)}",status_class="${escapeLabel(statusClass)}"`;
    lines.push(`civicforge_http_requests_total{${labels}} ${value.count}`);
  }
  lines.push("# HELP civicforge_http_request_duration_seconds_sum Cumulative API request duration.");
  lines.push("# TYPE civicforge_http_request_duration_seconds_sum counter");
  for (const [key, value] of requests) {
    const [method, group, statusClass] = JSON.parse(key) as string[];
    const labels = `method="${escapeLabel(method)}",route_group="${escapeLabel(group)}",status_class="${escapeLabel(statusClass)}"`;
    lines.push(`civicforge_http_request_duration_seconds_sum{${labels}} ${value.durationSeconds}`);
    lines.push(`civicforge_http_request_duration_seconds_count{${labels}} ${value.count}`);
  }
  lines.push("# HELP civicforge_http_requests_in_flight Requests currently being processed.");
  lines.push("# TYPE civicforge_http_requests_in_flight gauge");
  lines.push(`civicforge_http_requests_in_flight ${inFlight}`);
  lines.push("# HELP civicforge_process_uptime_seconds API process uptime.");
  lines.push("# TYPE civicforge_process_uptime_seconds gauge");
  lines.push(`civicforge_process_uptime_seconds ${process.uptime()}`);
  lines.push("# HELP civicforge_process_resident_memory_bytes Resident process memory.");
  lines.push("# TYPE civicforge_process_resident_memory_bytes gauge");
  lines.push(`civicforge_process_resident_memory_bytes ${process.memoryUsage().rss}`);
  const backupDir = process.env.BACKUP_STATE_DIR?.trim();
  if (backupDir) {
    const readNumber = (name: string) => {
      try {
        const value = Number(fs.readFileSync(path.join(backupDir, name), "utf8").trim());
        return Number.isFinite(value) && value >= 0 ? value : 0;
      } catch {
        return 0;
      }
    };
    lines.push("# HELP civicforge_backup_last_attempt_timestamp_seconds Unix time of the most recent encrypted backup attempt.");
    lines.push("# TYPE civicforge_backup_last_attempt_timestamp_seconds gauge");
    lines.push(`civicforge_backup_last_attempt_timestamp_seconds ${readNumber("last-attempt-epoch")}`);
    lines.push("# HELP civicforge_backup_last_success_timestamp_seconds Unix time of the most recent successful encrypted backup.");
    lines.push("# TYPE civicforge_backup_last_success_timestamp_seconds gauge");
    lines.push(`civicforge_backup_last_success_timestamp_seconds ${readNumber("last-success-epoch")}`);
    lines.push("# HELP civicforge_backup_last_result Whether the most recent encrypted backup attempt succeeded.");
    lines.push("# TYPE civicforge_backup_last_result gauge");
    lines.push(`civicforge_backup_last_result ${readNumber("last-result")}`);
  }
  return `${lines.join("\n")}\n`;
}
