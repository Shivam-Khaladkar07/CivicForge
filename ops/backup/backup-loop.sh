#!/usr/bin/env bash
set -Eeuo pipefail

read_secret() {
  local file="$1"
  [[ -r "$file" ]] || { echo "Required secret file is unavailable: $file" >&2; exit 1; }
  tr -d '\r\n' < "$file"
}

secret_dir="${SECRETS_DIR:-/run/secrets}"
state_dir="${BACKUP_STATE_DIR:-/backup-state}"
restore_work_dir="${RESTORE_WORK_DIR:-/restore-work}"
upload_dir="${PRIVATE_UPLOAD_DIR:-/data/uploads}"
ca_file="${DATABASE_CA_CERT_FILE:-$secret_dir/supabase-ca.crt}"
[[ -r "$ca_file" ]] || { echo "Supabase CA certificate is unavailable" >&2; exit 1; }
DATABASE_URL="$(read_secret "$secret_dir/database_url")"
export DATABASE_URL
export PGSSLROOTCERT="$ca_file"
export PGSSLMODE=verify-full
export RESTIC_PASSWORD_FILE="$secret_dir/restic_password"

if [[ -s "$secret_dir/s3_access_key_id" ]]; then export AWS_ACCESS_KEY_ID="$(read_secret "$secret_dir/s3_access_key_id")"; fi
if [[ -s "$secret_dir/s3_secret_access_key" ]]; then export AWS_SECRET_ACCESS_KEY="$(read_secret "$secret_dir/s3_secret_access_key")"; fi
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"

if ! restic snapshots >/dev/null 2>&1; then
  restic init
fi

run_backup() {
  local work_dir dump_file
  work_dir="$(mktemp -d "$restore_work_dir/backup.XXXXXX")"
  dump_file="${work_dir}/database.dump"
  trap 'rm -rf "${work_dir:-}"' RETURN

  pg_dump --format=custom --compress=9 --no-owner --no-acl --file "$dump_file" "$DATABASE_URL" || return 1
  restic backup "$dump_file" "$upload_dir" --tag civicforge-production --host "${BACKUP_HOST_NAME:-civicforge}" || return 1
  restic forget --prune \
    --keep-daily "${BACKUP_KEEP_DAILY:-14}" \
    --keep-weekly "${BACKUP_KEEP_WEEKLY:-8}" \
    --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}" \
    --tag civicforge-production || return 1
  date -u +%s > "$state_dir/last-success-epoch" || return 1
  echo "$(date -u +%FT%TZ) encrypted off-host backup completed"
}

while true; do
  date -u +%s > "$state_dir/last-attempt-epoch"
  if run_backup; then
    printf '1\n' > "$state_dir/last-result"
  else
    printf '0\n' > "$state_dir/last-result"
    echo "$(date -u +%FT%TZ) backup failed" >&2
  fi
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
