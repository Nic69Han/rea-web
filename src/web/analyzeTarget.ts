import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { DirectAnalysis } from "../composition/directAnalysis.js";
import type { JsonValue } from "../domain/jsonValue.js";
import { parseEvidence } from "../domain/evidence.js";
import type { Result } from "../domain/result.js";
import {
  projectArtifactContainment,
  projectDylibDependencies,
  readArtifactInventory,
  type ParsedInventory,
} from "./graphProjection.js";
import type {
  WebAnalysisResponse,
  WebGraph,
  WebOperationName,
  WebOperationResult,
} from "./types.js";

/** What the caller asked REA to analyze. */
export type WebAnalysisSource =
  | { readonly kind: "path"; readonly path: string }
  | {
      readonly kind: "upload";
      readonly displayName: string;
      readonly localPath: string;
    };

/** Analysis result before the server adds upload cleanup status. */
export type WebAnalysisBody = Omit<WebAnalysisResponse, "cleanup">;

/** Run the provider-free workflows for one target. */
export type WebAnalyzer = (
  source: WebAnalysisSource,
  signal: AbortSignal,
) => Promise<WebAnalysisBody>;

const MACH_O_FORMATS = new Set(["mach-o", "mach-o-universal"]);

type RunProviderAnalysis = DirectAnalysis["runProviderAnalysis"];

/** Bind the web analysis workflow to the shared direct-analysis operations. */
export const createWebAnalyzer =
  (runProviderAnalysis: RunProviderAnalysis): WebAnalyzer =>
  async (source, signal) => {
    const localPath =
      source.kind === "path" ? resolve(source.path) : source.localPath;
    const size = await regularFileSize(localPath);
    const run = (
      operation: WebOperationName,
      parameters: Readonly<Record<string, JsonValue>>,
    ) =>
      runOperation(
        { runProviderAnalysis, path: localPath, signal },
        operation,
        parameters,
      );
    const inspected = await run("inspect_artifact", {
      integrity_policy: "fail",
    });
    const inventory =
      inspected.status === "ok"
        ? readArtifactInventory(inspected.evidence)
        : undefined;
    const operations: WebOperationResult[] = [inspected];
    const graphs: WebGraph[] = [];
    if (inventory?.ok === true)
      graphs.push(projectArtifactContainment(inventory.value));
    else if (inventory !== undefined)
      operations[0] = { ...inspected, reason: inventory.error.message };
    const applicability = machoApplicability(inventory);
    if (!applicability.applicable)
      operations.push({
        operation: "trace_dylib_resolution",
        status: applicability.unknown ? "error" : "not_applicable",
        reason: applicability.reason,
      });
    else {
      const traced = await run("trace_dylib_resolution", {});
      operations.push(traced);
      if (traced.status === "ok") {
        const graph = projectDylibDependencies(traced.evidence);
        if (!graph.ok)
          operations[1] = { ...traced, reason: graph.error.message };
        else graphs.push(graph.value);
      }
    }
    return {
      target: {
        input_kind: source.kind,
        display_name:
          source.kind === "upload" ? source.displayName : basename(localPath),
        local_path: localPath,
        size_bytes: size,
        // A directory digest is not a file digest; report only file content.
        sha256:
          size !== null && inventory?.ok === true
            ? inventory.value.inventory.manifest.root_sha256
            : null,
      },
      operations,
      graphs,
    };
  };

const regularFileSize = async (path: string): Promise<number | null> => {
  try {
    const metadata = await stat(path);
    return metadata.isFile() ? metadata.size : null;
  } catch {
    return null;
  }
};

type Applicability =
  | { readonly applicable: true }
  | {
      readonly applicable: false;
      readonly unknown: boolean;
      readonly reason: string;
    };

/** Mach-O applicability comes from the inventory's parsed formats, never raw bytes. */
const machoApplicability = (
  inventory: Result<ParsedInventory, { readonly message: string }> | undefined,
): Applicability => {
  if (inventory === undefined || !inventory.ok)
    return {
      applicable: false,
      unknown: true,
      reason:
        "Mach-O applicability is unknown because inspect_artifact did not produce a verified inventory.",
    };
  const { manifest, occurrences } = inventory.value.inventory;
  if (MACH_O_FORMATS.has(manifest.root_format)) return { applicable: true };
  if (
    manifest.root_format === "directory" &&
    occurrences.some(({ artifact_format: format }) =>
      MACH_O_FORMATS.has(format),
    )
  )
    return { applicable: true };
  return {
    applicable: false,
    unknown: false,
    reason: `Target format "${manifest.root_format}" is not a Mach-O image or an app bundle containing Mach-O images.`,
  };
};

interface OperationContext {
  readonly runProviderAnalysis: RunProviderAnalysis;
  readonly path: string;
  readonly signal: AbortSignal;
}

const runOperation = async (
  { runProviderAnalysis, path, signal }: OperationContext,
  operation: WebOperationName,
  parameters: Readonly<Record<string, JsonValue>>,
): Promise<WebOperationResult> => {
  let output: JsonValue;
  try {
    output = await runProviderAnalysis(
      path,
      operation,
      parameters,
      undefined,
      signal,
    );
  } catch (cause) {
    if (signal.aborted) throw cause;
    return {
      operation,
      status: "error",
      reason: cause instanceof Error ? cause.message : "Analysis failed",
    };
  }
  try {
    parseEvidence(output);
    return { operation, status: "ok", evidence: output };
  } catch {
    // Not authenticated Evidence: a projected AnalysisError, kept verbatim.
    return {
      operation,
      status: "error",
      reason: errorMessage(output),
      error: output,
    };
  }
};

const errorMessage = (output: JsonValue): string =>
  typeof output === "object" &&
  output !== null &&
  !Array.isArray(output) &&
  typeof output.message === "string"
    ? output.message
    : "Analysis failed";
