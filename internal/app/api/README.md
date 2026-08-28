# API

This package is the main HTTP API surface for Rebecca.

It wires routes, middleware, auth checks, request decoding, response shaping,
OpenAPI/Swagger documentation, and handlers for users, admins, services, nodes,
settings, system maintenance, subscriptions, runtime helpers, WARP, hosts, and
inbounds.

Domain-specific business logic should stay in its own package. This package
should mostly coordinate HTTP input/output and call the relevant app services.
