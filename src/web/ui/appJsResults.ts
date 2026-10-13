export const RESULTS_JS: string = String.raw`
function badge(text, cls) { return el('span', 'badge badge-' + cls, text); }

function kvList(pairs) {
  var dl = el('dl', 'kv');
  pairs.forEach(function (p) {
    if (p[1] === undefined) { return; }
    dl.appendChild(el('dt', null, p[0]));
    var dd = el('dd', p[2] || null, scalar(p[1]));
    dl.appendChild(dd);
  });
  return dl;
}

function jsonDetails(summary, value) {
  var d = el('details');
  d.appendChild(el('summary', null, summary));
  var filled = false;
  d.addEventListener('toggle', function () {
    if (!d.open || filled) { return; }
    filled = true;
    var text;
    try { text = JSON.stringify(value, null, 2); } catch (e) { text = String(value); }
    d.appendChild(el('pre', 'json mono', text));
  });
  return d;
}

function listOf(items, cls) {
  var ul = el('ul', cls || null);
  items.forEach(function (it) {
    var text = isRecord(it) && typeof it.message === 'string' ? it.message : scalar(it);
    ul.appendChild(el('li', null, text));
  });
  return ul;
}

function failureHint(status) {
  if (status === 401 || status === 403) { return 'The access token or request origin was rejected. Open the URL printed by "rea web" again.'; }
  if (status === 409 || status === 429) { return 'Another analysis is already running. Wait for it to finish, then retry.'; }
  if (status === 413) { return 'The upload is larger than the server limit.'; }
  if (status === 0) { return 'The local server did not respond. Is "rea web" still running?'; }
  return null;
}

function renderFailure(status, data, text) {
  clearNode(dom.results);
  var err = data && isRecord(data.error) ? data.error : null;
  var card = el('section', 'card card-error');
  var head = el('div', 'op-head');
  head.appendChild(el('h2', null, 'Request failed'));
  head.appendChild(badge(status ? 'HTTP ' + status : 'network', 'error'));
  card.appendChild(head);
  var message = err && err.message ? String(err.message) : (text ? shorten(text, 500) : 'No response body.');
  card.appendChild(el('p', null, message));
  if (err && err.code) { card.appendChild(kvList([['Code', err.code, 'mono']])); }
  var hint = failureHint(status);
  if (hint) { card.appendChild(el('p', 'hint', hint)); }
  if (data !== null) { card.appendChild(jsonDetails('Raw response', data)); }
  dom.results.appendChild(card);
}

function targetCard(t) {
  var card = el('section', 'card');
  card.appendChild(el('h2', null, 'Target'));
  card.appendChild(kvList([
    ['Name', t.display_name],
    ['Input', t.input_kind],
    ['Local path', t.local_path, 'mono'],
    ['Size', t.size_bytes === null || t.size_bytes === undefined ? 'unknown' : fmtBytes(t.size_bytes)],
    ['SHA-256', t.sha256 === null || t.sha256 === undefined ? 'unknown' : t.sha256, 'mono'],
  ]));
  return card;
}

function pick(ev, key) {
  var places = [ev, ev.provenance, ev.metadata, ev.meta];
  for (var i = 0; i < places.length; i += 1) {
    if (isRecord(places[i]) && places[i][key] !== undefined) { return places[i][key]; }
  }
  return undefined;
}

function evidenceBlock(ev) {
  var box = el('div', 'evidence');
  if (!isRecord(ev)) { box.appendChild(jsonDetails('Evidence (raw JSON)', ev)); return box; }
  var id = pick(ev, 'evidence_id');
  box.appendChild(kvList([
    ['Evidence ID', id === undefined ? pick(ev, 'id') : id, 'mono'],
    ['Provider', pick(ev, 'provider')],
    ['Confidence', pick(ev, 'confidence')],
  ]));
  var lim = pick(ev, 'limitations');
  if (Array.isArray(lim) && lim.length > 0) {
    var b = el('div', 'banner banner-warn');
    b.appendChild(el('strong', null, 'Limitations'));
    b.appendChild(listOf(lim));
    box.appendChild(b);
  }
  box.appendChild(jsonDetails('Evidence (raw JSON)', ev));
  return box;
}

function statusClass(s) { return s === 'ok' ? 'ok' : s === 'error' ? 'error' : 'na'; }

function opCard(op) {
  var card = el('article', 'card' + (op.status === 'error' ? ' card-error' : ''));
  var head = el('div', 'op-head');
  head.appendChild(el('h3', 'mono', op.operation));
  head.appendChild(badge(op.status === 'not_applicable' ? 'not applicable' : String(op.status), statusClass(op.status)));
  card.appendChild(head);
  if (op.reason) { card.appendChild(el('p', null, op.reason)); }
  if (op.error !== undefined && op.error !== null) {
    var e = op.error;
    if (isRecord(e)) {
      card.appendChild(kvList([['Code', e.code === undefined ? e._tag : e.code, 'mono'], ['Message', e.message]]));
    }
    card.appendChild(jsonDetails('Error (raw JSON)', e));
  }
  if (op.evidence !== undefined && op.evidence !== null) { card.appendChild(evidenceBlock(op.evidence)); }
  return card;
}

function cleanupCard(c) {
  var failed = c.status === 'failed';
  var b = el('div', 'banner ' + (failed ? 'banner-error' : 'banner-info'));
  b.setAttribute('role', failed ? 'alert' : 'note');
  b.appendChild(el('strong', null, 'Cleanup: ' + scalar(c.status)));
  if (c.detail) { b.appendChild(el('div', null, c.detail)); }
  if (failed) { b.appendChild(el('div', 'hint', 'The temporary upload directory was retained and may still hold the file.')); }
  return b;
}

function renderResult(data) {
  clearNode(dom.results);
  var root = dom.results;
  if (isRecord(data.target)) { root.appendChild(targetCard(data.target)); }
  var ops = Array.isArray(data.operations) ? data.operations.filter(isRecord) : [];
  var opSection = el('section');
  opSection.appendChild(el('h2', null, 'Operations'));
  var list = el('div', 'op-list');
  ops.forEach(function (op) { list.appendChild(opCard(op)); });
  if (ops.length === 0) { list.appendChild(el('p', 'empty', 'No operations were reported.')); }
  opSection.appendChild(list);
  root.appendChild(opSection);
  root.appendChild(renderGraphSection(Array.isArray(data.graphs) ? data.graphs.filter(isRecord) : []));
  if (isRecord(data.cleanup)) { root.appendChild(cleanupCard(data.cleanup)); }
}

function renderGraphSection(graphs) {
  var section = el('section');
  section.appendChild(el('h2', null, 'Graphs'));
  if (graphs.length === 0) {
    section.appendChild(el('p', 'empty', 'No graphs were produced for this target.'));
    return section;
  }
  var tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Graphs');
  var panel = el('div');
  panel.setAttribute('role', 'tabpanel');
  var buttons = [];
  var views = [];
  var current = -1;
  function show(i) {
    current = i;
    buttons.forEach(function (b, j) {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    if (!views[i]) { views[i] = buildGraphView(graphs[i]); }
    clearNode(panel);
    panel.appendChild(views[i].root);
    panel.setAttribute('aria-labelledby', 'graph-tab-' + i);
    views[i].afterAttach();
  }
  graphs.forEach(function (g, i) {
    var nodeCount = Array.isArray(g.nodes) ? g.nodes.length : 0;
    var b = el('button', null, (g.title || g.graph_id || 'Graph ' + (i + 1)) + ' (' + nodeCount + ')');
    b.type = 'button';
    b.id = 'graph-tab-' + i;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', function () { show(i); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d === 0) { return; }
      e.preventDefault();
      var n = (current + d + graphs.length) % graphs.length;
      show(n);
      buttons[n].focus();
    });
    buttons.push(b);
    tabs.appendChild(b);
  });
  section.appendChild(tabs);
  section.appendChild(panel);
  show(0);
  return section;
}
`;
