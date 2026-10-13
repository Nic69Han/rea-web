export const WORKSPACE_JS: string = String.raw`
function targetFormat(ops) {
  for (var i = 0; i < ops.length; i += 1) {
    var ev = ops[i].evidence;
    if (isRecord(ev) && isRecord(ev.subject) && typeof ev.subject.format === 'string') { return ev.subject.format; }
  }
  return null;
}

function copyText(text, button) {
  var done = function (ok) {
    button.textContent = ok ? 'Copied' : 'Copy failed';
    announce(ok ? 'SHA-256 copied to the clipboard.' : 'Copying to the clipboard failed.');
    setTimeout(function () { button.textContent = 'Copy'; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
  } else {
    done(false);
  }
}

function chip(label, value, mono) {
  var c = el('span', 'chip');
  c.appendChild(el('span', 'chip-label', label));
  c.appendChild(el('span', mono ? 'chip-value mono' : 'chip-value', value));
  return c;
}

function buildBar(data, secs, ws) {
  var t = isRecord(data.target) ? data.target : {};
  var ops = Array.isArray(data.operations) ? data.operations.filter(isRecord) : [];
  var bar = el('div', 'bar');
  var id = el('div', 'bar-id');
  var name = el('strong', 'bar-name', t.display_name === undefined ? 'Unknown target' : t.display_name);
  if (t.local_path) { name.title = String(t.local_path); }
  id.appendChild(name);
  var meta = el('div', 'bar-meta');
  meta.appendChild(chip('Format', targetFormat(ops) || 'unknown'));
  meta.appendChild(chip('Size', t.size_bytes === null || t.size_bytes === undefined ? 'unknown' : fmtBytes(t.size_bytes)));
  if (typeof t.sha256 === 'string') {
    var sha = chip('SHA-256', t.sha256.slice(0, 12) + '…', true);
    sha.title = t.sha256;
    var copy = el('button', 'small', 'Copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy full SHA-256');
    copy.addEventListener('click', function () { copyText(t.sha256, copy); });
    sha.appendChild(copy);
    meta.appendChild(sha);
  } else {
    meta.appendChild(chip('SHA-256', 'unknown', true));
  }
  meta.appendChild(chip('Analyzed in', secs.toFixed(1) + ' s'));
  id.appendChild(meta);
  bar.appendChild(id);
  var actions = el('div', 'bar-actions');
  actions.appendChild(ws.exportControl.root);
  var again = el('button', null, 'New analysis');
  again.type = 'button';
  again.addEventListener('click', function () { resetToIdle(null, 'Ready for a new analysis.'); });
  actions.appendChild(again);
  bar.appendChild(actions);
  return bar;
}

function tally(items, key) {
  var out = {};
  items.forEach(function (it) { var k = String(it[key]); out[k] = (out[k] || 0) + 1; });
  return out;
}
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

function opsSummaryCard(ops, ws) {
  var card = el('section', 'card summary');
  card.appendChild(el('h3', null, 'Operations'));
  var counts = tally(ops, 'status');
  var row = el('p', 'tallies');
  row.appendChild(badge((counts.ok || 0) + ' ok', 'ok'));
  row.appendChild(badge((counts.not_applicable || 0) + ' not applicable', 'na'));
  row.appendChild(badge((counts.error || 0) + ' error', counts.error ? 'error' : 'na'));
  card.appendChild(row);
  var ul = el('ul', 'plain');
  ops.forEach(function (op) {
    var li = el('li');
    li.appendChild(badge(op.status === 'not_applicable' ? 'n/a' : String(op.status), statusClass(op.status)));
    li.appendChild(el('span', 'mono', ' ' + op.operation));
    if (op.reason) { li.appendChild(el('div', 'hint', op.reason)); }
    ul.appendChild(li);
  });
  card.appendChild(ul);
  card.appendChild(linkButton('View evidence', function () { ws.select('evidence'); }));
  return card;
}

function linkButton(text, onClick) {
  var b = el('button', 'link', text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function coverageBadge(graph) {
  var status = isRecord(graph.coverage) && typeof graph.coverage.status === 'string' ? graph.coverage.status : 'unknown';
  return badge('coverage ' + status, status === 'complete' ? 'ok' : 'warn');
}

function graphSummaryCard(graph, index, ws) {
  var nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  var edges = Array.isArray(graph.edges) ? graph.edges.filter(isRecord) : [];
  var card = el('section', 'card summary');
  card.appendChild(el('h3', null, graph.title || graph.graph_id || 'Graph ' + (index + 1)));
  card.appendChild(el('p', 'big', plural(nodes.length, 'node') + ' · ' + plural(edges.length, 'edge')));
  var row = el('p', 'tallies');
  row.appendChild(coverageBadge(graph));
  var res = tally(edges, 'resolution');
  Object.keys(res).forEach(function (k) {
    row.appendChild(badge(res[k] + ' ' + k, k === 'unresolved' ? 'error' : k === 'ambiguous' || k === 'unknown' ? 'warn' : 'na'));
  });
  card.appendChild(row);
  var tr = isRecord(graph.truncated) ? graph.truncated : {};
  if ((Number(tr.nodes_omitted) || 0) > 0 || (Number(tr.edges_omitted) || 0) > 0) {
    card.appendChild(el('p', 'hint', 'Truncated: ' + (Number(tr.nodes_omitted) || 0) + ' node(s) and ' + (Number(tr.edges_omitted) || 0) + ' edge(s) omitted.'));
  }
  card.appendChild(linkButton('Open graph', function () { ws.select('graphs'); ws.graphs.select(index); }));
  return card;
}

function collectFindings(graphs) {
  var found = [];
  graphs.forEach(function (g) {
    var labels = new Map();
    (Array.isArray(g.nodes) ? g.nodes : []).forEach(function (n) { if (isRecord(n)) { labels.set(String(n.id), n.label === undefined ? String(n.id) : String(n.label)); } });
    (Array.isArray(g.edges) ? g.edges : []).forEach(function (e) {
      if (!isRecord(e) || (e.resolution !== 'unresolved' && e.resolution !== 'ambiguous')) { return; }
      var s = labels.has(String(e.source)) ? labels.get(String(e.source)) : String(e.source);
      var t = labels.has(String(e.target)) ? labels.get(String(e.target)) : String(e.target);
      found.push({ resolution: e.resolution, text: s + ' → ' + t + (e.relation ? ' (' + e.relation + ')' : ''), graph: g.title || g.graph_id || 'graph' });
    });
  });
  return found;
}

function findingsBlock(graphs, edgeCount) {
  var found = collectFindings(graphs);
  if (found.length === 0) {
    if (edgeCount === 0) { return null; }
    var b = banner('info', 'No unresolved or ambiguous edges among the ' + edgeCount + ' drawn. Absence is only meaningful where coverage is complete.');
    return b;
  }
  var unresolved = found.filter(function (f) { return f.resolution === 'unresolved'; }).length;
  var box = banner(unresolved > 0 ? 'error' : 'warn', 'Findings: ' + unresolved + ' unresolved, ' + (found.length - unresolved) + ' ambiguous reference(s)', null);
  box.classList.add('finding');
  var ul = el('ul');
  found.slice(0, 8).forEach(function (f) {
    var li = el('li');
    li.appendChild(badge(f.resolution, f.resolution === 'unresolved' ? 'error' : 'warn'));
    li.appendChild(el('span', 'mono', ' ' + f.text));
    ul.appendChild(li);
  });
  box.appendChild(ul);
  if (found.length > 8) { box.appendChild(el('div', 'hint', 'and ' + (found.length - 8) + ' more in the graph.')); }
  return box;
}

function collectLimitations(graphs, ops) {
  var seen = new Set();
  var out = [];
  var add = function (it) {
    var text = isRecord(it) && typeof it.message === 'string' ? it.message : scalar(it);
    if (!seen.has(text)) { seen.add(text); out.push(text); }
  };
  graphs.forEach(function (g) { (Array.isArray(g.limitations) ? g.limitations : []).forEach(add); });
  ops.forEach(function (op) {
    var lim = isRecord(op.evidence) ? pick(op.evidence, 'limitations') : undefined;
    if (Array.isArray(lim)) { lim.forEach(add); }
  });
  return out;
}

function buildOverview(data, ws) {
  var root = el('div', 'overview');
  var ops = Array.isArray(data.operations) ? data.operations.filter(isRecord) : [];
  var graphs = Array.isArray(data.graphs) ? data.graphs.filter(isRecord) : [];
  var edgeCount = graphs.reduce(function (n, g) { return n + (Array.isArray(g.edges) ? g.edges.length : 0); }, 0);
  var findings = findingsBlock(graphs, edgeCount);
  if (findings) { root.appendChild(findings); }
  var grid = el('div', 'card-grid');
  grid.appendChild(opsSummaryCard(ops, ws));
  graphs.forEach(function (g, i) { grid.appendChild(graphSummaryCard(g, i, ws)); });
  if (graphs.length === 0) {
    var none = el('section', 'card summary');
    none.appendChild(el('h3', null, 'Graphs'));
    none.appendChild(el('p', 'empty', 'No graphs were produced for this target.'));
    grid.appendChild(none);
  }
  root.appendChild(grid);
  var lims = collectLimitations(graphs, ops);
  if (lims.length > 0) {
    var lb = banner('warn', 'Top limitations (' + lims.length + ')', lims.slice(0, 4));
    if (lims.length > 4) {
      var more = el('details');
      more.appendChild(el('summary', null, 'Show ' + (lims.length - 4) + ' more'));
      more.appendChild(listOf(lims.slice(4)));
      lb.appendChild(more);
    }
    root.appendChild(lb);
  }
  if (isRecord(data.target)) { root.appendChild(targetCard(data.target)); }
  if (isRecord(data.cleanup)) { root.appendChild(cleanupCard(data.cleanup)); }
  return root;
}

function buildEvidence(data) {
  var root = el('div', 'evidence-tab');
  var ops = Array.isArray(data.operations) ? data.operations.filter(isRecord) : [];
  var list = el('div', 'op-list');
  ops.forEach(function (op) { list.appendChild(opCard(op)); });
  if (ops.length === 0) { list.appendChild(el('p', 'empty', 'No operations were reported.')); }
  root.appendChild(list);
  if (isRecord(data.cleanup)) { root.appendChild(cleanupCard(data.cleanup)); }
  return root;
}

function buildDecompiledIntro(ws) {
  var root = el('div', 'decompiled-tab');
  root.appendChild(el('p', null, 'Runs the existing read-only deep provider (Ghidra, IDA or Hopper) once over this target and downloads the pseudo-code as a zip with a README, a manifest and one file per function. Pseudo-code is derived, provider-specific output, not original source.'));
  root.appendChild(el('p', 'hint', 'Start it with "Download decompiled code (.zip)" in the header bar. Per-function counts (decompiled, skipped, failed) are recorded in manifest.json inside the zip; the server does not return them in response headers, so they are not shown here.'));
  var caps = state.capabilities;
  var providers = caps ? caps.providers : [];
  if (providers.length > 0) {
    root.appendChild(el('h3', null, 'Deep providers'));
    root.appendChild(listOf(providers.map(function (p) { return providerLabel(p) + ': ' + (p.available === true ? 'available' : (p.reason || 'unavailable')); })));
  }
  ws.decompileSlot = el('div', 'decompile-slot');
  root.appendChild(ws.decompileSlot);
  return root;
}

var TAB_BUILDERS = {
  overview: function (data, ws) { return buildOverview(data, ws); },
  graphs: function (data, ws, panel) {
    var graphs = Array.isArray(data.graphs) ? data.graphs.filter(isRecord) : [];
    ws.graphs = renderGraphSection(graphs, panel);
    return null;
  },
  evidence: function (data) { return buildEvidence(data); },
};

function buildWorkspace(data, secs) {
  var ops = Array.isArray(data.operations) ? data.operations.filter(isRecord) : [];
  var graphs = Array.isArray(data.graphs) ? data.graphs.filter(isRecord) : [];
  var ws = { graphs: { select: function () {} }, decompileSlot: null, panels: {}, buttons: {}, current: null };
  ws.exportControl = createExportControl();
  var defs = [
    { id: 'overview', label: 'Overview' },
    { id: 'graphs', label: 'Graphs (' + graphs.length + ')' },
    { id: 'evidence', label: 'Evidence (' + ops.length + ')' },
    { id: 'decompiled', label: 'Decompiled' },
  ];
  var nav = el('div', 'ws-nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Result sections');
  var main = el('div', 'ws-main');
  defs.forEach(function (d) {
    var b = el('button', 'ws-tab', d.label);
    b.type = 'button';
    b.id = 'ws-tab-' + d.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'ws-panel-' + d.id);
    b.addEventListener('click', function () { ws.select(d.id); });
    b.addEventListener('keydown', function (e) {
      var i = defs.findIndex(function (x) { return x.id === d.id; });
      var n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? defs.length - 1 : null;
      if (n === null) { return; }
      e.preventDefault();
      var next = defs[(n + defs.length) % defs.length].id;
      ws.select(next);
      ws.buttons[next].focus();
    });
    nav.appendChild(b);
    ws.buttons[d.id] = b;
    var p = el('div', 'ws-panel');
    p.id = 'ws-panel-' + d.id;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', b.id);
    p.hidden = true;
    main.appendChild(p);
    ws.panels[d.id] = { el: p, built: false };
  });
  ws.select = function (id) {
    ws.current = id;
    defs.forEach(function (d) {
      var sel = d.id === id;
      ws.buttons[d.id].setAttribute('aria-selected', String(sel));
      ws.buttons[d.id].tabIndex = sel ? 0 : -1;
      ws.panels[d.id].el.hidden = !sel;
    });
    var panel = ws.panels[id];
    if (!panel.built) {
      panel.built = true;
      var content = TAB_BUILDERS[id](data, ws, panel.el);
      if (content) { panel.el.appendChild(content); }
    }
  };
  ws.refreshExport = function () { ws.exportControl.refresh(); };
  ws.bar = buildBar(data, secs, ws);
  ws.nav = nav;
  ws.main = main;
  return ws;
}

function showResults(data, secs) {
  state.result = data;
  var ws = buildWorkspace(data, secs);
  state.workspace = ws;
  clearNode(dom.resultsBar);
  clearNode(dom.resultsBody);
  dom.resultsBar.appendChild(ws.bar);
  dom.resultsBody.appendChild(ws.nav);
  dom.resultsBody.appendChild(ws.main);
  // The export slot lives in the Decompiled panel; build it now so an export can start from any tab.
  ws.panels.decompiled.built = true;
  ws.panels.decompiled.el.appendChild(buildDecompiledIntro(ws));
  setStage('results', 'Analysis finished in ' + secs.toFixed(1) + ' seconds. Showing the overview.');
  ws.select('overview');
  ws.refreshExport();
  if (state.capsPromise) { state.capsPromise.then(function () { if (state.workspace === ws) { ws.refreshExport(); } }); }
}
`;
