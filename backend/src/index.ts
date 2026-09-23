import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { migrate, getDb } from "./db/index.js";
import { seed } from "./db/seed.js";
import { authRouter } from "./routes/auth.js";
import { challengeRouter } from "./routes/challenges.js";
import { clusterRouter } from "./routes/clusters.js";
import { projectRouter } from "./routes/projects.js";
import { adminRouter, catalogRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { errorHandler } from "./middleware/error.js";
import { fileRouter } from "./routes/files.js";
import { emitStructuredLog, prometheusMetrics, requestObservability } from "./middleware/observability.js";
import { allowedOrigins, internalMetricsPort, readSecret, validateProductionConfiguration } from "./config.js";
import crypto from "node:crypto";

dotenv.config();
validateProductionConfiguration();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const metricsPort = internalMetricsPort(PORT);

app.disable("x-powered-by");
if (process.env.TRUST_PROXY_HOPS) app.set("trust proxy", Math.max(0, Number(process.env.TRUST_PROXY_HOPS)));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins().includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(requestObservability);
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

function serveMetrics(req: express.Request, res: express.Response) {
  const expected = readSecret("METRICS_TOKEN");
  const supplied = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (!expected || expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(404).end();
  }
  res.type("text/plain; version=0.0.4").send(prometheusMetrics());
}

// Render routes PORT publicly; additional ports are reachable only privately.
// The Compose path keeps the existing route behind Caddy's /internal block.
if (metricsPort) app.use("/internal", (_req, res) => { res.status(404).end(); });
else app.get("/internal/metrics", serveMetrics);

app.get("/api/health", async (_req, res) => {
  const db = await getDb();
  res.json({
    ok: true,
    engine: db.engine,
    demo: process.env.DEMO_ENV === "true",
    product: "CivicForge — Jharkhand",
  });
});

app.get("/api/health/live", (_req, res) => res.json({ ok: true, service: "civicforge-api" }));
app.get("/api/health/ready", async (_req, res) => {
  try {
    const db = await getDb();
    await db.query("SELECT 1");
    res.json({ ok: true, engine: db.engine, checked_at: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, error: "Database readiness check failed" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/files", fileRouter);
app.use("/api/public", publicRouter);
app.use("/api/challenges", challengeRouter);
app.use("/api/clusters", clusterRouter);
app.use("/api/projects", projectRouter);
app.use("/api/admin", adminRouter);
app.use("/api", catalogRouter);

app.use(errorHandler);

async function main() {
  await migrate();
  if (process.env.DEMO_ENV === "true" || process.env.SEED_ON_STARTUP === "true") await seed();
  if (metricsPort) {
    const metricsApp = express();
    metricsApp.disable("x-powered-by");
    metricsApp.use(helmet());
    metricsApp.get("/internal/metrics", serveMetrics);
    metricsApp.listen(metricsPort, "0.0.0.0");
  }
  app.listen(PORT, "0.0.0.0", () => {
    emitStructuredLog({ level: "info", event: "service_started", service: "civicforge-api", port: PORT, demo: process.env.DEMO_ENV === "true" });
  });
}

main().catch((err) => {
  emitStructuredLog({ level: "error", event: "service_start_failed", error_message: err instanceof Error ? err.message : "Unknown startup error" });
  process.exit(1);
});
