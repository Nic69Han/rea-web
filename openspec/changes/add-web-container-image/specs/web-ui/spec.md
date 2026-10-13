## ADDED Requirements

### Requirement: Container image for the local web UI

The repository SHALL provide a Dockerfile that builds the local web UI from the locked dependencies and runs `node scripts/rea.mjs web` as an unprivileged user with `REA_WEB_PORT=8080`, without modifying the server's loopback binding, token, `Host` or `Origin` checks and without a port forwarder or proxy. The image SHALL keep HOME, XDG and temporary directories under `/tmp` so it runs with a read-only root filesystem and a tmpfs `/tmp`.

#### Scenario: Run with host networking

- **WHEN** the image runs with `--network host --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges`
- **THEN** the container logs `http://127.0.0.1:8080/?token=<token>` and the server accepts requests carrying that token on host loopback
- **AND** a request without the token, or with a foreign `Host`, receives 403

#### Scenario: Server not reachable beyond loopback

- **WHEN** the image runs without host networking
- **THEN** the server remains bound to the container's loopback and the UI is unreachable from the host

### Requirement: Ghidra is an explicit, verified build choice

The Dockerfile SHALL include Ghidra only when built with `WITH_GHIDRA=1`, downloaded at build time and rejected unless its SHA-256 equals the pinned value. With `WITH_GHIDRA=0` the image SHALL contain neither Ghidra nor Java, and `GET /api/capabilities` SHALL report Ghidra unavailable with its reason.

#### Scenario: Decompile with the Ghidra variant

- **WHEN** an authorized client posts a path under the read-only `/work` mount to `/api/decompile`
- **THEN** the response is 200 `application/zip` produced without network access from the container

#### Scenario: Slim variant

- **WHEN** an authorized client posts to `/api/decompile` on the slim image
- **THEN** the response is 424 `deep_provider_unavailable`

#### Scenario: Archive digest mismatch

- **WHEN** the downloaded Ghidra archive does not match the pinned SHA-256
- **THEN** the image build fails and no image is produced

### Requirement: Documented platform limits

The Docker documentation SHALL state that host networking is native on Linux, that Docker Desktop requires host networking to be enabled and otherwise leaves the UI unreachable by design, and that the container is not a sandbox for hostile binaries.

#### Scenario: Reader on Docker Desktop

- **WHEN** a reader follows the Docker instructions on macOS or Windows
- **THEN** the documentation tells them to enable host networking (Docker Desktop 4.34 or later) and why
