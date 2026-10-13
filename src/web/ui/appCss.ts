export const APP_CSS: string = String.raw`
:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --panel: #ffffff;
  --panel-2: #eef0f3;
  --fg: #1b1f24;
  --muted: #566170;
  --border: #cfd6de;
  --accent: #0b5fcc;
  --accent-fg: #ffffff;
  --ok: #1a7f37;
  --warn: #a35200;
  --bad: #c62828;
  --edge: #4b5563;
  --k0: #0072b2;
  --k1: #e69f00;
  --k2: #009e73;
  --k3: #cc79a7;
  --k4: #56b4e9;
  --k5: #d55e00;
  --k6: #bba800;
  --k7: #7a7a7a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111418;
    --panel: #1a1f26;
    --panel-2: #232a33;
    --fg: #e6e9ed;
    --muted: #9aa5b1;
    --border: #3a444f;
    --accent: #6aa9ff;
    --accent-fg: #0b1220;
    --ok: #4cc26b;
    --warn: #ffb04d;
    --bad: #ff6b6b;
    --edge: #9aa5b1;
    --k0: #4aa3df;
    --k1: #f0b429;
    --k2: #2fc79a;
    --k3: #e29bc2;
    --k4: #7cc6f2;
    --k5: #f08a4b;
    --k6: #e6d84a;
    --k7: #a0a0a0;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
header.app-header { padding: 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
header.app-header h1 { margin: 0; font-size: 20px; }
header.app-header p { margin: 4px 0 0; color: var(--muted); }
main { max-width: 1280px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
footer { max-width: 1280px; margin: 0 auto; padding: 0 16px 24px; color: var(--muted); font-size: 12px; }
h2 { font-size: 16px; margin: 0 0 8px; }
h3 { font-size: 14px; margin: 0; }
code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.card, .drop-zone {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
}
.drop-zone { border-style: dashed; border-width: 2px; }
.drop-zone.dragover { border-color: var(--accent); background: var(--panel-2); }
.drop-zone.busy { opacity: 0.9; }
.field-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.field-row label { flex: 1 0 100%; font-weight: 600; }
input[type="text"], input[type="search"] {
  flex: 1 1 280px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
}
button {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-2);
  color: var(--fg);
  font: inherit;
  cursor: pointer;
}
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled, input:disabled { opacity: 0.55; cursor: not-allowed; }
button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); font-weight: 600; }
.hint { color: var(--muted); margin: 8px 0 0; font-size: 13px; }
.status { display: flex; align-items: center; gap: 8px; min-height: 24px; margin-top: 8px; }
.status.error { color: var(--bad); }
.status.warn { color: var(--warn); }
.status.ok { color: var(--ok); }
.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--border); border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
.banner {
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
  background: var(--panel-2);
}
.banner ul { margin: 4px 0 0; padding-left: 20px; }
.banner-warn { border-left-color: var(--warn); }
.banner-error { border-left-color: var(--bad); }
.banner-info { border-left-color: var(--accent); }
.banner-ok { border-left-color: var(--ok); }
dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 8px 0 0; }
dl.kv dt { color: var(--muted); }
dl.kv dd { margin: 0; overflow-wrap: anywhere; }
.badge {
  display: inline-block; padding: 1px 8px; border-radius: 999px;
  font-size: 12px; font-weight: 600; border: 1px solid currentColor;
}
.badge-ok { color: var(--ok); }
.badge-error { color: var(--bad); }
.badge-na { color: var(--muted); }
.badge-warn { color: var(--warn); }
.op-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.op-list { display: grid; gap: 12px; margin-bottom: 16px; }
.card-error { border-color: var(--bad); }
details { margin-top: 8px; }
details summary { cursor: pointer; color: var(--accent); }
pre.json {
  max-height: 420px; overflow: auto; margin: 6px 0 0; padding: 8px;
  background: var(--panel-2); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere;
}
.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
.tabs button[aria-selected="true"] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.graph-meta { color: var(--muted); font-size: 13px; margin: 0 0 4px; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
.toolbar input[type="search"] { flex: 0 1 260px; }
.toolbar .count { color: var(--muted); font-size: 13px; }
.graph-main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; }
@media (max-width: 860px) { .graph-main { grid-template-columns: minmax(0, 1fr); } }
.canvas-wrap {
  border: 1px solid var(--border); border-radius: 8px; background: var(--bg);
  height: 560px; min-height: 240px; resize: vertical; overflow: hidden;
}
.graph-svg { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; user-select: none; }
.graph-svg.panning { cursor: grabbing; }
.side-panel {
  border: 1px solid var(--border); border-radius: 8px; background: var(--panel);
  padding: 8px 12px; max-height: 560px; overflow: auto;
}
.side-panel h3 { overflow-wrap: anywhere; }
.side-panel h4 { margin: 12px 0 4px; font-size: 13px; }
.side-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.side-panel li { overflow-wrap: anywhere; }
.side-panel .sub { color: var(--muted); font-size: 12px; }
button.link { border: none; background: none; padding: 0; color: var(--accent); text-align: left; cursor: pointer; }
.empty { color: var(--muted); padding: 16px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; font-size: 12px; color: var(--muted); }
.legend span.item { display: inline-flex; align-items: center; gap: 6px; }
.legend svg { width: 36px; height: 10px; overflow: visible; }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 2px solid; }
.edge { fill: none; stroke: var(--edge); stroke-width: 1.4; }
.edge:hover { stroke-width: 3; cursor: pointer; }
.edge.res-observed, .edge.res-resolved { stroke-dasharray: none; }
.edge.res-derived, .edge.res-inferred { stroke-dasharray: 7 4; }
.edge.res-unresolved { stroke: var(--bad); stroke-dasharray: 2 4; stroke-linecap: round; stroke-width: 1.8; }
.edge.res-ambiguous { stroke: #e08a00; stroke-width: 2; }
.edge.res-unknown { stroke: #8a8f98; stroke-dasharray: 9 3 2 3; }
.edge.hl { stroke-width: 3; }
.viewport.has-sel .edge:not(.hl) { opacity: 0.18; }
.arrow { fill: var(--edge); }
.arrow.res-unresolved { fill: var(--bad); }
.arrow.res-ambiguous { fill: #e08a00; }
.arrow.res-unknown { fill: #8a8f98; }
.node { cursor: pointer; }
.node rect { fill-opacity: 0.2; stroke-width: 1.5; }
.node text { fill: var(--fg); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; pointer-events: none; }
.node.selected rect { stroke-width: 3.5; fill-opacity: 0.4; }
.node.match rect { stroke: var(--fg) !important; stroke-width: 3; }
.node.dim { opacity: 0.25; }
.node:focus-visible rect { stroke: var(--fg); stroke-width: 3; }
.node:focus-visible { outline: none; }
.node.kind-0 rect, .swatch.kind-0 { fill: var(--k0); stroke: var(--k0); }
.node.kind-1 rect, .swatch.kind-1 { fill: var(--k1); stroke: var(--k1); }
.node.kind-2 rect, .swatch.kind-2 { fill: var(--k2); stroke: var(--k2); }
.node.kind-3 rect, .swatch.kind-3 { fill: var(--k3); stroke: var(--k3); }
.node.kind-4 rect, .swatch.kind-4 { fill: var(--k4); stroke: var(--k4); }
.node.kind-5 rect, .swatch.kind-5 { fill: var(--k5); stroke: var(--k5); }
.node.kind-6 rect, .swatch.kind-6 { fill: var(--k6); stroke: var(--k6); }
.node.kind-7 rect, .swatch.kind-7 { fill: var(--k7); stroke: var(--k7); }
.swatch.kind-0 { border-color: var(--k0); background: color-mix(in srgb, var(--k0) 30%, transparent); }
.swatch.kind-1 { border-color: var(--k1); background: color-mix(in srgb, var(--k1) 30%, transparent); }
.swatch.kind-2 { border-color: var(--k2); background: color-mix(in srgb, var(--k2) 30%, transparent); }
.swatch.kind-3 { border-color: var(--k3); background: color-mix(in srgb, var(--k3) 30%, transparent); }
.swatch.kind-4 { border-color: var(--k4); background: color-mix(in srgb, var(--k4) 30%, transparent); }
.swatch.kind-5 { border-color: var(--k5); background: color-mix(in srgb, var(--k5) 30%, transparent); }
.swatch.kind-6 { border-color: var(--k6); background: color-mix(in srgb, var(--k6) 30%, transparent); }
.swatch.kind-7 { border-color: var(--k7); background: color-mix(in srgb, var(--k7) 30%, transparent); }
`;
