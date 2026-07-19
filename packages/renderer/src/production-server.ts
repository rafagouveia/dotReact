#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PROTOCOL_VERSION, isRenderRequest, type RenderFailure, type RenderResponse } from "@dotreact/protocol";
import { isLoopbackHost, readIntegerEnvironment } from "./http-runtime.js";

const port = readIntegerEnvironment(process.env, "DOTREACT_RENDERER_PORT", 5178, 1, 65_535);
const host = process.env.DOTREACT_RENDERER_HOST ?? "127.0.0.1";
const token = process.env.DOTREACT_RENDERER_TOKEN;
const entryPath = process.env.DOTREACT_SERVER_ENTRY;
const maxBodyBytes = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_BODY_BYTES", 1_048_576, 1_024, 16_777_216);
const maxResponseBytes = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_RESPONSE_BYTES", 4_194_304, 1_024, 33_554_432);
const maxConcurrency = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_CONCURRENCY", 32, 1, 1_024);
const keepAliveTimeout = readIntegerEnvironment(process.env, "DOTREACT_KEEP_ALIVE_TIMEOUT_MS", 65_000, 1_000, 300_000);
const requestTimeout = readIntegerEnvironment(process.env, "DOTREACT_RENDER_REQUEST_TIMEOUT_MS", 30_000, 1_000, 300_000);

if (!isLoopbackHost(host)) throw new Error("Production renderer must bind to a loopback host.");
if (!token || token.length < 32) throw new Error("DOTREACT_RENDERER_TOKEN must contain at least 32 characters in production.");
if (!entryPath) throw new Error("DOTREACT_SERVER_ENTRY is required in production.");

const imported = await import(pathToFileURL(resolve(entryPath)).href) as {
  render?: (input: unknown) => Promise<RenderResponse> | RenderResponse;
};
if (typeof imported.render !== "function") throw new Error("Production server entry must export render().");
const render = imported.render;
let activeRenders = 0;
let draining = false;

function failure(requestId: string, code: RenderFailure["error"]["code"], error: unknown): RenderFailure {
  return { protocolVersion: PROTOCOL_VERSION, requestId, ok: false,
    error: { code, message: error instanceof Error ? error.message : String(error) } };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  let content = Buffer.from(JSON.stringify(body));
  if (content.byteLength > maxResponseBytes) {
    status = 500;
    content = Buffer.from(JSON.stringify(failure("unknown", "RENDER_FAILED", "Renderer response exceeds the configured limit.")));
  }
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": content.byteLength
  });
  response.end(content);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("Render payload exceeds the configured limit.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${token}`;
}

async function handleRender(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!authorized(request)) return sendJson(response, 401, failure("unknown", "INVALID_REQUEST", "Invalid renderer token."));
  if (draining) return sendJson(response, 503, failure("unknown", "RENDER_FAILED", "Renderer is draining."));
  if (activeRenders >= maxConcurrency) return sendJson(response, 503, failure("unknown", "RENDER_FAILED", "Renderer concurrency limit reached."));
  let body: unknown;
  try { body = await readJson(request); }
  catch (error) { return sendJson(response, 400, failure("unknown", "INVALID_REQUEST", error)); }
  if (!isRenderRequest(body)) return sendJson(response, 400, failure("unknown", "INVALID_REQUEST", "Invalid render request."));

  activeRenders++;
  try {
    const result = await render(body);
    sendJson(response, result.ok ? 200 : 500, result);
  } catch (error) {
    sendJson(response, 500, failure(body.requestId, "RENDER_FAILED", error));
  } finally { activeRenders--; }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && (url.pathname === "/__dotreact/live" || url.pathname === "/__dotreact/health"))
    return sendJson(response, 200, { ok: true, protocolVersion: PROTOCOL_VERSION });
  if (request.method === "GET" && url.pathname === "/__dotreact/ready")
    return sendJson(response, draining ? 503 : 200, { ok: !draining, protocolVersion: PROTOCOL_VERSION });
  if (request.method === "POST" && url.pathname === "/__dotreact/render") {
    void handleRender(request, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/__dotreact/shutdown") {
    if (!authorized(request)) return sendJson(response, 401, { ok: false });
    sendJson(response, 202, { ok: true });
    void shutdown();
    return;
  }
  response.statusCode = 404;
  response.end("Not found");
});
server.keepAliveTimeout = keepAliveTimeout;
server.headersTimeout = Math.max(keepAliveTimeout + 1_000, 60_000);
server.requestTimeout = requestTimeout;

server.listen(port, host, () => process.stdout.write(`[dotreact] production renderer ready at http://${host}:${port}\n`));

async function shutdown(): Promise<void> {
  if (draining) return;
  draining = true;
  server.close();
  const deadline = Date.now() + 10_000;
  while (activeRenders > 0 && Date.now() < deadline) await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  process.exit(activeRenders === 0 ? 0 : 1);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
