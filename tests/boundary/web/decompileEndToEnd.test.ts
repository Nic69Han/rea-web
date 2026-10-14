import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import { runDirectAnalysisSession } from "../../../src/application/DirectAnalysisSession.js";
import type { DirectAnalysisDependencies } from "../../../src/application/DirectAnalysisDependencies.js";
import type { JsonValue } from "../../../src/domain/jsonValue.js";
import { GhidraSessionError } from "../../../src/ghidra/GhidraSessionError.js";
import { err, ok } from "../../../src/domain/result.js";
import { createWebDecompiler } from "../../../src/web/decompileExport.js";
import { createGhidraFixtureSession } from "../mcp/ghidraMcpHarness.js";
import { post, start } from "./webHarness.js";

const procedure = (address: string, value: string, flags = {}) => ({
  address,
  value,
  procedure: { external: false, thunk: false, thunk_target: null, ...flags },
});

const readZip = async (bytes: Uint8Array): Promise<Map<string, string>> => {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const files = new Map<string, string>();
  for (const entry of await reader.getEntries())
    if (!entry.directory)
      files.set(entry.filename, await entry.getData(new TextWriter()));
  await reader.close();
  return files;
};

describe("decompiled export through the Ghidra provider fixture", () => {
  it("opens one provider session and zips pseudo-code with recorded failures", async () => {
    const operations: string[] = [];
    const { session, config, calls } = createGhidraFixtureSession(
      (operation, input) => {
        operations.push(operation);
        if (operation === "list_procedures")
          return Promise.resolve(
            ok<JsonValue>([
              procedure("0x401000", "main"),
              procedure("0x401100", "../../evil"),
              procedure("0x401200", "puts", { external: true }),
              procedure("0x401300", "extra"),
            ]),
          );
        if (operation === "procedure_pseudo_code") {
          if (input.procedure === "0x401100")
            return Promise.resolve(
              err(new GhidraSessionError("remote", "decompiler crashed")),
            );
          return Promise.resolve(
            ok<JsonValue>({
              value: `int f_${String(input.procedure)}(void) { return 1; }`,
              limitations: [],
            }),
          );
        }
        return Promise.reject(new Error(`unexpected ${operation}`));
      },
    );
    let opened = 0;
    const dependencies: DirectAnalysisDependencies = {
      readConfiguration: () => ok(config),
      createBinarySession: () => {
        opened += 1;
        return session;
      },
      createManagedBinarySession: () => {
        throw new Error("unused");
      },
    };
    const server = await start({
      capabilities: () =>
        Promise.resolve({
          deep_providers: [{ id: "ghidra", available: true }],
        }),
      decompile: createWebDecompiler({
        runDirectAnalysisSession: (path, options, work) =>
          runDirectAnalysisSession(dependencies, path, options, work),
        readCapabilities: () =>
          Promise.resolve({
            deep_providers: [{ id: "ghidra", available: true }],
          }),
      }),
    });
    const reply = await post(server, "/api/decompile", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: process.execPath,
        provider: "ghidra",
        max_functions: 2,
      }),
    });
    expect(reply.status, reply.body).toBe(200);
    expect(reply.headers["content-type"]).toBe("application/zip");
    expect(opened).toBe(1);
    expect(
      operations.filter((name) => name === "list_procedures"),
    ).toHaveLength(1);
    expect(
      calls.filter((name) => name === "procedure_pseudo_code"),
    ).toHaveLength(2);

    const files = await readZip(reply.bytes);
    const manifest = JSON.parse(files.get("manifest.json") ?? "") as {
      provider: { id: string };
      attempted: number;
      omitted: { count: number; truncated: boolean };
      skipped: { name: string; reason: string }[];
      counts: Record<string, number>;
      failures: { name: string; message: string }[];
      functions: {
        status: string;
        file: string | null;
        evidence_id: string | null;
      }[];
    };
    expect(manifest.provider.id).toBe("ghidra");
    expect(manifest.attempted).toBe(2);
    expect(manifest.omitted).toMatchObject({ count: 1, truncated: true });
    expect(manifest.skipped).toEqual([
      { name: "puts", address: "0x401200", reason: "external" },
    ]);
    expect(manifest.counts).toEqual({
      decompiled: 1,
      no_pseudo_code: 0,
      failed: 1,
    });
    expect(manifest.failures).toHaveLength(1);
    expect(manifest.failures[0]?.name).toBe("../../evil");
    const [main] = manifest.functions;
    expect(main?.status).toBe("decompiled");
    const source = files.get(main?.file ?? "missing") ?? "";
    expect(source).toContain("int f_0x401000(void)");
    expect(source).toContain(`evidence_id: ${main?.evidence_id ?? "missing"}`);
    expect([...files.keys()].every((name) => !name.includes(".."))).toBe(true);
    expect(files.get("README.md")).toContain("Truncated");
    expect(
      JSON.parse(files.get("evidence/0001_main_0x401000.json") ?? ""),
    ).toMatchObject({
      operation: "procedure_pseudo_code",
      provider: { id: "ghidra" },
    });
  });
});
