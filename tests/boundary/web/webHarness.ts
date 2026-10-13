import { request, type IncomingHttpHeaders } from "node:http";

import { afterEach, vi } from "vitest";

import { createDirectAnalysis } from "../../../src/composition/directAnalysis.js";
import {
  createWebAnalyzer,
  type WebAnalyzer,
} from "../../../src/web/analyzeTarget.js";
import {
  createWebCapabilitiesReader,
  type WebCapabilitiesReader,
} from "../../../src/web/capabilities.js";
import {
  createWebDecompiler,
  type WebDecompiler,
} from "../../../src/web/decompileExport.js";
import {
  startWebServer,
  type RunningWebServer,
} from "../../../src/web/server.js";

const direct = createDirectAnalysis({});
export const { runProviderAnalysis } = direct;
const running: RunningWebServer[] = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
  vi.unstubAllEnvs();
});

/** Start a loopback server; defaults use the real composition with no provider. */
export const start = async (
  options: {
    readonly maxUploadBytes?: number;
    readonly analyze?: WebAnalyzer;
    readonly decompile?: WebDecompiler;
    readonly capabilities?: WebCapabilitiesReader;
  } = {},
): Promise<RunningWebServer> => {
  const capabilities =
    options.capabilities ??
    createWebCapabilitiesReader(() => direct.runSessionStatus());
  const server = await startWebServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      maxUploadBytes: options.maxUploadBytes ?? 1_048_576,
    },
    analyze: options.analyze ?? createWebAnalyzer(runProviderAnalysis),
    capabilities,
    decompile:
      options.decompile ??
      createWebDecompiler({
        runDirectAnalysisSession: direct.runDirectAnalysisSession,
        readCapabilities: capabilities,
      }),
  });
  running.push(server);
  return server;
};

export interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
  readonly bytes: Buffer;
}

export const send = (
  server: RunningWebServer,
  options: {
    readonly method?: string;
    readonly path: string;
    readonly headers?: Record<string, string>;
    readonly body?: Buffer | string;
  },
): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port: server.port,
        method: options.method ?? "GET",
        path: options.path,
        headers: {
          host: `127.0.0.1:${String(server.port)}`,
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: bytes.toString("utf8"),
            bytes,
          });
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(options.body);
  });

/** POST to an API route with the server token unless `token` is null. */
export const post = (
  server: RunningWebServer,
  route: string,
  options: {
    readonly headers?: Record<string, string>;
    readonly body?: Buffer | string;
    readonly token?: string | null;
  },
): Promise<Reply> =>
  send(server, {
    method: "POST",
    path: route,
    headers: {
      ...(options.token === null
        ? {}
        : { "x-rea-web-token": options.token ?? server.token }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: options.body }),
  });
