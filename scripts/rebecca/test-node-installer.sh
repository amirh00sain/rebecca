#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

colorized_echo() { :; }

for SCRIPT in "$ROOT/rebecca-node.sh" "$ROOT/rebecca-node-binary.sh"; do
    eval "$(sed -n '/^select_node_version() {$/,/^}$/p' "$SCRIPT")"
    select_node_version dev
    [ "$SELECTED_NODE_VERSION" = "dev" ]
    select_node_version latest
    [ "$SELECTED_NODE_VERSION" = "latest" ]

    eval "$(sed -n '/^read_node_certificate_bundle() {$/,/^}$/p' "$SCRIPT")"
    CERT_FILE="$TMP/cert.pem"
    CERT_KEY_FILE="$TMP/cert.key"
    BUNDLE_FILE="$TMP/bundle.pem"
    rm -f "$CERT_FILE" "$CERT_KEY_FILE"

    printf '%s\r\n' \
        '-----BEGIN CERTIFICATE-----' \
        'certificate' \
        '-----END CERTIFICATE-----' \
        '-----BEGIN PRIVATE KEY-----' \
        'private-key' >"$BUNDLE_FILE"
    printf '%s\r' '-----END PRIVATE KEY-----' >>"$BUNDLE_FILE"
    read_node_certificate_bundle <"$BUNDLE_FILE"

    grep -qx -- '-----END CERTIFICATE-----' "$CERT_FILE"
    grep -qx -- '-----END PRIVATE KEY-----' "$CERT_KEY_FILE"
    if [[ "$(uname -s)" == Linux* ]]; then
        [ "$(stat -c '%a' "$CERT_KEY_FILE")" = "600" ]
    fi
done
