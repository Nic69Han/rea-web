import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import { targetPathSchema } from "./analyzeRoute.js";
import { DEEP_PROVIDER_IDS } from "./capabilities.js";
import {
  DEFAULT_MAX_FUNCTIONS,
  MAX_FUNCTIONS_CAP,
  type WebDecompiler,
} from "./decompileExport.js";
import { HttpRejection, sendBytes } from "./http.js";
import type { SourceRequests, SourceSpec } from "./sourceRequests.js";
import type { WorkGate } from "./workGate.js";

const optionsSchema = z.strictObject({
  provider: z.enum(DEEP_PROVIDER_IDS).optional(),
  max_functions: z.number().int().min(1).max(MAX_FUNCTIONS_CAP).optional(),
});
type DecompileOptions = z.infer<typeof optionsSchema>;

const requestSchema = optionsSchema.extend({ path: targetPathSchema });

const invalid = (): HttpRejection =>
  new HttpRejection(
    400,
    "invalid_request",
    `Body must be {"path": string, "provider"?: ${DEEP_PROVIDER_IDS.join("|")}, "max_functions"?: integer 1..${String(MAX_FUNCTIONS_CAP)}}.`,
  );

const decompileSpec: SourceSpec<DecompileOptions> = {
  parseJson: (json) => {
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) throw invalid();
    const { path, ...options } = parsed.data;
    return { path, options };
  },
  parseQuery: (query) => {
    const provider = query.get("provider");
    const max = query.get("max_functions");
    const parsed = optionsSchema.safeParse({
      ...(provider === null ? {} : { provider }),
      ...(max === null
        ? {}
        : { max_functions: /^\d{1,6}$/u.test(max) ? Number(max) : Number.NaN }),
    });
    if (!parsed.success) throw invalid();
    return parsed.data;
  },
};

/**
 * `POST /api/decompile`: one deep-provider session decompiles a target into a
 * zip. Shares the single-work gate and upload staging with `/api/analyze`.
 */
export class DecompileRoute {
  constructor(
    private readonly decompile: WebDecompiler,
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
        decompileSpec,
        (source, options) =>
          this.decompile(
            {
              source,
              provider: options.provider,
              maxFunctions: options.max_functions ?? DEFAULT_MAX_FUNCTIONS,
            },
            signal,
          ),
      );
      sendBytes(response, 200, result.bytes, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "x-rea-cleanup": cleanup.status,
        ...(cleanup.detail === undefined
          ? {}
          : { "x-rea-cleanup-detail": encodeURIComponent(cleanup.detail) }),
      });
    });
  }
}
