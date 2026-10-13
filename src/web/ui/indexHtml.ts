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
<body data-stage="idle">
<header class="app-header">
  <span class="brand">REA</span>
  <span class="tagline">Local, read-only analysis. Files and paths stay on this machine.</span>
</header>
<main>
  <noscript><div class="banner banner-error">This page needs JavaScript.</div></noscript>
  <div id="token-alert" class="banner banner-error" role="alert" hidden>
    <strong>Access token missing.</strong>
    Open the full URL printed by <code>rea web</code> (it ends with <code>?token=&hellip;</code>) in this browser.
  </div>
  <p id="live" class="sr-only" role="status" aria-live="polite"></p>

  <section id="stage-idle" class="stage stage-idle" aria-labelledby="idle-title">
    <div id="drop-zone" class="drop-zone" role="group" aria-labelledby="idle-title">
      <svg class="drop-icon" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" focusable="false">
        <path d="M24 31V9M14 19l10-10 10 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 31v7a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3v-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h1 id="idle-title">Drop a binary, app bundle or archive here</h1>
      <p class="drop-or">
        <span>or</span>
        <button id="pick-btn" class="primary" type="button">choose a file</button>
      </p>
      <input id="file-input" type="file" hidden>
    </div>
    <details id="path-details" class="path-details">
      <summary>or enter a local path</summary>
      <form id="analyze-form" autocomplete="off">
        <label for="path-input" class="sr-only">Local path</label>
        <input id="path-input" name="path" type="text" spellcheck="false" placeholder="/path/to/binary-or-app">
        <button id="analyze-btn" class="primary" type="submit">Analyze</button>
      </form>
    </details>
    <div id="idle-notice" class="idle-notice"></div>
  </section>

  <section id="stage-analyzing" class="stage stage-analyzing" aria-labelledby="analyzing-title" hidden>
    <h2 id="analyzing-title" tabindex="-1"></h2>
    <div id="analyzing-host"></div>
  </section>

  <section id="stage-results" class="stage stage-results" aria-labelledby="results-title" hidden>
    <h2 id="results-title" class="sr-only" tabindex="-1">Analysis results</h2>
    <div id="results-bar"></div>
    <div id="results-body" class="workspace"></div>
    <p class="footnote">Results are read-only observations; check coverage and limitations before drawing conclusions.</p>
  </section>
</main>
</body>
</html>
`;
