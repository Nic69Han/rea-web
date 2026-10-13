## ADDED Requirements

### Requirement: Staged analysis flow

The web UI SHALL present one page that moves through the stages `idle`, `analyzing` and `results`, and SHALL return to `idle` when the user chooses **New analysis**.

#### Scenario: Start screen is minimal

- **WHEN** the page loads with a valid token
- **THEN** it shows only a minimal header, a drop target reading "Drop a binary, app bundle or archive here", a "choose a file" button and an "or enter a local path" disclosure
- **AND** the path field is hidden until the disclosure is opened

#### Scenario: Whole-window drop while idle

- **WHEN** the user drops a file anywhere in the window during `idle`
- **THEN** the file is uploaded for analysis and the stage becomes `analyzing`
- **AND** a drop during `analyzing` or `results` neither starts a run nor navigates the browser

#### Scenario: Missing token

- **WHEN** the page has no access token
- **THEN** the token alert is shown and analysis controls are disabled

#### Scenario: Return to start

- **WHEN** the user chooses **New analysis** in `results`
- **THEN** results, the last source and any export state are discarded and the stage becomes `idle`

### Requirement: Honest analysis progress

The analyzing stage SHALL show a compact instrument card with one numbered protocol row per step the server performs, beside a decorative bench animation, and SHALL NOT present progress the server did not report.

#### Scenario: Pending steps

- **WHEN** a request is in flight
- **THEN** every step reads "running…", and the specimen name, a monospace elapsed clock and a Cancel control are shown
- **AND** the bench animation and the rotating lab-note captions are flavor only, hidden from assistive technology, and never state or imply progress
- **AND** an upload is labelled "Upload + artifact inventory" instead of a separately completed upload step

#### Scenario: Real statuses

- **WHEN** the response arrives
- **THEN** each step shows the status reported in `operations` (ok, not applicable or error) with an icon, color and text
- **AND** a step with no matching operation reads "not reported"
- **AND** the page shows results after a short hold of about 500 ms

#### Scenario: Cancel and failure

- **WHEN** the user cancels, or the request fails
- **THEN** the stage returns to `idle` with a message and, for HTTP failures, the server error and raw response

#### Scenario: Reduced motion

- **WHEN** the user prefers reduced motion
- **THEN** the bench is a static pose, a single lab note is shown without rotating, and progress is conveyed as text

### Requirement: Results workspace

The results stage SHALL show a header bar and the sections Overview, Graphs, Evidence and Decompiled, preserving existing graph, evidence, coverage, limitation, truncation and cleanup information.

#### Scenario: Header bar

- **WHEN** results are shown
- **THEN** the bar shows target name, format, size, a short SHA-256 with a copy button, the decompiled-code download and **New analysis**
- **AND** the download is disabled with a visible reason when no deep provider is available

#### Scenario: Overview findings

- **WHEN** a graph contains unresolved or ambiguous edges
- **THEN** Overview highlights them as findings and shows per-graph node and edge counts, coverage status and top limitations

#### Scenario: Export progress

- **WHEN** the user starts the export
- **THEN** the Decompiled section shows the same instrument card in a smaller variant, indeterminate, with Cancel and export-specific lab notes, then the file name, size, duration and cleanup status
- **AND** per-function counts are not shown because the server does not return them outside the zip

### Requirement: Accessible, CSP-safe presentation

The UI SHALL keep a strict CSP, define colors as tokens with light and dark variants, and announce stage changes.

#### Scenario: No unsafe sinks

- **WHEN** the UI assets are inspected
- **THEN** they contain no inline script, no `style` attribute, no HTML-injection API and no dynamic-code API

#### Scenario: Narrow screens and announcements

- **WHEN** the viewport is 400 px wide
- **THEN** the page has no horizontal scroll
- **AND** each stage change is announced through an `aria-live` region and the decorative bench and lab notes are `aria-hidden` while the step list carries the real state
