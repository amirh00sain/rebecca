# User

This package owns user read, mutation, validation, lifecycle, and subscription
support logic.

It handles user list/detail responses, create/update/delete/reset/revoke flows,
service assignment, admin and service limit enforcement, credential key
normalization, node operation enqueueing, lifecycle transitions, and bulk
actions.

Manual inbound selection has been removed. Users must belong to a service, and
subscription/config generation should be based on service hosts.
