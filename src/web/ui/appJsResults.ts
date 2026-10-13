export const RESULTS_JS: string = String.raw`
var ICONS = { ok: '✓', error: '✕', na: '–', warn: '!' };
function badge(text, cls) { return el('span', 'badge badge-' + cls, (ICONS[cls] ? ICONS[cls] + ' ' : '') + text); }

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

function failureCard(status, data, text) {
  var err = data && isRecord(data.error) ? data.error : null;
  var card = el('section', 'card card-error');
  card.setAttribute('role', 'alert');
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
  return card;
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
`;
