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

  it("parses as a script", () => {
    expect(() => new Script(APP_JS, { filename: "app.js" })).not.toThrow();
  });
});
