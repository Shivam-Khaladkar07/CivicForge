#!/bin/sh
set -eu

if ! grep -q ' /data ' /proc/mounts; then
  echo 'A persistent Render disk mounted at /data is required.' >&2
  exit 1
fi
mkdir -p /data/uploads /data/backup-state /data/restic-cache /tmp/civicforge-restore
chown civicforge:civicforge /data/uploads /data/backup-state /data/restic-cache /tmp/civicforge-restore
exec su-exec civicforge node /app/render-start.mjs
