/** Instrument card (analyzing stage, export progress) and the deconstruction bench animation. */
export const BENCH_CSS: string = `
/* Stage 2: analyzing, laid out like a lab instrument readout */
.stage-analyzing { max-width: 640px; width: 100%; margin: 4vh auto 0; }
.stage-analyzing > h2 { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.instrument { display: grid; gap: 12px; padding: 14px 16px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.instrument-compact { max-width: 560px; margin: 0 0 12px; padding: 10px 12px 8px; gap: 8px; }
.micro { font-size: 10px; line-height: 1.2; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
.inst-head { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px 24px; align-items: end; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.inst-cell { display: grid; gap: 2px; min-width: 0; }
.inst-value { font-size: 14px; font-weight: 600; }
.inst-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inst-time { font: 600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
@media (max-width: 480px) {
  .inst-head { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .inst-cell:first-child { grid-column: 1 / -1; }
}
.bench-area {
  position: relative; display: flex; justify-content: center; padding: 22px 8px 8px;
  border: 1px solid var(--border); border-radius: 4px; color: var(--fg); overflow: hidden;
  background-color: var(--panel);
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 12px 12px;
}
.fig { position: absolute; top: 6px; }
.fig-l { left: 8px; }
.fig-r { right: 8px; }
.bench { width: min(100%, 224px); height: auto; display: block; overflow: visible; }
.instrument-compact .bench { width: min(100%, 196px); }
.instrument-compact .bench-area { padding-top: 20px; }
@media (max-width: 480px) { .bench { width: min(100%, 192px); } .fig-r { display: none; } }

.protocol { list-style: none; margin: 0; padding: 0; }
.step { display: grid; grid-template-columns: 2ch 18px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 6px 0; border-top: 1px solid var(--border); }
.step:first-child { border-top: 0; }
.step-num { font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
.step-icon { text-align: center; font-weight: 700; color: var(--accent); }
.step-state { color: var(--muted); font-size: 13px; }
.step-ok .step-icon, .step-ok .step-state { color: var(--ok); }
.step-error .step-icon, .step-error .step-state { color: var(--bad); }
.step-na .step-icon { color: var(--muted); }
.step-warn .step-icon, .step-warn .step-state { color: var(--warn); }
.progress-line { margin: 0; }
.inst-foot { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border); }
.lab-note { flex: 1 1 auto; min-width: 0; margin: 0; display: flex; gap: 8px; align-items: baseline; color: var(--muted); font-size: 13px; }
.lab-note .micro { flex: none; padding: 1px 6px; border: 1px solid var(--border); border-radius: 3px; }
.lab-text { min-width: 0; overflow-wrap: anywhere; }
button.quiet { flex: none; padding: 3px 10px; font-size: 13px; background: transparent; color: var(--muted); }
button.quiet:hover:not(:disabled) { color: var(--fg); }

/* Bench drawing: line art in currentColor, one accent for the code tokens. */
.bn-line, .bn-ground { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.bn-ground { stroke-width: 1; stroke: var(--border); }
.bn-hat { fill: var(--panel); }
.bn-head { fill: var(--panel); }
.bn-brick { fill: var(--panel); stroke: currentColor; stroke-width: 1; }
.bn-slot { fill: none; stroke: var(--muted); stroke-width: 1; stroke-dasharray: 2 2; }
.bn-hex, .bn-tok { font: 500 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: currentColor; }
.bn-tok { font-weight: 700; fill: var(--accent); }
.bn-chip { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.bench-ok .bn-chip { stroke: var(--ok); } .bench-ok .bn-tok { fill: var(--ok); }
.bench-error .bn-chip { stroke: var(--bad); } .bench-error .bn-tok { fill: var(--bad); }
.bench-warn .bn-chip { stroke: var(--warn); } .bench-warn .bn-tok { fill: var(--warn); }
.bn-dust { fill: var(--muted); opacity: 0; }

/* Static pose (also the reduced-motion pose): tokens on the pile, hammer resting on the chisel. */
.bn-k0 { --dx: 74px; --delay: 0s; } .bn-k1 { --dx: 97px; --delay: -2.7s; } .bn-k2 { --dx: 120px; --delay: -1.8s; } .bn-k3 { --dx: 143px; --delay: -0.9s; }
.bn-fly-x { transform: translateX(var(--dx)); }
.bn-fly-y { transform: translateY(36px); }
.bn-hexbrick { opacity: 0; }
.bn-hammer { transform-origin: 33px 37px; transform: rotate(40deg); }

@media (prefers-reduced-motion: no-preference) {
  .is-running .bn-hammer { animation: bn-hammer 0.9s infinite; }
  .is-running .bn-chisel { animation: bn-chisel 0.9s infinite; }
  .is-running .bn-fly-x { animation: bn-fly-x 3.6s linear var(--delay) infinite; }
  .is-running .bn-fly-y { animation: bn-fly-y 3.6s linear var(--delay) infinite; }
  .is-running .bn-hexbrick { animation: bn-hex 3.6s linear var(--delay) infinite; }
  .is-running .bn-tokchip { animation: bn-tok 3.6s linear var(--delay) infinite; }
  .is-running .bn-dust { animation: bn-dust 0.9s ease-out infinite; }
  .is-running .bn-dust-1 { --ex: -3px; --ey: -6px; }
  .is-running .bn-dust-2 { --ex: -6px; --ey: -2px; }
  .is-running .bn-dust-3 { --ex: 0px; --ey: -9px; }
  .lab-text { animation: lab-in 0.5s ease-out; }
}
@keyframes bn-hammer {
  0% { transform: rotate(48deg); } 18% { transform: rotate(60deg); animation-timing-function: ease-in; }
  32% { transform: rotate(0deg); animation-timing-function: ease-out; } 40% { transform: rotate(14deg); } 62%, 100% { transform: rotate(48deg); }
}
@keyframes bn-chisel { 0%, 31% { transform: translateX(0); } 34% { transform: translateX(1px); } 46%, 100% { transform: translateX(0); } }
@keyframes bn-fly-x {
  0%, 7% { transform: translateX(0); } 31%, 89% { transform: translateX(var(--dx)); } 90%, 100% { transform: translateX(0); }
}
@keyframes bn-fly-y {
  0%, 7% { transform: translateY(0); animation-timing-function: ease-out; } 15% { transform: translateY(-14px); animation-timing-function: ease-in; }
  31%, 89% { transform: translateY(36px); } 90%, 100% { transform: translateY(0); }
}
@keyframes bn-hex { 0%, 14% { opacity: 1; } 22%, 90% { opacity: 0; } 100% { opacity: 1; } }
@keyframes bn-tok { 0%, 16% { opacity: 0; } 26%, 82% { opacity: 1; } 88%, 100% { opacity: 0; } }
@keyframes bn-dust {
  0%, 31% { opacity: 0; transform: translate(0, 0); } 34% { opacity: 0.8; } 62%, 100% { opacity: 0; transform: translate(var(--ex), var(--ey)); }
}
@keyframes lab-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
`;
