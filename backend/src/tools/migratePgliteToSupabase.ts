import path from "node:path";
import dotenv from "dotenv";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readSecret } from "../config.js";

dotenv.config();

const sourcePath = path.resolve(
  process.env.CIVICFORGE_SOURCE_PGLITE_DIR ||
    "../backups/supabase-preflight-1790153937248/pglite-recovery",
);
const databaseUrl = readSecret("DATABASE_URL");
const caCertificate = readSecret("DATABASE_CA_CERT");
if (!databaseUrl) throw new Error("DATABASE_URL must point to the CivicForge Supabase database.");
if (!caCertificate) throw new Error("Set DATABASE_CA_CERT_FILE to the Supabase CA certificate before transferring records.");

const source = new PGlite(sourcePath);
await source.waitReady;
const target = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { ca: caCertificate, rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 15_000,
  application_name: "civicforge-data-migration",
});

const quote = (identifier: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error("Unexpected database identifier in schema metadata.");
  return `"${identifier}"`;
};

try {
  await target.query("SET TIME ZONE 'UTC'");
  const sourceTables = await source.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const targetTables = await target.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const targetSet = new Set(targetTables.rows.map((row) => row.table_name));
  const names = sourceTables.rows.map((row) => row.table_name);
  const missing = names.filter((name) => !targetSet.has(name));
  if (missing.length) throw new Error(`Supabase schema is missing ${missing.length} CivicForge tables; apply the schema migration first.`);

  for (const table of names) {
    const count = await target.query(`SELECT count(*)::int AS count FROM public.${quote(table)}`);
    if (count.rows[0].count !== 0) throw new Error(`Refusing data transfer because public.${table} already contains records.`);
  }

  const foreignKeys = await target.query<{ child: string; parent: string }>(
    `SELECT child.table_name AS child, parent.table_name AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage child
       ON child.constraint_name = tc.constraint_name AND child.constraint_schema = tc.constraint_schema AND child.table_name = tc.table_name
     JOIN information_schema.constraint_column_usage parent
       ON parent.constraint_name = tc.constraint_name AND parent.constraint_schema = tc.constraint_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_schema = 'public'`,
  );
  const dependencies = new Map(names.map((name) => [name, new Set<string>()]));
  for (const edge of foreignKeys.rows) {
    if (edge.child !== edge.parent) dependencies.get(edge.child)?.add(edge.parent);
  }
  const insertionOrder: string[] = [];
  while (insertionOrder.length < names.length) {
    const next = names.filter((name) => !insertionOrder.includes(name) && [...dependencies.get(name)!].every((dep) => insertionOrder.includes(dep)));
    if (!next.length) throw new Error("CivicForge schema contains a foreign-key cycle; transfer requires a reviewed order.");
    insertionOrder.push(...next);
  }

  await target.query("BEGIN");
  const verified: Record<string, number> = {};
  let importingTable = "initialization";
  try {
    for (const table of insertionOrder) {
      importingTable = table;
      const sourceColumns = await source.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [table],
      );
      const targetColumns = await target.query<{ column_name: string; is_generated: string }>(
        "SELECT column_name, is_generated FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [table],
      );
      const sourceSet = new Set(sourceColumns.rows.map((column) => column.column_name));
      const columns = targetColumns.rows.filter((column) => column.is_generated === "NEVER" && sourceSet.has(column.column_name)).map((column) => column.column_name);
      const rows = await source.query<Record<string, unknown>>(`SELECT ${columns.map(quote).join(", ")} FROM public.${quote(table)}`);
      const batchSize = Math.max(1, Math.floor(5_000 / columns.length));
      for (let offset = 0; offset < rows.rows.length; offset += batchSize) {
        const batch = rows.rows.slice(offset, offset + batchSize);
        const values = batch.flatMap((row) => columns.map((column) => row[column]));
        const rowPlaceholders = batch.map((_, rowIndex) => {
          const start = rowIndex * columns.length;
          return `(${columns.map((_, columnIndex) => `$${start + columnIndex + 1}`).join(", ")})`;
        }).join(", ");
        await target.query(`INSERT INTO public.${quote(table)} (${columns.map(quote).join(", ")}) VALUES ${rowPlaceholders}`, values);
      }
      const imported = await target.query(`SELECT count(*)::int AS count FROM public.${quote(table)}`);
      if (imported.rows[0].count !== rows.rows.length) throw new Error(`Row count verification failed for public.${table}.`);
      verified[table] = rows.rows.length;
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK").catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "migration_failed";
    throw new Error(`Import rolled back at public.${importingTable} (${code}). No partial records were committed.`);
  }

  console.log(JSON.stringify({ ok: true, source: "protected PGlite recovery snapshot", target: "Supabase PostgreSQL", tables: Object.keys(verified).length, rows: Object.values(verified).reduce((sum, count) => sum + count, 0), counts: verified }));
} finally {
  await source.close().catch(() => undefined);
  await target.end().catch(() => undefined);
}
