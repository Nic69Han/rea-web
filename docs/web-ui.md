# Local web UI

`rea web` starts a local page for read-only analysis of one file or path at a
time. It is a prototype adapter over the shared analysis workflows. The provider-free
analysis never uses Hopper, Ghidra, or IDA; the optional decompiled-code export
(below) uses whichever of them you have already configured.

## Launch

```sh
npm run build:cached
node scripts/rea.mjs web   # or: rea web
```

The command prints `http://127.0.0.1:<port>/?token=<token>` to stderr. Open that
exact URL; the page removes the token from the address bar and sends it as a header.

| Variable                   | Default     | Meaning                                  |
| -------------------------- | ----------- | ---------------------------------------- |
| `REA_WEB_PORT`             | `0`         | Port (`0` picks a free one).             |
| `REA_WEB_HOST`             | `127.0.0.1` | Literal `127.0.0.1` or `::1` only.       |
| `REA_WEB_MAX_UPLOAD_BYTES` | `268435456` | Upload size cap; larger uploads get 413. |

## The three stages

The page is one screen that moves through three stages (`idle`, `analyzing`, `results`);
**New analysis** returns to `idle`. Stage changes are announced through an `aria-live` region.

1. **Idle**: a large drop target ("Drop a binary, app bundle or archive here"; the whole
   window accepts a drop), a **choose a file** button, Ctrl/Cmd+V for a file on the
   clipboard, and an **or enter a local path** disclosure. Dropped or chosen files are
   uploaded to a private temporary directory, analyzed, and removed; the result reports
   whether cleanup succeeded and retains the directory if removal failed.
2. **Analyzing**: an SVG rosette with one ring segment per pipeline step the server
   really performs (`inspect_artifact`, then `trace_dylib_resolution`), the target name,
   elapsed time and **Cancel**. The server does not stream progress, so the animation is
   indeterminate and every step reads "running…" until the single response arrives; for
   uploads the first step is labelled "Upload + artifact inventory" because the upload
   cannot be observed separately. The response then sets each step to its real status
   (ok, not applicable, error; icon, color and text) and the page holds about 500 ms
   before showing results. With `prefers-reduced-motion` the rosette is static and the
   progress is text only.
3. **Results**: a header bar (target name, format, size, short SHA-256 with a copy
   button, **Download decompiled code (.zip)**, **New analysis**) over a section nav:
   **Overview** (operation status, nodes/edges and coverage per graph, unresolved or
   ambiguous references highlighted, top limitations, target, cleanup), **Graphs**,
   **Evidence** (operation cards with raw JSON) and **Decompiled** (export status).

## Security model

- Binds only to loopback and rejects any `Host` or `Origin` that is not the bound address (403).
- A per-process random token is required on every request (403 when missing or wrong).
- Strict CSP, `no-store`, no external resources, no CORS headers, and no `innerHTML` in the UI.
- One analysis or export at a time across all routes (409 while busy); closing the page aborts the run.
- The target is never executed, modified, or deleted.

## What is analyzed

- `inspect_artifact` (integrity policy `fail`) renders an artifact containment graph.
- `trace_dylib_resolution` renders a Mach-O dylib dependency graph; other targets
  report it as not applicable.

Each result shows retained Evidence verbatim, limitations, confidence, and graph
coverage (`complete`, `partial`, `unknown`). Graphs are capped at 500 nodes and
1500 edges, with omitted counts shown.

## Download decompiled code (.zip)

In the results header bar, **Download decompiled code (.zip)** runs the
existing read-only deep-provider operations (`list_procedures`, then
`procedure_pseudo_code` per procedure) inside **one** provider session: the target is
opened once, every function is decompiled sequentially, and the session is closed. With
Ghidra that avoids paying import and auto-analysis per function.

Ghidra, IDA and Hopper are bring-your-own (see [installation](installation.md)).
`GET /api/capabilities` returns `{"deep_providers":[{"id","available","reason?"}]}` from the
same provider availability logic as `rea` status; the button is disabled with the
reason when none is available, and a provider select appears when several are. While
an export runs, the Decompiled section shows its own rosette progress (one step, also
indeterminate) with Cancel, then the file name, size, duration and upload cleanup status.
Per-function counts are only in the zip's `manifest.json`; the server does not return
them in headers, so the page does not show them.

`POST /api/decompile` takes `{"path": string, "provider"?: "ghidra"|"ida"|"hopper",
"max_functions"?: integer}` as JSON, or an `application/octet-stream` upload exactly like
`/api/analyze` with `provider` and `max_functions` as query parameters. `max_functions`
defaults to 200; values above 2000 or below 1 get 400 `invalid_request`. The upload's
temporary directory lives until the export finishes and is then removed; the result is in
the `x-rea-cleanup` header (and `x-rea-cleanup-detail`, percent-encoded, on failure).

| Status | Code                        | Meaning                                                           |
| ------ | --------------------------- | ----------------------------------------------------------------- |
| 200    | (zip)                       | `application/zip`, `attachment; filename="<name>-decompiled.zip"` |
| 400    | `invalid_request`           | Malformed body or out-of-range `max_functions`                    |
| 409    | `busy`                      | Another analysis or export is running                             |
| 424    | `deep_provider_unavailable` | No (or the requested) deep provider is installed or configured    |
| 422    | `decompile_failed`          | The provider could not open the target or list its procedures     |

424 (Failed Dependency) is used instead of 409 so clients can tell a missing
provider from a busy server. A single function that fails or yields no pseudo-code is
recorded, never fatal.

Archive layout:

- `README.md`: target, SHA-256, provider, date, counts, limitations, and the note that
  pseudo-code is derived, provider-specific output rather than original source.
- `manifest.json`: target identity, provider, per-function `{name, address, file, status}`,
  skipped external/thunk procedures, omitted count and truncation, failures with reasons,
  and whether the provider closed cleanly.
- `functions/<index>_<name>_<address>.c`: pseudo-code with a header comment; names are
  reduced to a safe segment (the verbatim name stays in the manifest).
- `evidence/`: the provider Evidence (or projected error) for every call, verbatim.

Procedures are taken in the provider's order; external and thunk procedures are skipped
(and listed). More than `max_functions` decompilable procedures is reported as truncation.

## Limitations

- Deep providers are used only for the decompiled-code export; no call graphs, execution,
  or mutation.
- The export is sequential and can take minutes on large targets; Cancel aborts it.
- Verified end to end with Ghidra 12.1.4 on a small ELF only; IDA and Hopper exports are
  covered by shared-provider tests, not by a real run.
- `dist/web` is not bundled; it runs from a built checkout.
- The hand-written layout is meant for modest graphs.
- Verified with the Chromium browser and synthetic Mach-O fixtures only.
