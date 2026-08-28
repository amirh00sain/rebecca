# WARP

This package implements the Go-native Cloudflare WARP integration.

It stores the local WARP account record, registers devices with the Cloudflare
client API, updates licenses, fetches remote WARP config, and deletes only the
local account record when requested.

Secrets currently follow the legacy behavior and are stored as plaintext in the
database.
