export const GRAPH_JS: string = String.raw`
function banner(kind, title, lines) {
  var b = el('div', 'banner banner-' + kind);
  b.setAttribute('role', kind === 'error' ? 'alert' : 'note');
  b.appendChild(el('strong', null, title));
  if (lines && lines.length > 0) { b.appendChild(listOf(lines)); }
  return b;
}

function graphBanners(graph, model) {
  var box = el('div', 'banners');
  var cov = isRecord(graph.coverage) ? graph.coverage : null;
  var status = cov && typeof cov.status === 'string' ? cov.status : 'unknown';
  var notes = cov && Array.isArray(cov.notes) ? cov.notes : [];
  if (status === 'complete') {
    box.appendChild(banner('ok', 'Coverage: complete', notes));
  } else if (status === 'partial') {
    box.appendChild(banner('warn', 'Coverage: partial. Missing nodes or edges do not imply absence in the target.', notes));
  } else {
    box.appendChild(banner('warn', 'Coverage: unknown. This is not the same as "none found".', notes));
  }
  var lims = Array.isArray(graph.limitations) ? graph.limitations : [];
  if (lims.length > 0) { box.appendChild(banner('warn', 'Limitations', lims)); }
  var tr = isRecord(graph.truncated) ? graph.truncated : {};
  var no = Number(tr.nodes_omitted) || 0;
  var eo = Number(tr.edges_omitted) || 0;
  if (no > 0 || eo > 0) {
    box.appendChild(banner('warn', 'Truncated for display: ' + no + ' node(s) and ' + eo + ' edge(s) omitted.'));
  }
  if (model.dangling > 0) {
    box.appendChild(banner('info', model.dangling + ' edge(s) reference nodes that are not in this graph and are not drawn.'));
  }
  return box;
}

function kindClasses(items) {
  var kinds = [];
  var counts = {};
  items.forEach(function (it) {
    if (counts[it.kind] === undefined) { counts[it.kind] = 0; kinds.push(it.kind); }
    counts[it.kind] += 1;
  });
  kinds.sort();
  var map = {};
  kinds.forEach(function (k, i) { map[k] = i % 8; });
  return { kinds: kinds, map: map, counts: counts };
}

function buildLegend(kc) {
  var legend = el('div', 'legend');
  legend.setAttribute('aria-label', 'Legend');
  var labels = {
    observed: 'observed', resolved: 'resolved', derived: 'derived', inferred: 'inferred',
    ambiguous: 'ambiguous', unresolved: 'unresolved', unknown: 'unknown',
  };
  RES_LIST.forEach(function (r) {
    var item = el('span', 'item');
    var s = svgEl('svg', { 'aria-hidden': 'true', viewBox: '0 0 36 10' });
    s.appendChild(svgEl('line', { x1: 1, y1: 5, x2: 35, y2: 5, 'class': 'edge res-' + r }));
    item.appendChild(s);
    item.appendChild(document.createTextNode(labels[r]));
    legend.appendChild(item);
  });
  kc.kinds.forEach(function (k) {
    var item = el('span', 'item');
    item.appendChild(el('span', 'swatch kind-' + kc.map[k]));
    item.appendChild(document.createTextNode(k + ' (' + kc.counts[k] + ')'));
    legend.appendChild(item);
  });
  return legend;
}

function buildMarkers() {
  var defs = svgEl('defs');
  RES_LIST.forEach(function (r) {
    var m = svgEl('marker', {
      id: 'arrow-' + r, viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: 'auto',
    });
    m.appendChild(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', 'class': 'arrow res-' + r }));
    defs.appendChild(m);
  });
  return defs;
}

function attrPairs(rec) {
  var pairs = [];
  if (isRecord(rec)) { Object.keys(rec).forEach(function (k) { pairs.push([k, rec[k] === null ? 'null' : rec[k], 'mono']); }); }
  return pairs;
}

function buildGraphView(graph) {
  var model = computeLayout(graph);
  var items = model.items;
  var kc = kindClasses(items);
  var root = el('div', 'graph-view');
  var meta = [graph.source_operation ? 'from ' + graph.source_operation : null,
    graph.evidence_id ? 'evidence ' + graph.evidence_id : null,
    items.length + ' node(s), ' + model.edges.length + ' edge(s) drawn'].filter(Boolean);
  root.appendChild(el('p', 'graph-meta', meta.join(' · ')));
  root.appendChild(graphBanners(graph, model));
  if (items.length === 0) {
    root.appendChild(el('p', 'empty', 'This graph has no nodes to draw.'));
    return { root: root, afterAttach: function () {} };
  }

  var view = { tx: 0, ty: 0, k: 1 };
  var fitted = false;
  var sel = { node: -1 };
  var toolbar = el('div', 'toolbar');
  var searchId = 'search-' + Math.random().toString(36).slice(2, 8);
  var searchLabel = el('label', null, 'Find nodes');
  searchLabel.setAttribute('for', searchId);
  var search = el('input');
  search.type = 'search'; search.id = searchId; search.placeholder = 'label, id, kind or attribute';
  var count = el('span', 'count');
  count.setAttribute('aria-live', 'polite');
  var btnOut = el('button', null, '−'); btnOut.type = 'button'; btnOut.setAttribute('aria-label', 'Zoom out');
  var btnIn = el('button', null, '+'); btnIn.type = 'button'; btnIn.setAttribute('aria-label', 'Zoom in');
  var btnFit = el('button', null, 'Fit'); btnFit.type = 'button'; btnFit.setAttribute('aria-label', 'Fit graph to view');
  [searchLabel, search, count, btnOut, btnIn, btnFit].forEach(function (c) { toolbar.appendChild(c); });
  root.appendChild(toolbar);

  var main = el('div', 'graph-main');
  var wrap = el('div', 'canvas-wrap');
  var svg = svgEl('svg', { 'class': 'graph-svg', 'aria-label': 'Graph ' + (graph.title || graph.graph_id || '') + '. Drag to pan, scroll to zoom.' });
  svg.appendChild(buildMarkers());
  var viewport = svgEl('g', { 'class': 'viewport' });
  var edgeLayer = svgEl('g');
  var nodeLayer = svgEl('g');
  viewport.appendChild(edgeLayer);
  viewport.appendChild(nodeLayer);
  svg.appendChild(viewport);
  wrap.appendChild(svg);
  var side = el('aside', 'side-panel');
  side.setAttribute('aria-label', 'Details');
  main.appendChild(wrap);
  main.appendChild(side);
  root.appendChild(main);
  root.appendChild(buildLegend(kc));

  model.edges.forEach(function (ed) {
    var a = items[ed.s];
    var b = items[ed.t];
    var p = svgEl('path', {
      d: edgePath(a, b), 'class': 'edge res-' + ed.res, 'marker-end': 'url(#arrow-' + ed.res + ')',
    });
    p.dataset.i = String(ed.i);
    p.appendChild(svgEl('title')).textContent = ed.relation + ' [' + ed.res + ']: ' + a.label + ' → ' + b.label;
    edgeLayer.appendChild(p);
    ed.el = p;
    a.edgeEls.push(p);
    if (b !== a) { b.edgeEls.push(p); }
  });
  items.forEach(function (it) {
    var g = svgEl('g', {
      'class': 'node kind-' + kc.map[it.kind], tabindex: 0, role: 'button',
      transform: 'translate(' + (it.x - it.w / 2) + ' ' + (it.y - it.h / 2) + ')',
      'aria-label': it.label + ' (' + it.kind + ')',
    });
    g.dataset.i = String(it.i);
    g.appendChild(svgEl('title')).textContent = it.label + ' (' + it.kind + ')';
    g.appendChild(svgEl('rect', { width: it.w, height: it.h, rx: 5 }));
    var t = svgEl('text', { x: it.w / 2, y: it.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    t.textContent = it.shown;
    g.appendChild(t);
    nodeLayer.appendChild(g);
    it.el = g;
  });

  function applyView() {
    viewport.setAttribute('transform', 'translate(' + view.tx + ' ' + view.ty + ') scale(' + view.k + ')');
  }
  function size() {
    var r = svg.getBoundingClientRect();
    return { w: r.width || 800, h: r.height || 500 };
  }
  function zoomAt(factor, px, py) {
    var nk = Math.max(0.005, Math.min(4, view.k * factor));
    view.tx = px - (px - view.tx) * (nk / view.k);
    view.ty = py - (py - view.ty) * (nk / view.k);
    view.k = nk;
    applyView();
  }
  function fit() {
    var s = size();
    view.k = Math.max(0.005, Math.min(1.5, (s.w - 24) / model.width, (s.h - 24) / model.height));
    view.tx = (s.w - model.width * view.k) / 2;
    view.ty = Math.max(12, (s.h - model.height * view.k) / 2);
    applyView();
  }
  function center(it) {
    var s = size();
    view.tx = s.w / 2 - it.x * view.k;
    view.ty = s.h / 2 - it.y * view.k;
    applyView();
  }

  function linkButton(text, onClick) {
    var b = el('button', 'link', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function neighborList(title, edgeList, outgoing) {
    var shownMax = 200;
    side.appendChild(el('h4', null, title + ' (' + edgeList.length + ')'));
    if (edgeList.length === 0) { side.appendChild(el('p', 'sub', 'None')); return; }
    var ul = el('ul');
    edgeList.slice(0, shownMax).forEach(function (ed) {
      var other = items[outgoing ? ed.t : ed.s];
      var li = el('li');
      li.appendChild(linkButton(other.shown, function () { selectNode(other.i, true); }));
      li.appendChild(el('div', 'sub', ed.relation + ' · ' + ed.res));
      var keys = isRecord(ed.raw.attributes) ? Object.keys(ed.raw.attributes).slice(0, 4) : [];
      if (keys.length > 0) {
        li.appendChild(el('div', 'sub mono', keys.map(function (k) { return k + '=' + scalar(ed.raw.attributes[k]); }).join(', ')));
      }
      ul.appendChild(li);
    });
    side.appendChild(ul);
    if (edgeList.length > shownMax) { side.appendChild(el('p', 'sub', '… ' + (edgeList.length - shownMax) + ' more not listed')); }
  }
  function showHint() {
    clearNode(side);
    side.appendChild(el('p', 'sub', 'Click a node or edge to see its attributes and connections.'));
  }
  function clearSelection() {
    if (sel.node >= 0) {
      var prev = items[sel.node];
      prev.el.classList.remove('selected');
      prev.edgeEls.forEach(function (e) { e.classList.remove('hl'); });
    }
    sel.node = -1;
    viewport.classList.remove('has-sel');
  }
  function selectNode(i, recenter) {
    clearSelection();
    var it = items[i];
    sel.node = i;
    it.el.classList.add('selected');
    it.edgeEls.forEach(function (e) { e.classList.add('hl'); });
    viewport.classList.add('has-sel');
    clearNode(side);
    side.appendChild(el('h3', null, it.label));
    side.appendChild(kvList([['Kind', it.kind], ['ID', it.id, 'mono']]));
    side.appendChild(el('h4', null, 'Attributes'));
    var pairs = attrPairs(it.raw.attributes);
    if (pairs.length === 0) { side.appendChild(el('p', 'sub', 'No attributes')); } else { side.appendChild(kvList(pairs)); }
    neighborList('Outgoing edges', it.out, true);
    neighborList('Incoming edges', it.inn, false);
    if (recenter) { center(it); }
  }
  function selectEdge(i) {
    clearSelection();
    var ed = model.edges[i];
    clearNode(side);
    side.appendChild(el('h3', null, 'Edge: ' + ed.relation));
    side.appendChild(kvList([['Resolution', ed.res], ['ID', ed.id, 'mono']]));
    var row = el('p');
    row.appendChild(linkButton(items[ed.s].shown, function () { selectNode(ed.s, true); }));
    row.appendChild(document.createTextNode(' → '));
    row.appendChild(linkButton(items[ed.t].shown, function () { selectNode(ed.t, true); }));
    side.appendChild(row);
    side.appendChild(el('h4', null, 'Attributes'));
    var pairs = attrPairs(ed.raw.attributes);
    if (pairs.length === 0) { side.appendChild(el('p', 'sub', 'No attributes')); } else { side.appendChild(kvList(pairs)); }
  }
  showHint();

  var haystacks = null;
  function runSearch(jump) {
    var q = search.value.trim().toLowerCase();
    if (haystacks === null) {
      haystacks = items.map(function (it) {
        var parts = [it.label, it.id, it.kind];
        if (isRecord(it.raw.attributes)) { Object.keys(it.raw.attributes).forEach(function (k) { parts.push(scalar(it.raw.attributes[k])); }); }
        return parts.join('\n').toLowerCase();
      });
    }
    var matches = [];
    items.forEach(function (it) {
      var hit = q.length > 0 && haystacks[it.i].indexOf(q) >= 0;
      it.el.classList.toggle('match', hit);
      it.el.classList.toggle('dim', q.length > 0 && !hit);
      if (hit) { matches.push(it); }
    });
    count.textContent = q.length === 0 ? '' : matches.length + ' match' + (matches.length === 1 ? '' : 'es');
    if (jump && matches.length > 0) { selectNode(matches[0].i, true); }
  }
  search.addEventListener('input', function () { runSearch(false); });
  search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(true); } });

  btnIn.addEventListener('click', function () { var s = size(); zoomAt(1.25, s.w / 2, s.h / 2); });
  btnOut.addEventListener('click', function () { var s = size(); zoomAt(0.8, s.w / 2, s.h / 2); });
  btnFit.addEventListener('click', fit);
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = svg.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  var drag = null;
  var suppressClick = false;
  svg.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) { return; }
    drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, id: e.pointerId };
  });
  svg.addEventListener('pointermove', function (e) {
    if (!drag) { return; }
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      svg.classList.add('panning');
      try { svg.setPointerCapture(drag.id); } catch (err) { /* pointer may be gone */ }
    }
    if (drag.moved) { view.tx = drag.tx + dx; view.ty = drag.ty + dy; applyView(); }
  });
  function endDrag() {
    if (drag && drag.moved) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }
    drag = null;
    svg.classList.remove('panning');
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('click', function (e) {
    if (suppressClick) { return; }
    var n = e.target.closest ? e.target.closest('.node') : null;
    if (n) { selectNode(Number(n.dataset.i), false); return; }
    var ed = e.target.closest ? e.target.closest('.edge') : null;
    if (ed) { selectEdge(Number(ed.dataset.i)); return; }
    clearSelection();
    showHint();
  });
  svg.addEventListener('keydown', function (e) {
    var n = e.target.closest ? e.target.closest('.node') : null;
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectNode(Number(n.dataset.i), false); return; }
    var s = size();
    if (e.key === '+' || e.key === '=') { zoomAt(1.25, s.w / 2, s.h / 2); }
    else if (e.key === '-') { zoomAt(0.8, s.w / 2, s.h / 2); }
    else if (e.key === '0') { fit(); }
  });
  return { root: root, afterAttach: function () { if (!fitted) { fitted = true; fit(); } } };
}

function renderGraphSection(graphs, host) {
  var section = el('section');
  host.appendChild(section);
  if (graphs.length === 0) {
    section.appendChild(el('p', 'empty', 'No graphs were produced for this target.'));
    return { select: function () {} };
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
  return { select: show };
}
`;
