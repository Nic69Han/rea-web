# Proposal: add a local web UI

## Why

REA's analysis is reachable only through the one-shot CLI and the MCP stdio
server. Both are excellent for agents and scripts, but an analyst who just wants
to look at a binary has to know command names, read JSON Evidence, and mentally
reconstruct relationships that REA already models as graphs (artifact
containment, Mach-O dylib resolution). A small local page where the analyst
pastes a path, or drops or pastes the file itself, and immediately sees status
per operation, limitations, raw Evidence and a navigable dependency graph lowers
the cost of the first look without adding any analysis capability.

The provider-free static operations (`inspect_artifact`, `trace_dylib_resolution`)
already return everything required, so no deep provider (Hopper, Ghidra, IDA)
must be installed for the first release.

## What Changes

- Add `rea web`, a new mode of the `scripts/rea.mjs` dispatcher (like `mcp`),
  routed to the compiled entry `dist/web/main.js` (source `src/web/main.ts`). It
  is not a CLI subcommand, so the generated CLI command catalog does not change.
- Add a loopback-only HTTP adapter built on `node:http` (no framework) that:
  - binds a literal loopback address only (`127.0.0.1` default, or `::1`);
  - prints a one-time URL carrying a random token to stderr;
  - guards every request with Host, Origin and token checks and a strict CSP;
  - serves the UI from in-memory strings (no files on disk, no CDN);
  - exposes `POST /api/analyze` accepting a JSON path or raw bytes upload.
- Reuse the shared workflow: the adapter calls the bound `runProviderAnalysis`
  from `src/composition/directAnalysis.ts` for `inspect_artifact` and
  `trace_dylib_resolution`. `trace_dylib_resolution` on a non-Mach-O target is
  reported as `not_applicable`, not as a failure.
- Add a graph projection module (`src/web/graphProjection.ts`) that turns parsed
  domain results into `WebGraph` values: `artifact-containment` from
  `ArtifactInventoryResult` and `dylib-dependencies` from `DylibResolutionResult`.
  Unknown coverage stays `unknown`; rendering caps (500 nodes, 1500 edges per
  graph) are reported in `truncated`.
- Add a no-dependency browser UI (`src/web/ui/assets.ts` exporting `INDEX_HTML`,
  `APP_JS`, `APP_CSS`): paste/drop zone, result cards with raw Evidence, and an
  SVG graph viewer with a hand-written layered layout, pan/zoom, node details and
  resolution-styled edges. Untrusted strings are never inserted with `innerHTML`.
- Uploaded bytes are written to an owned private temporary directory (0700 dir,
  0600 file, sanitized basename), analyzed, and removed. A failed cleanup is
  reported in the response (`cleanup.status: "failed"`) and the directory is
  retained, never silently ignored.
- Wiring: `scripts/rea.mjs` mode, `knip.json` entry, `vitest.config.ts`
  `adapters` glob, `docs/architecture.mermaid`, `docs/web-ui.md`, and a
  decision on bundling/prepack for `dist/web/`.

This is a prototype intended as a draft PR. It does not add an analysis
capability and does not change MCP or CLI contracts.

## Non-goals

- No target execution, launching, attaching, injection, instrumentation, memory
  or register mutation, or any runtime tool (Frida, capture, adb, browser).
- No mutation of the analyzed file; analysis is static and read-only. An uploaded
  copy is the only thing the adapter writes, and only into its own temp dir.
- No remote access: no non-loopback bind, no TLS, no accounts, no CORS opt-in,
  no tunnel or hosted mode.
- No requirement for a deep provider in v1. Hopper/Ghidra/IDA workflows are not
  exposed, and no deep-provider call graph, CFG or xref view is included.
- No new runtime dependencies (no web framework, no graph library, no bundler).
- No persistence: results live in the browser tab only; there is no history,
  database or retained session on the server.
- No change to MCP tool catalog, CLI commands, Evidence schemas or provider
  contracts.

## Impact

### Affected specs

- ADDED capability `web-ui` (`specs/web-ui/spec.md`). No existing OpenSpec
  capability is modified (this is the repository's first OpenSpec change).

### Affected code

| Area                                                               | Change                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `scripts/rea.mjs`                                                  | new `web` mode and compiled-file existence check                                                              |
| `src/web/` (new)                                                   | `main.ts`, config parsing (Zod), server, guards, upload materialization, `graphProjection.ts`, `ui/assets.ts` |
| `src/composition/directAnalysis.ts`                                | consumed unchanged; no edits expected                                                                         |
| `knip.json`                                                        | add `src/web/main.ts` entry                                                                                   |
| `vitest.config.ts`                                                 | add `web` to the `adapters` include glob                                                                      |
| `scripts/bundle-runtime.mjs`, `scripts/prepack.mjs`                | decision pending (see open questions)                                                                         |
| `docs/architecture.mermaid`, `docs/web-ui.md` (new), `docs/cli.md` | document the new entry point                                                                                  |
| `tests/`                                                           | boundary test for the dispatcher mode and an end-to-end web workflow test                                     |

## Open questions for maintainers

1. Scope decision (required by `CONTRIBUTING.md#contribution-scope`). The web UI
   adds a network-listening adapter but no analysis authority: static,
   read-only, loopback, token-guarded, no execution or mutation. Does the
   maintainers' scope rule accept a local HTTP adapter at all, and under what
   verification? Until answered, the change is a draft PR and must not be merged,
   enabled by default, or included in official distributions (fail-closed
   integration). Passing CI does not substitute for this decision.
2. Upload materialization. Analysis operates on paths, so dropped or pasted bytes
   must be written to disk first. Is an owned private temp dir under
   `os.tmpdir()` acceptable, or should it use a REA-owned runtime root from
   `src/process/` (private roots with ownership proof)? Should a failed cleanup
   also be surfaced at the process level on shutdown?
3. Bundling of the `web` mode. `scripts/bundle-runtime.mjs` bundles only
   `dist/mcp` and `dist/cli-runtime` to reduce startup resolution cost. Should
   `dist/web` be bundled and listed in `scripts/prepack.mjs`, or ship as plain
   compiled modules since it is not a startup-sensitive path?
4. Deep-provider call graphs later. Should a follow-up add Hopper/Ghidra/IDA
   call-graph or xref views (needing provider selection UI, long-running
   sessions, and cancellation), or should the web UI stay limited to
   provider-free static graphs?
5. Distribution default. Should `rea web` ship in the published package
   (`rea-agents`) from the start, or stay behind an explicit opt-in until the
   scope decision and real-browser verification are complete?
