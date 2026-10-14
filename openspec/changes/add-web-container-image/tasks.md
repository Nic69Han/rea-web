# Tasks

## 1. Image

- [x] 1.1 `docker/rea-web/Dockerfile`: build stage (`npm ci`, `npm run compile`, prune), Ghidra stage with pinned SHA-256, runtime selected by `WITH_GHIDRA`.
- [x] 1.2 Unprivileged user, `REA_WEB_PORT=8080`, HOME/XDG/TMPDIR under `/tmp`, `/work` mount point, `ENTRYPOINT ["node","scripts/rea.mjs","web"]`.
- [x] 1.3 `.dockerignore` excluding VCS, dependencies, build output, tests and local state.

## 2. Documentation

- [x] 2.1 `docker/rea-web/README.md`: build, run, resources, platform note, security notes.
- [x] 2.2 "Run with Docker" section in `docs/web-ui.md`.

## 3. Publishing

- [x] 3.1 `.github/workflows/rea-web-image.yml`: `workflow_dispatch` and `rea-web-v*` tags, `contents: read` and `packages: write` only, no third-party actions.

## 4. Verification

- [x] 4.1 Build both variants; run with `--network host --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 4g`; check `/api/capabilities`, `/api/analyze` and `/api/decompile`.
- [ ] 4.2 Verify on Docker Desktop with host networking enabled (macOS and Windows).
- [ ] 4.3 Verify the registry publish workflow on GitHub-hosted runners.
