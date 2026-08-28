# Node

This package owns node records and node mutation logic.

It handles creating, updating, deleting, and resetting nodes in the database,
node certificate generation and regeneration, pending certificate tokens, and
the request/response DTOs used by node mutation routes.

It does not talk to rebecca-node directly. Runtime communication belongs in
`nodeclient` and orchestration belongs in `nodecontroller`.
