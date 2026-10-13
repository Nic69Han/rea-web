# Local web UI

`rea web` starts a local page for read-only static analysis of one file or path at a
time. It is a prototype adapter over the shared analysis workflows; it does not use
Hopper, Ghidra, or IDA.

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

Enter a local path, or drop or paste a file. Dropped files are uploaded to a private
temporary directory, analyzed, and removed; the result reports whether cleanup
succeeded and retains the directory if removal failed.

## Security model

- Binds only to loopback and rejects any `Host` or `Origin` that is not the bound address (403).
- A per-process random token is required on every request (403 when missing or wrong).
- Strict CSP, `no-store`, no external resources, no CORS headers, and no `innerHTML` in the UI.
- One analysis at a time (409 while busy); closing the page aborts the run.
- The target is never executed, modified, or deleted.

## What is analyzed

- `inspect_artifact` (integrity policy `fail`) renders an artifact containment graph.
- `trace_dylib_resolution` renders a Mach-O dylib dependency graph; other targets
  report it as not applicable.

Each result shows retained Evidence verbatim, limitations, confidence, and graph
coverage (`complete`, `partial`, `unknown`). Graphs are capped at 500 nodes and
1500 edges, with omitted counts shown.

## Limitations

- No deep-provider analysis, call graphs, execution, or mutation.
- `dist/web` is not bundled; it runs from a built checkout.
- The hand-written layout is meant for modest graphs.
- Verified with the Chromium browser and synthetic Mach-O fixtures only.
