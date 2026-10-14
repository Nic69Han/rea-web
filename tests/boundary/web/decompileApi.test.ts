import { stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createWebCapabilitiesReader } from "../../../src/web/capabilities.js";
import type {
  DecompileRequest,
  WebDecompiler,
} from "../../../src/web/decompileExport.js";
import { post, send, start } from "./webHarness.js";

const noProvider = () =>
  Promise.resolve({
    deep_providers: [
      { id: "ghidra" as const, available: false, reason: "not configured" },
      { id: "ida" as const, available: false, reason: "not configured" },
    ],
  });

const JSON_HEADERS = { "content-type": "application/json" };
const ZIP = new Uint8Array([
  0x50,
  0x4b,
  5,
  6,
  ...Array.from({ length: 18 }, () => 0),
]);

describe("GET /api/capabilities", () => {
  it("reports deep providers from the shared availability logic", async () => {
    const server = await start();
    const reply = await send(server, {
      path: "/api/capabilities",
      headers: { "x-rea-web-token": server.token },
    });
    expect(reply.status).toBe(200);
    const body = JSON.parse(reply.body) as {
      deep_providers: { id: string; available: boolean; reason?: string }[];
    };
    expect(body.deep_providers.length).toBeGreaterThan(0);
    for (const provider of body.deep_providers) {
      expect(["ghidra", "ida", "hopper"]).toContain(provider.id);
      if (!provider.available)
        expect(provider.reason).toEqual(expect.any(String));
    }
  });

  it("applies the token, method and Host guards", async () => {
    const server = await start();
    const missing = await send(server, { path: "/api/capabilities" });
    expect(missing.status).toBe(403);
    const wrongMethod = await post(server, "/api/capabilities", {});
    expect(wrongMethod.status).toBe(405);
    const foreign = await send(server, {
      path: "/api/capabilities",
      headers: {
        "x-rea-web-token": server.token,
        origin: "http://evil.example",
      },
    });
    expect(foreign.status).toBe(403);
  });

  it("reports every provider unavailable when status is unreadable", async () => {
    const reader = createWebCapabilitiesReader(() =>
      Promise.resolve({ error: { message: "bad configuration" } }),
    );
    const { deep_providers: providers } = await reader();
    expect(providers.map(({ available }) => available)).toEqual([
      false,
      false,
      false,
    ]);
    expect(providers[0]?.reason).toBe("bad configuration");
  });
});

describe("POST /api/decompile requests", () => {
  it("answers 424 deep_provider_unavailable without a provider", async () => {
    const server = await start({ capabilities: noProvider });
    const reply = await post(server, "/api/decompile", {
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "/does/not/matter" }),
    });
    expect(reply.status).toBe(424);
    const { error } = JSON.parse(reply.body) as {
      error: { code: string; message: string };
    };
    expect(error.code).toBe("deep_provider_unavailable");
    expect(error.message).toContain("Ghidra, IDA or Hopper");
    expect(error.message).toContain("docs/installation.md");
  });

  it("applies the token, method, Origin and content-type guards", async () => {
    const server = await start({ capabilities: noProvider });
    const body = JSON.stringify({ path: "/x" });
    expect(
      (
        await post(server, "/api/decompile", {
          token: null,
          headers: JSON_HEADERS,
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(server, "/api/decompile", {
          token: "wrong",
          headers: JSON_HEADERS,
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(server, "/api/decompile", {
          headers: { ...JSON_HEADERS, origin: "http://evil.example" },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(server, {
          path: "/api/decompile",
          headers: { "x-rea-web-token": server.token },
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await post(server, "/api/decompile", {
          headers: { "content-type": "text/plain" },
          body,
        })
      ).status,
    ).toBe(400);
  });

  it.each([
    [{ path: "/x", provider: "binja" }],
    [{ path: "/x", max_functions: 2001 }],
    [{ path: "/x", max_functions: 0 }],
    [{ path: "/x", max_functions: 1.5 }],
    [{ path: "/x", extra: true }],
    [{ provider: "ghidra" }],
  ])("rejects an invalid body %j", async (payload) => {
    let called = false;
    const server = await start({
      decompile: () => {
        called = true;
        return Promise.reject(new Error("must not run"));
      },
    });
    const reply = await post(server, "/api/decompile", {
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body).error.code).toBe("invalid_request");
    expect(called).toBe(false);
  });
});

describe("POST /api/decompile responses", () => {
  it("streams the zip with a sanitized attachment name and defaults", async () => {
    const seen: DecompileRequest[] = [];
    const server = await start({
      decompile: (request) => {
        seen.push(request);
        return Promise.resolve({ bytes: ZIP, filename: "a-decompiled.zip" });
      },
    });
    const reply = await post(server, "/api/decompile", {
      headers: JSON_HEADERS,
      body: JSON.stringify({
        path: "/some/a",
        provider: "ghidra",
        max_functions: 7,
      }),
    });
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("application/zip");
    expect(reply.headers["content-disposition"]).toBe(
      'attachment; filename="a-decompiled.zip"',
    );
    expect(reply.headers["x-rea-cleanup"]).toBe("not_needed");
    expect(reply.bytes.equals(Buffer.from(ZIP))).toBe(true);
    expect(seen[0]).toMatchObject({
      provider: "ghidra",
      maxFunctions: 7,
      source: { kind: "path", path: "/some/a" },
    });
    await post(server, "/api/decompile", {
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "/b" }),
    });
    expect(seen[1]).toMatchObject({ provider: undefined, maxFunctions: 200 });
  });

  it("keeps an upload until the export finishes, then removes it", async () => {
    let stagedPath = "";
    let existedDuringExport = false;
    const server = await start({
      decompile: async (request) => {
        if (request.source.kind !== "upload")
          throw new Error("expected upload");
        stagedPath = request.source.localPath;
        existedDuringExport = (await stat(stagedPath)).isFile();
        return { bytes: ZIP, filename: "up-decompiled.zip" };
      },
    });
    const reply = await post(
      server,
      "/api/decompile?provider=ida&max_functions=3",
      {
        headers: {
          "content-type": "application/octet-stream",
          "x-rea-filename": "up.bin",
        },
        body: Buffer.from("bytes"),
      },
    );
    expect(reply.status).toBe(200);
    expect(reply.headers["x-rea-cleanup"]).toBe("removed");
    expect(existedDuringExport).toBe(true);
    await expect(stat(stagedPath)).rejects.toThrow();
  });

  it("shares the single-work lock with analyze", async () => {
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const running = new Promise<void>((resolve) => (started = resolve));
    const decompile: WebDecompiler = () =>
      new Promise((resolve) => {
        started();
        release = () => resolve({ bytes: ZIP, filename: "x-decompiled.zip" });
      });
    const server = await start({ decompile });
    const first = post(server, "/api/decompile", {
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "/x" }),
    });
    await running;
    const analyze = await post(server, "/api/analyze", {
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "/x" }),
    });
    const second = await post(server, "/api/decompile", {
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: "/x" }),
    });
    expect(analyze.status).toBe(409);
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
});
