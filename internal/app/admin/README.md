# Admin

This package owns Rebecca's administrator identity model.

It handles admin password hashing and verification, JWT creation and validation,
API key validation, role and permission normalization, active/disabled/deleted
status checks, and effective admin context building.

HTTP routes should not duplicate permission logic. They should authenticate the
admin through this package and then apply route-specific business rules.
