export const LAYOUT_JS: string = String.raw`
var NODE_H = 30;
var ROW_GAP = 54;
var COL_GAP = 22;
var MAX_ROW_W = 1800;
var LABEL_MAX = 40;
var RES_LIST = ['observed', 'resolved', 'derived', 'inferred', 'ambiguous', 'unresolved', 'unknown'];

function normRes(r) { return RES_LIST.indexOf(r) >= 0 ? r : 'unknown'; }

function buildModel(graph) {
  var items = [];
  var index = new Map();
  (Array.isArray(graph.nodes) ? graph.nodes : []).forEach(function (n) {
    if (!isRecord(n) || n.id === undefined || n.id === null) { return; }
    var id = String(n.id);
    if (index.has(id)) { return; }
    var label = n.label === undefined || n.label === null ? id : String(n.label);
    var shown = shorten(label, LABEL_MAX);
    index.set(id, items.length);
    items.push({
      i: items.length, id: id, raw: n, label: label, shown: shown,
      kind: n.kind === undefined || n.kind === null ? 'unknown' : String(n.kind),
      w: Math.max(64, Math.min(320, shown.length * 7 + 28)), h: NODE_H,
      layer: 0, order: 0, x: 0, y: 0, out: [], inn: [], edgeEls: [], el: null,
    });
  });
  var edges = [];
  var dangling = 0;
  (Array.isArray(graph.edges) ? graph.edges : []).forEach(function (e) {
    if (!isRecord(e)) { return; }
    var s = index.get(String(e.source));
    var t = index.get(String(e.target));
    if (s === undefined || t === undefined) { dangling += 1; return; }
    var ed = {
      i: edges.length, id: e.id === undefined || e.id === null ? String(edges.length) : String(e.id),
      raw: e, s: s, t: t, res: normRes(e.resolution),
      relation: e.relation === undefined || e.relation === null ? '' : String(e.relation),
      rev: false, self: s === t,
    };
    edges.push(ed);
    items[s].out.push(ed);
    items[t].inn.push(ed);
  });
  return { items: items, edges: edges, index: index, dangling: dangling };
}

// Mark DFS back edges (cycle breakers). Used for layering only; edges keep their real direction when drawn.
function markBackEdges(items) {
  var n = items.length;
  var color = new Uint8Array(n);
  var starts = [];
  items.forEach(function (it) { if (it.inn.length === 0) { starts.push(it.i); } });
  items.forEach(function (it) { if (it.inn.length !== 0) { starts.push(it.i); } });
  starts.forEach(function (r) {
    if (color[r] !== 0) { return; }
    var nodes = [r];
    var idx = [0];
    color[r] = 1;
    while (nodes.length > 0) {
      var u = nodes[nodes.length - 1];
      var k = idx[idx.length - 1];
      var outs = items[u].out;
      if (k >= outs.length) { color[u] = 2; nodes.pop(); idx.pop(); continue; }
      idx[idx.length - 1] = k + 1;
      var ed = outs[k];
      if (ed.self) { continue; }
      if (color[ed.t] === 1) { ed.rev = true; }
      else if (color[ed.t] === 0) { color[ed.t] = 1; nodes.push(ed.t); idx.push(0); }
    }
  });
}

// Longest-path layering over the acyclic effective edges. Returns arrays of node indexes per layer.
function assignLayers(model) {
  var items = model.items;
  var n = items.length;
  var indeg = new Int32Array(n);
  var eff = items.map(function () { return []; });
  model.up = items.map(function () { return []; });
  model.down = items.map(function () { return []; });
  model.edges.forEach(function (ed) {
    if (ed.self) { return; }
    var a = ed.rev ? ed.t : ed.s;
    var b = ed.rev ? ed.s : ed.t;
    eff[a].push(b);
    indeg[b] += 1;
    model.down[a].push(b);
    model.up[b].push(a);
  });
  var queue = [];
  for (var i = 0; i < n; i += 1) { if (indeg[i] === 0) { queue.push(i); } }
  for (var h = 0; h < queue.length; h += 1) {
    var u = queue[h];
    eff[u].forEach(function (v) {
      if (items[v].layer < items[u].layer + 1) { items[v].layer = items[u].layer + 1; }
      indeg[v] -= 1;
      if (indeg[v] === 0) { queue.push(v); }
    });
  }
  var layers = [];
  items.forEach(function (it) {
    while (layers.length <= it.layer) { layers.push([]); }
    layers[it.layer].push(it.i);
  });
  return layers;
}

function frac(items, layers, v) {
  var it = items[v];
  return (it.order + 0.5) / layers[it.layer].length;
}

function sweepLayer(model, layers, li, useUp) {
  var items = model.items;
  var layer = layers[li];
  var keyed = layer.map(function (u) {
    var nb = useUp ? model.up[u] : model.down[u];
    var key;
    if (nb.length === 0) {
      key = frac(items, layers, u);
    } else {
      var sum = 0;
      nb.forEach(function (v) { sum += frac(items, layers, v); });
      key = sum / nb.length;
    }
    return { u: u, key: key };
  });
  keyed.sort(function (a, b) { return a.key - b.key; });
  keyed.forEach(function (k, pos) { layer[pos] = k.u; items[k.u].order = pos; });
}

function orderLayers(model, layers) {
  var items = model.items;
  layers.forEach(function (layer) { layer.forEach(function (u, pos) { items[u].order = pos; }); });
  for (var s = 0; s < 4; s += 1) {
    var li;
    if (s % 2 === 0) {
      for (li = 1; li < layers.length; li += 1) { sweepLayer(model, layers, li, true); }
    } else {
      for (li = layers.length - 2; li >= 0; li -= 1) { sweepLayer(model, layers, li, false); }
    }
  }
}

// Pack each layer into one or more rows no wider than MAX_ROW_W.
function buildRows(items, layers) {
  var rows = [];
  layers.forEach(function (layer) {
    var row = [];
    var width = 0;
    layer.forEach(function (u) {
      var w = items[u].w;
      if (row.length > 0 && width + COL_GAP + w > MAX_ROW_W) { rows.push(row); row = []; width = 0; }
      width += (row.length > 0 ? COL_GAP : 0) + w;
      row.push(u);
    });
    if (row.length > 0) { rows.push(row); }
  });
  return rows;
}

function placeRow(items, row, desired) {
  var prev = null;
  var shift = 0;
  var xs = row.map(function (u, k) {
    var x = desired[k];
    if (prev !== null) {
      var minX = prev.x + prev.w / 2 + COL_GAP + items[u].w / 2;
      if (x < minX) { x = minX; }
    }
    prev = { x: x, w: items[u].w };
    shift += desired[k] - x;
    return x;
  });
  var mean = shift / row.length;
  row.forEach(function (u, k) { items[u].x = xs[k] + mean; });
}

function refineX(model, rows) {
  var items = model.items;
  rows.forEach(function (row) {
    var total = 0;
    row.forEach(function (u) { total += items[u].w + COL_GAP; });
    var cursor = -total / 2;
    row.forEach(function (u) { items[u].x = cursor + items[u].w / 2; cursor += items[u].w + COL_GAP; });
  });
  var passes = [true, false, true];
  passes.forEach(function (down) {
    var seq = down ? rows : rows.slice().reverse();
    seq.forEach(function (row) {
      var desired = row.map(function (u) {
        var nb = down ? model.up[u] : model.down[u];
        if (nb.length === 0) { return items[u].x; }
        var sum = 0;
        nb.forEach(function (v) { sum += items[v].x; });
        return sum / nb.length;
      });
      placeRow(items, row, desired);
    });
  });
}

function computeLayout(graph) {
  var model = buildModel(graph);
  var items = model.items;
  if (items.length === 0) { model.width = 0; model.height = 0; return model; }
  markBackEdges(items);
  var layers = assignLayers(model);
  orderLayers(model, layers);
  var rows = buildRows(items, layers);
  refineX(model, rows);
  var minX = Infinity;
  var maxX = -Infinity;
  rows.forEach(function (row, r) {
    row.forEach(function (u) {
      items[u].y = r * (NODE_H + ROW_GAP) + NODE_H / 2;
      minX = Math.min(minX, items[u].x - items[u].w / 2);
      maxX = Math.max(maxX, items[u].x + items[u].w / 2);
    });
  });
  var margin = 24;
  items.forEach(function (it) { it.x = it.x - minX + margin; it.y += margin; });
  model.width = maxX - minX + margin * 2;
  model.height = rows.length * (NODE_H + ROW_GAP) - ROW_GAP + margin * 2;
  return model;
}

function edgePath(a, b) {
  var x1 = a.x;
  var x2 = b.x;
  var y1;
  var y2;
  var k;
  if (a === b) {
    var rx = a.x + a.w / 2;
    return 'M ' + rx + ' ' + (a.y - 6) + ' C ' + (rx + 34) + ' ' + (a.y - 28) + ' ' + (rx + 34) + ' ' + (a.y + 28) + ' ' + rx + ' ' + (a.y + 6);
  }
  var dy = b.y - a.y;
  if (dy > 1) {
    y1 = a.y + a.h / 2; y2 = b.y - b.h / 2; k = Math.max(24, (y2 - y1) / 2);
    return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + k) + ' ' + x2 + ' ' + (y2 - k) + ' ' + x2 + ' ' + y2;
  }
  if (dy < -1) {
    y1 = a.y - a.h / 2; y2 = b.y + b.h / 2; k = Math.max(24, (y1 - y2) / 2);
    return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 - k) + ' ' + x2 + ' ' + (y2 + k) + ' ' + x2 + ' ' + y2;
  }
  y1 = a.y - a.h / 2; y2 = b.y - b.h / 2;
  var lift = Math.min(70, 22 + Math.abs(x2 - x1) / 6);
  return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 - lift) + ' ' + x2 + ' ' + (y2 - lift) + ' ' + x2 + ' ' + y2;
}
`;
