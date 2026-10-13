# Tasks

## 1. Spec and scope

- [ ] 1.1 Open a draft PR (Conventional Commit title, e.g. `feat(web): add local web UI prototype`) and record the scope decision request from `proposal.md` "Open questions for maintainers".
- [ ] 1.2 Review `specs/web-ui/spec.md` against `openspec/changes/add-local-web-ui/design.md`; run `openspec validate add-local-web-ui --strict`.
- [ ] 1.3 Confirm no deep-provider, execution, injection or mutation behavior is reachable from any route (checklist review recorded in the PR).

## 2. Server (`src/web/`)

- [ ] 2.1 Zod-validated configuration from environment: `REA_WEB_PORT` (default 0), `REA_WEB_HOST` (literal `127.0.0.1` or `::1`), `REA_WEB_MAX_UPLOAD_BYTES` (default 268435456); reject any other host at parse time.
- [ ] 2.2 `src/web/main.ts`: bind loopback, generate a 32-byte base64url token, print `http://<host>:<port>/?token=<token>` to stderr, handle SIGINT/SIGTERM shutdown including in-flight analysis abort.
- [ ] 2.3 Request guards: exact `Host` match, `Origin` match when present, constant-time token comparison (`x-rea-web-token` for `/api/*`, `?token=` for `/`), 401/403 responses; never log or echo the token.
- [ ] 2.4 Response headers on every response: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store`.
- [ ] 2.5 Routes: `GET /`, `GET /assets/app.js`, `GET /assets/app.css`, `POST /api/analyze`; unknown routes 404; wrong methods 405.
- [ ] 2.6 `POST /api/analyze` JSON path branch (64 KiB body cap, Zod-parsed `{ path }`).
- [ ] 2.7 `POST /api/analyze` octet-stream branch: streaming size cap (413 on exceed, with request abort), `x-rea-filename` decoding and basename sanitization, private temp dir (0700) and file (0600), analyze, remove, populate `cleanup`; retain the directory and report `failed` when removal fails.
- [ ] 2.8 Concurrency 1: second concurrent analyze returns 409; client disconnect aborts the in-flight `AbortSignal` and still runs upload cleanup.
- [ ] 2.9 Operation runner: call the bound `runProviderAnalysis` for `inspect_artifact` and `trace_dylib_resolution`; discriminate the `error` branch, parse success with `evidenceSchema`, map unsupported-target to `not_applicable`, project other errors; target summary (size, sha256) from the opened target facts or Evidence subject.

## 3. Projection (`src/web/graphProjection.ts`)

- [ ] 3.1 Define the `WebGraph` / `WebAnalysisResponse` types and a Zod schema used by server tests and the UI contract.
- [ ] 3.2 `artifact-containment` from `ArtifactInventoryResult` (`nodes`, `occurrences`, `edges`); map `coverage_status` (absent => `unknown`) and `limitations`.
- [ ] 3.3 `dylib-dependencies` from `DylibResolutionResult` (roots, images, install names; edges with `weak`/`upward`/`reexport`/`delayed_init` attributes; resolution mapping `resolved`, `conditional`->`ambiguous`, `unresolved`, `undetermined`->`unknown`); map `coverage.status`, unparsed images and `findings` to coverage notes.
- [ ] 3.4 Deterministic ordering and stable ids; truncation at 500 nodes / 1500 edges with `truncated` counts and no dangling edges.
- [ ] 3.5 Keep attributes JSON-primitive only; preserve source values verbatim (paths, install names, digests).

## 4. UI (`src/web/ui/assets.ts`)

- [ ] 4.1 `INDEX_HTML`, `APP_CSS` (light/dark via `prefers-color-scheme`), `APP_JS` as exported strings; no external resources.
- [ ] 4.2 Token handling: read `location.search`, strip with `history.replaceState`, send `x-rea-web-token`.
- [ ] 4.3 Input: path field, paste of path text, clipboard file paste, drag-and-drop, upload as octet-stream with `x-rea-filename`; busy/size/error states.
- [ ] 4.4 Result panel: target summary, per-operation status cards, limitations, confidence, collapsible raw Evidence JSON.
- [ ] 4.5 Graph panel: tabs per graph; layered layout (longest-path layering + barycenter ordering); pan/zoom (wheel + drag); node click shows attributes; edge styles by resolution; legend; coverage and truncation banner.
- [ ] 4.6 Safe rendering: `textContent` and `createElementNS` only; add a test that fails on `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` in `APP_JS`.

## 5. Wiring

- [ ] 5.1 `scripts/rea.mjs`: `web` mode detection before importing `incur`, compiled-file existence check for `dist/web/main.js`, dynamic import of the entry.
- [ ] 5.2 `knip.json`: add `src/web/main.ts` to `entry`; resolve any unused export findings without suppressions.
- [ ] 5.3 `vitest.config.ts`: add `web` to the `adapters` include glob; run `npm run verify:test-discovery`.
- [ ] 5.4 Module boundaries: confirm `npm run verify:module-boundaries` passes (providers only via `src/composition/`).
- [ ] 5.5 Bundling: apply the maintainer decision on `scripts/bundle-runtime.mjs` / `scripts/prepack.mjs` for `dist/web/`.
- [ ] 5.6 Docs: add `docs/web-ui.md`, update `docs/architecture.mermaid` and `docs/cli.md`; run `npm run docs:check`.

## 6. Tests and validation

- [ ] 6.1 Server tests (loopback): token required, wrong/missing token 401/403, Host and Origin rejection, non-loopback config rejected, security headers present, 404/405.
- [ ] 6.2 Upload tests: success and temp-dir removal, filename sanitization (traversal, NUL, separators), size limit 413, injected cleanup failure reported with directory retained, client-disconnect cancellation, concurrency 409.
- [ ] 6.3 Projection tests with fixtures: Mach-O dylib graph (resolved/unresolved/ambiguous), non-Mach-O `not_applicable`, containment graph from an archive fixture, absent `coverage_status` => `unknown`, truncation counts, verbatim Evidence.
- [ ] 6.4 Dispatcher boundary test (`tests/boundary/cli/dispatcher.test.ts` style): `rea web` starts, prints the URL to stderr, serves `/`, and exits cleanly; missing compiled runtime prints the rebuild instruction.
- [ ] 6.5 One end-to-end workflow test through the compiled entry using a real Mach-O fixture (public HTTP API, not module internals).
- [ ] 6.6 Run `npm run check:fast`, `npm run test:local -- src/web`, `npm run test:focused -- <boundary test>`; `npm run check:pr` optional.
- [ ] 6.7 Performance note per `AGENTS.md#performance`: report response size and elapsed time cold/warm for one representative binary; state unmeasured costs (token usage is not applicable to a human UI).
- [ ] 6.8 Real-provider verification scope: none. v1 uses only provider-free static operations; no Hopper, Ghidra or IDA is exercised. State this explicitly in the PR; real-browser rendering is verified manually or marked unverified.
