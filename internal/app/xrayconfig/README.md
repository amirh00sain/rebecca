# Xray Config

This package owns Xray configuration parsing, validation, normalization, and
target storage.

It manages master/default and node custom config targets, inbound and host
helpers, REALITY key normalization, non-persisted API/policy injection, and
sync_config enqueue behavior.

The master process does not run local Xray. Config changes are stored in the
database and pushed to nodes through node operations.
