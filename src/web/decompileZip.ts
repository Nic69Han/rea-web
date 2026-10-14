import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";

import type { JsonValue } from "../domain/jsonValue.js";

/** Identity of the decompiled target, as the opened session reports it. */
export interface ExportTarget {
  readonly display_name: string;
  readonly input_kind: "path" | "upload";
  readonly local_path: string;
  readonly sha256: string;
  readonly format: string | null;
  readonly architecture: string | null;
}

/** Provider that produced the pseudo-code, taken from its Evidence. */
export interface ExportProvider {
  readonly id: string;
  readonly name: string;
  readonly version: string | null;
}

/** Result of decompiling one procedure; failures are data, not exceptions. */
export interface FunctionOutcome {
  /** 1-based position in the provider's procedure listing. */
  readonly index: number;
  readonly name: string;
  readonly address: string;
  readonly status: "decompiled" | "no_pseudo_code" | "failed";
  readonly pseudoCode: string | null;
  /** Evidence (or projected error) exactly as the call returned it. */
  readonly evidence: JsonValue;
  readonly evidenceId: string | null;
  readonly failure: {
    readonly code: string | null;
    readonly message: string;
  } | null;
}

/** A listed procedure the provider classifies as having no decompilable body. */
export interface SkippedProcedure {
  readonly name: string;
  readonly address: string;
  readonly reason: "external" | "thunk";
}

/** Everything one export session observed. */
export interface CollectedExport {
  readonly target: ExportTarget;
  readonly provider: ExportProvider | null;
  readonly maxFunctions: number;
  readonly proceduresTotal: number;
  readonly listingEvidence: JsonValue;
  readonly listingLimitations: readonly string[];
  /** Projected provider-close failure; the provider may still hold resources. */
  readonly providerCleanupFailure: JsonValue | null;
  readonly skipped: readonly SkippedProcedure[];
  readonly functions: readonly FunctionOutcome[];
}

/** A finished download. */
export interface DecompiledZip {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

const MAX_NAME_LENGTH = 60;
const MAX_ARCHIVE_STEM_LENGTH = 80;

/**
 * Reduce provider- or caller-supplied text to one inert path segment: no
 * separators, no dot runs, no control characters, bounded length.
 */
export const sanitizeSegment = (
  value: string,
  fallback: string,
  maxLength = MAX_NAME_LENGTH,
): string => {
  const cleaned = value
    .replace(/[^A-Za-z0-9_.-]/gu, "_")
    .replace(/\.{2,}/gu, "_")
    .replace(/_{2,}/gu, "_")
    .slice(0, maxLength)
    .replace(/^[._-]+/u, "")
    .replace(/[._-]+$/u, "");
  return cleaned === "" ? fallback : cleaned;
};

const padded = (index: number): string => String(index).padStart(4, "0");

const stem = (outcome: Pick<FunctionOutcome, "index" | "name" | "address">) =>
  `${padded(outcome.index)}_${sanitizeSegment(outcome.name, "unnamed")}_${sanitizeSegment(outcome.address, "noaddr", 24)}`;

/** Path of one function's pseudo-code inside the archive. */
export const functionFilePath = (
  outcome: Pick<FunctionOutcome, "index" | "name" | "address">,
): string => `functions/${stem(outcome)}.c`;

const evidenceFilePath = (
  outcome: Pick<FunctionOutcome, "index" | "name" | "address">,
): string => `evidence/${stem(outcome)}.json`;

const LISTING_EVIDENCE_PATH = "evidence/0000_list_procedures.json";

/** Download name derived from the target's display name. */
export const archiveFilename = (displayName: string): string =>
  `${sanitizeSegment(displayName, "target", MAX_ARCHIVE_STEM_LENGTH)}-decompiled.zip`;

/** One line of text safe inside a C block comment. */
const commentText = (value: string): string =>
  value.replace(/\p{Cc}+/gu, " ").replace(/\*\//gu, "* /");

const providerLabel = (provider: ExportProvider | null): string =>
  provider === null
    ? "unknown"
    : `${provider.name}${provider.version === null ? "" : ` ${provider.version}`} (${provider.id})`;

const functionSource = (
  outcome: FunctionOutcome,
  provider: ExportProvider | null,
): string =>
  [
    "/*",
    " * REA pseudo-code: derived, provider-specific output. It is not the",
    " * original source and may be incomplete or wrong.",
    ` * name: ${commentText(outcome.name)}`,
    ` * address: ${commentText(outcome.address)}`,
    ` * provider: ${commentText(providerLabel(provider))}`,
    ` * evidence_id: ${commentText(outcome.evidenceId ?? "none")}`,
    " */",
    "",
    outcome.pseudoCode ?? "",
    "",
  ].join("\n");

const counts = (functions: readonly FunctionOutcome[]) => ({
  decompiled: functions.filter(({ status }) => status === "decompiled").length,
  no_pseudo_code: functions.filter(({ status }) => status === "no_pseudo_code")
    .length,
  failed: functions.filter(({ status }) => status === "failed").length,
});

const manifestOf = (collected: CollectedExport, generatedAt: Date) => {
  const omitted =
    collected.proceduresTotal -
    collected.skipped.length -
    collected.functions.length;
  return {
    format_version: 1,
    generated_at: generatedAt.toISOString(),
    output_kind: "derived_pseudo_code",
    target: collected.target,
    provider: collected.provider,
    max_functions: collected.maxFunctions,
    procedures_total: collected.proceduresTotal,
    attempted: collected.functions.length,
    skipped: collected.skipped,
    counts: counts(collected.functions),
    omitted: {
      count: omitted,
      truncated: omitted > 0,
      reason: omitted > 0 ? "max_functions" : null,
    },
    provider_cleanup:
      collected.providerCleanupFailure === null
        ? { status: "closed" }
        : { status: "incomplete", error: collected.providerCleanupFailure },
    listing_evidence_file: LISTING_EVIDENCE_PATH,
    listing_limitations: collected.listingLimitations,
    functions: collected.functions.map((outcome) => ({
      index: outcome.index,
      name: outcome.name,
      address: outcome.address,
      status: outcome.status,
      file: outcome.status === "decompiled" ? functionFilePath(outcome) : null,
      evidence_file: evidenceFilePath(outcome),
      evidence_id: outcome.evidenceId,
    })),
    failures: collected.functions.flatMap((outcome) =>
      outcome.failure === null
        ? []
        : [
            {
              name: outcome.name,
              address: outcome.address,
              status: outcome.status,
              code: outcome.failure.code,
              message: outcome.failure.message,
            },
          ],
    ),
  };
};

const readmeOf = (
  collected: CollectedExport,
  generatedAt: Date,
  manifest: ReturnType<typeof manifestOf>,
): string => {
  const { target } = collected;
  const lines = [
    `# Decompiled code: ${target.display_name}`,
    "",
    "> Pseudo-code in this archive is **derived** output from a decompiler",
    "> (an inference over machine code). It is not the original source, is",
    "> provider-specific, and can be incomplete or wrong. Verify against the",
    "> evidence files before relying on it.",
    "",
    `- Target: ${target.display_name} (${target.input_kind})`,
    `- Path analyzed: ${target.local_path}`,
    `- SHA-256: ${target.sha256}`,
    `- Format: ${target.format ?? "unknown"}; architecture: ${target.architecture ?? "unknown"}`,
    `- Provider: ${providerLabel(collected.provider)}`,
    `- Generated: ${generatedAt.toISOString()}`,
    "",
    "## Counts",
    "",
    `- Procedures reported by the provider: ${String(collected.proceduresTotal)}`,
    `- Procedures attempted: ${String(manifest.attempted)} (limit ${String(collected.maxFunctions)})`,
    `- Skipped as external or thunk (listed in manifest.json): ${String(collected.skipped.length)}`,
    `- Decompiled: ${String(manifest.counts.decompiled)}`,
    `- No pseudo-code returned: ${String(manifest.counts.no_pseudo_code)}`,
    `- Failed: ${String(manifest.counts.failed)}`,
    `- Not attempted (omitted): ${String(manifest.omitted.count)}`,
    "",
    "## Limitations",
    "",
    manifest.omitted.truncated
      ? `- Truncated: only the first ${String(manifest.attempted)} of ${String(manifest.attempted + manifest.omitted.count)} decompilable procedures, in provider order, were decompiled. ${String(manifest.omitted.count)} were not attempted.`
      : "- Every procedure the provider listed was attempted.",
    "- A failed or empty function is recorded in manifest.json, not hidden.",
    "- The procedure list itself may be incomplete; see the listing evidence.",
    ...(collected.providerCleanupFailure === null
      ? []
      : [
          "- The provider session did not close cleanly; see `provider_cleanup` in manifest.json.",
        ]),
    ...collected.listingLimitations.map((limitation) => `- ${limitation}`),
    "",
    "## Contents",
    "",
    "- `manifest.json`: target identity, provider, per-function status, omissions, failures.",
    "- `functions/`: one `.c` file per decompiled function, with a header comment.",
    "- `evidence/`: the provider Evidence for every call, verbatim.",
    "",
  ];
  return lines.join("\n");
};

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Build the export archive. Dates are pinned to `generatedAt`. */
export const buildDecompiledZip = async (
  collected: CollectedExport,
  generatedAt: Date,
): Promise<DecompiledZip> => {
  const manifest = manifestOf(collected, generatedAt);
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    lastModDate: generatedAt,
    useWebWorkers: false,
  });
  const add = (path: string, text: string) =>
    writer.add(path, new TextReader(text));
  await add("README.md", readmeOf(collected, generatedAt, manifest));
  await add("manifest.json", json(manifest));
  await add(LISTING_EVIDENCE_PATH, json(collected.listingEvidence));
  for (const outcome of collected.functions) {
    if (outcome.status === "decompiled")
      await add(
        functionFilePath(outcome),
        functionSource(outcome, collected.provider),
      );
    await add(evidenceFilePath(outcome), json(outcome.evidence));
  }
  return {
    bytes: await writer.close(),
    filename: archiveFilename(collected.target.display_name),
  };
};
