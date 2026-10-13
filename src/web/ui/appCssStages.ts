/** Layout and motion for the idle -> analyzing -> results flow. */
export const STAGES_CSS: string = `
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.app-header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
.brand { font-weight: 700; letter-spacing: 0.12em; font-size: 16px; }
.tagline { color: var(--muted); font-size: 13px; }
main { max-width: 1280px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; min-width: 0; }
main > * { min-width: 0; }
main p, main li, dd, .banner, .hint, h1, h2, h3 { overflow-wrap: anywhere; }
.footnote { color: var(--muted); font-size: 12px; margin: 16px 0 0; }
.stage { min-width: 0; }

/* Stage 1: idle */
.stage-idle { max-width: 720px; width: 100%; margin: 6vh auto 0; display: grid; gap: 16px; justify-items: center; }
.drop-zone {
  width: 100%; min-height: 280px; padding: 32px 20px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center;
  border: 2px dashed var(--border); border-radius: 16px; background: var(--panel);
  transition: border-color 0.15s, background-color 0.15s;
}
.drop-zone h1 { margin: 8px 0 0; font-size: 22px; font-weight: 600; line-height: 1.3; }
.drop-icon { color: var(--accent); }
.drop-or { margin: 4px 0 0; color: var(--muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.dragging .drop-zone, .drop-zone:focus-within { border-color: var(--accent); }
.dragging .drop-zone { background: var(--accent-soft); }
.path-details { width: 100%; text-align: center; color: var(--muted); margin: 0; }
.path-details summary { display: inline-block; cursor: pointer; padding: 4px 8px; border-radius: 6px; font-size: 13px; }
.path-details[open] summary { margin-bottom: 8px; }
.path-details form { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; text-align: left; }
.path-details input[type="text"] { flex: 1 1 260px; }
.idle-notice { width: 100%; }
.idle-notice:empty { display: none; }

/* Stage 3: results workspace */
.stage-results { display: grid; gap: 12px; }
.stage-results h2:focus { outline: none; }
.bar { display: flex; gap: 12px 24px; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.bar-id { flex: 1 1 320px; min-width: 0; }
.bar-name { display: block; font-size: 18px; overflow-wrap: anywhere; }
.bar-meta { display: flex; flex-wrap: wrap; gap: 6px 8px; margin-top: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-2); font-size: 13px; max-width: 100%; }
.chip-label { color: var(--muted); }
.chip-value { overflow-wrap: anywhere; }
button.small { padding: 0 8px; font-size: 12px; border-radius: 999px; }
.bar-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
.export-control { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; max-width: 360px; }
.export-reason { flex: 1 1 100%; margin: 0; }
.workspace { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; align-items: start; }
.ws-nav { display: flex; flex-direction: column; gap: 4px; position: sticky; top: 8px; }
.ws-tab { text-align: left; border-color: transparent; background: transparent; }
.ws-tab[aria-selected="true"] { background: var(--accent-soft); border-color: var(--accent); font-weight: 600; }
.ws-main, .ws-panel { min-width: 0; }
@media (max-width: 760px) {
  .workspace { grid-template-columns: minmax(0, 1fr); }
  .ws-nav { flex-direction: row; flex-wrap: wrap; position: static; }
}
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; margin: 12px 0; }
.summary h3 { margin-bottom: 6px; }
.summary .big { font-size: 18px; margin: 0 0 6px; }
.tallies { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
ul.plain { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 4px; }
.finding ul { list-style: none; padding-left: 0; }
.finding li { margin: 4px 0; }
.decompile-slot { margin-top: 12px; }
.decompiled-tab h3 { margin-top: 12px; }
`;
