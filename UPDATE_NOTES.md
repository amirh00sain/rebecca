# Update changes

- Railway GraphQL endpoint updated to `https://backboard.railway.com/graphql/v2`.
- TCP Proxy list now uses the public `tcpProxies` query and surfaces API errors instead of silently returning an empty list.
- Added `Update` action to every project detail screen.
- Project Update flow: enumerate and delete every TCP Proxy in the project, connect the service to the target GitHub repo, set Rebecca's port to 8080, resolve the latest `main` commit from GitHub's public API, deploy that exact commit through Railway `serviceInstanceDeployV2(..., commitSha: ...)`, and poll deployment status.
- Projects still pointing at the old RVG repository are migrated to `amirh00sain/rebecca` during Update.
- New deployment selection replaces RVG with Rebecca.
- Public GitHub access does not require embedding a GitHub credential in the project; the updater reads the public repository's latest commit through GitHub's public API.
- Removed real Railway example secrets from `railway.env.example` and replaced them with placeholders.
