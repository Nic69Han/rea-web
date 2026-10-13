# Design: local web UI

## Context

REA exposes shared workflows through a one-shot CLI and an MCP stdio server
(see `openspec/project.md`). `runProviderAnalysis` (bound in
`src/composition/directAnalysis.ts`, implemented in
`src/application/DirectAnalysis.ts`) opens a fresh `BinarySession` per call,
runs one operation, cleans up, honors an `AbortSignal`, and returns Evidence JSON
or `{ error: "Analysis failed", ... }`. `ArtifactProvider` implements
`inspect_artifact` and `trace_dylib_resolution` without any external engine, and
refuses `trace_dylib_resolution` for non-Mach-O targets with
`AnalysisUnsupportedTargetError`. The domain already owns parsed graph shapes
(`ArtifactInventoryResult` in `src/domain/artifactGraph.ts`,
`DylibResolutionResult` in `src/domain/apple/dylibResolution.ts`).

The goal is a human-facing local page over those existing workflows. The change
must satisfy the fail-closed scope rule: it is a prototype for a draft PR and
adds no execution, injection or mutation authority.

## Goals / Non-Goals

Goals:

- Paste or drop a binary, or paste its path, and see per-operation results,
  limitations, raw Evidence and dependency graphs.
- Zero new runtime dependencies; works with no deep provider installed.
- Preserve Evidence verbatim, preserve unknown coverage, report truncation and
  cleanup failures.
- Small attack surface: loopback only, authenticated, rebinding-resistant.

Non-Goals:

- Target execution, injection, mutation, runtime tooling.
- Remote access, multi-user use, persistence, history.
- Deep-provider workflows and call graphs (future work).
- A general web framework or reusable graph library.

## Decisions

### D1. `rea web` as a dispatcher mode, not a CLI subcommand

`scripts/rea.mjs` already decides the mode before importing `incur` and routes
`mcp` to `dist/mcp/main.js`. `web` follows that pattern and routes to
`dist/web/main.js` (`runEntrypoint`), with the same compiled-file existence
check and rebuild message.

Alternatives considered:

- A `CLI_COMMANDS` subcommand: touches the generated command catalog, one-shot
  output handling (`createCliResultOutput`), and tests that pin the catalog; the
  command is long-lived and does not fit the one-shot model.
- A separate bin (`rea-web`): extra package surface and install path for no gain.

### D2. `node:http` with no framework

The server has four routes. `node:http` plus a small router function is less
code than the glue for a framework and adds no dependency that `knip` must
allow-list or that needs supply-chain review.

Alternatives: Express/Fastify/Hono (new dependency, larger audit surface, middleware
defaults that may weaken the explicit guards); the MCP SDK's HTTP transport
(couples the UI to MCP session semantics, which the UI does not need).

### D3. Token + Host + Origin guards, loopback only

Threats: another local user or page reaching the port, DNS rebinding, and
cross-site requests from a browser tab.

- Bind only a literal loopback address (`127.0.0.1` or `::1`); a hostname such as
  `localhost` or any other address fails configuration parsing. Port 0 picks an
  ephemeral port and the real port is printed.
- Every request's `Host` must equal the bound `host:port` (defeats DNS
  rebinding, because a rebound name sends a different Host).
- If an `Origin` header is present it must equal `http://<host:port>`.
- `/api/*` requires `x-rea-web-token` (a custom header forces a CORS preflight
  that the server never grants); `/` requires `?token=`. Comparison uses
  `crypto.timingSafeEqual` over equal-length digests. The token is 32 random
  bytes, base64url, per process, printed only to stderr and never logged.
- The UI strips the token from the address bar with `history.replaceState`
  after reading it, limiting exposure through history and screenshots.
- No CORS headers are ever sent.

Alternatives: Unix domain socket (not reachable from a browser); cookie sessions
(CSRF surface, needs `SameSite` reasoning); no token and rely on loopback alone
(any local process or malicious page via rebinding could submit paths, and a
path request reads arbitrary local files).

Residual risk: the path mode lets any holder of the token ask REA to read any
file the user can read. This is inherent to a local analysis tool and equals CLI
authority; the token is the access control.

### D4. Content Security Policy

`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
connect-src 'self'; frame-ancestors 'none'`, plus `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Script and
style are external same-origin assets (no inline), so the policy needs no
`unsafe-inline`. Combined with `textContent`/`createElementNS` rendering this
removes both injection and exfiltration routes if a binary's strings contain
markup. The `?token=` in the URL is why `Referrer-Policy: no-referrer` matters.

Alternative: inline script with a nonce - adds per-response templating and
weakens the "static in-memory string" simplicity.

### D5. Assets as in-memory strings

`src/web/ui/assets.ts` exports `INDEX_HTML`, `APP_JS`, `APP_CSS`. TypeScript
compilation then carries the UI into `dist/` with no copy step, no `files`
entry, and no runtime filesystem reads (nothing for `scripts/prepack.mjs` or the
bundler to miss).

Alternatives: static files copied at build (extra build step and packaging rule);
a bundler/Vite UI (new tooling and dependencies); a framework such as React
(violates the no-dependency goal).

Trade-off: JavaScript lives inside a string, so editors do not lint it. Mitigated
by keeping `APP_JS` small and adding a test that evaluates it for syntax and
scans it for forbidden sinks.

### D6. Upload temp-dir lifecycle

Analysis is path based, so pasted/dropped bytes must be materialized.

1. Create a private directory (`mkdtemp`, mode 0700) under `os.tmpdir()`.
2. Stream the body into a file inside it (mode 0600, `wx`), enforcing
   `REA_WEB_MAX_UPLOAD_BYTES` while streaming; exceeding it aborts the request
   with 413 and removes the directory.
3. The file name is the sanitized basename of `x-rea-filename` (URL-decoded, then
   path separators, NUL and control characters rejected or replaced; empty or
   dot-only names replaced by a fixed name). The original name is shown as
   `display_name` only.
4. Run the analysis, then remove the directory in a `finally` block, including on
   error, abort and client disconnect.
5. If removal fails, keep ownership of the directory: return
   `cleanup: { status: "failed", detail }` with the retained path, never swallow
   the error. This mirrors the repository rule to retain ownership of resources
   whose cleanup failed.

Alternatives: keep uploads for the session (longer exposure of potentially
sensitive samples, needs eviction); in-memory-only analysis (the shared workflow
requires a path); a REA runtime root from `src/process/` private-root primitives
(stronger ownership proof; recorded as an open question since it needs
confirming the primitive fits a long-lived server).

### D7. Graph projection owner: `src/web/graphProjection.ts`

One module owns the translation from parsed domain results to `WebGraph`. It
takes already-parsed `ArtifactInventoryResult` and `DylibResolutionResult`
(obtained by validating the Evidence `normalized_result` with the owners'
schemas) and never re-reads bytes or re-interprets raw JSON elsewhere. The UI
renders `WebGraph` only; it does not know domain formats.

Mappings:

- `artifact-containment`: node per `ArtifactNode` (`artifact_id`, label from the
  first occurrence path or format, attributes for `format`, `size`, `sha256`,
  `content_state`); edge per `ArtifactEdge` from `parent_artifact_id` to the
  occurrence's `artifact_id` with `relation` preserved and `resolution:
  "observed"`; occurrences whose `artifact_id` is null produce no node and are
  counted in coverage notes. Edges carry `observed` when the container produced
  the `contains`/`slice-of` relation itself and `derived` otherwise. Coverage is
  owned by the domain inventory parser (legacy Evidence without
  `coverage_status` is classified fail-closed there); the graph reports
  `complete` only for a complete classification with all manifest-declared
  items retained, otherwise `partial`.
- `dylib-dependencies`: nodes for roots, images and unresolved install names;
  edges per load command with `weak`, `upward`, `reexport`, `delayed_init`,
  `command` attributes. Resolution: `resolved` -> `resolved`, `conditional` ->
  `ambiguous`, `unresolved` -> `unresolved`, any other status (`undetermined`)
  -> `unknown`; the domain value is kept in `attributes.resolution_status`.
  Edge targets without a resolved image become `unresolved-install-name` nodes.
  `coverage.status` is copied; `unparsed_images` and
  `roots_without_architecture` populate coverage notes; `findings` are attached
  to their edge (`attributes.findings`) or, when not edge-specific, to coverage
  notes. Limitations are the union of the result and Evidence limitations.

Unresolved or conditional edges stay visible, not dropped. Unknown coverage is
`unknown`, never an empty "none".

Alternatives: let the browser project raw Evidence (duplicates domain
interpretation in an untested string and risks drift); add graph output to the
domain/contracts layer (premature: no other consumer; can be promoted if CLI/MCP
later want it).

### D8. Hand-written layered SVG layout

Longest-path layering with barycenter ordering over the capped graph, rendered
with `createElementNS`. Cycles (dylib re-exports can cycle) are handled by
ignoring back edges during layering and drawing them as curved edges. Pan/zoom
is a transform on a group, driven by pointer and wheel events.

Alternatives: Cytoscape/D3/dagre/ELK (dependency size and review, bundling, CSP
constraints, and knip/package changes); server-side Graphviz rendering (requires
an external executable, which the installer rules forbid assuming); a plain
table (hides structure, the reason for the feature).

Trade-off: layout quality is basic. The 500/1500 caps bound its cost, and a
future dependency can replace it behind the `WebGraph` contract.

### D9. Truncation caps

Rendering is capped at 500 nodes and 1500 edges per graph. The projection keeps
nodes in deterministic order, keeps only edges whose endpoints are kept, and
reports `truncated: { nodes_omitted, edges_omitted }`. The UI shows a banner and
that the complete data remains in the raw Evidence JSON. The cap protects the
browser (SVG DOM size) and the response size; it is a rendering limit, not a
statement about completeness, which comes from `coverage`.

### D10. Concurrency 1

One analysis at a time. A second `POST /api/analyze` while one runs returns 409
immediately. This bounds memory, temp-dir count and process spawning (each
analysis opens a fresh session), and removes cross-request cleanup races. A
client disconnect aborts the `AbortSignal` passed to the workflow.

Alternatives: a queue (unbounded waiting, stale requests after the tab closed);
parallel analyses (resource bounds the CLI does not define).

## Request flow

```mermaid
sequenceDiagram
    actor Analyst
    participant UI as Browser UI (app.js)
    participant Web as src/web server
    participant Proj as graphProjection
    participant WF as runProviderAnalysis (composition/application)
    participant Art as ArtifactProvider

    Analyst->>UI: open URL with ?token, paste path / drop file
    UI->>UI: read token, replaceState to strip it
    UI->>Web: POST /api/analyze (x-rea-web-token, JSON path or octet-stream; other media types: 400 unsupported_content_type)
    Web->>Web: check Host, Origin, token, busy, size
    opt upload
        Web->>Web: write 0600 file in 0700 temp dir
    end
    Web->>WF: inspect_artifact(path, integrity_policy=fail, signal)
    WF->>Art: open fresh session, execute, cleanup
    Art-->>WF: Evidence JSON or error
    WF-->>Web: JsonValue
    Web->>WF: trace_dylib_resolution(path, signal)
    WF-->>Web: Evidence, or unsupported target (not_applicable)
    Web->>Proj: parsed ArtifactInventoryResult / DylibResolutionResult
    Proj-->>Web: WebGraph[] with coverage, truncation
    opt upload
        Web->>Web: remove temp dir (report failed cleanup)
    end
    Web-->>UI: 200 WebAnalysisResponse
    UI->>UI: render cards, raw Evidence, SVG graph (textContent only)
    Analyst->>UI: tab, zoom, click node for attributes
```

## Risks / Trade-offs

- New listening surface. Mitigated by loopback-only bind, token, Host/Origin
  checks, CSP, no CORS, concurrency 1; residual risk is a local process that
  obtains the token (printed on stderr). Accepted; equals local CLI authority.
- Path mode reads any user-readable file. Intentional and bounded to the
  analysis operations; no write, execute or listing route exists.
- Uploaded samples touch disk. Private dir and file modes, removal in `finally`,
  and explicit reporting of failed cleanup limit exposure; a crash can leave a
  directory behind (documented; startup does not scan or delete foreign dirs).
- Malicious binary strings in labels. Handled by `textContent`/`createElementNS`
  and the CSP, with a test scanning for forbidden sinks.
- Hand-written layout limits readability on large graphs. Caps and clear
  truncation reporting; replaceable behind `WebGraph`.
- `dist/web` is not bundled: it is compiled by `tsc` with relative imports and
  loads like other `dist` modules, so it only runs from a built checkout or a
  package that ships `dist/`. Whether to bundle remains a maintainer decision.
- Scope risk: reviewers may consider any network adapter out of scope. The
  change stays a draft until maintainers decide; nothing is enabled by default
  in other modes.
- Duplicate interpretation risk: the dylib mapping duplicates a status
  vocabulary. Mitigated by deriving it from the exported `DylibEdge` type and
  testing every resolution value.

## Migration plan

1. Land as a draft PR with the OpenSpec change; no behavior change for existing
   commands, MCP tools, or packages until the scope decision.
2. After approval, implement tasks 2-5 behind the new `web` mode only; nothing
   else changes.
3. Documentation and architecture diagram updates ship with the code.
4. Rollback: remove the `web` mode from `scripts/rea.mjs` and delete `src/web/`;
   no data, schema, or configuration migration exists because nothing persists.
5. Follow-up (separate proposal): deep-provider call graphs, bundling, or a
   REA-owned runtime root for uploads, depending on the open questions.
