export const ROSETTE_JS: string = String.raw`
var PETAL_COUNT = 12;
var STEP_STATUS = {
  ok: { icon: '✓', text: 'ok', cls: 'ok' },
  not_applicable: { icon: '–', text: 'not applicable', cls: 'na' },
  error: { icon: '✕', text: 'error', cls: 'error' },
  unknown: { icon: '?', text: 'not reported', cls: 'warn' },
};

function polar(r, deg) {
  var a = (deg - 90) * Math.PI / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}
function arcPath(r, a0, a1) {
  var p0 = polar(r, a0);
  var p1 = polar(r, a1);
  return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
}

// SVG rosette: a ring with one segment per pipeline step, around two layers of petals.
function buildRosette(steps) {
  var svg = svgEl('svg', { 'class': 'rosette is-running', viewBox: '-110 -110 220 220', role: 'img', focusable: 'false' });
  var petals = svgEl('g', { 'class': 'rosette-spin' });
  for (var i = 0; i < PETAL_COUNT; i += 1) {
    var deg = i * (360 / PETAL_COUNT);
    petals.appendChild(svgEl('path', { 'class': 'petal petal-out', d: 'M0 -26 C12 -42 12 -64 0 -80 C-12 -64 -12 -42 0 -26Z', transform: 'rotate(' + deg + ')' }));
    petals.appendChild(svgEl('path', { 'class': 'petal petal-in', d: 'M0 -10 C6 -20 6 -32 0 -44 C-6 -32 -6 -20 0 -10Z', transform: 'rotate(' + (deg + 180 / PETAL_COUNT) + ')' }));
  }
  svg.appendChild(petals);
  var ring = svgEl('g');
  var parts = [];
  var span = 360 / steps.length;
  steps.forEach(function (step, idx) {
    var seg = steps.length === 1
      ? svgEl('circle', { 'class': 'seg seg-running', r: 96, cx: 0, cy: 0 })
      : svgEl('path', { 'class': 'seg seg-running', d: arcPath(96, idx * span + 3, (idx + 1) * span - 3) });
    ring.appendChild(seg);
    var pos = polar(96, idx * span + span / 2);
    var mark = svgEl('g', { 'class': 'marker marker-running', transform: 'translate(' + pos[0].toFixed(2) + ' ' + pos[1].toFixed(2) + ')' });
    mark.appendChild(svgEl('circle', { r: 11 }));
    var glyph = svgEl('text', { 'class': 'marker-glyph', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    glyph.textContent = String(idx + 1);
    mark.appendChild(glyph);
    ring.appendChild(mark);
    parts.push({ seg: seg, mark: mark, glyph: glyph });
  });
  svg.appendChild(ring);
  svg.appendChild(svgEl('circle', { 'class': 'rosette-core', r: 24, cx: 0, cy: 0 }));
  var time = svgEl('text', { 'class': 'rosette-time', 'text-anchor': 'middle', 'dominant-baseline': 'central', x: 0, y: 0 });
  time.textContent = '0.0 s';
  svg.appendChild(time);
  return { svg: svg, parts: parts, time: time };
}

// Honest progress view: the server reports once at the end, so pending steps stay "running…".
function createProgress(opts) {
  var steps = opts.steps;
  var rosette = buildRosette(steps);
  var root = el('div', 'progress');
  var wrap = el('div', 'rosette-wrap');
  wrap.appendChild(rosette.svg);
  root.appendChild(wrap);
  var side = el('div', 'progress-side');
  var elapsed = el('p', 'progress-elapsed', 'Elapsed 0.0 s');
  side.appendChild(elapsed);
  var list = el('ol', 'step-list');
  var items = steps.map(function (step) {
    var li = el('li', 'step step-running');
    li.appendChild(el('span', 'step-icon', '…')).setAttribute('aria-hidden', 'true');
    li.appendChild(el('span', 'step-label', step.label));
    var st = el('span', 'step-state', 'running…');
    li.appendChild(st);
    list.appendChild(li);
    return { li: li, icon: li.firstChild, state: st };
  });
  side.appendChild(list);
  var line = el('p', 'hint progress-line', opts.line + (prefersReducedMotion() ? ' Motion is reduced; elapsed time is shown as text.' : ''));
  side.appendChild(line);
  var cancel = null;
  if (opts.onCancel) {
    cancel = el('button', null, 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', opts.onCancel);
    side.appendChild(cancel);
  }
  root.appendChild(side);
  var describe = function (suffix) { rosette.svg.setAttribute('aria-label', opts.title + ' rosette, ' + steps.length + (steps.length === 1 ? ' step' : ' steps') + ': ' + suffix); };
  describe('running');

  var api = {
    root: root,
    tick: function () {
      var secs = elapsedSeconds().toFixed(1);
      elapsed.textContent = 'Elapsed ' + secs + ' s';
      rosette.time.textContent = secs + ' s';
    },
    start: function () {
      api.tick();
      state.timer = setInterval(api.tick, 200);
    },
    // statuses: array of 'ok' | 'not_applicable' | 'error' | 'unknown' per step.
    complete: function (statuses, lineText) {
      api.tick();
      if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
      if (cancel) { cancel.hidden = true; }
      var summary = [];
      var worst = 'ok';
      steps.forEach(function (step, i) {
        var info = STEP_STATUS[statuses[i]] || STEP_STATUS.unknown;
        var part = rosette.parts[i];
        part.seg.setAttribute('class', 'seg seg-' + info.cls);
        part.mark.setAttribute('class', 'marker marker-' + info.cls);
        part.glyph.textContent = info.icon;
        items[i].li.className = 'step step-' + info.cls;
        items[i].icon.textContent = info.icon;
        items[i].state.textContent = info.text;
        summary.push(step.label + ' ' + info.text);
        if (info.cls === 'error') { worst = 'error'; } else if (info.cls === 'warn' && worst === 'ok') { worst = 'warn'; }
      });
      rosette.svg.setAttribute('class', 'rosette is-done rosette-' + worst);
      describe(summary.join('; '));
      line.textContent = lineText;
    },
    dispose: function () {
      if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
    },
  };
  return api;
}
`;
