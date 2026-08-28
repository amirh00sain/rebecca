# Node Client

This package is the low-level gRPC client for rebecca-node.

It builds mTLS credentials from the current certificate model and opens typed
gRPC clients for the node protobuf services.

Keep this package focused on transport concerns: dialing, TLS configuration,
client construction, and protocol-level errors.
