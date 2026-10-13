import { createDirectAnalysis } from "../composition/directAnalysis.js";
import { createWebAnalyzer } from "./analyzeTarget.js";
import { createWebCapabilitiesReader } from "./capabilities.js";
import { createWebDecompiler } from "./decompileExport.js";
import { parseWebConfig } from "./config.js";
import { startWebServer } from "./server.js";

/** Run `rea web` until interrupted; resolves to the process exit code. */
export const runEntrypoint = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> => {
  const config = parseWebConfig(environment);
  if (!config.ok) {
    const settings = config.error.settings
      .map(({ setting, constraint }) => `${setting} ${constraint}`)
      .join("; ");
    process.stderr.write(`${config.error.message}: ${settings}\n`);
    return 1;
  }
  const { runProviderAnalysis, runDirectAnalysisSession, runSessionStatus } =
    createDirectAnalysis(environment);
  const capabilities = createWebCapabilitiesReader(() => runSessionStatus());
  const server = await startWebServer({
    config: config.value,
    analyze: createWebAnalyzer(runProviderAnalysis),
    capabilities,
    decompile: createWebDecompiler({
      runDirectAnalysisSession,
      readCapabilities: capabilities,
    }),
  });
  // The URL carries the access token. It is printed once, to the terminal that
  // started the server, and is never logged elsewhere.
  process.stderr.write(`REA web UI (static analysis only): ${server.url}\n`);
  return new Promise<number>((resolve) => {
    let stopping = false;
    const stop = (): void => {
      if (stopping) return;
      stopping = true;
      server.close().then(
        (cleanup) => {
          if (cleanup.status === "failed")
            process.stderr.write(
              `Upload cleanup incomplete: ${cleanup.detail ?? "unknown"}\n`,
            );
          resolve(cleanup.status === "failed" ? 1 : 0);
        },
        (cause: unknown) => {
          process.stderr.write(
            `Shutdown failed: ${cause instanceof Error ? cause.message : "unknown error"}\n`,
          );
          resolve(1);
        },
      );
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
};
