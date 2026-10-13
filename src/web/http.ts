import type { IncomingMessage, ServerResponse } from "node:http";

/** Response headers every route carries, including rejections. */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

/** Expected request failure rendered as `{error:{code,message}}`. */
export class HttpRejection extends Error {
  readonly _tag = "HttpRejection";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const applySecurityHeaders = (response: ServerResponse): void => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    response.setHeader(name, value);
};

export const sendBody = (
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
): void => {
  if (response.headersSent || response.destroyed) return;
  response.statusCode = status;
  response.setHeader("content-type", contentType);
  response.setHeader("content-length", Buffer.byteLength(body));
  response.end(body);
};

export const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void =>
  sendBody(
    response,
    status,
    "application/json; charset=utf-8",
    JSON.stringify(body),
  );

/** Render a rejection; an unread request body ends the connection after the reply. */
export const sendRejection = (
  request: IncomingMessage,
  response: ServerResponse,
  rejection: HttpRejection,
): void => {
  if (!request.readableEnded) {
    response.setHeader("connection", "close");
    request.resume();
  }
  sendJson(response, rejection.status, {
    error: { code: rejection.code, message: rejection.message },
  });
};

/** Read at most `limit` bytes; the caller maps overflow to its own rejection. */
export const readBounded = async (
  request: IncomingMessage,
  limit: number,
): Promise<Buffer | undefined> => {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const bytes = chunk as Buffer;
    received += bytes.length;
    if (received > limit) return undefined;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
};

/** Declared Content-Length, or undefined when absent or not a plain integer. */
export const declaredLength = (
  request: IncomingMessage,
): number | undefined => {
  const value = request.headers["content-length"];
  return typeof value === "string" && /^\d{1,15}$/u.test(value)
    ? Number(value)
    : undefined;
};
