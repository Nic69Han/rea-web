## ADDED Requirements

### Requirement: Loopback-only launch

The system SHALL provide a `rea web` mode, dispatched by `scripts/rea.mjs` to `dist/web/main.js`, that binds only a literal loopback address (`127.0.0.1` by default, or `::1`) from `REA_WEB_HOST` and the port from `REA_WEB_PORT` (default `0`). Any other host value SHALL be rejected at configuration parse time. After binding, the system SHALL print `http://<host>:<port>/?token=<token>` to stderr, where the token is a per-process random 32-byte base64url string.

#### Scenario: Default launch binds IPv4 loopback on an ephemeral port

- **WHEN** the user runs `rea web` with no `REA_WEB_*` variables set
- **THEN** the server listens on `127.0.0.1` on an operating-system-selected port
- **AND** stderr contains one URL of the form `http://127.0.0.1:<port>/?token=<43-character base64url token>` with the actual bound port

#### Scenario: Non-loopback host is rejected

- **WHEN** the user runs `rea web` with `REA_WEB_HOST=0.0.0.0` (or `localhost`, or a LAN address)
- **THEN** the process exits non-zero with a configuration error naming `REA_WEB_HOST`
- **AND** no socket is opened

#### Scenario: Compiled runtime missing

- **WHEN** the user runs `rea web` and `dist/web/main.js` does not exist
- **THEN** the dispatcher prints the existing rebuild instruction and exits non-zero without starting a server

### Requirement: Token authentication

The system SHALL require the per-process token on every request other than rejected ones: `/api/*` requests SHALL carry the header `x-rea-web-token` equal to the token, and the `GET /` page request SHALL carry a matching `token` query parameter. Token comparison SHALL be constant-time. The system SHALL NOT log, echo in any response, or persist the token, other than the single startup URL on stderr.

#### Scenario: Missing API token

- **WHEN** a client sends `POST /api/analyze` without `x-rea-web-token`
- **THEN** the server responds 403 (`forbidden_token`) with `{"error":{"code":...,"message":...}}`
- **AND** no analysis starts and no file is written

#### Scenario: Wrong page token

- **WHEN** a client requests `GET /?token=wrong`
- **THEN** the server responds 403 and serves no UI

#### Scenario: Token never echoed

- **WHEN** any request is rejected or fails
- **THEN** neither the response body nor the server's log output contains the token value

#### Scenario: Valid token serves the page

- **WHEN** a client requests `GET /?token=<token>` with a valid Host header
- **THEN** the server responds 200 with the HTML page and the response carries the security headers

### Requirement: Host and Origin rejection

The system SHALL reject any request whose `Host` header does not equal the bound `host:port`, and any request carrying an `Origin` header that does not equal `http://<host:port>`, with status 403 before routing or authentication-dependent work. The system SHALL NOT emit CORS headers.

#### Scenario: DNS-rebinding Host header

- **WHEN** a request arrives with `Host: attacker.example:<port>` and a valid token
- **THEN** the server responds 403 and performs no analysis

#### Scenario: Cross-site Origin

- **WHEN** a browser page at `https://evil.example` sends `POST /api/analyze` with a valid token and `Origin: https://evil.example`
- **THEN** the server responds 403 and performs no analysis
- **AND** the response contains no `Access-Control-Allow-*` header

#### Scenario: Same-origin request without Origin

- **WHEN** a non-browser client sends a request with the exact Host and a valid token and no Origin header
- **THEN** the request is accepted

### Requirement: Response hardening headers

The system SHALL send on every response `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`. The system SHALL serve the UI from in-memory assets at `/`, `/assets/app.js` and `/assets/app.css` and SHALL NOT load any resource from another origin or require files on disk.

#### Scenario: Headers on success and failure

- **WHEN** the server answers a 200, 403, 404 and 413 response
- **THEN** each response includes all four headers with the stated values

#### Scenario: Assets served from memory

- **WHEN** the client requests `/assets/app.js` and `/assets/app.css` with valid Host and token
- **THEN** each responds 200 with the matching content type and the page references no external URL

### Requirement: Analysis of a local path

The system SHALL accept `POST /api/analyze` with a JSON body `{"path": "<local path>"}` of at most 64 KiB. It SHALL run `inspect_artifact` (with `integrity_policy: "fail"`) and `trace_dylib_resolution` through the shared `runProviderAnalysis` workflow and respond 200 with a `WebAnalysisResponse` (`target.input_kind: "path"`) reporting each operation as `ok`, `error` or `not_applicable`. It SHALL NOT execute, modify or delete the target.

#### Scenario: Path to an application bundle

- **WHEN** the client posts `{"path":"/fixtures/Sample.app"}` and the target exists
- **THEN** the response has `target.input_kind` equal to `"path"` and `operations` containing `inspect_artifact` with `status: "ok"`
- **AND** the target on disk is unchanged

#### Scenario: Invalid body

- **WHEN** the client posts a JSON body without a string `path`, or a body larger than 64 KiB
- **THEN** the server responds 400 (or 413 for the oversized body) with an error object containing `code` and `message`

#### Scenario: Unsupported content type

- **WHEN** the client posts to `/api/analyze` with any media type other than `application/json` or `application/octet-stream`
- **THEN** the server responds 400 with `{"error":{"code":"unsupported_content_type","message":...}}` and starts no analysis

#### Scenario: Nonexistent path

- **WHEN** the client posts a `path` that does not exist
- **THEN** the response reports each operation with `status: "error"` and the projected analysis error, preserving the error reason without inventing a result

#### Scenario: Evidence preserved verbatim

- **WHEN** an operation succeeds
- **THEN** its `evidence` field equals the Evidence JSON returned by the shared workflow, including `evidence_id`, `confidence`, `limitations`, `locations`, and `normalized_result`, without field removal, reordering of arrays, or value rewriting

### Requirement: Uploaded file analysis

The system SHALL accept `POST /api/analyze` with `application/octet-stream` and a URL-encoded `x-rea-filename` header. It SHALL write the bytes to a new 0700 temporary directory as a 0600 file with a sanitized basename (no separators, NUL, control characters or traversal), analyze it like a path, and respond with `target.input_kind: "upload"`, the original `display_name`, `size_bytes` and `sha256`.

#### Scenario: Dropped file analyzed and removed

- **WHEN** the client uploads a Mach-O executable with `x-rea-filename: sample.bin`
- **THEN** the response is 200 with `cleanup.status: "removed"`
- **AND** the temporary directory no longer exists after the response

#### Scenario: Hostile filename

- **WHEN** the client uploads with `x-rea-filename` equal to `..%2F..%2Fetc%2Fpasswd`
- **THEN** the file is created only inside the temporary directory under a sanitized name
- **AND** no file is created outside that directory

#### Scenario: Upload cleanup failure is reported

- **WHEN** removal of the temporary directory fails after analysis
- **THEN** the response includes `cleanup: { "status": "failed", "detail": <reason> }` and the directory is retained
- **AND** the failure is not suppressed or reported as `removed`

#### Scenario: Cleanup on abort

- **WHEN** the client disconnects while an upload analysis is running
- **THEN** the in-flight analysis is cancelled through its abort signal and the temporary directory is removed (or reported failed in server diagnostics if removal fails)

### Requirement: Upload size limit

The system SHALL enforce a maximum upload size from `REA_WEB_MAX_UPLOAD_BYTES` (default 268435456 bytes, 256 MiB) while streaming the request body, SHALL respond 413 when the limit is exceeded without waiting for the entire body, and SHALL NOT leave the partial upload on disk.

#### Scenario: Oversized upload

- **WHEN** the client uploads more bytes than `REA_WEB_MAX_UPLOAD_BYTES`
- **THEN** the server responds 413 with an error object
- **AND** no analysis starts and the temporary directory and partial file are removed

#### Scenario: Declared length exceeds the limit

- **WHEN** the request declares a `content-length` greater than the limit
- **THEN** the server responds 413 before writing any bytes to disk

### Requirement: Single concurrent analysis

The system SHALL run at most one analysis at a time and SHALL respond 409 to a `POST /api/analyze` received while another analysis is running, without queuing it and without creating a temporary directory for it.

#### Scenario: Second request while busy

- **WHEN** a first analysis is in progress and a second authenticated `POST /api/analyze` arrives
- **THEN** the second receives 409 with an error object whose message states that an analysis is already running
- **AND** the first analysis completes normally

#### Scenario: Capacity returns after completion

- **WHEN** the first analysis finishes
- **THEN** a subsequent `POST /api/analyze` is accepted

### Requirement: Mach-O dylib dependency graph

For a Mach-O or `.app` target, the system SHALL project `trace_dylib_resolution` into a `dylib-dependencies` graph of roots, images and unresolved install names, with load edges carrying `command`, `weak`, `upward`, `reexport`, `delayed_init`. Edge `resolution` SHALL derive from the domain edge status as stated in the scenarios, and coverage and limitations SHALL come from the result.

#### Scenario: Resolved and unresolved loads

- **WHEN** an executable has one dependency that resolves to an image in the analyzed root and one weak dependency that does not resolve
- **THEN** the `dylib-dependencies` graph has an edge with `resolution: "resolved"` and an edge with `resolution: "unresolved"` and `attributes.weak: true`
- **AND** the unresolved edge is present in the response rather than omitted

#### Scenario: Conditional resolution is ambiguous

- **WHEN** a load edge has domain status `conditional` or `undetermined` (any status other than `resolved` and `unresolved` maps to `unknown`)
- **THEN** the projected edge has `resolution: "ambiguous"` or `"unknown"` respectively, keeps the domain value in `attributes.resolution_status`, and is never shown as resolved

#### Scenario: Node kinds and findings

- **WHEN** a load edge has no resolved image
- **THEN** its target is a node of kind `unresolved-install-name` with id `install-name:<install name>`; resolved targets and loaders are `image` nodes and analyzed roots are `root-image` nodes
- **AND** findings that reference the edge appear in `attributes.findings`, and findings that do not appear in `coverage.notes`

#### Scenario: Partial coverage retained

- **WHEN** the result reports `coverage.status: "partial"` with unparsed images
- **THEN** the graph `coverage.status` is `"partial"` and `coverage.notes` names the unparsed images

### Requirement: Non-Mach-O targets are not applicable for dylib tracing

The system SHALL report `trace_dylib_resolution` as `status: "not_applicable"` with a `reason` when the target is not a Mach-O executable or `.app` bundle (the shared workflow refuses it as an unsupported target), SHALL NOT report it as an error, and SHALL NOT emit a `dylib-dependencies` graph for that target. Other operations for the same target SHALL still be reported.

#### Scenario: ELF binary

- **WHEN** the client analyzes an ELF executable
- **THEN** the `trace_dylib_resolution` operation has `status: "not_applicable"` and a non-empty `reason`
- **AND** `graphs` contains no `dylib-dependencies` entry
- **AND** `inspect_artifact` is still reported with its own status

#### Scenario: Genuine failure stays an error

- **WHEN** `trace_dylib_resolution` fails for a Mach-O target for a reason other than an unsupported target (for example an I/O failure)
- **THEN** the operation has `status: "error"` with the projected `error`, not `not_applicable`

### Requirement: Artifact containment graph

The system SHALL project the `inspect_artifact` result into a graph with `graph_id: "artifact-containment"` where each artifact node is a content-addressed artifact and each edge connects a parent artifact to a child artifact with `relation` preserved from the domain value (`contains`, `extracts`, `slice-of`, `embeds`, `loads`, `maps-source`, `derived-from`), using only the parsed inventory result and not re-reading target bytes. Node attributes SHALL include format, size and sha256.

#### Scenario: Archive with nested entries

- **WHEN** the target is an archive containing an executable
- **THEN** the graph contains a node for the archive and a node for the executable joined by an edge whose `relation` equals the inventory edge relation
- **AND** each node carries `format`, `size` and `sha256` attributes

#### Scenario: Single plain file

- **WHEN** the inventory contains one artifact and no edges
- **THEN** the graph has one node, zero edges, and is still returned

### Requirement: Unknown coverage is preserved

The system SHALL NOT convert unknown or missing coverage into complete coverage or absence. The UI SHALL display `unknown`, `partial` and `complete` distinctly and SHALL NOT present an empty graph with unknown coverage as "no dependencies". The web projection SHALL NOT upgrade coverage reported by the domain.

#### Scenario: Coverage sources

- **WHEN** a graph is projected
- **THEN** `dylib-dependencies` reports the result's `coverage.status` verbatim
- **AND** `artifact-containment` reports `complete` only when the domain inventory classification is complete and every manifest-declared node, occurrence and edge was retained, otherwise `partial`

#### Scenario: Missing coverage_status

- **WHEN** the inventory result has no `coverage_status` and carries an unrecognized limitation
- **THEN** the artifact graph reports `coverage.status: "partial"`, never `"complete"`

#### Scenario: Empty graph with unknown coverage

- **WHEN** a graph has no edges and `coverage.status` is `"unknown"`
- **THEN** the UI shows the unknown-coverage banner and does not state that the target has no relationships

### Requirement: Truncation is reported

The system SHALL limit each returned graph to at most 500 nodes and 1500 edges, SHALL keep only edges whose endpoints are retained, and SHALL report `truncated: { nodes_omitted, edges_omitted }` with the exact omitted counts (zero when nothing was omitted). The UI SHALL show a banner when either count is non-zero. Truncation SHALL NOT alter the `coverage` status or the raw `evidence`, which remains complete.

#### Scenario: Graph over the cap

- **WHEN** a projected graph would contain 620 nodes and 1700 edges
- **THEN** the returned graph has 500 nodes, at most 1500 edges, no edge with a missing endpoint, and `truncated.nodes_omitted` equal to 120
- **AND** `truncated.edges_omitted` equals the number of edges not returned

#### Scenario: Graph within the cap

- **WHEN** a graph has fewer nodes and edges than the caps
- **THEN** `truncated` is `{ "nodes_omitted": 0, "edges_omitted": 0 }` and no banner is shown

### Requirement: Safe rendering of untrusted text

The UI SHALL render every string originating from a target, Evidence, filename, path or error using `textContent` and `createElementNS` (or equivalent non-parsing DOM APIs) and SHALL NOT assign untrusted text to `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write`. The UI SHALL read the token from the page URL, remove it from the address bar with `history.replaceState`, and send it only as the `x-rea-web-token` header.

#### Scenario: Markup in an install name

- **WHEN** a dylib install name is `<img src=x onerror=alert(1)>`
- **THEN** the graph and detail panel display that exact text as characters and no element or script is created from it

#### Scenario: Forbidden sinks absent

- **WHEN** the shipped `app.js` source is scanned
- **THEN** it contains no use of `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`

#### Scenario: Token removed from the address bar

- **WHEN** the page loads at `/?token=<token>`
- **THEN** after load `location.search` no longer contains the token and subsequent API calls still authenticate

### Requirement: Graph presentation

The UI SHALL show each graph in its own tab as a layered SVG with pan and zoom, node selection showing attributes, a legend, coverage, limitations and the source operation's confidence. Edges SHALL be drawn solid for `observed` and `resolved`, dashed for `inferred` and `derived`, red dotted for `unresolved`, grey for `unknown`, and `ambiguous` visually distinct from `resolved`. The UI SHALL follow `prefers-color-scheme`.

#### Scenario: Node selection

- **WHEN** the analyst clicks a node
- **THEN** a side panel lists that node's `kind`, `label` and each attribute

#### Scenario: Unresolved edge styling

- **WHEN** a graph contains an edge with `resolution: "unresolved"`
- **THEN** it is drawn red and dotted and the legend explains that style

### Requirement: Read-only static scope

The system SHALL NOT execute, launch, attach to, instrument, or modify the analyzed target, SHALL NOT require or invoke a deep provider (Hopper, Ghidra, IDA), and SHALL NOT expose any route other than the static asset routes and `POST /api/analyze`. Requests to other paths SHALL receive 404 and unsupported methods SHALL receive 405.

#### Scenario: Unknown route

- **WHEN** an authenticated client requests `GET /api/session` or `POST /api/execute`
- **THEN** the server responds 404 and performs no action

#### Scenario: No deep provider installed

- **WHEN** no Hopper, Ghidra or IDA installation is configured and the client analyzes a Mach-O file
- **THEN** both operations complete using provider-free static analysis and the response contains no deep-provider requirement or error
