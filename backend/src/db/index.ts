import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { isProduction, readSecret } from "../config.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type QueryResult<T> = { rows: T[] };

interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  engine: "pglite" | "postgres";
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}

let client: DbClient | null = null;
const transactionStore = new AsyncLocalStorage<DbClient>();

function toPgParams(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  return { text: sql, values: params };
}

async function createPglite(): Promise<DbClient> {
  const configuredDir = process.env.PGLITE_DATA_DIR;
  const dataDir = configuredDir
    ? path.resolve(configuredDir)
    : path.join(__dirname, "../../data/pglite");
  let db: PGlite;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new PGlite(dataDir);
    await db.waitReady;
  } catch (error) {
    if (configuredDir) throw error;
    const recoveryDir = path.join(__dirname, "../../data/pglite-recovery");
    console.warn(`Default PGlite store could not open; preserving it and using recovery store: ${recoveryDir}`);
    fs.mkdirSync(recoveryDir, { recursive: true });
    db = new PGlite(recoveryDir);
    await db.waitReady;
  }
  return {
    engine: "pglite",
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await db.query<T>(sql, params);
      return { rows: (res.rows ?? []) as T[] };
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>) {
      return db.transaction(async (transaction) => {
        const tx: DbClient = {
          engine: "pglite",
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await transaction.query<R>(sql, params);
            return { rows: (res.rows ?? []) as R[] };
          },
          transaction: async <R>(nested: (client: DbClient) => Promise<R>) => nested(tx),
        };
        return fn(tx);
      });
    },
  };
}

async function createPostgres(url: string): Promise<DbClient> {
  const parsed = new URL(url);
  const isSupabase = /\.(supabase\.co|supabase\.com)$/.test(parsed.hostname);
  const ca = readSecret("DATABASE_CA_CERT");
  const pool = new pg.Pool({
    connectionString: url,
    ...(isSupabase ? { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } } : {}),
    application_name: "civicforge-api",
    max: Math.max(2, Number(process.env.DB_POOL_MAX || 20)),
    connectionTimeoutMillis: Math.max(1_000, Number(process.env.DB_CONNECT_TIMEOUT_MS || 10_000)),
    idleTimeoutMillis: Math.max(5_000, Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000)),
  });
  await pool.query("SELECT 1");
  return {
    engine: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const { text, values } = toPgParams(sql, params);
      const res = await pool.query(text, values);
      return { rows: res.rows as T[] };
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>) {
      const connection = await pool.connect();
      const tx: DbClient = {
        engine: "postgres",
        async query<R>(sql: string, params: unknown[] = []) {
          const res = await connection.query(sql, params);
          return { rows: res.rows as R[] };
        },
        transaction: async <R>(nested: (client: DbClient) => Promise<R>) => nested(tx),
      };
      try {
        await connection.query("BEGIN");
        const result = await fn(tx);
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}

export async function getDb(): Promise<DbClient> {
  if (client) return client;
  if (process.env.DB_PROVIDER === "pglite") {
    if (isProduction()) throw new Error("Embedded test databases are not allowed in production.");
    client = await createPglite();
    return client;
  }
  const url = readSecret("DATABASE_URL");
  if (url) {
    try {
      client = await createPostgres(url);
      return client;
    } catch (err) {
      throw new Error("The configured database is unavailable. Local fallback is disabled to protect your data.");
    }
  }
  throw new Error("Set DATABASE_URL to your Supabase database connection. DB_PROVIDER=pglite is reserved for isolated local tests.");
}

function splitSql(raw: string) {
  return raw
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*(?:\r?\n|$)/gm, "").trim())
    .filter((s) => s.length > 0);
}

const ALTERS = [
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS impact_description TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS urgency INTEGER DEFAULT 3",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS assigned_department TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT FALSE",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_request TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_response TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_responded_at TIMESTAMPTZ",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS golden_key TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS secondary_slug TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS sub_domain TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS skills_json TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS technologies_json TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS pipeline_json TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS fallback_reason TEXT",
  "ALTER TABLE projects ADD COLUMN IF NOT EXISTS irl_level INTEGER DEFAULT 1",
  "ALTER TABLE projects ADD COLUMN IF NOT EXISTS golden_key TEXT",
  "ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS institution_status TEXT DEFAULT 'pending'",
  "ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS institution_note TEXT",
  "ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS breakdown_json TEXT",
  "ALTER TABLE universities ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4",
  "ALTER TABLE universities ADD COLUMN IF NOT EXISTS technologies TEXT",
  "ALTER TABLE universities ADD COLUMN IF NOT EXISTS verified_on DATE",
  "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url TEXT",
  "ALTER TABLE industry_interests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'expressed'",
  "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT",
  "ALTER TABLE challenge_media ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'legacy_unscanned'",
  "ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name TEXT",
  "ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT",
  "ALTER TABLE documents ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'legacy_unscanned'",
];

export async function migrate() {
  return withTransaction(async () => {
  for (const file of ["schema.sql", "schema.v2.sql"]) {
    const localPath = path.join(__dirname, file);
    const sourcePath = path.join(__dirname, "../../src/db", file);
    const schema = fs.readFileSync(fs.existsSync(localPath) ? localPath : sourcePath, "utf8");
    for (const stmt of splitSql(schema)) {
      await query(stmt);
    }
  }
  for (const stmt of ALTERS) {
    await query(stmt);
  }
  // Express is the only data access boundary; CivicForge JWTs are not Supabase Auth sessions.
  if ((await getDb()).engine === "postgres") {
    const { rows: apiRoles } = await query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
    if (apiRoles.length) {
      const { rows: tables } = await query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      const appTables = new Set<string>();
      for (const file of ["schema.sql", "schema.v2.sql"]) {
        const local = path.join(__dirname, file);
        const raw = fs.readFileSync(fs.existsSync(local) ? local : path.join(__dirname, "../../src/db", file), "utf8");
        for (const match of raw.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) appTables.add(match[1]);
      }
      for (const { tablename } of tables) {
        if (!appTables.has(tablename)) continue;
        await query(`ALTER TABLE public."${tablename}" ENABLE ROW LEVEL SECURITY`);
        for (const row of apiRoles) await query(`REVOKE ALL ON TABLE public."${tablename}" FROM "${row.rolname}"`);
      }
    }
  }
  });
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const db = transactionStore.getStore() ?? await getDb();
  return db.query<T>(sql, params);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const { rows } = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: () => Promise<T>) {
  const active = transactionStore.getStore();
  if (active) return fn();
  const db = await getDb();
  return db.transaction((tx) => transactionStore.run(tx, fn));
}
