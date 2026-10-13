import { z } from "zod";

import { ConfigurationError } from "../domain/configurationErrors.js";
import { err, ok, type Result } from "../domain/result.js";

/** Loopback literals the local web UI may bind; names are never resolved. */
export type WebLoopbackHost = "127.0.0.1" | "::1";

/** Validated settings for one `rea web` server. */
export interface WebConfig {
  readonly host: WebLoopbackHost;
  /** 0 selects an ephemeral port. */
  readonly port: number;
  readonly maxUploadBytes: number;
}

const DEFAULT_MAX_UPLOAD_BYTES = 268_435_456;

const webEnvironmentSchema = z.object({
  REA_WEB_HOST: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1"),
  REA_WEB_PORT: z
    .string()
    .regex(/^\d{1,5}$/u)
    .transform(Number)
    .pipe(z.number().int().min(0).max(65_535))
    .default(0),
  REA_WEB_MAX_UPLOAD_BYTES: z
    .string()
    .regex(/^\d{1,15}$/u)
    .transform(Number)
    .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER))
    .default(DEFAULT_MAX_UPLOAD_BYTES),
});

/** Parse web-owned settings; rejected values are named but never echoed. */
export const parseWebConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): Result<WebConfig, ConfigurationError> => {
  const selected: Record<string, string> = {};
  for (const key of Object.keys(webEnvironmentSchema.shape)) {
    const value = environment[key];
    // An empty assignment means unset, matching the other REA settings.
    if (value !== undefined && value !== "") selected[key] = value;
  }
  const parsed = webEnvironmentSchema.safeParse(selected);
  if (!parsed.success)
    return err(
      new ConfigurationError("Invalid REA web configuration", {
        settings: parsed.error.issues.map((issue) => ({
          setting: String(issue.path[0] ?? "REA_WEB"),
          constraint:
            issue.path[0] === "REA_WEB_HOST"
              ? "must be the literal loopback address 127.0.0.1 or ::1"
              : issue.path[0] === "REA_WEB_PORT"
                ? "must be an integer from 0 to 65535"
                : "must be a positive integer number of bytes",
        })),
      }),
    );
  return ok({
    host: parsed.data.REA_WEB_HOST,
    port: parsed.data.REA_WEB_PORT,
    maxUploadBytes: parsed.data.REA_WEB_MAX_UPLOAD_BYTES,
  });
};

/** Host header authority a browser sends for the bound loopback address. */
export const webHostAuthority = (host: WebLoopbackHost, port: number): string =>
  `${host === "::1" ? "[::1]" : host}:${String(port)}`;
