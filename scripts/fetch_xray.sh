#!/usr/bin/env bash
set -euo pipefail

# fetch_xray.sh — Downloads a specific Xray-core release for the target architecture.
#
# Usage: fetch_xray.sh <release_tag> <arch> <output_dir>
#
# Arguments:
#   release_tag  - GitHub release tag, e.g. v26.7.11
#   arch         - Architecture label used in Xray release filenames:
#                    64, arm64-v8a, arm32-v7a, arm32-v6, arm32-v5, s390x
#   output_dir   - Where to place xray binary, geoip.dat, geosite.dat
#
# The script downloads the zip, verifies the sha256 checksum (if available),
# extracts xray + geo assets, and cleans up.

RELEASE_TAG="${1:?Usage: fetch_xray.sh <release_tag> <arch> <output_dir>}"
ARCH="${2:?Usage: fetch_xray.sh <release_tag> <arch> <output_dir>}"
OUTPUT_DIR="${3:?Usage: fetch_xray.sh <release_tag> <arch> <output_dir>}"

DOWNLOAD_URL="https://github.com/XTLS/Xray-core/releases/download/${RELEASE_TAG}/Xray-linux-${ARCH}.zip"
CHECKSUM_URL="https://github.com/XTLS/Xray-core/releases/download/${RELEASE_TAG}/Xray-linux-${ARCH}.zip.sha256"

TMPDIR_BUILD="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_BUILD}"' EXIT

echo "[fetch_xray] downloading ${DOWNLOAD_URL}"
curl -fSL --retry 3 --retry-delay 5 -o "${TMPDIR_BUILD}/xray.zip" "${DOWNLOAD_URL}"

# Verify checksum if available
if curl -fsSL -o "${TMPDIR_BUILD}/xray.zip.sha256" "${CHECKSUM_URL}" 2>/dev/null; then
    EXPECTED="$(awk '{print $1}' "${TMPDIR_BUILD}/xray.zip.sha256")"
    ACTUAL="$(sha256sum "${TMPDIR_BUILD}/xray.zip" | awk '{print $1}')"
    if [ "${EXPECTED}" != "${ACTUAL}" ]; then
        echo "[fetch_xray] ERROR: checksum mismatch: expected ${EXPECTED} got ${ACTUAL}" >&2
        exit 1
    fi
    echo "[fetch_xray] checksum verified"
else
    echo "[fetch_xray] warning: no checksum file available, skipping verification"
fi

echo "[fetch_xray] extracting"
unzip -o "${TMPDIR_BUILD}/xray.zip" -d "${TMPDIR_BUILD}/extract"

mkdir -p "${OUTPUT_DIR}"

# Move xray binary
cp "${TMPDIR_BUILD}/extract/xray" "${OUTPUT_DIR}/xray"
chmod 755 "${OUTPUT_DIR}/xray"

# Move geo assets if present
for f in geoip.dat geosite.dat; do
    if [ -f "${TMPDIR_BUILD}/extract/${f}" ]; then
        cp "${TMPDIR_BUILD}/extract/${f}" "${OUTPUT_DIR}/${f}"
    fi
done

echo "[fetch_xray] installed xray to ${OUTPUT_DIR}/xray"
