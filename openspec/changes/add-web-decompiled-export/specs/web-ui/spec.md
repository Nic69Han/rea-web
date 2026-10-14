## ADDED Requirements

### Requirement: Deep-provider availability endpoint

The system SHALL expose `GET /api/capabilities`, guarded by the same Host, Origin and token checks as other API routes, returning `{"deep_providers":[{"id","available","reason?"}]}` for `ghidra`, `ida` and `hopper`. Availability SHALL be derived from the existing provider availability reported by the shared session status. When availability cannot be read, the system SHALL report each provider as unavailable with the reason, never as available.

#### Scenario: Provider not configured

- **WHEN** an authorized client requests `GET /api/capabilities` and Ghidra is not configured
- **THEN** the response lists `ghidra` with `available: false` and the provider's reason

#### Scenario: Token required

- **WHEN** a client requests `GET /api/capabilities` without the token
- **THEN** the server responds 403 and reports no availability

### Requirement: Decompiled-code export request

The system SHALL provide `POST /api/decompile` accepting `{"path": string, "provider"?: "ghidra"|"ida"|"hopper", "max_functions"?: integer}` as JSON, or an `application/octet-stream` upload with `provider` and `max_functions` as query parameters. `max_functions` SHALL default to 200 and SHALL be rejected with 400 `invalid_request` when outside 1 to 2000. On success it SHALL respond 200 `application/zip` with `content-disposition: attachment; filename="<sanitized-basename>-decompiled.zip"`.

#### Scenario: Out-of-range limit

- **WHEN** a client posts `max_functions: 2001`
- **THEN** the server responds 400 `invalid_request` and starts no provider

### Requirement: Exclusive, cancellable export

The export route SHALL share the single-work gate with `/api/analyze`, abort on client disconnect, and keep an uploaded file until the export finishes before removing it and reporting cleanup in the `x-rea-cleanup` header.

#### Scenario: Successful export

- **WHEN** a deep provider is available and an authorized client posts a valid path
- **THEN** the target is opened once, procedures are listed once, and each decompilable procedure is decompiled in that same session
- **AND** the session is closed before the response is sent

#### Scenario: Concurrent work

- **WHEN** an analysis or export is running and another `/api/decompile` or `/api/analyze` request arrives
- **THEN** the later request receives 409 `busy`

#### Scenario: Upload cleanup

- **WHEN** a file is uploaded for export
- **THEN** it exists while the export runs and is removed afterwards
- **AND** a failed removal is reported as `x-rea-cleanup: failed` with the directory retained

### Requirement: No provider available

The system SHALL answer 424 with `{"error":{"code":"deep_provider_unavailable","message":...}}` before opening the target when no deep provider, or the requested one, is available. The message SHALL tell the user to install or configure Ghidra, IDA or Hopper and reference `docs/installation.md`.

#### Scenario: Nothing installed

- **WHEN** no deep provider is available and a client posts to `/api/decompile`
- **THEN** the server responds 424 `deep_provider_unavailable` and starts no provider

### Requirement: Archive content

The archive SHALL contain `README.md`, `manifest.json`, `functions/<index>_<sanitized name>_<address>.c` and `evidence/*.json`. The README SHALL state target, SHA-256, provider, date, counts, limitations, and that pseudo-code is derived, provider-specific output. Evidence files SHALL hold each call's result verbatim.

#### Scenario: Derived output is labeled

- **WHEN** the archive is opened
- **THEN** the README and every `.c` header state that the pseudo-code is derived and not original source
- **AND** each function's `evidence/` file equals the provider's Evidence for that call

### Requirement: Manifest completeness and safe names

The manifest SHALL list each function's name, address, file and status, the skipped external or thunk procedures, the omitted count with an explicit truncation flag, failures with reasons, and provider cleanup status. A failure of one function SHALL be recorded and SHALL NOT abort the export. File names SHALL never contain path separators or `..`, whatever the provider reports.

#### Scenario: More procedures than the limit

- **WHEN** the provider lists more decompilable procedures than `max_functions`
- **THEN** only the first `max_functions` are decompiled
- **AND** the manifest and README state the omitted count and that the export is truncated

#### Scenario: Hostile function name

- **WHEN** a procedure is named `../../x` or has a very long name
- **THEN** its file name is a bounded safe segment inside `functions/`
- **AND** the verbatim name is preserved in `manifest.json`

#### Scenario: One function fails

- **WHEN** the provider fails for one procedure
- **THEN** the manifest records the failure code and message and the remaining functions are still exported

### Requirement: Download control in the UI

After a result renders, the page SHALL show a "Download decompiled code (.zip)" button. It SHALL be disabled with the reason when no deep provider is available, offer a provider choice when several are, show elapsed time and a Cancel control while running, save the zip through a temporary object URL that is revoked afterwards, and render a JSON error response instead of downloading. The UI SHALL NOT use `innerHTML` or inline script or style.

#### Scenario: No provider

- **WHEN** capabilities report no available provider
- **THEN** the button is disabled and the unavailable providers' reasons are shown

#### Scenario: Export error

- **WHEN** the export responds with a JSON error
- **THEN** the error code and message are shown and nothing is downloaded
