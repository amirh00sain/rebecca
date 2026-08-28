# Backup

This package implements Rebecca backup export and import.

It preserves the current `.rbbackup` format, including manifest validation,
SQLite backup/restore, MySQL/MariaDB dump and restore paths, full backup file
roots, and safe archive extraction.

The backup logic is only intended for supported binary installs. HTTP handlers
should use this package rather than shelling out directly.
