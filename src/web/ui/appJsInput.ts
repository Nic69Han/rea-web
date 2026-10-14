export const INPUT_JS: string = String.raw`
function sourceName(source) { return source.kind === 'file' ? source.file.name : source.path; }

function analysisSteps(source) {
  return [
    { id: 'inspect_artifact', label: source.kind === 'file' ? 'Upload + artifact inventory' : 'Artifact inventory' },
    { id: 'trace_dylib_resolution', label: 'Dylib resolution' },
  ];
}

function showNotice(node) {
  clearNode(dom.idleNotice);
  if (node) { dom.idleNotice.appendChild(node); }
}
function noticeBanner(kind, title, text) {
  var b = el('div', 'banner banner-' + kind);
  b.setAttribute('role', kind === 'error' ? 'alert' : 'note');
  b.appendChild(el('strong', null, title));
  if (text) { b.appendChild(el('div', null, text)); }
  return b;
}

function resetToIdle(notice, message) {
  state.gen += 1;
  stopTimers();
  if (state.progress) { state.progress.dispose(); state.progress = null; }
  if (state.controller) { state.controller.abort(); }
  state.controller = null;
  state.busy = false;
  state.result = null;
  state.workspace = null;
  state.exportInfo = null;
  state.lastSource = null;
  clearNode(dom.resultsBar);
  clearNode(dom.resultsBody);
  clearNode(dom.analyzingHost);
  dom.fileInput.value = '';
  showNotice(notice || null);
  setStage('idle', message || 'Ready for a new analysis.');
}

function startAnalysis(source) {
  if (state.busy || state.stage !== 'idle') { return; }
  if (!state.token) {
    dom.tokenAlert.hidden = false;
    showNotice(noticeBanner('error', 'Cannot start', 'Access token missing.'));
    return;
  }
  showNotice(null);
  var gen = state.gen + 1;
  state.gen = gen;
  var controller = new AbortController();
  state.controller = controller;
  state.startedAt = performance.now();
  state.busy = true;
  state.lastSource = source;
  state.exportInfo = null;
  var name = sourceName(source);
  dom.analyzingTitle.textContent = 'Analyzing ' + shorten(name, 80);
  clearNode(dom.analyzingHost);
  var steps = analysisSteps(source);
  var progress = createProgress({
    steps: steps,
    title: 'Analysis',
    specimen: name,
    notes: ANALYSIS_NOTES,
    line: 'Steps run on the local server, which reports once when all of them finish, so every pending step shows "running…".',
    onCancel: function () { controller.abort(); },
  });
  state.progress = progress;
  dom.analyzingHost.appendChild(progress.root);
  setStage('analyzing', 'Analyzing ' + name + '. Steps run on the local server.');
  progress.start();
  var init = source.kind === 'file'
    ? { headers: { 'content-type': 'application/octet-stream', 'x-rea-filename': encodeURIComponent(source.file.name) }, body: source.file }
    : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: source.path }) };
  var headers = Object.assign({ 'x-rea-web-token': state.token }, init.headers);
  fetch('/api/analyze', { method: 'POST', headers: headers, body: init.body, signal: controller.signal })
    .then(readResponse)
    .then(function (r) {
      if (gen !== state.gen) { return; }
      var secs = finishRun();
      if (!r.res.ok || !isRecord(r.data)) {
        resetToIdle(failureCard(r.res.status, r.data, r.text), 'Request failed (HTTP ' + r.res.status + ').');
        return;
      }
      var ops = Array.isArray(r.data.operations) ? r.data.operations.filter(isRecord) : [];
      var statuses = steps.map(function (step) {
        var op = ops.filter(function (o) { return o.operation === step.id; })[0];
        return op && STEP_STATUS[op.status] ? op.status : 'unknown';
      });
      progress.complete(statuses, 'Finished in ' + secs.toFixed(1) + ' s. Opening results…');
      announce('Analysis finished in ' + secs.toFixed(1) + ' seconds. ' + steps.map(function (s, i) { return s.label + ': ' + STEP_STATUS[statuses[i]].text; }).join('; ') + '.');
      state.holdTimer = setTimeout(function () {
        state.holdTimer = null;
        if (gen !== state.gen) { return; }
        state.progress = null;
        showResults(r.data, secs);
      }, HOLD_MS);
    })
    .catch(function (err) {
      if (gen !== state.gen) { return; }
      var secs = finishRun();
      if (err && err.name === 'AbortError') {
        resetToIdle(noticeBanner('warn', 'Cancelled', 'The analysis was cancelled after ' + secs.toFixed(1) + ' s.'), 'Analysis cancelled.');
      } else {
        resetToIdle(failureCard(0, null, String((err && err.message) || err)), 'Network error.');
      }
    });
}

function submitPath() {
  var value = dom.pathInput.value.trim();
  if (value.length === 0) {
    showNotice(noticeBanner('warn', 'Enter a local path', 'Or drop, paste or choose a file.'));
    dom.pathInput.focus();
    return;
  }
  startAnalysis({ kind: 'path', path: value });
}

function isTextField(t) {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

function fillPath(text) {
  dom.pathDetails.open = true;
  dom.pathInput.value = text.trim();
  dom.pathInput.focus();
}

function onPaste(e) {
  if (state.stage !== 'idle') { return; }
  var data = e.clipboardData;
  if (!data) { return; }
  if (data.files && data.files.length > 0) {
    e.preventDefault();
    startAnalysis({ kind: 'file', file: data.files[0] });
    return;
  }
  if (isTextField(e.target)) { return; }
  var text = data.getData('text/plain');
  if (text) {
    e.preventDefault();
    fillPath(text);
    showNotice(noticeBanner('info', 'Pasted text placed in the path field', 'Press Enter to analyze.'));
  }
}

function hasFiles(e) {
  var types = e.dataTransfer && e.dataTransfer.types;
  return !!types && Array.prototype.indexOf.call(types, 'Files') >= 0;
}

// Whole-window drop target while idle; in other stages a drop is swallowed so the browser never navigates away.
function setupDropTarget() {
  var accepting = function () { return state.stage === 'idle' && !state.busy; };
  window.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) { return; }
    e.preventDefault();
    if (accepting()) { document.body.classList.add('dragging'); }
  });
  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) { return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = accepting() ? 'copy' : 'none';
    if (accepting()) { document.body.classList.add('dragging'); }
  });
  window.addEventListener('dragleave', function (e) {
    if (!e.relatedTarget) { document.body.classList.remove('dragging'); }
  });
  window.addEventListener('drop', function (e) {
    document.body.classList.remove('dragging');
    if (hasFiles(e)) { e.preventDefault(); }
    if (!accepting()) { return; }
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      e.preventDefault();
      startAnalysis({ kind: 'file', file: files[0] });
    } else if (e.dataTransfer) {
      var text = e.dataTransfer.getData('text/plain');
      if (text) { e.preventDefault(); fillPath(text); }
    }
  });
}

function init() {
  ['live', 'token-alert', 'stage-idle', 'stage-analyzing', 'stage-results', 'drop-zone', 'pick-btn', 'file-input',
    'path-details', 'analyze-form', 'path-input', 'analyze-btn', 'idle-notice', 'analyzing-title', 'analyzing-host',
    'results-title', 'results-bar', 'results-body']
    .forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
      dom[key] = document.getElementById(id);
    });
  dom.analyzeForm.addEventListener('submit', function (e) { e.preventDefault(); submitPath(); });
  dom.pickBtn.addEventListener('click', function () { dom.fileInput.click(); });
  dom.fileInput.addEventListener('change', function () {
    var file = dom.fileInput.files && dom.fileInput.files[0];
    if (file) { startAnalysis({ kind: 'file', file: file }); }
  });
  document.addEventListener('paste', onPaste);
  setupDropTarget();
  state.token = readToken();
  if (!state.token) {
    dom.tokenAlert.hidden = false;
    dom.pickBtn.disabled = true;
    dom.pathInput.disabled = true;
    dom.analyzeBtn.disabled = true;
    announce('No access token. Open the URL printed by "rea web".');
  } else {
    loadCapabilities();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
`;
