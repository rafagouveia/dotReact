import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  STREAM_MEDIA_TYPE,
  STREAM_PROTOCOL_HEADER,
  STREAM_PROTOCOL_VERSION,
  type RenderStreamRequest
} from "@blackredsolutionsteam/dotreact-protocol";
import {
  handleRenderStream,
  RenderStreamEncoder,
  RenderStreamProtocolError,
  RenderStreamResponseLimitError,
  type RenderStreamEntry,
  type RenderStreamHandlerOptions
} from "./stream-runtime.js";

const requestBody: RenderStreamRequest = {
  protocolVersion: STREAM_PROTOCOL_VERSION,
  requestId: "request-1",
  moduleId: "page",
  url: "/",
  props: {},
  renderMode: "stream",
  responseKind: "document",
  capabilities: ["html-stream"]
};

async function startServer(options: RenderStreamHandlerOptions): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.url === "/__dotreact/render-stream") void handleRenderStream(request, response, options);
    else { response.statusCode = 404; response.end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected an IP test listener.");
  return {
    url: `http://127.0.0.1:${address.port}/__dotreact/render-stream`,
    async close() { server.close(); await once(server, "close"); }
  };
}

function streamHeaders(token?: string): HeadersInit {
  return {
    "content-type": "application/json",
    "accept": STREAM_MEDIA_TYPE,
    [STREAM_PROTOCOL_HEADER]: String(STREAM_PROTOCOL_VERSION),
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` })
  };
}

function simpleEntry(): RenderStreamEntry {
  return {
    async *renderStream(request) {
      yield { protocolVersion: 2, requestId: request.requestId, kind: "start", head: [] };
      yield { protocolVersion: 2, requestId: request.requestId, kind: "html", sequence: 0, chunk: "<main>ok</main>" };
      yield { protocolVersion: 2, requestId: request.requestId, kind: "complete" };
    }
  };
}

test("encodes a correlated ordered stream", () => {
  const encoder = new RenderStreamEncoder("request-1", 4096);
  assert.match(encoder.encode({
    protocolVersion: STREAM_PROTOCOL_VERSION,
    requestId: "request-1",
    kind: "start",
    head: []
  }).toString(), /"kind":"start"/);
  encoder.encode({
    protocolVersion: STREAM_PROTOCOL_VERSION,
    requestId: "request-1",
    kind: "html",
    sequence: 0,
    chunk: "<main>ready</main>"
  });
  encoder.encode({
    protocolVersion: STREAM_PROTOCOL_VERSION,
    requestId: "request-1",
    kind: "complete"
  });
  assert.equal(encoder.started, true);
  assert.equal(encoder.terminal, true);
});

test("rejects uncorrelated, out-of-order and post-terminal frames", () => {
  const encoder = new RenderStreamEncoder("request-1", 4096);
  assert.throws(() => encoder.encode({
    protocolVersion: 2,
    requestId: "other",
    kind: "start",
    head: []
  }), RenderStreamProtocolError);
  encoder.encode({ protocolVersion: 2, requestId: "request-1", kind: "start", head: [] });
  assert.throws(() => encoder.encode({
    protocolVersion: 2,
    requestId: "request-1",
    kind: "html",
    sequence: 2,
    chunk: "late"
  }), RenderStreamProtocolError);
  encoder.encode({ protocolVersion: 2, requestId: "request-1", kind: "complete" });
  assert.throws(() => encoder.encode({
    protocolVersion: 2,
    requestId: "request-1",
    kind: "html",
    sequence: 0,
    chunk: "after"
  }), RenderStreamProtocolError);
});

test("enforces the cumulative encoded response limit", () => {
  const encoder = new RenderStreamEncoder("request-1", 100);
  assert.throws(() => encoder.encode({
    protocolVersion: 2,
    requestId: "request-1",
    kind: "start",
    head: [{ kind: "title", content: "x".repeat(100) }]
  }), RenderStreamResponseLimitError);
});

test("stream endpoint enforces auth and version negotiation", async context => {
  const server = await startServer({
    token: "secret",
    maxBodyBytes: 4096,
    maxResponseBytes: 4096,
    acquire: () => () => undefined,
    loadEntry: async () => simpleEntry()
  });
  context.after(() => server.close());

  const unauthorized = await fetch(server.url, {
    method: "POST",
    headers: streamHeaders(),
    body: JSON.stringify(requestBody)
  });
  assert.equal(unauthorized.status, 401);

  const incompatible = await fetch(server.url, {
    method: "POST",
    headers: { ...streamHeaders("secret"), [STREAM_PROTOCOL_HEADER]: "1" },
    body: JSON.stringify(requestBody)
  });
  assert.equal(incompatible.status, 406);

  const response = await fetch(server.url, {
    method: "POST",
    headers: streamHeaders("secret"),
    body: JSON.stringify(requestBody)
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get(STREAM_PROTOCOL_HEADER), "2");
  assert.equal(response.headers.get("content-type"), STREAM_MEDIA_TYPE);
  const frames = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { kind: string });
  assert.deepEqual(frames.map(frame => frame.kind), ["start", "html", "complete"]);
});

test("stream endpoint applies its concurrency gate", async context => {
  let active = 0;
  let resume!: () => void;
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  const entry: RenderStreamEntry = {
    async *renderStream(request) {
      yield { protocolVersion: 2, requestId: request.requestId, kind: "start", head: [] };
      await waiting;
      yield { protocolVersion: 2, requestId: request.requestId, kind: "complete" };
    }
  };
  const server = await startServer({
    maxBodyBytes: 4096,
    maxResponseBytes: 4096,
    acquire() {
      if (active === 1) return undefined;
      active++;
      return () => { active--; };
    },
    loadEntry: async () => entry
  });
  context.after(() => server.close());

  const first = await fetch(server.url, { method: "POST", headers: streamHeaders(), body: JSON.stringify(requestBody) });
  const second = await fetch(server.url, {
    method: "POST",
    headers: streamHeaders(),
    body: JSON.stringify({ ...requestBody, requestId: "request-2" })
  });
  assert.equal(second.status, 503);
  resume();
  await first.text();
  assert.equal(active, 0);
});

test("closing the consumer aborts the generic renderStream entry", async context => {
  let observedAbort!: () => void;
  const aborted = new Promise<void>(resolve => { observedAbort = resolve; });
  const entry: RenderStreamEntry = {
    async *renderStream(request, renderContext) {
      yield { protocolVersion: 2, requestId: request.requestId, kind: "start", head: [] };
      await new Promise<void>((_, reject) => renderContext.signal.addEventListener("abort", () => {
        observedAbort();
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true }));
    }
  };
  const server = await startServer({
    maxBodyBytes: 4096,
    maxResponseBytes: 4096,
    acquire: () => () => undefined,
    loadEntry: async () => entry
  });
  context.after(() => server.close());

  const controller = new AbortController();
  const response = await fetch(server.url, {
    method: "POST",
    headers: streamHeaders(),
    body: JSON.stringify(requestBody),
    signal: controller.signal
  });
  const reader = response.body!.getReader();
  await reader.read();
  controller.abort();
  await Promise.race([
    aborted,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Abort was not propagated.")), 2000))
  ]);
});
