export const DECOMPILE_JS: string = String.raw`
var DEEP_LABELS = { ghidra: 'Ghidra', ida: 'IDA', hopper: 'Hopper' };

function loadCapabilities() {
  state.capabilities = { status: 'loading', providers: [] };
  return fetch('/api/capabilities', { headers: { 'x-rea-web-token': state.token } })
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

function showDecompileError(slot, status, data, text) {
  clearNode(slot);
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

function runDecompile(slot, provider) {
  if (state.busy || !state.lastSource) { return; }
  var req = decompileRequest(state.lastSource, provider);
  var controller = new AbortController();
  state.controller = controller;
  state.startedAt = performance.now();
  setBusy(true);
  clearNode(slot);
  var tick = function () { setStatus('Decompiling — ' + elapsedSeconds().toFixed(1) + ' s (one provider session; large targets take minutes)', ''); };
  tick();
  state.timer = setInterval(tick, 200);
  req.init.signal = controller.signal;
  fetch(req.url, req.init)
    .then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (res.ok && type.indexOf('application/zip') === 0) {
        return res.blob().then(function (blob) {
          var secs = finishRun();
          saveBlob(blob, downloadName(res));
          setStatus('Export finished in ' + secs.toFixed(1) + ' s (' + fmtBytes(blob.size) + ').', 'ok');
          if (res.headers.get('x-rea-cleanup') === 'failed') {
            var detail = res.headers.get('x-rea-cleanup-detail');
            var b = el('div', 'banner banner-error');
            b.setAttribute('role', 'alert');
            b.appendChild(el('strong', null, 'Cleanup: failed'));
            b.appendChild(el('div', null, detail ? decodeURIComponent(detail) : 'The temporary upload directory was retained.'));
            slot.appendChild(b);
          }
        });
      }
      return readResponse(res).then(function (r) {
        var secs = finishRun();
        showDecompileError(slot, res.status, r.data, r.text);
        setStatus('Export failed (HTTP ' + res.status + ') after ' + secs.toFixed(1) + ' s.', 'error');
      });
    })
    .catch(function (err) {
      var secs = finishRun();
      if (err && err.name === 'AbortError') {
        setStatus('Export cancelled after ' + secs.toFixed(1) + ' s.', 'warn');
      } else {
        showDecompileError(slot, 0, null, String((err && err.message) || err));
        setStatus('Network error after ' + secs.toFixed(1) + ' s.', 'error');
      }
    });
}

function decompileCard() {
  var card = el('section', 'card');
  card.appendChild(el('h2', null, 'Decompiled code'));
  var caps = state.capabilities;
  var providers = caps ? caps.providers : [];
  var usable = providers.filter(function (p) { return p.available === true; });
  card.appendChild(el('p', 'hint', 'Runs the deep provider once over this target and downloads pseudo-code as a zip. Pseudo-code is derived, provider-specific output, not original source.'));
  var row = el('div', 'field-row');
  var select = null;
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
    row.appendChild(select);
  }
  var button = el('button', 'primary', 'Download decompiled code (.zip)');
  button.type = 'button';
  var slot = el('div');
  button.disabled = usable.length === 0 || !state.lastSource || state.busy;
  button.addEventListener('click', function () { runDecompile(slot, select ? select.value : ''); });
  row.appendChild(button);
  card.appendChild(row);
  if (usable.length === 0) {
    var why = caps && caps.status === 'error' ? caps.message : (caps && caps.status === 'loading' ? 'Checking deep providers…' : 'No deep provider is available. Install or configure Ghidra, IDA or Hopper (see docs/installation.md).');
    var note = el('div', 'banner banner-warn');
    note.appendChild(el('div', null, why));
    var unavailable = providers.filter(function (p) { return p.available !== true; });
    if (unavailable.length > 0) {
      note.appendChild(listOf(unavailable.map(function (p) { return providerLabel(p) + ': ' + (p.reason || 'unavailable'); })));
    }
    card.appendChild(note);
  }
  card.appendChild(slot);
  return card;
}
`;
