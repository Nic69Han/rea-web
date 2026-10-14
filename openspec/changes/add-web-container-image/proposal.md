# Proposal: run the local web UI and Ghidra export from a container image

## Why

Running `rea web` with the decompiled-code export needs Node.js, a built checkout, a
full JDK and a Ghidra install. Analysts who only have Docker should be able to run the
same local UI and export without installing those on the host, and without changing
what the server exposes.

## What Changes

- Add `docker/rea-web/Dockerfile` (multi-stage, build args `WITH_GHIDRA=1|0`): build
  with the pinned Node.js, run `npm ci` and `npm run compile`, keep production
  dependencies, and run `node scripts/rea.mjs web` as an unprivileged user. With
  `WITH_GHIDRA=1` the image adds JDK 21 and Ghidra 12.1.4 downloaded at build time and
  checked against a pinned SHA-256; `0` produces an image without Ghidra or Java.
- Run with `docker run --network host`, so the in-container `127.0.0.1` is the host
  loopback. `REA_WEB_PORT` is fixed to `8080` so the URL is predictable. HOME, XDG and
  temporary directories are `/tmp`, so `--read-only --tmpfs /tmp` works.
- Add `docker/rea-web/README.md`, a "Run with Docker" section in `docs/web-ui.md`,
  `.dockerignore`, and a `rea-web-image` workflow that publishes both variants to
  `ghcr.io/<owner>/rea-web` on `rea-web-v*` tags or manual dispatch.

## Non-goals

- No change to `src/**`: the server stays bound to literal loopback with its token and
  `Host`/`Origin` checks. No port forwarder or proxy re-exposes it.
- No change to REA's installers or `rea setup`; they never install Ghidra or Java.
  The image downloads Ghidra only as an explicit image build step, and the user chooses
  that build (`WITH_GHIDRA=0` opts out).
- No claim that the container is a sandbox for hostile binaries, and no target
  execution, mutation or new analysis capability.

## Impact

- Affected spec: `web-ui` (ADDED requirements).
- Affected files: `docker/rea-web/*`, `.dockerignore`, `.github/workflows/rea-web-image.yml`,
  `docs/web-ui.md`. No application code.
- Scope note: this packages an existing local, read-only workflow; per
  `CONTRIBUTING.md#contribution-scope` it adds no capability and enables nothing by
  default. Publishing to a registry and bundling Ghidra in a distributed image are
  distribution decisions for maintainers.

## Open questions (maintainer decision required)

1. **Non-Linux hosts and a container bind opt-in.** `--network host` is native only on
   Linux. Docker Desktop (macOS, Windows) needs host networking enabled (4.34 or later);
   without it the UI is unreachable by design. Should REA offer an explicit opt-in to
   bind a non-loopback address inside the container (published only to host loopback by
   `-p 127.0.0.1:8080:8080`)? That would change the server's bind and Host/Origin
   rules, so it is not implemented here and needs a scope and authority decision.
2. **Redistribution.** Is publishing an image that contains Ghidra (Apache-2.0) and a
   JDK under the project's `ghcr.io` namespace acceptable, or should only the slim
   image and the Dockerfile be distributed?
3. **Architectures.** The release archive ships no Linux ARM64 native decompiler, so the
   Ghidra variant is `linux/amd64` only.
