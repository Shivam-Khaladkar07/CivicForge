#!/bin/sh
set -eu

# Free Render demo: no persistent disk and no secondary private service.
mkdir -p /tmp/civicforge-uploads
exec node /app/dist/index.js
