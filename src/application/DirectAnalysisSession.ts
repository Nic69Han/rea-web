import type { Logger } from "pino";

import type { JsonValue } from "../domain/jsonValue.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import { err, ok, type Result } from "../domain/result.js";
import { silentLogger } from "../logger.js";
import type { AnalysisProviderSelector } from "../contracts/providerSelection.js";
import { cliError, executeAnalysisTool } from "./DirectAnalysis.js";
import {
  directAnalysisCleanupFailure,
  withSessionCleanup,
} from "./DirectAnalysisCleanup.js";
import type { DirectAnalysisDependencies } from "./DirectAnalysisDependencies.js";

/** Read-only operations a multi-call direct session may run. */
export type DirectSessionTool = "list_procedures" | "procedure_pseudo_code";

/**
 * One tool call on an already-open session. Resolves to authenticated Evidence
 * or a projected analysis error, exactly as `runDirectAnalysis` would return.
 */
export type DirectSessionCall = (
  tool: DirectSessionTool,
  arguments_: Readonly<Record<string, JsonValue>>,
) => Promise<JsonValue>;

/** Outcome of a session whose cleanup is reported, not hidden. */
export interface DirectSessionOutcome<Value> {
  readonly value: Value;
  /** Projected cleanup failure when work succeeded but the provider did not close. */
  readonly cleanupFailure?: JsonValue;
}

/** Caller-selected inputs of one session. */
export interface DirectSessionOptions {
  readonly signal: AbortSignal;
  readonly logger?: Logger;
  readonly providerId?: AnalysisProviderSelector;
}

/** Calls to run once the target is open. */
export type DirectSessionWork<Value> = (context: {
  readonly target: BinaryTarget;
  readonly call: DirectSessionCall;
}) => Promise<Value>;

/**
 * Open one target, run several read-only calls against the same provider
 * session, and always close it. Unlike `runDirectAnalysis` the provider is
 * started once, so per-call latency is only the operation itself.
 */
export const runDirectAnalysisSession = async <Value>(
  dependencies: DirectAnalysisDependencies,
  path: string,
  options: DirectSessionOptions,
  work: DirectSessionWork<Value>,
): Promise<Result<DirectSessionOutcome<Value>, JsonValue>> => {
  const config = dependencies.readConfiguration();
  if (!config.ok) return err(cliError(config.error));
  const session = await dependencies.createBinarySession(
    config.value,
    options.logger ?? silentLogger,
  );
  return withSessionCleanup(
    session,
    async (): Promise<Result<DirectSessionOutcome<Value>, JsonValue>> => {
      const opened = await session.open(path, {
        signal: options.signal,
        ...(options.providerId === undefined
          ? {}
          : { providerId: options.providerId }),
      });
      if (!opened.ok) return err(cliError(opened.error));
      const call: DirectSessionCall = async (tool, arguments_) =>
        (
          await executeAnalysisTool({
            session,
            openedTarget: opened.value,
            tool,
            arguments: arguments_,
            signal: options.signal,
            evidenceProfile: undefined,
          })
        ).output;
      return ok({ value: await work({ target: opened.value, call }) });
    },
    (result, error) =>
      result.ok
        ? ok({
            ...result.value,
            cleanupFailure: {
              error: "Cleanup incomplete",
              ...projectAnalysisError(error),
            },
          })
        : err(directAnalysisCleanupFailure(result.error, error)),
  );
};
