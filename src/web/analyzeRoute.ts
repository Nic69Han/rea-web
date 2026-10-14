import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import type { WebAnalyzer } from "./analyzeTarget.js";
import { HttpRejection, sendJson } from "./http.js";
import type { SourceRequests, SourceSpec } from "./sourceRequests.js";
import type { WebAnalysisResponse } from "./types.js";
import type { WorkGate } from "./workGate.js";

/** Bounded, NUL-free local path shared by every route that names a target. */
export const targetPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes("\0"), "path must not contain NUL");

const pathRequestSchema = z.strictObject({ path: targetPathSchema });

const analyzeSpec: SourceSpec<undefined> = {
  parseJson: (json) => {
    const parsed = pathRequestSchema.safeParse(json);
    if (!parsed.success)
      throw new HttpRejection(
        400,
        "invalid_request",
        'Body must be {"path": "<non-empty local path>"}.',
      );
    return { path: parsed.data.path, options: undefined };
  },
  parseQuery: () => undefined,
};

/** `POST /api/analyze`: provider-free analysis of one path or upload. */
export class AnalyzeRoute {
  constructor(
    private readonly analyze: WebAnalyzer,
    private readonly sources: SourceRequests,
    private readonly gate: WorkGate,
  ) {}

  handle(
    request: IncomingMessage,
    response: ServerResponse,
    query: URLSearchParams,
  ): Promise<void> {
    return this.gate.run(response, async (signal) => {
      const { result, cleanup } = await this.sources.withSource(
        request,
        query,
        analyzeSpec,
        (source) => this.analyze(source, signal),
      );
      sendJson(response, 200, {
        ...result,
        cleanup,
      } satisfies WebAnalysisResponse);
    });
  }
}
