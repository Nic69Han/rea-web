import { describe, expect, it } from "vitest";

import { parseWebConfig, webHostAuthority } from "./config.js";

describe("parseWebConfig", () => {
  it("defaults to an ephemeral IPv4 loopback port and 256 MiB uploads", () => {
    expect(parseWebConfig({})).toEqual({
      ok: true,
      value: { host: "127.0.0.1", port: 0, maxUploadBytes: 268_435_456 },
    });
    expect(parseWebConfig({ REA_WEB_PORT: "", REA_WEB_HOST: "" }).ok).toBe(
      true,
    );
  });

  it("accepts the IPv6 loopback literal and explicit limits", () => {
    expect(
      parseWebConfig({
        REA_WEB_HOST: "::1",
        REA_WEB_PORT: "8080",
        REA_WEB_MAX_UPLOAD_BYTES: "1024",
      }),
    ).toEqual({
      ok: true,
      value: { host: "::1", port: 8080, maxUploadBytes: 1024 },
    });
  });

  it.each([
    "0.0.0.0",
    "localhost",
    "0:0:0:0:0:0:0:1",
    "192.168.0.1",
    "127.0.0.2",
  ])("rejects non-loopback-literal host %s without echoing it", (host) => {
    const result = parseWebConfig({ REA_WEB_HOST: host });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("ConfigurationError");
    expect(result.error.settings).toEqual([
      expect.objectContaining({ setting: "REA_WEB_HOST" }),
    ]);
    expect(JSON.stringify(result.error.settings)).not.toContain(host);
  });

  it.each([
    ["REA_WEB_PORT", "65536"],
    ["REA_WEB_PORT", "-1"],
    ["REA_WEB_PORT", "80x"],
    ["REA_WEB_MAX_UPLOAD_BYTES", "0"],
    ["REA_WEB_MAX_UPLOAD_BYTES", "1.5"],
    ["REA_WEB_MAX_UPLOAD_BYTES", "9999999999999999"],
  ])("rejects %s=%s", (setting, value) => {
    const result = parseWebConfig({ [setting]: value });
    expect(result).toMatchObject({
      ok: false,
      error: { settings: [expect.objectContaining({ setting })] },
    });
  });

  it("formats the Host header authority for both literals", () => {
    expect(webHostAuthority("127.0.0.1", 80)).toBe("127.0.0.1:80");
    expect(webHostAuthority("::1", 80)).toBe("[::1]:80");
  });
});
