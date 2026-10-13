# syntax=docker/dockerfile:1.7
#
# Local REA web UI (`rea web`) with optional Ghidra decompilation.
#
# Build from the repository root:
#   docker build -f docker/rea-web/Dockerfile -t rea-web .                      # with Ghidra
#   docker build -f docker/rea-web/Dockerfile --build-arg WITH_GHIDRA=0 -t rea-web:slim .
#
# The server is unchanged: it binds the literal loopback address and enforces its
# token and Host/Origin checks. The image is meant to run with `--network host`
# so that the in-container 127.0.0.1 is the host loopback. See README.md.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG DEBIAN_IMAGE=debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
ARG JDK_IMAGE=eclipse-temurin:21-jdk-noble@sha256:b468c3fc688b14450571494f588bd939378e7fd542ed5a73f8efc13f17872a87
# 1 = include Ghidra (JDK 21 base); 0 = slim image without Ghidra or Java.
ARG WITH_GHIDRA=1

# ---------------------------------------------------------------------------
# Build: install locked dependencies, compile dist/, keep production modules.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
ENV HUSKY=0 \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false
WORKDIR /src
COPY package.json package-lock.json ./
COPY scripts/prepare.mjs scripts/prepare.mjs
# Optional build secret `extra_ca`: a PEM bundle for TLS-intercepting proxies.
RUN --mount=type=secret,id=extra_ca \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
    && npm ci
COPY . .
# `compile` is the minimal build that produces dist/ (including dist/web).
RUN npm run compile \
    && npm prune --omit=dev \
    && test -f dist/web/main.js

# ---------------------------------------------------------------------------
# Ghidra: bring-your-own-style download, verified against a pinned SHA-256.
# ---------------------------------------------------------------------------
FROM ${DEBIAN_IMAGE} AS ghidra
ARG WITH_GHIDRA
ARG GHIDRA_VERSION=12.1.4
ARG GHIDRA_RELEASE=PUBLIC_20260921
ARG GHIDRA_SHA256=ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN mkdir -p /opt/ghidra
# hadolint ignore=DL3008
RUN --mount=type=secret,id=extra_ca \
    if [ "${WITH_GHIDRA}" = "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends ca-certificates curl unzip \
      && rm -rf /var/lib/apt/lists/* \
      && if [ -s /run/secrets/extra_ca ]; then cat /run/secrets/extra_ca >> /etc/ssl/certs/ca-certificates.crt; fi \
      && curl --fail --silent --show-error --location \
        --output /tmp/ghidra.zip \
        "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VERSION}_build/ghidra_${GHIDRA_VERSION}_${GHIDRA_RELEASE}.zip" \
      && echo "${GHIDRA_SHA256}  /tmp/ghidra.zip" | sha256sum --check --strict - \
      && unzip -q /tmp/ghidra.zip -d /opt/ghidra \
      && rm /tmp/ghidra.zip \
      && test -d "/opt/ghidra/ghidra_${GHIDRA_VERSION}_PUBLIC"; \
    fi

# ---------------------------------------------------------------------------
# Runtime bases selected by WITH_GHIDRA (only the chosen one is built).
# ---------------------------------------------------------------------------
FROM ${DEBIAN_IMAGE} AS base-0

# Ghidra needs the full JDK (it compiles the bridge scripts with javac).
FROM ${JDK_IMAGE} AS base-1
ARG GHIDRA_VERSION=12.1.4
COPY --from=ghidra /opt/ghidra /opt/ghidra
ENV GHIDRA_INSTALL_DIR=/opt/ghidra/ghidra_${GHIDRA_VERSION}_PUBLIC

# hadolint ignore=DL3006
FROM base-${WITH_GHIDRA} AS runtime
COPY --from=build /usr/local/bin/node /usr/local/bin/node

# Unprivileged user whose home is /tmp, so a read-only root filesystem with
# `--tmpfs /tmp` is enough for every HOME/XDG/Java user.home write.
RUN groupadd --system --gid 10001 rea \
    && useradd --system --uid 10001 --gid rea --no-create-home \
      --home-dir /tmp --shell /usr/sbin/nologin rea \
    && mkdir -p /app /work

WORKDIR /app
COPY --from=build --chown=root:root /src/package.json ./package.json
COPY --from=build --chown=root:root /src/node_modules ./node_modules
COPY --from=build --chown=root:root /src/dist ./dist
COPY --from=build --chown=root:root /src/scripts/rea.mjs ./scripts/rea.mjs
COPY --from=build --chown=root:root /src/bridge ./bridge

ENV HOME=/tmp \
    TMPDIR=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    XDG_CONFIG_HOME=/tmp/.config \
    XDG_DATA_HOME=/tmp/.local/share \
    XDG_STATE_HOME=/tmp/.local/state \
    REA_WEB_PORT=8080

USER 10001:10001
ENTRYPOINT ["node", "scripts/rea.mjs", "web"]
