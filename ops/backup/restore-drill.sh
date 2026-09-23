#!/usr/bin/env bash
set -Eeuo pipefail

read_secret() {
  local file="$1"
  [[ -r "$file" ]] || { echo "Required secret file is unavailable: $file" >&2; exit 1; }
  tr -d '\r\n' < "$file"
}

secret_dir="${SECRETS_DIR:-/run/secrets}"
ca_file="${DATABASE_CA_CERT_FILE:-$secret_dir/supabase-ca.crt}"
[[ -r "$ca_file" ]] || { echo "Supabase CA certificate is unavailable" >&2; exit 1; }
DATABASE_URL="$(read_secret "$secret_dir/database_url")"
RESTORE_DATABASE_URL="$(read_secret "$secret_dir/restore_database_url")"
export DATABASE_URL RESTORE_DATABASE_URL
export PGSSLROOTCERT="$ca_file"
export PGSSLMODE=verify-full
export RESTIC_PASSWORD_FILE="$secret_dir/restic_password"
if [[ -s "$secret_dir/s3_access_key_id" ]]; then export AWS_ACCESS_KEY_ID="$(read_secret "$secret_dir/s3_access_key_id")"; fi
if [[ -s "$secret_dir/s3_secret_access_key" ]]; then export AWS_SECRET_ACCESS_KEY="$(read_secret "$secret_dir/s3_secret_access_key")"; fi
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"

[[ -n "$RESTORE_DATABASE_URL" ]] || { echo "restore_database_url is empty" >&2; exit 1; }
[[ "$RESTORE_DATABASE_URL" != "$DATABASE_URL" ]] || { echo "Refusing to restore into the production database" >&2; exit 1; }
target_name="$(psql "$RESTORE_DATABASE_URL" -Atc 'SELECT current_database()')"
[[ "$target_name" =~ (restore|drill|test) ]] || { echo "Restore target database name must contain restore, drill, or test" >&2; exit 1; }
production_identity="$(psql "$DATABASE_URL" -Atc "SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port() || '/' || current_database()")"
restore_identity="$(psql "$RESTORE_DATABASE_URL" -Atc "SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port() || '/' || current_database()")"
[[ "$production_identity" != "$restore_identity" ]] || { echo "Refusing to restore into the production database connection" >&2; exit 1; }
existing_tables="$(psql "$RESTORE_DATABASE_URL" -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
[[ "$existing_tables" == "0" ]] || { echo "Restore target must be an empty database; found ${existing_tables} public tables" >&2; exit 1; }

work_dir="$(mktemp -d "${RESTORE_WORK_DIR:-/restore-work}/drill.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
restic check --read-data-subset="${RESTIC_CHECK_SUBSET:-5%}"
restic restore latest --tag civicforge-production --target "$work_dir"
dump_file="$(find "$work_dir" -type f -name database.dump -print -quit)"
[[ -n "$dump_file" ]] || { echo "No database.dump was found in the latest snapshot" >&2; exit 1; }

pg_restore --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" "$dump_file"
counts="$(psql "$RESTORE_DATABASE_URL" -Atc "SELECT json_build_object('users',(SELECT COUNT(*) FROM users),'challenges',(SELECT COUNT(*) FROM challenges),'projects',(SELECT COUNT(*) FROM projects));")"
echo "$(date -u +%FT%TZ) restore drill completed for ${target_name}: ${counts}"
