#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { PROTOCOL_VERSION, isRenderRequest, type RenderFailure, type RenderResponse } from "@blackredsolutionsteam/dotreact-protocol";
import { readIntegerEnvironment } from "./http-runtime.js";
import { handleRenderStream, type RenderStreamEntry } from "./stream-runtime.js";

const port = Number.parseInt(process.env.DOTREACT_RENDERER_PORT ?? "5173", 10);
const host = process.env.DOTREACT_RENDERER_HOST ?? "127.0.0.1";
const root = resolve(process.env.DOTREACT_APP_ROOT ?? process.cwd());
const token = process.env.DOTREACT_RENDERER_TOKEN;
const development = process.env.NODE_ENV !== "production";
const developmentBase = "/_dotreact/dev/";
const maxBodyBytes = 1_048_576;
const maxResponseBytes = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_RESPONSE_BYTES", 4_194_304, 1_024, 33_554_432);
const maxConcurrency = readIntegerEnvironment(process.env, "DOTREACT_MAX_RENDER_CONCURRENCY", 32, 1, 1_024);
let activeStreamRenders = 0;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const content = Buffer.from(JSON.stringify(body));
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
    if (size > maxBodyBytes) throw new Error("Render payload exceeds 1 MiB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function failure(requestId: string, code: RenderFailure["error"]["code"], error: unknown): RenderFailure {
  const value = error instanceof Error ? error : new Error(String(error));
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    error: {
      code,
      message: value.message,
      ...(development && value.stack ? { stack: value.stack } : {})
    }
  };
}

async function handleRender(request: IncomingMessage, response: ServerResponse, vite: ViteDevServer): Promise<void> {
  if (token && request.headers.authorization !== `Bearer ${token}`) {
    sendJson(response, 401, failure("unknown", "INVALID_REQUEST", "Invalid renderer token."));
    return;
  }

  let body: unknown;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, failure("unknown", "INVALID_REQUEST", error));
    return;
  }
  if (!isRenderRequest(body)) {
    const version = (body as { protocolVersion?: unknown } | null)?.protocolVersion;
    const code = version !== PROTOCOL_VERSION ? "PROTOCOL_MISMATCH" : "INVALID_REQUEST";
    sendJson(response, 400, failure("unknown", code, "Invalid render request."));
    return;
  }

  try {
    const entry = await vite.ssrLoadModule("virtual:dotreact/server-entry") as {
      render(input: typeof body): Promise<RenderResponse> | RenderResponse;
    };
    const result = await entry.render(body);
    sendJson(response, result.ok ? 200 : 500, result);
  } catch (error) {
    vite.ssrFixStacktrace(error as Error);
    sendJson(response, 500, failure(body.requestId, "RENDER_FAILED", error));
  }
}

let vite: ViteDevServer | undefined;
const server = createHttpServer((request, response) => {
  if (!vite) {
    response.statusCode = 503;
    response.end("Renderer is starting");
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && (url.pathname === "/__dotreact/health" || url.pathname === "/__dotreact/ready")) {
    sendJson(response, 200, { ok: true, protocolVersion: PROTOCOL_VERSION });
    return;
  }
  if (development && request.method === "GET" && url.pathname === `${developmentBase}__dotreact_route_style.css`) {
    const plugin = vite.config.plugins.find(candidate => candidate.name === "dotreact:drx") as
      | { api?: { routeStyleSheet?: (moduleKey: string) => Promise<string> } }
      | undefined;
    const routeStyleSheet = plugin?.api?.routeStyleSheet;
    if (routeStyleSheet === undefined) {
      response.statusCode = 404;
      response.end("/* DotReact route stylesheet service is unavailable. */");
      return;
    }
    void routeStyleSheet(url.searchParams.get("moduleKey") ?? "").then(css => {
      response.writeHead(200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff"
      });
      response.end(css);
    }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[dotreact] route stylesheet failed: ${message}\n`);
      response.statusCode = 404;
      response.end("/* DotReact route stylesheet was not found. */");
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__dotreact/render") {
    void handleRender(request, response, vite);
    return;
  }
  if (request.method === "POST" && url.pathname === "/__dotreact/render-stream") {
    void handleRenderStream(request, response, {
      ...(token === undefined ? {} : { token }),
      maxBodyBytes,
      maxResponseBytes,
      acquire() {
        if (activeStreamRenders >= maxConcurrency) return undefined;
        activeStreamRenders++;
        return () => { activeStreamRenders--; };
      },
      async loadEntry() {
        return await vite!.ssrLoadModule("virtual:dotreact/server-entry") as Partial<RenderStreamEntry>;
      },
      onError(error) { vite!.ssrFixStacktrace(error); }
    });
    return;
  }
  vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end("Not found");
  });
});

vite = await createViteServer({
  root,
  base: development ? developmentBase : "/",
  server: {
    middlewareMode: true,
    hmr: { server }
  },
  appType: "custom"
});

server.listen(port, host, () => {
  process.stdout.write(`[dotreact] renderer ready at http://${host}:${port} (root: ${root})\n`);
});

async function shutdown(): Promise<void> {
  await vite?.close();
  server.close(() => process.exit(0));
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
