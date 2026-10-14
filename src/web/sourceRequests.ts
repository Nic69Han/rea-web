import type { IncomingMessage } from "node:http";

import { declaredLength, HttpRejection, readBounded } from "./http.js";
import type { WebCleanup } from "./types.js";
import type { WebAnalysisSource } from "./analyzeTarget.js";
import {
  sanitizeUploadName,
  UploadStaging,
  UploadTooLargeError,
} from "./uploadStaging.js";

const MAX_JSON_BODY_BYTES = 64 * 1024;

/** How one route reads its options from a JSON body or an upload's query. */
export interface SourceSpec<Options> {
  /** Validate a JSON body; throw `HttpRejection` (400) when it is malformed. */
  readonly parseJson: (json: unknown) => {
    readonly path: string;
    readonly options: Options;
  };
  /** Options for an upload, whose body is the file itself. */
  readonly parseQuery: (query: URLSearchParams) => Options;
}

/**
 * Turns a request into an analysis source: a caller-named local path, or an
 * upload staged in a directory that persists until the route's work finishes.
 */
export class SourceRequests {
  constructor(
    private readonly staging: UploadStaging,
    private readonly maxUploadBytes: number,
  ) {}

  /** Run `use` with the request's source, then release any staged upload. */
  async withSource<Options, Result>(
    request: IncomingMessage,
    query: URLSearchParams,
    spec: SourceSpec<Options>,
    use: (source: WebAnalysisSource, options: Options) => Promise<Result>,
  ): Promise<{ readonly result: Result; readonly cleanup: WebCleanup }> {
    const mediaType = (request.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (mediaType === "application/json") {
      const { path, options } = spec.parseJson(await readJson(request));
      return {
        result: await use({ kind: "path", path }, options),
        cleanup: { status: "not_needed" },
      };
    }
    if (mediaType === "application/octet-stream")
      return this.#withUpload(request, spec.parseQuery(query), use);
    throw new HttpRejection(
      400,
      "unsupported_content_type",
      "Send application/json with a path or application/octet-stream with file bytes.",
    );
  }

  async #withUpload<Options, Result>(
    request: IncomingMessage,
    options: Options,
    use: (source: WebAnalysisSource, options: Options) => Promise<Result>,
  ): Promise<{ readonly result: Result; readonly cleanup: WebCleanup }> {
    if ((declaredLength(request) ?? 0) > this.maxUploadBytes)
      throw tooLarge(this.maxUploadBytes);
    const header = request.headers["x-rea-filename"];
    if (header !== undefined && typeof header !== "string")
      throw new HttpRejection(
        400,
        "invalid_filename",
        "x-rea-filename must be sent once.",
      );
    const staged = await this.staging
      .stage(request, {
        name: sanitizeUploadName(header),
        maxBytes: this.maxUploadBytes,
      })
      .catch((cause: unknown) => {
        if (cause instanceof UploadTooLargeError)
          throw tooLarge(this.maxUploadBytes);
        throw cause;
      });
    let result: Result;
    try {
      result = await use(
        {
          kind: "upload",
          displayName: staged.displayName,
          localPath: staged.path,
        },
        options,
      );
    } catch (cause) {
      // A failed release stays retained by the staging owner for shutdown retry.
      await this.staging.release(staged);
      throw cause;
    }
    return { result, cleanup: await this.staging.release(staged) };
  }
}

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  if ((declaredLength(request) ?? 0) > MAX_JSON_BODY_BYTES)
    throw tooLarge(MAX_JSON_BODY_BYTES);
  const bytes = await readBounded(request, MAX_JSON_BODY_BYTES);
  if (bytes === undefined) throw tooLarge(MAX_JSON_BODY_BYTES);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new HttpRejection(400, "invalid_json", "Body is not valid JSON.");
  }
};

export const tooLarge = (limit: number): HttpRejection =>
  new HttpRejection(
    413,
    "payload_too_large",
    `Request body exceeds ${String(limit)} bytes.`,
  );
