import { open } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";

import { PrivateRuntimeRoot } from "../process/PrivateRuntimeRoot.js";
import type { WebCleanup } from "./types.js";

/** The upload exceeded the configured byte limit. */
export class UploadTooLargeError extends Error {
  readonly _tag = "UploadTooLargeError";
  constructor(readonly limit: number) {
    super(`Upload exceeds ${String(limit)} bytes`);
  }
}

/** One upload written into a directory this process owns. */
export interface StagedUpload {
  readonly displayName: string;
  readonly path: string;
  readonly bytes: number;
  readonly root: PrivateRuntimeRoot;
}

const FALLBACK_NAME = "upload.bin";
const MAX_NAME_LENGTH = 128;

/**
 * Reduce a caller-supplied basename to one safe path segment. The original
 * extension is kept because artifact classification may depend on it.
 */
export const sanitizeUploadName = (encoded: string | undefined): string => {
  let decoded = FALLBACK_NAME;
  if (encoded !== undefined && encoded !== "") {
    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      return FALLBACK_NAME;
    }
  }
  const segment = decoded.split(/[\\/]/u).at(-1) ?? "";
  const cleaned = segment
    .replace(/[^A-Za-z0-9._ -]/gu, "_")
    .slice(0, MAX_NAME_LENGTH)
    .replace(/^\.+$/u, "");
  return cleaned === "" ? FALLBACK_NAME : cleaned;
};

/**
 * Owns upload directories from creation through removal. A directory whose
 * removal failed stays owned here and is retried at shutdown.
 */
export class UploadStaging {
  readonly #retained = new Set<PrivateRuntimeRoot>();

  /** Write the request body into a new 0700 directory as a 0600 file. */
  async stage(
    body: Readable,
    options: { readonly name: string; readonly maxBytes: number },
  ): Promise<StagedUpload> {
    const root = await PrivateRuntimeRoot.create({ prefix: "rea-web-upload-" });
    const path = join(root.path, options.name);
    let bytes = 0;
    try {
      const file = await open(path, "wx", 0o600);
      try {
        for await (const chunk of body) {
          const data = chunk as Buffer;
          bytes += data.length;
          if (bytes > options.maxBytes)
            throw new UploadTooLargeError(options.maxBytes);
          await file.write(data);
        }
      } finally {
        await file.close();
      }
    } catch (cause) {
      await this.release({ displayName: options.name, path, bytes, root });
      throw cause;
    }
    return { displayName: options.name, path, bytes, root };
  }

  /** Remove the upload directory; a failure is reported and the directory kept. */
  async release(upload: StagedUpload): Promise<WebCleanup> {
    try {
      await upload.root.close();
      this.#retained.delete(upload.root);
      return { status: "removed" };
    } catch (cause) {
      this.#retained.add(upload.root);
      return {
        status: "failed",
        detail: `Could not remove ${upload.root.path}: ${cause instanceof Error ? cause.message : "unknown error"}`,
      };
    }
  }

  /** Retry removal of every directory whose earlier removal failed. */
  async releaseRetained(): Promise<WebCleanup> {
    const failures: string[] = [];
    for (const root of this.#retained) {
      try {
        await root.close();
        this.#retained.delete(root);
      } catch (cause) {
        failures.push(
          `${root.path}: ${cause instanceof Error ? cause.message : "unknown error"}`,
        );
      }
    }
    return failures.length === 0
      ? { status: "removed" }
      : { status: "failed", detail: failures.join("; ") };
  }
}
