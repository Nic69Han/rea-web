# Tasks

## 1. Shared session helper

- [x] 1.1 `runDirectAnalysisSession` in `src/application/DirectAnalysisSession.ts` using `withSessionCleanup`; reports a cleanup failure after successful work instead of hiding it.
- [x] 1.2 Bind it in `createDirectAnalysis` without losing the work's result type.

## 2. Server

- [x] 2.1 Extract the concurrency gate (`WorkGate`) and source reading (`SourceRequests`) so analyze and decompile share them.
- [x] 2.2 `GET /api/capabilities` from session status; unreadable status reports every provider unavailable with the reason.
- [x] 2.3 `POST /api/decompile` (JSON path or octet-stream upload with query options); 424 `deep_provider_unavailable`, 422 `decompile_failed`, 400 `invalid_request`, 409 `busy`.
- [x] 2.4 Zip builder with sanitized names, explicit truncation, recorded failures, verbatim Evidence.

## 3. UI

- [x] 3.1 Capabilities fetch, download button with reason when disabled, provider select, progress, Cancel, Blob download via revoked object URL, JSON error rendering.

## 4. Tests and docs

- [x] 4.1 Unit tests for zip building and collection with a fake session call.
- [x] 4.2 Boundary tests for capabilities, errors, guards, lock, upload cleanup, and an end-to-end zip through the Ghidra provider fixture.
- [x] 4.3 Update `docs/web-ui.md`.
- [ ] 4.4 Real IDA and Hopper verification (only Ghidra 12.1.4 on a small ELF was run).
