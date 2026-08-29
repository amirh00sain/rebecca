# ============================================================
# Rebecca Master — Railway/Docker build
#
# The Rebecca Master manages Xray-core itself as a child process.
# Xray-core binary is downloaded at BUILD time with architecture
# detection and checksum verification (fails the build on error).
# No external Rebecca Node is required; no systemd is used.
# ============================================================

# ---- Dashboard build ----
FROM node:20-bookworm-slim AS dashboard

WORKDIR /src/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN VITE_BASE_API=/api/ npm run build \
    && cp ./build/index.html ./build/404.html

# ---- Tutorials (Hugo) ----
FROM golang:1.25-bookworm AS tutorials

ARG HUGO_VERSION=0.147.7
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && wget -q "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.deb" -O /tmp/hugo.deb \
    && dpkg -i /tmp/hugo.deb \
    && rm -rf /var/lib/apt/lists/* /tmp/hugo.deb

WORKDIR /src
COPY tutorials ./tutorials
RUN cd /src/tutorials && hugo --destination /out --cleanDestinationDir --gc --minify

# ---- Xray-core download stage ----
# Xray binary is downloaded at build time with arch detection + checksum.
# Configurable via build args: XRAY_CORE_VERSION, XRAY_ARCH
FROM golang:1.25-bookworm AS xray-download

ARG XRAY_CORE_VERSION=v26.3.27
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/fetch_xray.sh /fetch_xray.sh
RUN chmod +x /fetch_xray.sh && \
    /fetch_xray.sh "${XRAY_CORE_VERSION}" "${TARGETARCH:-amd64}" /opt/xray-out

# ---- Go builder ----
FROM golang:1.25-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    git \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .
COPY --from=dashboard /src/dashboard/build ./dashboard/build
COPY --from=tutorials /out ./dashboard/build/tutorial-content
RUN bash scripts/build_binary.sh

# ---- Final runtime image ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tzdata \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/rebecca
COPY --from=builder /src/dist/rebecca-server /usr/local/bin/rebecca-server
COPY --from=builder /src/dist/rebecca-cli /usr/local/bin/rebecca-cli
COPY templates ./templates

# Xray binary + geo assets installed at build time
COPY --from=xray-download /opt/xray-out/xray /usr/local/bin/xray
COPY --from=xray-download /opt/xray-out/geoip.dat /usr/local/share/xray/geoip.dat
COPY --from=xray-download /opt/xray-out/geosite.dat /usr/local/share/xray/geosite.dat

# Persistent data/config dirs (config.json generated at runtime — never baked into the image)
RUN mkdir -p \
        /var/lib/rebecca \
        /var/lib/rebecca/xray-core \
        /var/lib/rebecca/data \
        /var/lib/rebecca/config \
    && ln -sf /usr/local/bin/xray /var/lib/rebecca/xray-core/xray \
    && ln -sf /usr/local/share/xray/geoip.dat /var/lib/rebecca/xray-core/geoip.dat \
    && ln -sf /usr/local/share/xray/geosite.dat /var/lib/rebecca/xray-core/geosite.dat

COPY start.sh /start.sh
RUN chmod +x /start.sh

# Healthcheck hits the web endpoint (not just the process)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8080}/__rebecca_go/healthz || exit 1

# Railway/Docker inject PORT at runtime; default 8080
EXPOSE 8080
ENTRYPOINT ["/start.sh"]
