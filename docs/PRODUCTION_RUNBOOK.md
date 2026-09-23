# CivicForge production runbook

## 1. Provision external services

Provision a managed PostgreSQL 16-compatible database with TLS required, automated snapshots, point-in-time recovery, restricted network access, and a separate empty database whose name contains `restore`, `drill`, or `test`. Provision an S3-compatible off-host bucket with versioning and lifecycle protection. Create a private HTTPS webhook in the operator's alerting platform.

These provider resources incur cost and require owner credentials, so they are intentionally not created by repository scripts.

If publishing with `DEMO_ENV=true`, use an isolated database containing synthetic records only. The published demo accounts have a documented shared password, including the demo admin; never connect this deployment to citizen records or an operational government database. Keep a separate, non-demo environment for real users, with individual credentials and an independent security review before accepting personal data.

## 2. Prepare the host

Use a supported Linux server with Docker Engine and the Compose plugin. Permit inbound TCP 80/443 and UDP 443; do not expose PostgreSQL, ClamAV, Prometheus, Alertmanager, or the API container directly. Point the public DNS record to the server.

Copy `.env.production.example` to `.env.production` and set `DOMAIN`, `ALLOWED_ORIGINS`, `RESTIC_REPOSITORY`, Demo Mode, and AI settings. Generate local secret files:

```bash
npm run prod:prepare
```

Populate `.secrets/database_url`, `.secrets/restore_database_url`, and `.secrets/alert_webhook_url`. If static S3 credentials are required, populate `.secrets/s3_access_key_id` and `.secrets/s3_secret_access_key`; prefer an instance/workload identity when the provider supports it.

Validate without printing secret values:

```bash
set -a
. ./.env.production
set +a
npm run prod:validate
```

## 3. Launch

```bash
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up --build -d
docker compose --env-file .env.production -f compose.production.yml ps
```

Caddy obtains and renews the public TLS certificate. The API refuses startup when managed PostgreSQL, strong secrets, HTTPS origins, metrics authentication, or fail-closed malware scanning are missing. ClamAV's official container keeps signatures under the persistent `/var/lib/clamav` volume and runs FreshClam updates.

## 4. Verify

- Confirm the public landing page and Demo/Synthetic Data label where Demo Mode is enabled.
- Confirm `/api/health/live` and `/api/health/ready` return success through HTTPS.
- Confirm `/internal/metrics` returns 404 publicly.
- Run role and Golden Demo browser journeys.
- Upload the EICAR test file in staging and confirm it is rejected and removed.
- Confirm Prometheus can scrape the API and send a test alert through Alertmanager.
- Confirm the backup service writes a successful snapshot to the off-host repository and the Prometheus `CivicForgeBackupFailed` / `CivicForgeBackupStale` alerts are inactive.

## 5. Restore exercise

First run the safe local rehearsal:

```bash
npm run restore:drill:local
```

For the mandatory production-format exercise, verify `.secrets/restore_database_url` points to the isolated restore database and run:

```bash
docker compose --env-file .env.production -f compose.production.yml --profile restore-drill run --rm restore-drill
```

The drill runs Restic integrity checks, restores the latest PostgreSQL dump into an empty isolated database, and verifies user/challenge/project counts. It refuses a target with existing public tables or the same underlying connection as production. Record the timestamp, snapshot ID, result, elapsed time, and operator. Never point `restore_database_url` at production.

## 6. Ongoing operations

- Review alert delivery and backup success every day.
- Run the restore drill at least quarterly and after backup-provider changes.
- Rotate application and storage credentials on the organization's schedule and immediately after suspected exposure.
- Apply ClamAV, base-image, Node, PostgreSQL, Caddy, Prometheus, and Alertmanager security updates through reviewed deployments.
- Retain audit logs and penetration-test reports according to the organization's policy.
- Commission and close an independent penetration test before enabling real citizen data.
