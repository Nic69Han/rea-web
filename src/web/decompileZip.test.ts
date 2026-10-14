import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import {
  archiveFilename,
  buildDecompiledZip,
  functionFilePath,
  sanitizeSegment,
  type CollectedExport,
  type FunctionOutcome,
} from "./decompileZip.js";

const GENERATED_AT = new Date("2026-01-02T03:04:05.000Z");

const outcome = (
  overrides: Partial<FunctionOutcome> & Pick<FunctionOutcome, "index">,
): FunctionOutcome => ({
  name: `fn_${String(overrides.index)}`,
  address: `0x${String(1000 + overrides.index)}`,
  status: "decompiled",
  pseudoCode: "int f(void) { return 0; }",
  evidence: { evidence_id: `ev:${String(overrides.index)}` },
  evidenceId: `ev:${String(overrides.index)}`,
  failure: null,
  ...overrides,
});

const collected = (
  functions: readonly FunctionOutcome[],
  overrides: Partial<CollectedExport> = {},
): CollectedExport => ({
  target: {
    display_name: "sample.elf",
    input_kind: "path",
    local_path: "/tmp/sample.elf",
    sha256: "a".repeat(64),
    format: "elf",
    architecture: "x86_64",
  },
  provider: { id: "ghidra", name: "Ghidra", version: "12.1.4" },
  maxFunctions: 200,
  proceduresTotal: functions.length,
  listingEvidence: { evidence_id: "ev:list" },
  listingLimitations: [],
  providerCleanupFailure: null,
  skipped: [],
  functions,
  ...overrides,
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

describe("sanitizeSegment", () => {
  it.each([
    ["../../x", "x"],
    ["a/b\\c", "a_b_c"],
    ["...", "fallback"],
    ["", "fallback"],
    ["operator<<(int)", "operator_int"],
    ["ok_name-1.2", "ok_name-1.2"],
  ])("neutralizes %j", (input, expected) => {
    expect(sanitizeSegment(input, "fallback")).toBe(expected);
  });

  it("bounds very long names", () => {
    expect(sanitizeSegment("n".repeat(5000), "fallback").length).toBe(60);
  });
});

describe("buildDecompiledZip", () => {
  it("writes README, manifest, sources and verbatim evidence", async () => {
    const functions = [
      outcome({ index: 1, name: "main", address: "0x1000" }),
      outcome({
        index: 2,
        name: "broken",
        status: "failed",
        pseudoCode: null,
        evidence: { error: "Analysis failed", code: "boom", message: "bad" },
        evidenceId: null,
        failure: { code: "boom", message: "bad" },
      }),
      outcome({
        index: 3,
        name: "empty",
        status: "no_pseudo_code",
        pseudoCode: null,
        failure: { code: null, message: "none" },
      }),
    ];
    const zip = await buildDecompiledZip(collected(functions), GENERATED_AT);
    expect(zip.filename).toBe("sample.elf-decompiled.zip");
    const files = await readZip(zip.bytes);
    expect([...files.keys()].sort()).toEqual(
      [
        "README.md",
        "manifest.json",
        "evidence/0000_list_procedures.json",
        "evidence/0001_main_0x1000.json",
        "evidence/0002_broken_0x1002.json",
        "evidence/0003_empty_0x1003.json",
        "functions/0001_main_0x1000.c",
      ].sort(),
    );
    const manifest = JSON.parse(files.get("manifest.json") ?? "") as {
      generated_at: string;
      counts: Record<string, number>;
      omitted: { count: number; truncated: boolean };
      failures: { name: string; code: string; message: string }[];
      functions: { file: string | null; status: string }[];
      target: { sha256: string };
      provider: { id: string };
    };
    expect(manifest.generated_at).toBe(GENERATED_AT.toISOString());
    expect(manifest.counts).toEqual({
      decompiled: 1,
      no_pseudo_code: 1,
      failed: 1,
    });
    expect(manifest.omitted).toMatchObject({ count: 0, truncated: false });
    expect(manifest.target.sha256).toBe("a".repeat(64));
    expect(manifest.provider.id).toBe("ghidra");
    expect(manifest.failures.map(({ name }) => name)).toEqual([
      "broken",
      "empty",
    ]);
    expect(manifest.functions.map(({ file }) => file)).toEqual([
      "functions/0001_main_0x1000.c",
      null,
      null,
    ]);
    const source = files.get("functions/0001_main_0x1000.c") ?? "";
    expect(source).toContain("name: main");
    expect(source).toContain("address: 0x1000");
    expect(source).toContain("evidence_id: ev:1");
    expect(source).toContain("int f(void) { return 0; }");
    expect(
      JSON.parse(files.get("evidence/0002_broken_0x1002.json") ?? ""),
    ).toEqual({ error: "Analysis failed", code: "boom", message: "bad" });
    const readme = files.get("README.md") ?? "";
    expect(readme).toContain("derived");
    expect(readme).toContain("a".repeat(64));
    expect(readme).toContain("Ghidra 12.1.4");
    expect(readme).toContain(
      "Every procedure the provider listed was attempted",
    );
  });

  it("states truncation and skipped procedures explicitly", async () => {
    const zip = await buildDecompiledZip(
      collected([outcome({ index: 1 })], {
        maxFunctions: 1,
        proceduresTotal: 5,
        skipped: [{ name: "puts", address: "0x10", reason: "external" }],
      }),
      GENERATED_AT,
    );
    const files = await readZip(zip.bytes);
    const manifest = JSON.parse(files.get("manifest.json") ?? "") as {
      omitted: { count: number; truncated: boolean; reason: string };
      skipped: unknown[];
    };
    expect(manifest.omitted).toEqual({
      count: 3,
      truncated: true,
      reason: "max_functions",
    });
    expect(manifest.skipped).toHaveLength(1);
    expect(files.get("README.md")).toContain(
      "Truncated: only the first 1 of 4",
    );
  });

  it("keeps hostile function names inside functions/ and out of comments", async () => {
    const hostile = outcome({
      index: 1,
      name: "../../x */ evil\nline",
      address: "../0x1",
    });
    const long = outcome({ index: 2, name: "L".repeat(10_000) });
    const zip = await buildDecompiledZip(
      collected([hostile, long]),
      GENERATED_AT,
    );
    const files = await readZip(zip.bytes);
    for (const name of files.keys()) {
      expect(name).not.toContain("..");
      expect(name.startsWith("/")).toBe(false);
      expect(name.split("/").length).toBeLessThanOrEqual(2);
      expect(name.length).toBeLessThan(120);
    }
    const header = (files.get(functionFilePath(hostile)) ?? "").split("*/")[0];
    expect(header).not.toContain("\n * line");
    expect(files.get(functionFilePath(hostile))).toContain("* / evil line");
    // The verbatim name survives in the manifest for identity.
    expect(files.get("manifest.json")).toContain("../../x */ evil\\nline");
  });

  it("records an incomplete provider close", async () => {
    const zip = await buildDecompiledZip(
      collected([outcome({ index: 1 })], {
        providerCleanupFailure: { error: "Cleanup incomplete" },
      }),
      GENERATED_AT,
    );
    const files = await readZip(zip.bytes);
    expect(files.get("manifest.json")).toContain('"status": "incomplete"');
    expect(files.get("README.md")).toContain("did not close cleanly");
  });
});

describe("archiveFilename", () => {
  it("sanitizes the display name", () => {
    expect(archiveFilename('../a"b c.exe')).toBe("a_b_c.exe-decompiled.zip");
    expect(archiveFilename("")).toBe("target-decompiled.zip");
  });
});
