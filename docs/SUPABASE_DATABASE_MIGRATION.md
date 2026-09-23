# CivicForge database on Supabase

CivicForge keeps its Express API, JWT authentication, bcrypt passwords, authorization middleware, and React frontend. Supabase provides the managed PostgreSQL database. The application continues to use the existing `pg` driver and SQL services; no browser database client or Supabase Auth migration is part of this database-only move.

## Supabase project setup

The existing Supabase project is `CivicForge`. Its CivicForge schema has been applied as a versioned migration at `supabase/migrations/20260923090000_civicforge_schema_baseline.sql`.

The migration creates the current 53 application tables, additive runtime columns, and indexes. It enables row-level security on the application tables and revokes direct table privileges from Supabase's `anon` and `authenticated` roles. The Express backend remains the sole application access path and continues enforcing its existing JWT and role permissions.

## Encrypted connection

In the Supabase Dashboard, open **Project Settings → Database → SSL Configuration** and download this project's CA certificate. Save it locally as:

```text
.secrets/supabase-ca.crt
```

The certificate is not a password or API key. Keep it out of Git. For local backend use, set `DATABASE_CA_CERT_FILE` to its absolute path in `backend/.env`. `DATABASE_URL` is already configured locally; do not paste it into chat or commit it.

The Node PostgreSQL client verifies the server certificate and host. Backup and restore utilities use `PGSSLMODE=verify-full` with the same CA certificate.

For hosted services, use the session-pooler URL from the Supabase **Connect** panel when the host cannot reach the project's IPv6 direct endpoint. Copy the pooler host and username exactly as shown; never construct the hostname. Configure the database URL and CA certificate as private Render secret files.

## Source data and transfer

A read-only preflight copy of the recoverable local PGlite database is preserved under the ignored `backups/supabase-preflight-1790153937248/pglite-recovery` directory. It contains 9 users, 15 challenges, 1 project, 152 audit entries, and the associated synthetic demo relationships. The older `pglite` folder did not open during the preflight and was preserved separately; the recoverable copy is the selected source.

Once the CA file is present, from the repository root run:

```powershell
$env:DATABASE_CA_CERT_FILE = (Resolve-Path .secrets/supabase-ca.crt).Path
npm run migrate:supabase:data --prefix backend
```

The import checks that the target has the expected tables and that every CivicForge table is empty. It preserves row IDs and bcrypt hashes, orders inserts by foreign-key dependencies, and transfers everything inside one transaction. It stops without overwriting anything if the target contains application rows. It reports per-table record counts after the transaction commits.

The original local PGlite data is left in place. Do not run the ordinary seed against a production database until the imported rows have been verified; existing CivicForge startup logic skips seeding when it finds existing users.

## Local and hosted runtime

Set `DATABASE_URL` and `DATABASE_CA_CERT_FILE` for the API. Production also needs `REQUIRE_POSTGRES=true` and `REQUIRE_DATABASE_TLS=true`. PGlite is available only when a test process explicitly sets `DB_PROVIDER=pglite`; the server never silently diverts application writes to a second database.

Docker Compose no longer provisions a PostgreSQL container. Supply a Supabase connection URL and mount the CA file. The Render Blueprint expects the database URL and `supabase-ca.crt` as secret files in its private environment group.

## Backups

Keep encrypted logical database backups and private upload backups. Supabase's database backup does not include objects stored in Supabase Storage; CivicForge uploads currently remain on the API's private disk, so the existing encrypted upload backup remains necessary.
