import type { ServerResponse } from "node:http";

import { HttpRejection } from "./http.js";
import type { WebCleanup } from "./types.js";
import type { UploadStaging } from "./uploadStaging.js";

interface ActiveWork {
  readonly controller: AbortController;
  readonly settled: Promise<void>;
}

/**
 * Admits one unit of analysis work at a time across every route, aborts it
 * when the client disconnects, and owns shutdown of in-flight work.
 */
export class WorkGate {
  #active: ActiveWork | undefined;

  /** Run `work` exclusively; a concurrent request is rejected with 409. */
  async run(
    response: ServerResponse,
    work: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (this.#active !== undefined)
      throw new HttpRejection(
        409,
        "busy",
        "Another analysis is running; retry when it finishes.",
      );
    const controller = new AbortController();
    const running = work(controller.signal);
    this.#active = {
      controller,
      settled: running.then(
        () => undefined,
        () => undefined,
      ),
    };
    response.once("close", () => {
      if (!response.writableFinished) controller.abort();
    });
    try {
      await running;
    } finally {
      this.#active = undefined;
    }
  }

  /** Cancel running work, wait for its cleanup, then retry retained uploads. */
  async stop(staging: UploadStaging): Promise<WebCleanup> {
    this.#active?.controller.abort();
    await this.#active?.settled;
    return staging.releaseRetained();
  }
}
