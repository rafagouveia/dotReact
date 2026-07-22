#!/usr/bin/env node
import cluster, { type Worker } from "node:cluster";
import { timingSafeEqual } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer, type Socket } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PROTOCOL_VERSION, isRenderRequest, type RenderFailure, type RenderResponse } from "@blackredsolutionsteam/dotreact-protocol";
import {
  BINARY_RENDER_MEDIA_TYPE,
  binaryFailure,
  decodeBinaryRenderRequest,
  encodeBinaryRenderResponse
} from "./binary-runtime.js";
import { isLoopbackHost, readIntegerEnvironment } from "./http-runtime.js";
import { RendererFrameDecoder, RendererFrameKind, encodeRendererFrame } from "./framed-runtime.js";
import { handleRenderStream, type RenderStreamEntry } from "./stream-runtime.js";

const port = readIntegerEnvironment(process.env, "DOTREACT_RENDERER_PORT", 5178, 1, 65_535);
const host = process.env.DOTREACT_RENDERER_HOST ?? "127.0.0.1";
const socketPath = process.env.DOTREACT_RENDERER_SOCKET;
const frameSocketPath = process.env.DOTREACT_RENDERER_FRAME_SOCKET;
const token = process.env.DOTREACT_RENDERER_TOKEN;
const entryPath = process.env.DOTREACT_SERVER_ENTRY;
const workerCount = readIntegerEnvironment(process.env, "DOTREACT_RENDERER_WORKERS", 1, 1, 32);
const maxBodyBytes = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_BODY_BYTES", 1_048_576, 1_024, 16_777_216);
const maxResponseBytes = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_RESPONSE_BYTES", 4_194_304, 1_024, 33_554_432);
const maxConcurrency = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_CONCURRENCY", 32, 1, 1_024);
const keepAliveTimeout = readIntegerEnvironment(process.env, "DOTREACT_KEEP_ALIVE_TIMEOUT_MS", 65_000, 1_000, 300_000);
const requestTimeout = readIntegerEnvironment(process.env, "DOTREACT_RENDER_REQUEST_TIMEOUT_MS", 30_000, 1_000, 300_000);

if (!isLoopbackHost(host)) throw new Error("Production renderer must bind to a loopback host.");
if (!token || token.length < 32) throw new Error("DOTREACT_RENDERER_TOKEN must contain at least 32 characters in production.");
if (!entryPath) throw new Error("DOTREACT_SERVER_ENTRY is required in production.");

if (cluster.isPrimary && workerCount > 1) startCluster();
else await startRenderer();

function startCluster(): void {
  removeStaleSocket();
  cluster.schedulingPolicy = cluster.SCHED_RR;
  let stopping = false;
  const ready = new Set<number>();

  const fork = (): Worker => {
    const worker = cluster.fork();
    worker.on("message", message => {
      if (!isRendererMessage(message)) return;
      if (message.type === "ready") {
        ready.add(worker.id);
        if (ready.size === workerCount)
          process.stdout.write(`[dotreact] production renderer ready at ${socketPath ?? `http://${host}:${port}`} (${workerCount} workers)\n`);
      } else if (message.type === "shutdown") void shutdownCluster();
    });
    return worker;
  };

  for (let index = 0; index < workerCount; index++) fork();
  cluster.on("exit", worker => {
    ready.delete(worker.id);
    if (!stopping) fork();
  });

  const shutdownCluster = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    const workers = Object.values(cluster.workers ?? {}).filter((worker): worker is Worker => worker !== undefined);
    for (const worker of workers) worker.process.kill("SIGTERM");
    const deadline = Date.now() + 10_000;
    while (workers.some(worker => !worker.isDead()) && Date.now() < deadline)
      await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
    for (const worker of workers) if (!worker.isDead()) worker.process.kill("SIGKILL");
    removeStaleSocket();
    process.exit(workers.every(worker => worker.isDead()) ? 0 : 1);
  };

  process.once("SIGINT", () => void shutdownCluster());
  process.once("SIGTERM", () => void shutdownCluster());
}

async function startRenderer(): Promise<void> {
  const imported = await import(pathToFileURL(resolve(entryPath!)).href) as {
    render?: (input: unknown) => Promise<RenderResponse> | RenderResponse;
  } & Partial<RenderStreamEntry>;
  if (typeof imported.render !== "function") throw new Error("Production server entry must export render().");
  const render = imported.render;
  let activeRenders = 0;
  let draining = false;

  const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
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
  };

  const readJson = async (request: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBodyBytes) throw new Error("Render payload exceeds the configured limit.");
      chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };

  const authorized = (request: IncomingMessage): boolean =>
    request.headers.authorization === `Bearer ${token}`;

  const validFrameToken = (candidate: Buffer): boolean => {
    const expected = Buffer.from(token!, "utf8");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  };

  const handleRender = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
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
  };

  const handleBinaryRender = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!authorized(request)) return sendJson(response, 401, failure("unknown", "INVALID_REQUEST", "Invalid renderer token."));
    if (draining) return sendJson(response, 503, failure("unknown", "RENDER_FAILED", "Renderer is draining."));
    if (activeRenders >= maxConcurrency) return sendJson(response, 503, failure("unknown", "RENDER_FAILED", "Renderer concurrency limit reached."));
    let body: Buffer;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBodyBytes) throw new Error("Render payload exceeds the configured limit.");
        chunks.push(buffer);
      }
      body = Buffer.concat(chunks, size);
    } catch (error) {
      const content = encodeBinaryRenderResponse(binaryFailure("unknown", error));
      response.writeHead(400, { "content-type": BINARY_RENDER_MEDIA_TYPE, "content-length": content.length, "cache-control": "no-store" });
      response.end(content);
      return;
    }

    let renderRequest;
    try { renderRequest = decodeBinaryRenderRequest(body); }
    catch (error) {
      const content = encodeBinaryRenderResponse(binaryFailure("unknown", error));
      response.writeHead(400, { "content-type": BINARY_RENDER_MEDIA_TYPE, "content-length": content.length, "cache-control": "no-store" });
      response.end(content);
      return;
    }
    activeRenders++;
    try {
      const result = await render(renderRequest);
      const content = encodeBinaryRenderResponse(result);
      if (content.length > maxResponseBytes) throw new Error("Renderer response exceeds the configured limit.");
      response.writeHead(result.ok ? 200 : 500, {
        "content-type": BINARY_RENDER_MEDIA_TYPE,
        "content-length": content.length,
        "cache-control": "no-store"
      });
      response.end(content);
    } catch (error) {
      const content = encodeBinaryRenderResponse(binaryFailure(renderRequest.requestId, error));
      response.writeHead(500, { "content-type": BINARY_RENDER_MEDIA_TYPE, "content-length": content.length, "cache-control": "no-store" });
      response.end(content);
    } finally { activeRenders--; }
  };

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
    if (request.method === "POST" && url.pathname === "/__dotreact/render-v2") {
      void handleBinaryRender(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/__dotreact/render-stream") {
      void handleRenderStream(request, response, {
        token: token!,
        maxBodyBytes,
        maxResponseBytes,
        acquire() {
          if (draining || activeRenders >= maxConcurrency) return undefined;
          activeRenders++;
          return () => { activeRenders--; };
        },
        async loadEntry() { return imported; }
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/__dotreact/shutdown") {
      if (!authorized(request)) return sendJson(response, 401, { ok: false });
      sendJson(response, 202, { ok: true });
      if (cluster.isWorker) process.send?.({ type: "shutdown" });
      else void shutdown();
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  server.keepAliveTimeout = keepAliveTimeout;
  server.headersTimeout = Math.max(keepAliveTimeout + 1_000, 60_000);
  server.requestTimeout = requestTimeout;

  const frameServer = frameSocketPath === undefined ? undefined : createNetServer((socket: Socket) => {
    const decoder = new RendererFrameDecoder();
    let authenticated = false;
    socket.on("data", chunk => {
      try {
        for (const frame of decoder.push(chunk)) {
          if (!authenticated) {
            if (frame.kind !== RendererFrameKind.authenticate || !validFrameToken(frame.token)) {
              socket.destroy();
              return;
            }
            authenticated = true;
            socket.write(encodeRendererFrame(RendererFrameKind.authenticationAccepted));
            continue;
          }
          if (frame.kind !== RendererFrameKind.renderRequest || frame.correlationId.length === 0) {
            socket.destroy();
            return;
          }
          void handleFramedRender(socket, frame.correlationId, frame.payload);
        }
      } catch { socket.destroy(); }
    });
  });

  const handleFramedRender = async (socket: Socket, correlationId: string, body: Buffer): Promise<void> => {
    let renderRequest;
    try {
      if (body.length > maxBodyBytes) throw new Error("Render payload exceeds the configured limit.");
      renderRequest = decodeBinaryRenderRequest(body);
      if (renderRequest.requestId !== correlationId)
        throw new Error("Renderer frame correlation did not match the binary request.");
    } catch (error) {
      const response = encodeBinaryRenderResponse(binaryFailure(correlationId, error));
      if (!socket.destroyed)
        socket.write(encodeRendererFrame(RendererFrameKind.renderResponse, correlationId, Buffer.alloc(0), response));
      return;
    }
    if (draining || activeRenders >= maxConcurrency) {
      const reason = draining ? "Renderer is draining." : "Renderer concurrency limit reached.";
      const response = encodeBinaryRenderResponse(binaryFailure(renderRequest.requestId, reason));
      if (!socket.destroyed)
        socket.write(encodeRendererFrame(RendererFrameKind.renderResponse, correlationId, Buffer.alloc(0), response));
      return;
    }
    activeRenders++;
    try {
      let response: Buffer;
      try {
        response = encodeBinaryRenderResponse(await render(renderRequest));
        if (response.length > maxResponseBytes) throw new Error("Renderer response exceeds the configured limit.");
      } catch (error) { response = encodeBinaryRenderResponse(binaryFailure(renderRequest.requestId, error)); }
      if (!socket.destroyed)
        socket.write(encodeRendererFrame(RendererFrameKind.renderResponse, correlationId, Buffer.alloc(0), response));
    } finally { activeRenders--; }
  };

  let listeningServers = 0;
  const requiredServers = frameServer === undefined ? 1 : 2;
  const ready = (): void => {
    listeningServers++;
    if (listeningServers !== requiredServers) return;
    if (cluster.isWorker) process.send?.({ type: "ready" });
    else process.stdout.write(`[dotreact] production renderer ready at ${socketPath ?? `http://${host}:${port}`}${frameSocketPath ? " with framed IPC" : ""}\n`);
  };
  if (socketPath !== undefined) {
    if (!cluster.isWorker) removeStaleSocket();
    server.listen(socketPath, ready);
  } else server.listen(port, host, ready);
  frameServer?.listen(frameSocketPath!, ready);

  const shutdown = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    server.close();
    frameServer?.close();
    const deadline = Date.now() + 10_000;
    while (activeRenders > 0 && Date.now() < deadline)
      await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
    process.exit(activeRenders === 0 ? 0 : 1);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

function failure(requestId: string, code: RenderFailure["error"]["code"], error: unknown): RenderFailure {
  return { protocolVersion: PROTOCOL_VERSION, requestId, ok: false,
    error: { code, message: error instanceof Error ? error.message : String(error) } };
}

function isRendererMessage(message: unknown): message is { type: "ready" | "shutdown" } {
  return typeof message === "object" && message !== null && "type" in message
    && (message.type === "ready" || message.type === "shutdown");
}

function removeStaleSocket(): void {
  if (process.platform === "win32") return;
  for (const endpoint of [socketPath, frameSocketPath]) {
    if (endpoint === undefined || !existsSync(endpoint)) continue;
    try { unlinkSync(endpoint); } catch { /* another live primary may own it */ }
  }
}
