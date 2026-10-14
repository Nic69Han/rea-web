import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { AnalyzeRoute } from "./analyzeRoute.js";
import type { WebAnalyzer } from "./analyzeTarget.js";
import type { WebCapabilitiesReader } from "./capabilities.js";
import { DecompileRoute } from "./decompileRoute.js";
import type { WebDecompiler } from "./decompileExport.js";
import { webHostAuthority, type WebConfig } from "./config.js";
import {
  applySecurityHeaders,
  HttpRejection,
  sendBody,
  sendJson,
  sendRejection,
} from "./http.js";
import { SourceRequests } from "./sourceRequests.js";
import type { WebCleanup } from "./types.js";
import { APP_CSS, APP_JS, INDEX_HTML } from "./ui/assets.js";
import { UploadStaging } from "./uploadStaging.js";
import { WorkGate } from "./workGate.js";

/** Inputs for one local web server. */
export interface WebServerOptions {
  readonly config: WebConfig;
  readonly analyze: WebAnalyzer;
  readonly decompile: WebDecompiler;
  readonly capabilities: WebCapabilitiesReader;
  /** Defaults to 32 random bytes encoded as base64url. */
  readonly token?: string;
}

/** A listening server; `url` carries the access token and must not be logged. */
export interface RunningWebServer {
  readonly origin: string;
  readonly url: string;
  readonly port: number;
  readonly token: string;
  /** Cancel work, stop listening, and retry removal of retained uploads. */
  close(): Promise<WebCleanup>;
}

const STATIC_ASSETS: Readonly<
  Record<string, { readonly type: string; readonly body: string }>
> = {
  "/assets/app.js": {
    type: "text/javascript; charset=utf-8",
    body: APP_JS,
  },
  "/assets/app.css": { type: "text/css; charset=utf-8", body: APP_CSS },
};

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/** Start listening on the configured loopback literal. */
export const startWebServer = async (
  options: WebServerOptions,
): Promise<RunningWebServer> => {
  const token = options.token ?? randomBytes(32).toString("base64url");
  const expected = digest(token);
  const staging = new UploadStaging();
  const gate = new WorkGate();
  const sources = new SourceRequests(staging, options.config.maxUploadBytes);
  const analyzeRoute = new AnalyzeRoute(options.analyze, sources, gate);
  const decompileRoute = new DecompileRoute(options.decompile, sources, gate);
  let authority = "";
  const tokenMatches = (candidate: unknown): boolean =>
    typeof candidate === "string" &&
    timingSafeEqual(digest(candidate), expected);

  const guardOrigin = (request: IncomingMessage): void => {
    if (request.headers.host !== authority)
      throw new HttpRejection(403, "forbidden_host", "Unexpected Host header.");
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== `http://${authority}`)
      throw new HttpRejection(403, "forbidden_origin", "Unexpected Origin.");
  };

  const dispatch = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    guardOrigin(request);
    const target = request.url ?? "/";
    const queryStart = target.indexOf("?");
    const pathname = queryStart === -1 ? target : target.slice(0, queryStart);
    const query = new URLSearchParams(
      queryStart === -1 ? "" : target.slice(queryStart + 1),
    );
    if (pathname.startsWith("/api/")) {
      if (!tokenMatches(request.headers["x-rea-web-token"]))
        throw new HttpRejection(
          403,
          "forbidden_token",
          "Missing or invalid token.",
        );
      if (pathname === "/api/capabilities") {
        if (request.method !== "GET")
          throw new HttpRejection(405, "method_not_allowed", "Use GET.");
        sendJson(response, 200, await options.capabilities());
        return;
      }
      const post =
        pathname === "/api/analyze"
          ? analyzeRoute
          : pathname === "/api/decompile"
            ? decompileRoute
            : undefined;
      if (post === undefined)
        throw new HttpRejection(404, "not_found", "Unknown API route.");
      if (request.method !== "POST")
        throw new HttpRejection(405, "method_not_allowed", "Use POST.");
      return post.handle(request, response, query);
    }
    servePage(request, response, pathname, tokenMatches(query.get("token")));
  };

  const server = createServer((request, response) => {
    applySecurityHeaders(response);
    dispatch(request, response).catch((cause: unknown) => {
      sendRejection(
        request,
        response,
        cause instanceof HttpRejection
          ? cause
          : new HttpRejection(500, "internal_error", "Internal error."),
      );
    });
  });
  const port = await listen(server, options.config);
  authority = webHostAuthority(options.config.host, port);
  const origin = `http://${authority}`;
  return {
    origin,
    url: `${origin}/?token=${token}`,
    port,
    token,
    close: async () => {
      const closed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      server.closeAllConnections();
      const cleanup = await gate.stop(staging);
      await closed;
      return cleanup;
    },
  };
};

const listen = (server: Server, config: WebConfig): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: config.host, port: config.port }, () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });

/** Serve the UI document (token in the query) or a static asset. */
const servePage = (
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  tokenAccepted: boolean,
): void => {
  if (request.method !== "GET")
    throw new HttpRejection(405, "method_not_allowed", "Use GET.");
  if (pathname === "/") {
    if (!tokenAccepted)
      throw new HttpRejection(
        403,
        "forbidden_token",
        "Missing or invalid token.",
      );
    sendBody(response, 200, "text/html; charset=utf-8", INDEX_HTML);
    return;
  }
  const asset = STATIC_ASSETS[pathname];
  if (asset === undefined)
    throw new HttpRejection(404, "not_found", "Unknown route.");
  sendBody(response, 200, asset.type, asset.body);
};
