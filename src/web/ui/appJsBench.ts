/** Inline SVG "deconstruction bench": a mason chisels hex-labelled bricks that land as source tokens. */
export const BENCH_JS: string = String.raw`
// Wall bricks [x, y, hex label]; the animated bricks all start from BENCH_SLOT (the top-left brick).
var BENCH_WALL = [
  [62, 76, '48 83'], [90, 76, 'EC 10'], [48, 64, 'C7 45'], [76, 64, 'FC 00'],
  [62, 52, '8B 45'], [90, 52, '5D 90'], [76, 40, 'E8 1F'],
];
var BENCH_HALVES = [[48, 76], [104, 64], [48, 52], [104, 40]];
// Each flier is one brick: bytes in the wall, source token on the pile (CSS class bn-kN positions it).
var BENCH_FLIERS = [
  { hex: '55 48', tok: 'int' }, { hex: '0F 84', tok: 'if' }, { hex: '89 E5', tok: '{' }, { hex: 'C3', tok: ';' },
];

function benchRect(parent, cls, x, y, w, h, r) {
  var attrs = { 'class': cls, x: x, y: y, width: w, height: h };
  if (r) { attrs.rx = r; }
  return parent.appendChild(svgEl('rect', attrs));
}
function benchText(parent, cls, x, y, str) {
  var t = svgEl('text', { 'class': cls, x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  t.textContent = str;
  return parent.appendChild(t);
}
function benchLine(parent, d, cls) {
  return parent.appendChild(svgEl('path', { 'class': cls || 'bn-line', d: d }));
}

function buildMason(svg) {
  var worker = svgEl('g', { 'class': 'bn-worker' });
  worker.appendChild(svgEl('circle', { 'class': 'bn-line', cx: 20, cy: 52, r: 4.5 }));
  benchLine(worker, 'M15 50.5 A5 5 0 0 1 25 50.5 Z', 'bn-line bn-hat');
  benchLine(worker, 'M13.5 50.5 H26.5');
  benchLine(worker, 'M20 57 V73 M20 73 L15 88 M20 73 L26 88');
  benchLine(worker, 'M20 60 L27 56 L35 49');
  benchLine(worker, 'M20 60 L26 48 L33 37');
  svg.appendChild(worker);
  var chisel = svgEl('g', { 'class': 'bn-chisel' });
  benchLine(chisel, 'M34 48 H46.5');
  benchLine(chisel, 'M33 46 V50');
  svg.appendChild(chisel);
  var hammer = svgEl('g', { 'class': 'bn-hammer' });
  benchLine(hammer, 'M33 37 V43');
  hammer.appendChild(svgEl('rect', { 'class': 'bn-line bn-head', x: 26.5, y: 40.5, width: 13, height: 6, rx: 1.2 }));
  svg.appendChild(hammer);
  var dust = svgEl('g', { 'class': 'bn-dust-group' });
  [1, 2, 3].forEach(function (n) { dust.appendChild(svgEl('circle', { 'class': 'bn-dust bn-dust-' + n, cx: 47.5, cy: 48, r: 1.1 })); });
  svg.appendChild(dust);
}

function buildWall(svg) {
  var wall = svgEl('g', { 'class': 'bn-wall' });
  BENCH_WALL.forEach(function (b) {
    benchRect(wall, 'bn-brick', b[0], b[1], 28, 12, 1);
    benchText(wall, 'bn-hex', b[0] + 14, b[1] + 6.5, b[2]);
  });
  BENCH_HALVES.forEach(function (h) { benchRect(wall, 'bn-brick', h[0], h[1], 14, 12, 1); });
  benchRect(wall, 'bn-slot', 48, 40, 28, 12, 1);
  svg.appendChild(wall);
}

function buildFliers(svg) {
  BENCH_FLIERS.forEach(function (f, k) {
    var x = svgEl('g', { 'class': 'bn-fly-x bn-k' + k });
    var y = svgEl('g', { 'class': 'bn-fly-y bn-k' + k });
    var hex = svgEl('g', { 'class': 'bn-hexbrick bn-k' + k });
    benchRect(hex, 'bn-brick', 48, 40, 28, 12, 1);
    benchText(hex, 'bn-hex', 62, 46.5, f.hex);
    var tok = svgEl('g', { 'class': 'bn-tokchip bn-k' + k });
    benchRect(tok, 'bn-chip', 51.5, 40, 21, 12, 3);
    benchText(tok, 'bn-tok', 62, 46.5, f.tok);
    y.appendChild(hex);
    y.appendChild(tok);
    x.appendChild(y);
    svg.appendChild(x);
  });
}

// The bench is decorative: aria-hidden, no text a screen reader needs. Steps and the live region carry real state.
function buildBench() {
  var svg = svgEl('svg', { 'class': 'bench is-running', viewBox: '0 0 224 96', 'aria-hidden': 'true', focusable: 'false' });
  svg.appendChild(svgEl('path', { 'class': 'bn-ground', d: 'M2 88.5 H222' }));
  buildMason(svg);
  buildWall(svg);
  buildFliers(svg);
  return svg;
}
`;
