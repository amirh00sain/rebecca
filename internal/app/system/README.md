# System

This package provides system and maintenance services for the panel runtime.

It collects CPU, memory, disk, swap, uptime, load, process, network, and
in-memory history metrics. It also provides maintenance metadata and binary
mode update/restart helpers.

Master no longer owns a local Xray runtime, so Xray status is derived from
connected nodes rather than a local process.
