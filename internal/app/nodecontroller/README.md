# Node Controller

This package orchestrates operational communication with nodes.

It uses node database records and the gRPC node client to fetch status and
metrics, sync Xray config, restart/reconnect runtime, update geo/runtime/service
assets, collect usage, and read logs.

Use this package for runtime node actions. Use `node` only for node CRUD and
certificate mutation.
