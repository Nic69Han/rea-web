import { basename, resolve } from "node:path";

import { z } from "zod";

import type { DirectAnalysis } from "../composition/directAnalysis.js";
import type { DirectSessionCall } from "../application/DirectAnalysisSession.js";
import { parseEvidence, type Evidence } from "../domain/evidence.js";
import type { JsonValue } from "../domain/jsonValue.js";
import type { WebAnalysisSource } from "./analyzeTarget.js";
import type { DeepProviderId, WebCapabilitiesReader } from "./capabilities.js";
import {
  buildDecompiledZip,
  type CollectedExport,
  type DecompiledZip,
  type ExportProvider,
  type ExportTarget,
  type FunctionOutcome,
  type SkippedProcedure,
} from "./decompileZip.js";
import { HttpRejection } from "./http.js";

/** Default and hard upper bound on procedures decompiled per export. */
export const DEFAULT_MAX_FUNCTIONS = 200;
export const MAX_FUNCTIONS_CAP = 2000;

/** What the caller asked to export. */
export interface DecompileRequest {
  readonly source: WebAnalysisSource;
  /** Absent means the shared automatic provider selection. */
  readonly provider: DeepProviderId | undefined;
  readonly maxFunctions: number;
}

/** Decompile one target into a download. */
export type WebDecompiler = (
  request: DecompileRequest,
  signal: AbortSignal,
) => Promise<DecompiledZip>;

const procedureListSchema = z.array(
  z.object({
    address: z.string(),
    value: z.string(),
    procedure: z
      .object({ external: z.boolean(), thunk: z.boolean() })
      .optional(),
  }),
);

const failureSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

const PROVIDER_HELP =
  "Install or configure Ghidra, IDA or Hopper (see docs/installation.md).";

type Collection =
  | { readonly ok: true; readonly collected: CollectedExport }
  | { readonly ok: false; readonly message: string };

const describeFailure = (
  output: JsonValue,
): { readonly code: string | null; readonly message: string } => {
  const parsed = failureSchema.safeParse(output);
  return {
    code: parsed.success ? (parsed.data.code ?? null) : null,
    message:
      (parsed.success ? parsed.data.message : undefined) ??
      "The provider returned no usable result.",
  };
};

const asEvidence = (output: JsonValue): Evidence | undefined => {
  try {
    return parseEvidence(output);
  } catch {
    return undefined;
  }
};

const providerOf = (evidence: Evidence): ExportProvider => ({
  id: evidence.provider.id,
  name: evidence.provider.name,
  version: evidence.provider.version,
});

type OutcomeBase = Pick<FunctionOutcome, "index" | "name" | "address">;

/** Decompile one procedure; any failure becomes a recorded outcome. */
const decompileOne = async (
  call: DirectSessionCall,
  base: OutcomeBase,
  signal: AbortSignal,
): Promise<{
  readonly function: FunctionOutcome;
  readonly provider?: ExportProvider;
}> => {
  let output: JsonValue;
  try {
    output = await call("procedure_pseudo_code", { procedure: base.address });
  } catch (cause) {
    signal.throwIfAborted();
    const message = cause instanceof Error ? cause.message : "Call failed.";
    return {
      function: {
        ...base,
        status: "failed",
        pseudoCode: null,
        evidence: { error: "Call failed", message },
        evidenceId: null,
        failure: { code: null, message },
      },
    };
  }
  const evidence = asEvidence(output);
  if (evidence === undefined)
    return {
      function: {
        ...base,
        status: "failed",
        pseudoCode: null,
        evidence: output,
        evidenceId: null,
        failure: describeFailure(output),
      },
    };
  const text = evidence.normalized_result;
  const hasText = typeof text === "string" && text.trim() !== "";
  return {
    provider: providerOf(evidence),
    function: {
      ...base,
      status: hasText ? "decompiled" : "no_pseudo_code",
      pseudoCode: hasText ? text : null,
      evidence: output,
      evidenceId: evidence.evidence_id,
      failure: hasText
        ? null
        : {
            code: null,
            message: "The provider returned no pseudo-code for this procedure.",
          },
    },
  };
};

/**
 * List procedures once and decompile each (at most `maxFunctions`) through the
 * same open session. A function that fails is recorded and the loop continues.
 */
export const collectDecompilation = async (
  call: DirectSessionCall,
  target: ExportTarget,
  options: { readonly maxFunctions: number; readonly signal: AbortSignal },
): Promise<Collection> => {
  const listing = await call("list_procedures", {});
  const listed = asEvidence(listing);
  const procedures =
    listed === undefined
      ? undefined
      : procedureListSchema.safeParse(listed.normalized_result);
  if (listed === undefined || procedures?.success !== true)
    return {
      ok: false,
      message: `Procedure listing failed: ${describeFailure(listing).message}`,
    };
  // Facts come from the provider's own classification; absent means attempt.
  const skipped: SkippedProcedure[] = [];
  const candidates: typeof procedures.data = [];
  for (const procedure of procedures.data) {
    const reason =
      procedure.procedure?.external === true
        ? "external"
        : procedure.procedure?.thunk === true
          ? "thunk"
          : undefined;
    if (reason === undefined) candidates.push(procedure);
    else
      skipped.push({
        name: procedure.value,
        address: procedure.address,
        reason,
      });
  }
  const selected = candidates.slice(0, options.maxFunctions);
  let provider = providerOf(listed);
  const functions: FunctionOutcome[] = [];
  for (const [position, procedure] of selected.entries()) {
    options.signal.throwIfAborted();
    const outcome = await decompileOne(
      call,
      {
        index: position + 1,
        name: procedure.value,
        address: procedure.address,
      },
      options.signal,
    );
    functions.push(outcome.function);
    provider = outcome.provider ?? provider;
  }
  return {
    ok: true,
    collected: {
      target,
      provider,
      maxFunctions: options.maxFunctions,
      proceduresTotal: procedures.data.length,
      listingEvidence: listing,
      listingLimitations: listed.limitations,
      providerCleanupFailure: null,
      skipped,
      functions,
    },
  };
};

const unavailable = (detail: string): HttpRejection =>
  new HttpRejection(
    424,
    "deep_provider_unavailable",
    `${detail} ${PROVIDER_HELP}`,
  );

/** Reject before any work when the requested (or any) deep provider is unusable. */
const selectProvider = async (
  readCapabilities: WebCapabilitiesReader,
  requested: DeepProviderId | undefined,
): Promise<DeepProviderId | undefined> => {
  const { deep_providers: providers } = await readCapabilities();
  const available = providers.filter(({ available: usable }) => usable);
  if (requested !== undefined) {
    const entry = providers.find(({ id }) => id === requested);
    if (entry?.available !== true)
      throw unavailable(
        `Provider "${requested}" is unavailable: ${entry?.reason ?? "not reported by this REA build"}.`,
      );
    return requested;
  }
  if (available.length === 0)
    throw unavailable(
      `No deep provider is available (${providers.map(({ id, reason }) => `${id}: ${reason ?? "unknown"}`).join("; ")}).`,
    );
  return available.length === 1 ? available[0]?.id : undefined;
};

/** Bind the export to the shared single-session operation. */
export const createWebDecompiler =
  (dependencies: {
    readonly runDirectAnalysisSession: DirectAnalysis["runDirectAnalysisSession"];
    readonly readCapabilities: WebCapabilitiesReader;
    readonly now?: () => Date;
  }): WebDecompiler =>
  async ({ source, provider, maxFunctions }, signal) => {
    const providerId = await selectProvider(
      dependencies.readCapabilities,
      provider,
    );
    const localPath =
      source.kind === "path" ? resolve(source.path) : source.localPath;
    const displayName =
      source.kind === "upload" ? source.displayName : basename(localPath);
    const session = await dependencies.runDirectAnalysisSession(
      localPath,
      { signal, ...(providerId === undefined ? {} : { providerId }) },
      ({ target, call }) =>
        collectDecompilation(
          call,
          {
            display_name: displayName,
            input_kind: source.kind,
            local_path: localPath,
            sha256: target.sha256,
            format: "format" in target ? String(target.format) : null,
            architecture:
              "architecture" in target &&
              typeof target.architecture === "string"
                ? target.architecture
                : null,
          },
          { maxFunctions, signal },
        ),
    );
    if (!session.ok)
      throw new HttpRejection(
        422,
        "decompile_failed",
        describeFailure(session.error).message,
      );
    const { value, cleanupFailure } = session.value;
    if (!value.ok)
      throw new HttpRejection(422, "decompile_failed", value.message);
    return buildDecompiledZip(
      {
        ...value.collected,
        providerCleanupFailure: cleanupFailure ?? null,
      },
      (dependencies.now ?? (() => new Date()))(),
    );
  };
