import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import type { WebAnalysisSource, WebAnalyzer } from "./analyzeTarget.js";
import {
  declaredLength,
  HttpRejection,
  readBounded,
  sendJson,
} from "./http.js";
import type { WebAnalysisResponse, WebCleanup } from "./types.js";
import {
  sanitizeUploadName,
  UploadStaging,
  UploadTooLargeError,
} from "./uploadStaging.js";

const MAX_JSON_BODY_BYTES = 64 * 1024;

const pathRequestSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => !path.includes("\0"), "path must not contain NUL"),
});

interface ActiveAnalysis {
  readonly controller: AbortController;
  readonly settled: Promise<void>;
}

/**
 * `POST /api/analyze`: one analysis at a time, cancelled when the client
 * disconnects, with uploads confined to directories owned by this route.
 */
export class AnalyzeRoute {
  readonly #staging = new UploadStaging();
  #active: ActiveAnalysis | undefined;

  constructor(
    private readonly analyze: WebAnalyzer,
    private readonly maxUploadBytes: number,
  ) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (this.#active !== undefined)
      throw new HttpRejection(
        409,
        "busy",
        "Another analysis is running; retry when it finishes.",
      );
    const controller = new AbortController();
    const run = this.#run(request, response, controller.signal);
    this.#active = {
      controller,
      settled: run.then(
        () => undefined,
        () => undefined,
      ),
    };
    response.once("close", () => {
      if (!response.writableFinished) controller.abort();
    });
    try {
      await run;
    } finally {
      this.#active = undefined;
    }
  }

  /** Cancel the running analysis and wait for its cleanup to settle. */
  async stop(): Promise<WebCleanup> {
    this.#active?.controller.abort();
    await this.#active?.settled;
    return this.#staging.releaseRetained();
  }

  async #run(
    request: IncomingMessage,
    response: ServerResponse,
    signal: AbortSignal,
  ): Promise<void> {
    const mediaType = (request.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (mediaType === "application/json") {
      const source = await this.#readPathSource(request);
      const body = await this.analyze(source, signal);
      sendJson(response, 200, {
        ...body,
        cleanup: { status: "not_needed" },
      } satisfies WebAnalysisResponse);
      return;
    }
    if (mediaType === "application/octet-stream") {
      await this.#runUpload(request, response, signal);
      return;
    }
    throw new HttpRejection(
      400,
      "unsupported_content_type",
      "Send application/json with a path or application/octet-stream with file bytes.",
    );
  }

  async #readPathSource(request: IncomingMessage): Promise<WebAnalysisSource> {
    if ((declaredLength(request) ?? 0) > MAX_JSON_BODY_BYTES)
      throw tooLarge(MAX_JSON_BODY_BYTES);
    const bytes = await readBounded(request, MAX_JSON_BODY_BYTES);
    if (bytes === undefined) throw tooLarge(MAX_JSON_BODY_BYTES);
    let json: unknown;
    try {
      json = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new HttpRejection(400, "invalid_json", "Body is not valid JSON.");
    }
    const parsed = pathRequestSchema.safeParse(json);
    if (!parsed.success)
      throw new HttpRejection(
        400,
        "invalid_request",
        'Body must be {"path": "<non-empty local path>"}.',
      );
    return { kind: "path", path: parsed.data.path };
  }

  async #runUpload(
    request: IncomingMessage,
    response: ServerResponse,
    signal: AbortSignal,
  ): Promise<void> {
    if ((declaredLength(request) ?? 0) > this.maxUploadBytes)
      throw tooLarge(this.maxUploadBytes);
    const header = request.headers["x-rea-filename"];
    if (header !== undefined && typeof header !== "string")
      throw new HttpRejection(
        400,
        "invalid_filename",
        "x-rea-filename must be sent once.",
      );
    const staged = await this.#staging
      .stage(request, {
        name: sanitizeUploadName(header),
        maxBytes: this.maxUploadBytes,
      })
      .catch((cause: unknown) => {
        if (cause instanceof UploadTooLargeError)
          throw tooLarge(this.maxUploadBytes);
        throw cause;
      });
    let body: Awaited<ReturnType<WebAnalyzer>> | undefined;
    try {
      body = await this.analyze(
        {
          kind: "upload",
          displayName: staged.displayName,
          localPath: staged.path,
        },
        signal,
      );
    } finally {
      const cleanup = await this.#staging.release(staged);
      if (body !== undefined)
        sendJson(response, 200, {
          ...body,
          cleanup,
        } satisfies WebAnalysisResponse);
    }
  }
}

const tooLarge = (limit: number): HttpRejection =>
  new HttpRejection(
    413,
    "payload_too_large",
    `Request body exceeds ${String(limit)} bytes.`,
  );
