import { readdir, readFile, stat } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { RunningWebServer } from "../../../src/web/server.js";
import type { WebAnalysisResponse } from "../../../src/web/types.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import {
  writeElfExecutable,
  writeMachoApp,
  writeMachoExecutable,
} from "../../fixtures/webTargets.js";
import { post, send, start, type Reply } from "./webHarness.js";

const api = (
  server: RunningWebServer,
  options: Parameters<typeof post>[2],
): Promise<Reply> => post(server, "/api/analyze", options);

const analyzePath = async (
  server: RunningWebServer,
  path: string,
): Promise<WebAnalysisResponse> => {
  const reply = await api(server, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  expect(reply.status, reply.body).toBe(200);
  return JSON.parse(reply.body) as WebAnalysisResponse;
};

describe("request guards", () => {
  it("rejects requests without the token and never echoes it", async () => {
    const server = await start();
    const page = await send(server, { path: "/" });
    const wrongPage = await send(server, { path: "/?token=wrong" });
    const missing = await api(server, { token: null, body: "{}" });
    const wrong = await api(server, { token: "wrong", body: "{}" });
    for (const reply of [page, wrongPage, missing, wrong]) {
      expect(reply.status).toBe(403);
      expect(reply.body).not.toContain(server.token);
    }
  });

  it("rejects a Host header that is not the bound authority", async () => {
    const server = await start();
    for (const host of [
      "evil.example",
      `evil.example:${String(server.port)}`,
    ]) {
      const reply = await send(server, {
        path: `/?token=${server.token}`,
        headers: { host },
      });
      expect(reply.status, host).toBe(403);
      expect(JSON.parse(reply.body)).toMatchObject({
        error: { code: "forbidden_host" },
      });
    }
  });

  it("rejects a foreign Origin and accepts the server's own", async () => {
    const server = await start();
    const body = JSON.stringify({ path: "/nonexistent" });
    const foreign = await api(server, {
      headers: {
        "content-type": "application/json",
        origin: "http://evil.example",
      },
      body,
    });
    expect(foreign.status).toBe(403);
    expect(JSON.parse(foreign.body)).toMatchObject({
      error: { code: "forbidden_origin" },
    });
    const own = await api(server, {
      headers: { "content-type": "application/json", origin: server.origin },
      body,
    });
    expect(own.status).toBe(200);
  });

  it("serves the UI with security headers on every response", async () => {
    const server = await start();
    const page = await send(server, { path: `/?token=${server.token}` });
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    const rejected = await send(server, { path: "/" });
    for (const reply of [page, rejected]) {
      expect(reply.headers["content-security-policy"]).toContain(
        "default-src 'self'",
      );
      expect(reply.headers["x-content-type-options"]).toBe("nosniff");
      expect(reply.headers["referrer-policy"]).toBe("no-referrer");
      expect(reply.headers["cache-control"]).toBe("no-store");
    }
    expect((await send(server, { path: "/assets/app.js" })).status).toBe(200);
    expect((await send(server, { path: "/assets/app.css" })).status).toBe(200);
    expect((await send(server, { path: "/nope" })).status).toBe(404);
    expect(
      (
        await send(server, {
          path: "/api/analyze",
          headers: { "x-rea-web-token": server.token },
        })
      ).status,
    ).toBe(405);
  });
});

describe("request bodies", () => {
  it.each([
    ["invalid JSON", "application/json", "{not json"],
    ["unknown JSON member", "application/json", '{"path":"/x","extra":1}'],
    ["empty path", "application/json", '{"path":""}'],
    ["non-string path", "application/json", '{"path":3}'],
    ["unsupported content type", "text/plain", "path"],
  ])("answers 400 for %s", async (_name, contentType, body) => {
    const server = await start();
    const reply = await api(server, {
      headers: { "content-type": contentType },
      body,
    });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body).error.code).toEqual(expect.any(String));
  });

  it("answers 413 for an oversize JSON body", async () => {
    const server = await start();
    const reply = await api(server, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "x".repeat(70_000) }),
    });
    expect(reply.status).toBe(413);
  });

  it("answers 413 for an oversize upload and removes its directory", async () => {
    const temporary = await createTestTempDirectory("rea-web-tmp-");
    vi.stubEnv("TMPDIR", temporary);
    const server = await start({ maxUploadBytes: 1024 });
    const declared = await api(server, {
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.alloc(4096, 1),
    });
    expect(declared.status).toBe(413);
    // Chunked bodies declare no length, so the limit applies while streaming.
    const streamed = await new Promise<number>((resolve, reject) => {
      const outgoing = request(
        {
          host: "127.0.0.1",
          port: server.port,
          method: "POST",
          path: "/api/analyze",
          headers: {
            "x-rea-web-token": server.token,
            "content-type": "application/octet-stream",
            "transfer-encoding": "chunked",
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      outgoing.on("error", reject);
      outgoing.write(Buffer.alloc(800, 1));
      outgoing.write(Buffer.alloc(800, 1));
      outgoing.end();
    });
    expect(streamed).toBe(413);
    expect(await readdir(temporary)).toEqual([]);
  });
});

describe("analysis", () => {
  it("projects a Mach-O path into containment and dylib graphs", async () => {
    const root = await createTestTempDirectory("rea-web-macho-");
    const path = await writeMachoExecutable(root, [
      "/usr/lib/libSystem.B.dylib",
    ]);
    const response = await analyzePath(await start(), path);
    expect(response.target).toMatchObject({
      input_kind: "path",
      display_name: "tool",
      local_path: path,
      size_bytes: (await stat(path)).size,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(response.cleanup).toEqual({ status: "not_needed" });
    expect(
      response.operations.map(({ operation, status }) => [operation, status]),
    ).toEqual([
      ["inspect_artifact", "ok"],
      ["trace_dylib_resolution", "ok"],
    ]);
    expect(response.operations[1]?.evidence).toMatchObject({
      operation: "trace_dylib_resolution",
    });
    expect(response.graphs.map(({ graph_id: id }) => id)).toEqual([
      "artifact-containment",
      "dylib-dependencies",
    ]);
    const dylibs = response.graphs[1];
    expect(dylibs?.edges).toEqual([
      expect.objectContaining({
        relation: "LC_LOAD_DYLIB",
        attributes: expect.objectContaining({
          install_name: "/usr/lib/libSystem.B.dylib",
        }),
      }),
    ]);
  });

  it("traces an app bundle through relative paths", async () => {
    const root = await createTestTempDirectory("rea-web-app-");
    const app = await writeMachoApp(root);
    const response = await analyzePath(await start(), app);
    expect(response.target.size_bytes).toBeNull();
    expect(response.target.sha256).toBeNull();
    const resolutions = response.graphs
      .find(({ graph_id: id }) => id === "dylib-dependencies")
      ?.edges.map(({ resolution }) => resolution);
    expect(resolutions).toEqual(["resolved", "unresolved"]);
  });

  it("reports the dylib trace as not applicable for an ELF target", async () => {
    const root = await createTestTempDirectory("rea-web-elf-");
    const response = await analyzePath(
      await start(),
      await writeElfExecutable(root),
    );
    expect(response.operations[0]?.status).toBe("ok");
    expect(response.operations[1]).toMatchObject({
      operation: "trace_dylib_resolution",
      status: "not_applicable",
      reason: expect.stringContaining("elf"),
    });
    expect(response.operations[1]).not.toHaveProperty("evidence");
    expect(response.graphs.map(({ graph_id: id }) => id)).toEqual([
      "artifact-containment",
    ]);
  });

  it("keeps a projected provider error for a missing path", async () => {
    const response = await analyzePath(await start(), "/definitely/not/here");
    expect(response.operations[0]).toMatchObject({
      status: "error",
      error: expect.objectContaining({ error: "Analysis failed" }),
    });
    expect(response.operations[1]?.status).toBe("error");
    expect(response.graphs).toEqual([]);
  });

  it("analyzes an upload under a sanitized name and removes its directory", async () => {
    const root = await createTestTempDirectory("rea-web-fixture-src-");
    const bytes = await readFile(
      await writeMachoExecutable(root, ["/usr/lib/libz.dylib"]),
    );
    const temporary = await createTestTempDirectory("rea-web-upload-tmp-");
    vi.stubEnv("TMPDIR", temporary);
    const reply = await api(await start(), {
      headers: {
        "content-type": "application/octet-stream",
        "x-rea-filename": encodeURIComponent("../../evil dir/my tool.bin"),
      },
      body: bytes,
    });
    expect(reply.status, reply.body).toBe(200);
    const response = JSON.parse(reply.body) as WebAnalysisResponse;
    expect(response.target).toMatchObject({
      input_kind: "upload",
      display_name: "my tool.bin",
      size_bytes: bytes.length,
    });
    expect(response.target.local_path.startsWith(temporary)).toBe(true);
    expect(response.cleanup).toEqual({ status: "removed" });
    expect(
      response.graphs.some(({ graph_id: id }) => id === "dylib-dependencies"),
    ).toBe(true);
    await expect(stat(response.target.local_path)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readdir(temporary)).toEqual([]);
  });
});

describe("concurrency and cancellation", () => {
  it("answers 409 while an analysis runs and aborts it on disconnect", async () => {
    let aborted: (() => void) | undefined;
    const abortedPromise = new Promise<void>((resolve) => (aborted = resolve));
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    const server = await start({
      analyze: (_source, signal) =>
        new Promise((_resolve, reject) => {
          started?.();
          signal.addEventListener("abort", () => {
            aborted?.();
            reject(new Error("cancelled"));
          });
        }),
    });
    const first = request({
      host: "127.0.0.1",
      port: server.port,
      method: "POST",
      path: "/api/analyze",
      headers: {
        host: `127.0.0.1:${String(server.port)}`,
        "x-rea-web-token": server.token,
        "content-type": "application/json",
      },
    });
    first.on("error", () => undefined);
    first.end(JSON.stringify({ path: "/slow" }));
    await startedPromise;
    const second = await api(server, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/other" }),
    });
    expect(second.status).toBe(409);
    first.destroy();
    await abortedPromise;
    // The slot frees once the cancelled analysis settles.
    await vi.waitFor(async () => {
      const retry = await api(server, {
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(retry.status).toBe(400);
    });
  });
});

it("retains every upload path inside the staging root only", async () => {
  const temporary = await createTestTempDirectory("rea-web-root-tmp-");
  vi.stubEnv("TMPDIR", temporary);
  let seen = "";
  const server = await start({
    analyze: async (source) => {
      if (source.kind === "upload") {
        seen = source.localPath;
        expect((await stat(source.localPath)).mode & 0o777).toBe(0o600);
        expect((await stat(join(source.localPath, ".."))).mode & 0o777).toBe(
          0o700,
        );
      }
      return {
        target: {
          input_kind: "upload",
          display_name: "x",
          local_path: "x",
          size_bytes: null,
          sha256: null,
        },
        operations: [],
        graphs: [],
      };
    },
  });
  const reply = await api(server, {
    headers: { "content-type": "application/octet-stream" },
    body: Buffer.from("abc"),
  });
  expect(reply.status).toBe(200);
  expect(seen).not.toBe("");
  expect(await readdir(temporary)).toEqual([]);
});
