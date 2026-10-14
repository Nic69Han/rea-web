/** Instrument-style progress card: honest steps plus a decorative bench animation and lab notes. */
export const PROGRESS_JS: string = String.raw`
var STEP_STATUS = {
  ok: { icon: '✓', text: 'ok', cls: 'ok' },
  not_applicable: { icon: '–', text: 'not applicable', cls: 'na' },
  error: { icon: '✕', text: 'error', cls: 'error' },
  unknown: { icon: '?', text: 'not reported', cls: 'warn' },
};
var NOTE_MS = 2500;
var ANALYSIS_NOTES = [
  'Removing mortar from the stack frame…',
  'Interviewing the linker…',
  'Counting bytes twice, to be sure.',
  'No binaries were harmed (read-only).',
  'Asking dyld politely where its libraries went.',
  'Sweeping up stray NOPs.',
  'Re-gluing basic blocks into something readable.',
  'Checking whether the symbol table is lying again.',
  'Tapping gently on the load commands.',
  'Measuring the entry point twice, cutting once.',
  'Reading the fine print in the section headers.',
];
var EXPORT_NOTES = [
  'Translating assembly into regret-free C…',
  'Ghidra is thinking very hard.',
  'Naming variables something other than local_28…',
  'Convincing the decompiler it is not a goto.',
  'Squinting at jump tables.',
  'Asking the compiler what it meant.',
  'Folding the zip with great ceremony.',
  'Nobody has ever hurried a decompiler.',
];
var noteCursor = 0;

function pad2(n) { return (n < 10 ? '0' : '') + n; }
// "t = 00:04.2": tabular lab-clock reading of elapsed seconds.
function labClock(secs) {
  var tenths = Math.floor(secs * 10);
  return 't = ' + pad2(Math.floor(tenths / 600)) + ':' + pad2(Math.floor(tenths / 10) % 60) + '.' + (tenths % 10);
}
function microCell(label, value, cls) {
  var cell = el('div', 'inst-cell');
  cell.appendChild(el('span', 'micro', label));
  var v = el('span', 'inst-value' + (cls ? ' ' + cls : ''), value);
  cell.appendChild(v);
  return { cell: cell, value: v };
}

// Honest progress view: the server reports once at the end, so pending steps stay "running…".
// The bench animation and lab notes are flavor only (aria-hidden); they never imply progress.
function createProgress(opts) {
  var steps = opts.steps;
  var reduced = prefersReducedMotion();
  var root = el('div', 'instrument' + (opts.compact ? ' instrument-compact' : ''));
  var head = el('div', 'inst-head');
  var specimen = microCell('Specimen', opts.specimen, 'inst-name');
  specimen.value.title = opts.specimen;
  head.appendChild(specimen.cell);
  head.appendChild(microCell('Protocol', opts.title, null).cell);
  var clock = microCell('Elapsed', labClock(0), 'inst-time');
  head.appendChild(clock.cell);
  root.appendChild(head);

  var area = el('div', 'bench-area');
  area.setAttribute('aria-hidden', 'true');
  area.appendChild(el('span', 'micro fig fig-l', 'Fig. 1'));
  area.appendChild(el('span', 'micro fig fig-r', 'Deconstruction bench'));
  var bench = buildBench();
  area.appendChild(bench);
  root.appendChild(area);

  var list = el('ol', 'protocol');
  var items = steps.map(function (step, i) {
    var li = el('li', 'step step-running');
    li.appendChild(el('span', 'step-num', pad2(i + 1))).setAttribute('aria-hidden', 'true');
    li.appendChild(el('span', 'step-icon', '…')).setAttribute('aria-hidden', 'true');
    li.appendChild(el('span', 'step-label', step.label));
    var st = el('span', 'step-state', 'running…');
    li.appendChild(st);
    list.appendChild(li);
    return { li: li, icon: li.childNodes[1], state: st };
  });
  root.appendChild(list);
  var line = el('p', 'hint progress-line', opts.line + (reduced ? ' Motion is reduced; elapsed time is shown as text.' : ''));
  root.appendChild(line);

  var foot = el('div', 'inst-foot');
  var note = el('p', 'lab-note');
  note.setAttribute('aria-hidden', 'true');
  note.appendChild(el('span', 'micro', 'Lab note'));
  var noteText = el('i', 'lab-text', '');
  note.appendChild(noteText);
  foot.appendChild(note);
  var cancel = null;
  if (opts.onCancel) {
    cancel = el('button', 'quiet', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', opts.onCancel);
    foot.appendChild(cancel);
  }
  root.appendChild(foot);

  var noteTimer = null;
  var showNote = function (text) {
    var next = el('i', 'lab-text', text);
    note.replaceChild(next, noteText);
    noteText = next;
  };
  var nextNote = function () { showNote(opts.notes[noteCursor % opts.notes.length]); noteCursor += 1; };
  var stopNotes = function () { if (noteTimer !== null) { clearInterval(noteTimer); noteTimer = null; } };

  var api = {
    root: root,
    tick: function () { clock.value.textContent = labClock(elapsedSeconds()); },
    start: function () {
      api.tick();
      state.timer = setInterval(api.tick, 100);
      nextNote();
      if (!reduced) { noteTimer = setInterval(nextNote, NOTE_MS); }
    },
    // statuses: array of 'ok' | 'not_applicable' | 'error' | 'unknown' per step.
    complete: function (statuses, lineText) {
      api.tick();
      if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
      stopNotes();
      if (cancel) { cancel.hidden = true; }
      var worst = 'ok';
      steps.forEach(function (step, i) {
        var info = STEP_STATUS[statuses[i]] || STEP_STATUS.unknown;
        items[i].li.className = 'step step-' + info.cls;
        items[i].icon.textContent = info.icon;
        items[i].state.textContent = info.text;
        if (info.cls === 'error') { worst = 'error'; } else if (info.cls === 'warn' && worst === 'ok') { worst = 'warn'; }
      });
      bench.setAttribute('class', 'bench is-done bench-' + worst);
      showNote(worst === 'error' ? 'Result inconclusive. Notebook annotated.' : 'Bench cleared.');
      line.textContent = lineText;
    },
    dispose: function () {
      if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
      stopNotes();
    },
  };
  return api;
}
`;
