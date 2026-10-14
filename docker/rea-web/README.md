# REA web UI in Docker

Run the [local web UI](../../docs/web-ui.md) and its Ghidra decompiled-code
export from a container, so a host needs only Docker. REA stays local-only: the
server is unchanged, binds the literal loopback address, and keeps its token and
`Host`/`Origin` checks. The image adds no port forwarder or proxy.

## Build

From the repository root:

```sh
# With Ghidra 12.1.4 and JDK 21 (decompiled-code export available), about 2.6 GB on disk
docker build -f docker/rea-web/Dockerfile -t rea-web .

# Without Ghidra or Java (analysis only; export reports no deep provider), about 0.6 GB
docker build -f docker/rea-web/Dockerfile --build-arg WITH_GHIDRA=0 -t rea-web:slim .
```

The build runs `npm ci` and `npm run compile` with the pinned Node.js 24.18.0,
keeps production dependencies only, and (with `WITH_GHIDRA=1`) downloads the
Ghidra 12.1.4 release archive and refuses it unless its SHA-256 matches
`GHIDRA_SHA256` in the Dockerfile. Ghidra is Apache-2.0 software from the
National Security Agency; building the image downloads it for you, and REA
itself never installs it. After the build, the container needs no internet.

Behind a TLS-intercepting proxy, pass your CA bundle as an optional build
secret: `--secret id=extra_ca,src=/path/to/ca.pem`.

## Run

```sh
docker run --rm --network host --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges --memory 4g \
  -v "$PWD:/work:ro" rea-web
```

The container logs the tokenized URL (port `8080`, fixed by `REA_WEB_PORT`):

```text
REA web UI (static analysis only): http://127.0.0.1:8080/?token=<token>
```

Open that exact URL on the same machine; every start prints a new token. Read it
again with `docker logs <container>` if you ran detached (`-d`).

- Analyze a file or directory under the mounted folder by entering its
  container path (for example `/work/sample.bin`) in **or enter a local path**.
- Or drop a file on the page: uploads are staged in `/tmp` inside the
  container, analyzed, and removed.
- **Download decompiled code (.zip)** runs Ghidra in the same container
  (`GHIDRA_INSTALL_DIR=/opt/ghidra/ghidra_12.1.4_PUBLIC`). Without Ghidra
  (`rea-web:slim`) the button is disabled and `/api/capabilities` reports the
  reason.

Mount a different folder by changing `-v`, for example
`-v "$HOME/samples:/work:ro"`.

## Resources

- Plan for about 4 GB of memory (`--memory 4g`) for Ghidra; raise it for large
  targets. Peak memory was not measured; one idle snapshot after a small export
  read 282 MiB.
- Ghidra needs about 16 s to open a target, paid once per export.
- Uploads are capped at 256 MiB (`REA_WEB_MAX_UPLOAD_BYTES`); the cap and the
  `/tmp` tmpfs both hold an upload, so give the tmpfs room for large files
  (`--tmpfs /tmp:size=2g`).

## Platform support

`--network host` is native on Linux, where the container's `127.0.0.1` is the
host loopback. On Docker Desktop (macOS and Windows) the container shares the
Docker VM's network, not your computer's, so host networking must be enabled in
Docker Desktop settings (Docker Desktop 4.34 or later, "Enable host networking").
Without it the UI is unreachable from your browser, by design: the server never
binds a non-loopback address. Whether to offer a documented opt-in to bind a
non-loopback address inside the container is an open maintainer decision and is
not implemented.

## Security notes

- The server binds only `127.0.0.1` inside the shared host network namespace, so
  nothing is exposed beyond host loopback. The per-process token and the
  `Host`/`Origin` checks are unchanged.
- Other local users and processes on the host can reach loopback, as for
  `rea web` outside Docker; the token is what authorizes requests.
- Targets are parsed and decompiled, never executed. Mount them read-only.
- The container runs as an unprivileged user (uid 10001) with all capabilities
  dropped and a read-only root filesystem; only `/tmp` is writable.
- This is not a sandbox for hostile binaries. Parsers and Ghidra run in the
  container, which shares the host kernel and network namespace.
- `--network host` shares the host network namespace. The image makes no outbound
  connection of its own.

## Environment

| Variable             | Image value                                    |
| -------------------- | ---------------------------------------------- |
| `REA_WEB_PORT`       | `8080`                                         |
| `GHIDRA_INSTALL_DIR` | `/opt/ghidra/ghidra_12.1.4_PUBLIC` (full only) |
| `HOME`, `TMPDIR`     | `/tmp`                                         |

`REA_WEB_HOST` is deliberately not set; the loopback default applies.
