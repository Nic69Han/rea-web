# Proposal: add a decompiled-code export to the local web UI

## Why

After the web UI shows a target, an analyst often wants the decompiled pseudo-code of
the whole program to read offline or hand to another tool. REA already decompiles
(`procedure_pseudo_code`) through Ghidra, IDA and Hopper, but only one function per
CLI invocation, and every invocation reopens the provider (about 16 s per Ghidra open).

## What Changes

- Add `runDirectAnalysisSession` (application, bound in `src/composition/directAnalysis.ts`):
  open a target once, run several read-only calls (`list_procedures`,
  `procedure_pseudo_code`), and always close with the existing `withSessionCleanup`.
- Add `GET /api/capabilities` returning deep-provider availability derived from the
  existing session status (no new detection).
- Add `POST /api/decompile` returning a zip (`README.md`, `manifest.json`,
  `functions/*.c`, `evidence/*.json`). It shares the concurrency-1 gate, token, Host and
  Origin guards and upload staging with `/api/analyze`.
- Add a "Download decompiled code (.zip)" control to the result view.

## Non-goals

- No new analysis capability: decompilation is the existing read-only operation.
- No target execution, mutation, or provider installation.
- No new dependency; the zip is written with the existing `@zip.js/zip.js`.
- No claim that pseudo-code equals original source.

## Impact

- Affected spec: `web-ui` (ADDED requirements).
- Affected code: `src/application/DirectAnalysisSession.ts`,
  `src/composition/directAnalysis.ts`, `src/web/*` (routes, zip builder, gate, UI),
  `docs/web-ui.md`, `tests/boundary/web/*`.
- Scope note: this reuses an existing deep-provider read-only operation; per
  `CONTRIBUTING.md#contribution-scope` it stays part of the draft web UI change and does
  not enable anything by default.
