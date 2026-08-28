# Usage

This package owns usage accounting services.

It persists user, admin, service, node, node-user, and outbound traffic counters
that are collected through the Go node usage flow.

Database writes should be ack-safe: callers should only acknowledge node usage
after this package has successfully committed the relevant accounting changes.
