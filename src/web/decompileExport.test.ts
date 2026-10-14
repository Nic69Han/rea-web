import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import type { DirectSessionCall } from "../application/DirectAnalysisSession.js";
import type { DirectAnalysis } from "../composition/directAnalysis.js";
import { createEvidence } from "../domain/evidence.js";
import type { JsonValue } from "../domain/jsonValue.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import {
  collectDecompilation,
  createWebDecompiler,
} from "./decompileExport.js";
import type { ExportTarget } from "./decompileZip.js";
import { HttpRejection } from "./http.js";

const PROVIDER = { id: "ghidra", name: "Ghidra", version: "12.1.4" };
const TARGET: ExportTarget = {
  display_name: "t",
  input_kind: "path",
  local_path: "/t",
  sha256: "b".repeat(64),
  format: "elf",
  architecture: "x86_64",
};

const evidence = (operation: string, result: JsonValue): JsonValue =>
  createEvidence(undefined, PROVIDER, {
    operation,
    parameters: {},
    result,
    limitations: ["Pseudocode is decompiler output."],
  });

const procedures = (count: number): JsonValue =>
  Array.from({ length: count }, (_, index) => ({
    address: `0x${(0x1000 + index).toString(16)}`,
    value: `f${String(index)}`,
  }));

/** Fake session call: scripted listing plus per-address pseudo-code. */
const fakeCall = (
  listing: JsonValue,
  pseudo: (address: string) => JsonValue | Error,
) => {
  const requested: string[] = [];
  const call: DirectSessionCall = (tool, arguments_) => {
    if (tool === "list_procedures")
      return Promise.resolve(
        Array.isArray(listing) ? evidence("list_procedures", listing) : listing,
      );
    const address = String(arguments_.procedure);
    requested.push(address);
    const value = pseudo(address);
    return value instanceof Error
      ? Promise.reject(value)
      : Promise.resolve(value);
  };
  return { call, requested };
};

const signal = new AbortController().signal;

describe("collectDecompilation", () => {
  it("records failures and empty output without stopping", async () => {
    const { call } = fakeCall(procedures(4), (address) => {
      if (address === "0x1001")
        return { error: "Analysis failed", code: "boom", message: "bad" };
      if (address === "0x1002") return new Error("provider died");
      if (address === "0x1003") return evidence("procedure_pseudo_code", null);
      return evidence("procedure_pseudo_code", "int f0(void){return 0;}");
    });
    const result = await collectDecompilation(call, TARGET, {
      maxFunctions: 10,
      signal,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.collected.functions.map((f) => f.status)).toEqual([
      "decompiled",
      "failed",
      "failed",
      "no_pseudo_code",
    ]);
    expect(result.collected.functions[1]?.failure).toEqual({
      code: "boom",
      message: "bad",
    });
    expect(result.collected.functions[2]?.failure?.message).toBe(
      "provider died",
    );
    expect(result.collected.provider).toEqual(PROVIDER);
  });

  it("truncates to max_functions in provider order and counts the rest", async () => {
    const { call, requested } = fakeCall(procedures(5), () =>
      evidence("procedure_pseudo_code", "x"),
    );
    const result = await collectDecompilation(call, TARGET, {
      maxFunctions: 2,
      signal,
    });
    if (!result.ok) throw new Error(result.message);
    expect(requested).toEqual(["0x1000", "0x1001"]);
    expect(result.collected.proceduresTotal).toBe(5);
    expect(result.collected.functions).toHaveLength(2);
  });

  it("skips external and thunk procedures without spending the budget", async () => {
    const listing: JsonValue = [
      {
        address: "0x1",
        value: "puts",
        procedure: { external: true, thunk: false },
      },
      {
        address: "0x2",
        value: "jmp",
        procedure: { external: false, thunk: true },
      },
      {
        address: "0x3",
        value: "main",
        procedure: { external: false, thunk: false },
      },
    ];
    const { call, requested } = fakeCall(listing, () =>
      evidence("procedure_pseudo_code", "x"),
    );
    const result = await collectDecompilation(call, TARGET, {
      maxFunctions: 1,
      signal,
    });
    if (!result.ok) throw new Error(result.message);
    expect(requested).toEqual(["0x3"]);
    expect(result.collected.skipped.map((s) => s.reason)).toEqual([
      "external",
      "thunk",
    ]);
  });

  it("reports a failed listing", async () => {
    const { call } = fakeCall(
      { error: "Analysis failed", message: "no analysis" },
      () => new Error("unused"),
    );
    const result = await collectDecompilation(call, TARGET, {
      maxFunctions: 1,
      signal,
    });
    expect(result).toEqual({
      ok: false,
      message: "Procedure listing failed: no analysis",
    });
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    const { call } = fakeCall(procedures(3), () => {
      controller.abort();
      return evidence("procedure_pseudo_code", "x");
    });
    await expect(
      collectDecompilation(call, TARGET, {
        maxFunctions: 3,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

const sessionTarget = {
  sha256: "c".repeat(64),
  format: "elf",
  architecture: "x86_64",
} as unknown as BinaryTarget;

const fakeSession = (
  call: DirectSessionCall,
  calls: { path?: string; providerId?: string }[] = [],
): DirectAnalysis["runDirectAnalysisSession"] =>
  (async (path, options, work) => {
    calls.push({
      path,
      ...(options.providerId === undefined
        ? {}
        : { providerId: options.providerId }),
    });
    return {
      ok: true,
      value: { value: await work({ target: sessionTarget, call }) },
    };
  }) as DirectAnalysis["runDirectAnalysisSession"];

const caps =
  (
    providers: {
      id: "ghidra" | "ida" | "hopper";
      available: boolean;
      reason?: string;
    }[],
  ) =>
  () =>
    Promise.resolve({ deep_providers: providers });

describe("createWebDecompiler", () => {
  it("rejects with 424 before opening anything when no provider is available", async () => {
    const calls: { path?: string }[] = [];
    const decompile = createWebDecompiler({
      runDirectAnalysisSession: fakeSession(
        fakeCall([], () => new Error("x")).call,
        calls,
      ),
      readCapabilities: caps([
        { id: "ghidra", available: false, reason: "not configured" },
      ]),
    });
    const rejection: unknown = await decompile(
      {
        source: { kind: "path", path: "/t" },
        provider: undefined,
        maxFunctions: 1,
      },
      signal,
    ).catch((cause: unknown) => cause);
    expect(rejection).toBeInstanceOf(HttpRejection);
    expect(rejection).toMatchObject({
      status: 424,
      code: "deep_provider_unavailable",
    });
    expect((rejection as HttpRejection).message).toContain(
      "docs/installation.md",
    );
    expect(calls).toEqual([]);
  });

  it("selects the only available provider and builds a zip from one session", async () => {
    const calls: { path?: string; providerId?: string }[] = [];
    const { call, requested } = fakeCall(procedures(2), () =>
      evidence("procedure_pseudo_code", "int main(void){}"),
    );
    const decompile = createWebDecompiler({
      runDirectAnalysisSession: fakeSession(call, calls),
      readCapabilities: caps([
        { id: "ghidra", available: true },
        { id: "ida", available: false, reason: "x" },
      ]),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    const zip = await decompile(
      {
        source: {
          kind: "upload",
          displayName: "up.bin",
          localPath: "/tmp/up.bin",
        },
        provider: undefined,
        maxFunctions: 5,
      },
      signal,
    );
    expect(calls).toEqual([{ path: "/tmp/up.bin", providerId: "ghidra" }]);
    expect(requested).toHaveLength(2);
    expect(zip.filename).toBe("up.bin-decompiled.zip");
    const reader = new ZipReader(new Uint8ArrayReader(zip.bytes));
    const entries = await reader.getEntries();
    const manifest = entries.find((e) => e.filename === "manifest.json");
    const text =
      manifest !== undefined && !manifest.directory
        ? await manifest.getData(new TextWriter())
        : undefined;
    await reader.close();
    expect(JSON.parse(text ?? "").target.sha256).toBe("c".repeat(64));
  });

  it("maps a session error to 422", async () => {
    const decompile = createWebDecompiler({
      runDirectAnalysisSession: (async () => ({
        ok: false,
        error: { error: "Analysis failed", message: "unsupported format" },
      })) as unknown as DirectAnalysis["runDirectAnalysisSession"],
      readCapabilities: caps([{ id: "ghidra", available: true }]),
    });
    await expect(
      decompile(
        {
          source: { kind: "path", path: "/t" },
          provider: "ghidra",
          maxFunctions: 1,
        },
        signal,
      ),
    ).rejects.toMatchObject({
      status: 422,
      code: "decompile_failed",
      message: "unsupported format",
    });
  });
});
