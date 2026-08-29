#!/usr/bin/env bash
set -euo pipefail

# Rebecca Master startup script (Railway / Docker entrypoint).
# Xray-core is NOT run as a separate service: it is managed as a child process
# of the Rebecca Master Go binary (see internal/app/xraymanager).
# This script only configures persistent paths and starts the master.

PORT="${PORT:-8080}"

# Persistent data root. A Railway/Docker volume should be mounted here so the
# SQLite database, Xray config, and GEO assets survive redeploys.
REBECCA_DATA_DIR="${REBECCA_DATA_DIR:-/var/lib/rebecca}"

# --- Persistent directories ---------------------------------------------
mkdir -p \
    "${REBECCA_DATA_DIR}/xray-core" \
    "${REBECCA_DATA_DIR}/data" \
    "${REBECCA_DATA_DIR}/config"

# --- Database ------------------------------------------------------------
# The Go server requires SQLALCHEMY_DATABASE_URL (DATABASE_URL is accepted as
# a fallback). If the user hasn't provided one, default to a persistent SQLite
# file inside the data dir so no Railway variable is needed.
#   sqlite:////var/lib/rebecca/data/rebecca.db  -> /var/lib/rebecca/data/rebecca.db
#   (4 slashes: the scheme "sqlite:///" plus the leading "/" of the absolute path)
if [[ -z "${SQLALCHEMY_DATABASE_URL:-}" && -z "${DATABASE_URL:-}" ]]; then
    export SQLALCHEMY_DATABASE_URL="sqlite:///${REBECCA_DATA_DIR}/data/rebecca.db"
fi

export PORT
export REBECCA_DATA_DIR
export UVICORN_HOST="${UVICORN_HOST:-0.0.0.0}"
export UVICORN_PORT="${PORT}"

echo "[start.sh] starting Rebecca Master on port ${PORT}"
echo "[start.sh] database: ${SQLALCHEMY_DATABASE_URL:-${DATABASE_URL:-<unset>}}"
echo "[start.sh] data dir: ${REBECCA_DATA_DIR}"

exec /usr/local/bin/rebecca-server
