import { z } from "zod";

import type { JsonValue } from "../domain/jsonValue.js";

/** Deep providers whose decompiler the export can use. */
export const DEEP_PROVIDER_IDS = ["ghidra", "ida", "hopper"] as const;

/** One of the supported deep-provider identifiers. */
export type DeepProviderId = (typeof DEEP_PROVIDER_IDS)[number];

/** Availability of one deep provider as the shared provider logic reports it. */
export interface WebDeepProvider {
  readonly id: DeepProviderId;
  readonly available: boolean;
  readonly reason?: string;
}

/** Response body of `GET /api/capabilities`. */
export interface WebCapabilities {
  readonly deep_providers: readonly WebDeepProvider[];
}

/** Read target-free provider availability. */
export type WebCapabilitiesReader = () => Promise<WebCapabilities>;

const deepProviderIds: readonly string[] = DEEP_PROVIDER_IDS;

const statusSchema = z.object({
  analysis_provider_candidates: z.array(
    z.object({
      provider: z.object({ id: z.string() }),
      availability: z.discriminatedUnion("status", [
        z.object({ status: z.literal("available") }),
        z.object({ status: z.literal("unavailable"), reason: z.string() }),
      ]),
    }),
  ),
});

const failureSchema = z.object({
  error: z.object({ message: z.string() }),
});

/**
 * Derive deep-provider availability from the shared session status; this adds
 * no detection of its own. An unreadable status leaves every provider unknown,
 * which is reported as unavailable with the reason, never as available.
 */
export const readWebCapabilities = (status: JsonValue): WebCapabilities => {
  const parsed = statusSchema.safeParse(status);
  if (parsed.success)
    return {
      deep_providers: parsed.data.analysis_provider_candidates.flatMap(
        ({ provider, availability }) =>
          isDeepProviderId(provider.id)
            ? [
                availability.status === "available"
                  ? { id: provider.id, available: true }
                  : {
                      id: provider.id,
                      available: false,
                      reason: availability.reason,
                    },
              ]
            : [],
      ),
    };
  const failure = failureSchema.safeParse(status);
  const reason = failure.success
    ? failure.data.error.message
    : "Provider availability could not be read.";
  return {
    deep_providers: DEEP_PROVIDER_IDS.map((id) => ({
      id,
      available: false,
      reason,
    })),
  };
};

/** Bind capability reading to the shared target-free status operation. */
export const createWebCapabilitiesReader =
  (runSessionStatus: () => Promise<JsonValue>): WebCapabilitiesReader =>
  async () =>
    readWebCapabilities(await runSessionStatus());

const isDeepProviderId = (id: string): id is DeepProviderId =>
  deepProviderIds.includes(id);
