#!/usr/bin/env bash
set -euo pipefail

# Rebecca Master startup script (Railway / Docker entrypoint).
# Xray-core is NOT run as a separate service: it is managed as a child process
# of the Rebecca Master Go binary. This script only starts the master.

export PORT="${PORT:-8080}"
export UVICORN_HOST="${UVICORN_HOST:-0.0.0.0}"
export UVICORN_PORT="${PORT}"
export REBECCA_DATA_DIR="${REBECCA_DATA_DIR:-/var/lib/rebecca}"

# Ensure data directories exist
mkdir -p "${REBECCA_DATA_DIR}/xray-core"

# On ephemeral filesystems (Railway), the data dir may not persist across deploys.
# Ensure the binary and config directory are created each startup.
if [ -d "/var/lib/rebecca" ] && [ ! -w "/var/lib/rebecca" ]; then
    echo "[start.sh] warning: /var/lib/rebecca is not writable"
fi

echo "[start.sh] starting Rebecca Master on port ${PORT}"

exec rebecca-server
