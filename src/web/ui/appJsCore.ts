export const CORE_JS: string = String.raw`
var SVGNS = 'http://www.w3.org/2000/svg';
var state = { token: null, lastSource: null, capabilities: null, busy: false, controller: null, timer: null, startedAt: 0 };
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

function setStatus(text, kind) {
  dom.statusText.textContent = text;
  dom.status.className = 'status' + (kind ? ' ' + kind : '');
}
function setBusy(b) {
  state.busy = b;
  dom.pathInput.disabled = b;
  dom.analyzeBtn.disabled = b;
  dom.cancelBtn.hidden = !b;
  dom.spinner.hidden = !b;
  dom.dropZone.classList.toggle('busy', b);
  dom.dropZone.setAttribute('aria-busy', String(b));
}
function elapsedSeconds() { return (performance.now() - state.startedAt) / 1000; }

function finishRun() {
  if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
  var secs = elapsedSeconds();
  state.controller = null;
  setBusy(false);
  return secs;
}

function readResponse(res) {
  return res.text().then(function (text) {
    var data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { res: res, data: data, text: text };
  });
}

function run(label, init) {
  if (state.busy) { return; }
  if (!state.token) { dom.tokenAlert.hidden = false; setStatus('Cannot start: access token missing.', 'error'); return; }
  var controller = new AbortController();
  state.controller = controller;
  state.startedAt = performance.now();
  setBusy(true);
  clearNode(dom.results);
  var tick = function () { setStatus(label + ' — ' + elapsedSeconds().toFixed(1) + ' s', ''); };
  tick();
  state.timer = setInterval(tick, 200);
  var headers = Object.assign({ 'x-rea-web-token': state.token }, init.headers);
  fetch('/api/analyze', { method: 'POST', headers: headers, body: init.body, signal: controller.signal })
    .then(readResponse)
    .then(function (r) {
      var secs = finishRun();
      if (!r.res.ok || !isRecord(r.data)) {
        renderFailure(r.res.status, r.data, r.text);
        setStatus('Request failed (HTTP ' + r.res.status + ') after ' + secs.toFixed(1) + ' s.', 'error');
        return;
      }
      renderResult(r.data);
      setStatus('Finished in ' + secs.toFixed(1) + ' s.', 'ok');
    })
    .catch(function (err) {
      var secs = finishRun();
      if (err && err.name === 'AbortError') {
        setStatus('Cancelled after ' + secs.toFixed(1) + ' s.', 'warn');
      } else {
        renderFailure(0, null, String((err && err.message) || err));
        setStatus('Network error after ' + secs.toFixed(1) + ' s.', 'error');
      }
    });
}

function submitPath() {
  var value = dom.pathInput.value.trim();
  if (value.length === 0) {
    setStatus('Enter a local path, or drop / paste a file.', 'warn');
    dom.pathInput.focus();
    return;
  }
  dom.fileInfo.hidden = true;
  state.lastSource = { kind: 'path', path: value };
  run('Analyzing ' + shorten(value, 80), {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: value }),
  });
}

function submitFile(file) {
  if (state.busy) { return; }
  var size = fmtBytes(file.size);
  dom.fileInfo.hidden = false;
  dom.fileInfo.textContent = 'Selected file: ' + file.name + ' — ' + size;
  state.lastSource = { kind: 'file', file: file };
  run('Uploading and analyzing ' + shorten(file.name, 60) + ' (' + size + ')', {
    headers: {
      'content-type': 'application/octet-stream',
      'x-rea-filename': encodeURIComponent(file.name),
    },
    body: file,
  });
}

function isTextField(t) {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

function onPaste(e) {
  var data = e.clipboardData;
  if (!data) { return; }
  if (data.files && data.files.length > 0) {
    e.preventDefault();
    submitFile(data.files[0]);
    return;
  }
  if (isTextField(e.target)) { return; }
  var text = data.getData('text/plain');
  if (text && !state.busy) {
    e.preventDefault();
    dom.pathInput.value = text.trim();
    dom.pathInput.focus();
    setStatus('Pasted text placed in the path field. Press Enter to analyze.', '');
  }
}

function hasFiles(e) {
  var types = e.dataTransfer && e.dataTransfer.types;
  return !!types && Array.prototype.indexOf.call(types, 'Files') >= 0;
}

function setupDropZone() {
  var zone = dom.dropZone;
  zone.addEventListener('dragenter', function (e) { if (hasFiles(e)) { e.preventDefault(); zone.classList.add('dragover'); } });
  zone.addEventListener('dragover', function (e) {
    if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zone.classList.add('dragover'); }
  });
  zone.addEventListener('dragleave', function (e) {
    if (!zone.contains(e.relatedTarget)) { zone.classList.remove('dragover'); }
  });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      submitFile(files[0]);
    } else if (e.dataTransfer) {
      var text = e.dataTransfer.getData('text/plain');
      if (text) { dom.pathInput.value = text.trim(); dom.pathInput.focus(); }
    }
  });
  // Prevent the browser from navigating to a file dropped outside the zone.
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); } });
  window.addEventListener('drop', function (e) { if (hasFiles(e)) { e.preventDefault(); } });
}

function init() {
  ['drop-zone', 'analyze-form', 'path-input', 'analyze-btn', 'cancel-btn', 'status', 'status-text', 'spinner', 'file-info', 'results', 'token-alert']
    .forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
      dom[key] = document.getElementById(id);
    });
  dom.analyzeForm.addEventListener('submit', function (e) { e.preventDefault(); submitPath(); });
  dom.cancelBtn.addEventListener('click', function () { if (state.controller) { state.controller.abort(); } });
  document.addEventListener('paste', onPaste);
  setupDropZone();
  state.token = readToken();
  if (!state.token) {
    dom.tokenAlert.hidden = false;
    dom.pathInput.disabled = true;
    dom.analyzeBtn.disabled = true;
    setStatus('No access token. Open the URL printed by "rea web".', 'error');
  } else {
    dom.pathInput.focus();
    loadCapabilities();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
`;
