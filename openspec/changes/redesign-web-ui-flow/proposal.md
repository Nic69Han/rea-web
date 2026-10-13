# Proposal: redesign the local web UI as a staged flow

## Why

The first `rea web` page showed the path field, drop box, status line, operations, graphs
and export card together, so a first-time visitor saw a dense page before doing anything.
Analysts want to start with one obvious action (drop a target), see that work is in
progress, and then land in a workspace for reading results.

## What Changes

- One page, three stages: `idle` (drop target, choose-a-file button, path disclosure),
  `analyzing` (analysis rosette), `results` (header bar plus Overview, Graphs, Evidence
  and Decompiled sections). **New analysis** returns to `idle`.
- The rosette has one ring segment per step the server really performs. Because the
  server does not stream progress, it is indeterminate until the response arrives, then
  each step shows its real status from `operations`.
- The decompiled-code export moves to the results header bar with its own rosette progress.
- Colors become tokens with light, dark and explicit `data-theme` variants; stage
  changes are announced through an `aria-live` region; `prefers-reduced-motion` is honored.

## Non-goals

- No server, API, CSP or response-shape change; no progress streaming.
- No new analysis capability and no new dependency.
- No per-function export counts (the server does not return them outside the zip).

## Impact

- Affected spec: `web-ui` (ADDED requirements).
- Affected code: `src/web/ui/*`, `docs/web-ui.md`.
