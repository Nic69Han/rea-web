export const CORE_JS: string = String.raw`
var SVGNS = 'http://www.w3.org/2000/svg';
var HOLD_MS = 500;
var state = {
  token: null, lastSource: null, capabilities: null, capsPromise: null,
  busy: false, controller: null, timer: null, holdTimer: null, startedAt: 0,
  gen: 0, progress: null, stage: 'idle', result: null, workspace: null, exportInfo: null,
};
var dom = {};

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (text !== undefined && text !== null) { e.textContent = String(text); }
  return e;
}
function svgEl(tag, attrs) {
  var e = document.createElementNS(SVGNS, tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
  }
  return e;
}
function clearNode(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }
function isRecord(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function scalar(v) {
  if (v === null) { return 'null'; }
  if (v === undefined) { return ''; }
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  return String(v);
}
function fmtBytes(n) {
  if (typeof n !== 'number' || !isFinite(n)) { return 'unknown'; }
  var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  var i = 0;
  var v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  if (i === 0) { return n + ' B'; }
  return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + units[i] + ' (' + n + ' B)';
}
function shorten(s, max) {
  s = String(s);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function elapsedSeconds() { return (performance.now() - state.startedAt) / 1000; }
function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function readToken() {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  if (params.has('token')) {
    params.delete('token');
    var rest = params.toString();
    try {
      window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
    } catch (e) { /* history may be unavailable */ }
  }
  return token && token.length > 0 ? token : null;
}

function announce(text) { dom.live.textContent = text; }

// Stage state machine: idle -> analyzing -> results -> (New analysis) -> idle.
function setStage(name, message) {
  state.stage = name;
  ['idle', 'analyzing', 'results'].forEach(function (s) {
    dom['stage' + s.charAt(0).toUpperCase() + s.slice(1)].hidden = s !== name;
  });
  document.body.setAttribute('data-stage', name);
  announce(message || '');
  var focusTarget = name === 'idle' ? dom.pickBtn : name === 'analyzing' ? dom.analyzingTitle : dom.resultsTitle;
  if (focusTarget && !focusTarget.disabled) { focusTarget.focus(); }
}

function stopTimers() {
  if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
  if (state.holdTimer !== null) { clearTimeout(state.holdTimer); state.holdTimer = null; }
}
function finishRun() {
  stopTimers();
  var secs = elapsedSeconds();
  state.controller = null;
  state.busy = false;
  return secs;
}

function readResponse(res) {
  return res.text().then(function (text) {
    var data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { res: res, data: data, text: text };
  });
}

function failureHint(status) {
  if (status === 401 || status === 403) { return 'The access token or request origin was rejected. Open the URL printed by "rea web" again.'; }
  if (status === 409 || status === 429) { return 'Another analysis is already running. Wait for it to finish, then retry.'; }
  if (status === 413) { return 'The upload is larger than the server limit.'; }
  if (status === 0) { return 'The local server did not respond. Is "rea web" still running?'; }
  return null;
}
`;
