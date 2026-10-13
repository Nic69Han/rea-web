import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import { APP_CSS, APP_JS, INDEX_HTML } from "./assets.js";

describe("web UI assets", () => {
  it("exports non-empty strings", () => {
    for (const asset of [INDEX_HTML, APP_JS, APP_CSS]) {
      expect(typeof asset).toBe("string");
      expect(asset.length).toBeGreaterThan(100);
    }
  });

  it("keeps the HTML compatible with a script-src 'self' / style-src 'self' CSP", () => {
    expect(INDEX_HTML).toContain('href="/assets/app.css"');
    expect(INDEX_HTML).toContain('src="/assets/app.js"');
    for (const match of INDEX_HTML.matchAll(
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      expect(match[1]?.trim()).toBe("");
    }
    expect(INDEX_HTML).not.toMatch(/<style\b/i);
    expect(INDEX_HTML).not.toMatch(/\sstyle\s*=/i);
    expect(INDEX_HTML).not.toMatch(/\son[a-z]+\s*=/i);
    expect(INDEX_HTML).not.toMatch(/https?:\/\//i);
  });

  it("does not use HTML-injecting or dynamic-code APIs in the browser script", () => {
    for (const forbidden of [
      "innerHTML",
      "outerHTML",
      "insertAdjacentHTML",
      "document.write",
      "eval(",
      "new Function",
    ]) {
      expect(APP_JS).not.toContain(forbidden);
    }
    expect(APP_JS).not.toMatch(/\.setAttribute\(\s*['"]style['"]/);
    expect(APP_JS).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  });

  it("offers the decompiled-code download through a revoked object URL", () => {
    for (const expected of [
      "Download decompiled code (.zip)",
      "/api/decompile",
      "/api/capabilities",
      "URL.createObjectURL",
      "URL.revokeObjectURL",
    ])
      expect(APP_JS).toContain(expected);
  });

  it("ships the three-stage flow: idle drop target, analysis rosette, results workspace", () => {
    for (const id of [
      'id="stage-idle"',
      'id="stage-analyzing"',
      'id="stage-results"',
      'id="drop-zone"',
      'id="file-input"',
      'id="path-details"',
      'id="live"',
    ])
      expect(INDEX_HTML).toContain(id);
    expect(INDEX_HTML).toContain("Drop a binary, app bundle or archive here");
    expect(INDEX_HTML).toMatch(/aria-live="polite"/);
    for (const expected of [
      "createProgress",
      "buildRosette",
      "role: 'img'",
      "inspect_artifact",
      "trace_dylib_resolution",
      "running…",
      "not applicable",
      "New analysis",
      "Overview",
      "Evidence (",
      "Decompiled",
      "prefers-reduced-motion",
    ])
      expect(APP_JS + APP_CSS).toContain(expected);
    expect(APP_JS).toContain("'overview'");
    expect(APP_JS).toContain("'graphs'");
  });

  it("does not claim progress the server never reports", () => {
    expect(APP_JS).not.toMatch(
      /Math\.random\(\)\s*\*\s*100|\d+\s*%\s*complete/i,
    );
    expect(APP_JS).toContain("Upload + artifact inventory");
  });

  it("defines colors as tokens with light, dark and explicit-theme variants", () => {
    expect(APP_CSS).toContain("@media (prefers-color-scheme: dark)");
    expect(APP_CSS).toContain(':root:not([data-theme="light"])');
    expect(APP_CSS).toContain(':root[data-theme="dark"]');
    expect(APP_CSS).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    const rules = APP_CSS.slice(APP_CSS.indexOf("* { box-sizing"));
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("parses as a script", () => {
    expect(() => new Script(APP_JS, { filename: "app.js" })).not.toThrow();
  });
});
