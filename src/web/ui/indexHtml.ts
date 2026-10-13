export const INDEX_HTML: string = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>REA Local Analysis</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/assets/app.css">
<script src="/assets/app.js" defer></script>
</head>
<body>
<header class="app-header">
  <h1>REA &mdash; Local analysis</h1>
  <p>Static, read-only analysis. Files and paths stay on this machine.</p>
</header>
<main>
  <noscript><div class="banner banner-error">This page needs JavaScript.</div></noscript>
  <div id="token-alert" class="banner banner-error" role="alert" hidden>
    <strong>Access token missing.</strong>
    Open the full URL printed by <code>rea web</code> (it ends with <code>?token=&hellip;</code>) in this browser.
  </div>
  <section id="drop-zone" class="drop-zone" aria-labelledby="analyze-title">
    <h2 id="analyze-title">Analyze a target</h2>
    <form id="analyze-form" autocomplete="off">
      <div class="field-row">
        <label for="path-input">Local path (or paste / drop a file anywhere in this box)</label>
        <input id="path-input" name="path" type="text" spellcheck="false" placeholder="/path/to/binary-or-app">
        <button id="analyze-btn" class="primary" type="submit">Analyze</button>
        <button id="cancel-btn" type="button" hidden>Cancel</button>
      </div>
    </form>
    <p class="hint">Drop a file here or press Ctrl/Cmd+V with a file on the clipboard to upload it for analysis. Pasted text goes into the path field.</p>
    <p id="file-info" class="hint" hidden></p>
    <div id="status" class="status" role="status" aria-live="polite">
      <span id="spinner" class="spinner" aria-hidden="true" hidden></span>
      <span id="status-text"></span>
    </div>
  </section>
  <section id="results" aria-live="polite" aria-label="Results"></section>
</main>
<footer>REA local web UI. Results are read-only observations; check coverage and limitations before drawing conclusions.</footer>
</body>
</html>
`;
