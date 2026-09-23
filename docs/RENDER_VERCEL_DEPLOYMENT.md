# CivicForge: Render backend + Vercel frontend

This is the selected hosting path for the synthetic SIH demonstration. Keep `DEMO_ENV=true`. The shared demo accounts must never connect to real citizen records.

## Current status and protected deployment

The local `backend/.env` already points to the CivicForge Supabase project, and the CA certificate is configured locally. The schema and synthetic source data have been transferred and verified: 53 application tables, 568 records. This does not configure Render automatically: its new API service still needs the exact Supabase session-pooler URL and CA certificate as private secret files. `frontend/.env.local` contains Vercel-generated authentication material, not the backend address. Do not copy that file into Render or commit it.

The existing Render service `civicforge-backend` serves the protected **CodeCivic** repository. Its `/api/health` responds, but `/api/health/ready` returned 404 during inspection. Do not repoint it, change its environment, or use it as the new app's backend. This Blueprint uses new service names: `civicforge-api` and `civicforge-scanner`. Their actual URLs are assigned by Render; no URL in this guide is a claim that they already exist.

The current checkout's origin is `Shivam-Khaladkar07/Crowdsource`, not `CodeCivic`. Many application and deployment changes are uncommitted. A plain clone of the remote will not contain this working version. Review and publish the complete CivicForge version to its separate repository before importing the Blueprint. Do not push or connect these changes to CodeCivic.

## Cost decision before Apply

This configuration preserves private filesystem uploads and fail-closed ClamAV scanning. Render Free cannot attach a persistent disk, and private services are paid. ClamAV documents a minimum of 3 GiB RAM for its Docker setup.

The proposed Blueprint selects a 2 GB API/backup service (`standard`), a 4 GB scanner (`pro`), and 7 GB of disks. At the prices checked on 2026-09-23, these are approximately **US$111.75/month** ($25 + $85 + $1.75), before taxes, additional usage, database, backup storage, or monitoring charges. This is a conservative starting configuration, not a measured resource requirement for CivicForge. Review the Dashboard's current quote before Apply. No paid service is created merely by saving `render.yaml` locally.

Do not select Free and remove the disk or disable scanning to make the configuration appear to work. A $0-only requirement needs a separate approved storage/scanning design.

Sources: [Render Free limitations](https://render.com/docs/free), [Render pricing](https://render.com/pricing), [ClamAV memory requirements](https://docs.clamav.net/manual/Installing/Docker.html).

## 1. Prepare database and private backup storage

Use the existing CivicForge Supabase database with synthetic records only. Render's IPv4 network should use the Supabase **Session pooler**; copy the exact host and username from the project's Connect panel. Add the project's CA certificate as a secret file named `supabase-ca.crt`. CivicForge verifies the certificate and server host for its Node connection; the backup tools use `PGSSLMODE=verify-full`. Keep the database URL private and out of frontend variables. See [the database migration guide](SUPABASE_DATABASE_MIGRATION.md).

The Render image includes PostgreSQL 17 client tools to create encrypted logical backups of Supabase. The schema is tracked in `supabase/migrations`; startup checks and applies the existing idempotent schema setup before it seeds an empty demo database.

For Supabase, CivicForge uses its own Express authorization rather than Supabase's Data API. The schema migration enables RLS and removes `anon`/`authenticated` table grants. Keep those direct grants absent; the backend connects with its private database credentials.

Create a private S3-compatible bucket for encrypted Restic backups, for example Cloudflare R2 Standard storage. Obtain bucket-scoped credentials in the provider console. Keep public bucket access disabled. Supply the real repository in Render as `RESTIC_REPOSITORY`; Restic's R2 form is `s3:https://<account-endpoint>/<private-bucket>/<repository-prefix>`. This format is illustrative; obtain the actual endpoint from Cloudflare.

Create a separate, empty restore/test **database** whose actual database name contains `restore`, `drill`, or `test`. The script refuses the main database and any target with existing public tables. A Supabase **project name** containing `restore` does not change its default database name `postgres`; do not bypass the restore guard. Provision a suitable isolated database before the restoration exercise.

## 2. Prepare the two public origin settings

The frontend calls relative `/api/...` URLs. `frontend/vercel.mjs` proxies those requests to the backend; there is no `VITE_API_URL` setting.

| Setting | Where it belongs | Exact value to obtain |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | New Render API service | Vercel project **Settings → Domains**: actual production HTTPS origin, no trailing slash or path |
| `CIVICFORGE_API_ORIGIN` | Vercel project → Environment Variables → Production | New Render API service's public HTTPS origin, no `/api`, path, query, or credentials |
| `DATABASE_URL_FILE` | Render API, already set in Blueprint | `/etc/secrets/database_url` |
| `DATABASE_CA_CERT_FILE` | Render API, already set in Blueprint | `/etc/secrets/supabase-ca.crt` |
| `CLAMAV_HOST` | Render API, wired by Blueprint | Scanner's real private hostname, automatically resolved by `fromService` |

Vercel project linking alone does not prove a particular `*.vercel.app` hostname is assigned. Confirm the project's domain first. If none is assigned, assign an available domain in that project's Domains screen before filling `ALLOWED_ORIGINS`. The backend can then be deployed before publishing the frontend. No custom purchased domain or Caddy service is needed: Render and Vercel terminate HTTPS.

Reference templates: `backend/.env.render.example` and `frontend/.env.example`. They deliberately leave unallocated URLs empty. Keep the working local `backend/.env` unchanged.

## 3. Set Render secrets privately

In the confirmed Render workspace **My Workspace**, create an **Environment Group** named `civicforge-render-secrets` before importing the Blueprint. Add the following **secret files** through the Dashboard:

| Filename | Required | Source |
| --- | --- | --- |
| `database_url` | Yes | Managed main database connection string requiring TLS |
| `supabase-ca.crt` | Yes | Download from Supabase Database Settings → SSL Configuration |
| `restic_password` | Yes | Existing generated `.secrets/restic_password`, or a newly generated unique backup password for a new repository |
| `s3_access_key_id` | Yes for R2 | Bucket-scoped S3 credentials |
| `s3_secret_access_key` | Yes for R2 | Bucket-scoped S3 credentials |
| `restore_database_url` | Before restore drill | Isolated restore/test database connection requiring TLS |

Use `npm run prod:prepare` only if local generated secret files do not exist; it preserves existing files. Never print them in logs, paste them into chat, or commit them. Preserve the Restic password securely: snapshots are unusable without it. Do not regenerate it when reconnecting to an existing repository.

The Blueprint generates independent `JWT_SECRET`, `FILE_SIGNING_SECRET`, and `METRICS_TOKEN` values inside Render. Those values do not need to be copied to the frontend.

AI credentials are optional: with none configured, deterministic Demo AI Mode works. The structured log sink is also optional in code; Render captures stdout. To enable one, add the appropriate secret files and corresponding `LOG_SINK_URL_FILE`, `LOG_SINK_TOKEN_FILE`, or `AI_API_KEY_FILE` variables. Alert delivery and long-term log retention must still be configured and verified separately.

## 4. Create the new Render services

1. In Render choose **New → Blueprint** and select the separate repository containing this version of CivicForge. Do not select CodeCivic.
2. Use repository-root `render.yaml`. Leave the repository root available: `ops/render/Dockerfile` builds the backend and copies the existing backup scripts. Do not set the service root directory to `backend` for this Docker configuration.
3. Review both new service names, Singapore region, paid plans, and disks. Ensure `civicforge-render-secrets` exists and is linked only to the API service.
4. Enter the real `ALLOWED_ORIGINS` and `RESTIC_REPOSITORY` when prompted. Check the quoted charges, then Apply only after accepting them.
5. Render builds the API container, generates its HTTPS URL, and deploys the private scanner. The API runs compiled `node dist/index.js`, binds `0.0.0.0:10000`, migrates, and seeds synthetic records. The non-root backup process starts after API readiness.
6. Wait for the scanner's definitions to load and for both services to be healthy. The scanner has no public URL; port 3310 is private. Uploads fail closed if scanning cannot complete.

The Render startup wrapper requires a mounted disk at `/data` and nonempty backup/database secret files. Missing configuration produces a startup failure rather than storing uploads on an ephemeral filesystem.

Check through the **actual new API URL**:

- `/api/health/live`: 200.
- `/api/health/ready`: 200 and PostgreSQL, not PGlite.
- `/api/health`: `demo: true` and `engine: postgres`.
- `/internal/metrics`: 404 on the public API, even with a metrics token.

## 5. Connect and deploy Vercel

1. Open the existing Vercel project `civicforge`.
2. If deploying through Git, connect the separate CivicForge repository and set **Root Directory** to `frontend`. Select Vite, build `npm run build`, output `dist`. Local CLI deployments are run from the already-linked `frontend` directory.
3. Add `CIVICFORGE_API_ORIGIN` under **Environment Variables → Production**, using the new Render HTTPS origin verified above. Do not use the protected old backend or localhost.
4. Deploy production. For CLI: from `frontend`, use `vercel --prod` so it builds with the real configuration. Do not deploy earlier prebuilt output created with a test hostname.
5. Confirm the actual production frontend origin is in Render's exact `ALLOWED_ORIGINS` list. Add explicit Preview origins only if previews will be tested; do not use a wildcard.
6. Visit the public frontend and check its `/api/health/ready` response and browser network requests. Refresh a deep link such as `/citizen/dashboard`.

`frontend/vercel.mjs` supplies SPA fallback, the API proxy, and the security headers formerly supplied by the VPS web edge. Its origin validation intentionally refuses an empty or non-HTTPS API origin.

## 6. Verify workflows, backup, and restore

Use the existing Golden Demo role sequence from the README. Check login/logout, database-backed challenge and project updates, loading/error states, and mobile layout. Upload a harmless PDF and download it with an authorized account. Confirm the stored scan status is `clamav_instream`. Check that an unauthorized account cannot download it. The safe EICAR test should be rejected, but the app's built-in EICAR check alone does not prove the live ClamAV connection worked.

The API's Render disk contains private uploads, backup status, and Restic's cache. Render disks cannot be shared between services, cron jobs, or one-off jobs. That is why the API and backup loop share one service. The separate ClamAV service has its own persistent definitions disk.

Inspect the API logs for a successful encrypted snapshot. Confirm the snapshot appears in off-host storage and verify `/data/backup-state/last-result` is `1`. Retention defaults remain daily/weekly/monthly as in the Compose stack. A disk snapshot from Render is not a substitute for the off-host backup and restore drill.

To inspect Restic or run the restore drill, use the API's **Render Shell**, which runs on the service with its environment and disk. Run backup tools as `civicforge`, the same user as the application. After verifying the isolated `restore_database_url` secret file, run:

```sh
su-exec civicforge /usr/local/bin/restore-drill.sh
```

Record the result and check restored record counts. The existing restore command verifies database identities, checks for an empty target, runs Restic integrity checking, and restores the dump. It does not publish the restored database or switch the live API to it.

## Monitoring and remaining verification

Render replaces Caddy's TLS termination and supplies platform metrics and logs. The app's bearer-protected Prometheus metrics use private port 9090 when `INTERNAL_METRICS_PORT` is set. Configure a private monitoring collector in the same Render region to scrape that port, or integrate your chosen monitoring platform; connect alert delivery for backup failures/staleness as well as API failures. The Blueprint does not provision Prometheus or Alertmanager services or claim alerting is active. Their existing Compose configuration remains available for reference.

No Render container execution, hosted database migration, public end-to-end workflow, off-host backup, restore drill, or alert delivery is verified merely by a local build or Blueprint validation. Complete those checks before announcing deployment.

Official references: [Render Blueprints](https://render.com/docs/blueprint-spec), [environment groups and secret files](https://render.com/docs/configure-environment-variables), [persistent disk limits](https://render.com/docs/disks), [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
