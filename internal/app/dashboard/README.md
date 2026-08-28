# Dashboard

This package serves the compiled frontend dashboard from the Go binary.

The dashboard build is embedded into the application so production runtime does
not need Python or a separate static-file process for the UI.

Frontend source code lives in the top-level `dashboard` directory; this package
only exposes the built assets to the gateway/API server.
