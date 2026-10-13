export const DECOMPILE_JS: string = String.raw`
var DEEP_LABELS = { ghidra: 'Ghidra', ida: 'IDA', hopper: 'Hopper' };

function loadCapabilities() {
  state.capabilities = { status: 'loading', providers: [] };
  state.capsPromise = fetch('/api/capabilities', { headers: { 'x-rea-web-token': state.token } })
    .then(readResponse)
    .then(function (r) {
      if (r.res.ok && isRecord(r.data) && Array.isArray(r.data.deep_providers)) {
        state.capabilities = { status: 'ready', providers: r.data.deep_providers.filter(isRecord) };
      } else {
        state.capabilities = { status: 'error', providers: [], message: 'Provider availability could not be read (HTTP ' + r.res.status + ').' };
      }
    })
    .catch(function () {
      state.capabilities = { status: 'error', providers: [], message: 'Provider availability could not be read.' };
    });
  return state.capsPromise;
}

function providerLabel(p) { return DEEP_LABELS[p.id] || String(p.id); }

function downloadName(res) {
  var m = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
  return m ? m[1] : 'decompiled.zip';
}

function saveBlob(blob, name) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}

function decompileRequest(source, provider) {
  var headers = { 'x-rea-web-token': state.token };
  if (source.kind === 'path') {
    var payload = { path: source.path };
    if (provider) { payload.provider = provider; }
    headers['content-type'] = 'application/json';
    return { url: '/api/decompile', init: { method: 'POST', headers: headers, body: JSON.stringify(payload) } };
  }
  headers['content-type'] = 'application/octet-stream';
  headers['x-rea-filename'] = encodeURIComponent(source.file.name);
  return {
    url: '/api/decompile' + (provider ? '?provider=' + encodeURIComponent(provider) : ''),
    init: { method: 'POST', headers: headers, body: source.file },
  };
}

function appendDecompileError(slot, status, data, text) {
  var err = isRecord(data) && isRecord(data.error) ? data.error : null;
  var box = el('div', 'banner banner-error');
  box.setAttribute('role', 'alert');
  box.appendChild(el('strong', null, 'Export failed' + (status ? ' (HTTP ' + status + ')' : '')));
  box.appendChild(el('div', null, err && err.message ? String(err.message) : shorten(text || 'No response body.', 500)));
  if (err && err.code) { box.appendChild(kvList([['Code', err.code, 'mono']])); }
  var hint = failureHint(status);
  if (hint) { box.appendChild(el('div', 'hint', hint)); }
  if (data !== null) { box.appendChild(jsonDetails('Raw response', data)); }
  slot.appendChild(box);
}

function exportSummary(res, blob, secs, provider) {
  var cleanup = res.headers.get('x-rea-cleanup');
  var box = el('div', 'banner banner-ok');
  box.setAttribute('role', 'note');
  box.appendChild(el('strong', null, 'Export finished'));
  box.appendChild(kvList([
    ['File', downloadName(res), 'mono'],
    ['Size', fmtBytes(blob.size)],
    ['Duration', secs.toFixed(1) + ' s'],
    ['Provider', provider || 'automatic'],
    ['Upload cleanup', cleanup || undefined],
  ]));
  box.appendChild(el('div', 'hint', 'Function counts and per-function status are in manifest.json inside the zip.'));
  if (cleanup === 'failed') {
    var detail = res.headers.get('x-rea-cleanup-detail');
    var b = el('div', 'banner banner-error');
    b.setAttribute('role', 'alert');
    b.appendChild(el('strong', null, 'Cleanup: failed'));
    b.appendChild(el('div', null, detail ? decodeURIComponent(detail) : 'The temporary upload directory was retained.'));
    box.appendChild(b);
  }
  return box;
}

function runDecompile(provider) {
  var ws = state.workspace;
  if (state.busy || !state.lastSource || !ws) { return; }
  var gen = state.gen;
  var slot = ws.decompileSlot;
  var req = decompileRequest(state.lastSource, provider);
  var controller = new AbortController();
  state.controller = controller;
  state.startedAt = performance.now();
  state.busy = true;
  ws.select('decompiled');
  clearNode(slot);
  var progress = createProgress({
    steps: [{ id: 'decompile', label: 'Decompile and package (one provider session)' }],
    title: 'Export',
    line: 'One request decompiles every function in a single provider session, then builds the zip. Large targets take minutes; the server reports once at the end.',
    onCancel: function () { controller.abort(); },
  });
  slot.appendChild(progress.root);
  state.progress = progress;
  progress.start();
  ws.refreshExport();
  announce('Decompiled-code export started.');
  req.init.signal = controller.signal;
  var done = function (status, lineText) {
    var secs = finishRun();
    state.progress = null;
    progress.complete([status], lineText.replace('%s', secs.toFixed(1)));
    ws.refreshExport();
    return secs;
  };
  fetch(req.url, req.init)
    .then(function (res) {
      if (gen !== state.gen) { return; }
      var type = res.headers.get('content-type') || '';
      if (res.ok && type.indexOf('application/zip') === 0) {
        return res.blob().then(function (blob) {
          if (gen !== state.gen) { return; }
          var secs = done('ok', 'Export finished in %s s.');
          saveBlob(blob, downloadName(res));
          state.exportInfo = { name: downloadName(res), bytes: blob.size, seconds: secs };
          slot.appendChild(exportSummary(res, blob, secs, provider));
          announce('Export finished in ' + secs.toFixed(1) + ' seconds. The zip download started.');
        });
      }
      return readResponse(res).then(function (r) {
        if (gen !== state.gen) { return; }
        done('error', 'Export failed after %s s.');
        appendDecompileError(slot, res.status, r.data, r.text);
        announce('Export failed (HTTP ' + res.status + ').');
      });
    })
    .catch(function (err) {
      if (gen !== state.gen) { return; }
      if (err && err.name === 'AbortError') {
        var secs = finishRun();
        state.progress = null;
        progress.dispose();
        clearNode(slot);
        slot.appendChild(noticeBanner('warn', 'Export cancelled', 'Cancelled after ' + secs.toFixed(1) + ' s. No file was downloaded.'));
        ws.refreshExport();
        announce('Export cancelled.');
      } else {
        done('error', 'Export failed after %s s.');
        appendDecompileError(slot, 0, null, String((err && err.message) || err));
        announce('Export failed: network error.');
      }
    });
}

// Header-bar export control: disabled with a visible reason when no deep provider is usable.
function createExportControl() {
  var root = el('div', 'export-control');
  var select = null;
  var button = el('button', 'primary', 'Download decompiled code (.zip)');
  button.type = 'button';
  var reason = el('p', 'hint export-reason');
  reason.id = 'export-reason';
  button.addEventListener('click', function () { runDecompile(select ? select.value : ''); });
  root.appendChild(button);
  root.appendChild(reason);
  var control = { root: root };
  control.refresh = function () {
    var caps = state.capabilities;
    var providers = caps ? caps.providers : [];
    var usable = providers.filter(function (p) { return p.available === true; });
    if (select) { select.remove(); select = null; }
    if (usable.length > 1) {
      select = el('select');
      select.setAttribute('aria-label', 'Deep provider');
      var auto = el('option', null, 'Automatic provider');
      auto.value = '';
      select.appendChild(auto);
      usable.forEach(function (p) {
        var o = el('option', null, providerLabel(p));
        o.value = String(p.id);
        select.appendChild(o);
      });
      root.insertBefore(select, button);
    }
    var why = null;
    if (usable.length === 0) {
      why = caps && caps.status === 'error' ? caps.message : (!caps || caps.status === 'loading' ? 'Checking deep providers…' : 'No deep provider is available. Install or configure Ghidra, IDA or Hopper (see docs/installation.md).');
      var unavailable = providers.filter(function (p) { return p.available !== true; });
      if (unavailable.length > 0) {
        why += ' ' + unavailable.map(function (p) { return providerLabel(p) + ': ' + (p.reason || 'unavailable') + '.'; }).join(' ');
      }
    } else if (state.busy) {
      why = 'An analysis or export is running.';
    }
    button.disabled = usable.length === 0 || !state.lastSource || state.busy;
    if (why) { button.setAttribute('aria-describedby', 'export-reason'); } else { button.removeAttribute('aria-describedby'); }
    reason.textContent = why || '';
    reason.hidden = !why;
  };
  return control;
}
`;
