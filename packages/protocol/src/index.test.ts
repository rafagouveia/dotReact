import assert from "node:assert/strict";
import test from "node:test";
import {
  STREAM_PROTOCOL_VERSION,
  isRenderRequest,
  isRenderStreamFrame,
  isRenderStreamRequest
} from "./index.js";

test("validates protocol v1 render requests", () => {
  assert.equal(isRenderRequest({
    protocolVersion: 1,
    requestId: "request-1",
    moduleId: "app/page",
    url: "/",
    props: { message: "hello" },
    renderMode: "ssr"
  }), true);
  assert.equal(isRenderRequest({ protocolVersion: 2 }), false);
});

test("accepts the nullable boundary discriminator emitted by System.Text.Json", () => {
  assert.equal(isRenderRequest({
    protocolVersion: 1,
    requestId: "request-2",
    moduleId: "page",
    url: "/",
    props: {},
    renderMode: "ssr",
    boundaryKind: null
  }), true);
});

test("validates streaming protocol v2 without widening protocol v1", () => {
  const request = {
    protocolVersion: STREAM_PROTOCOL_VERSION,
    requestId: "stream-1",
    moduleId: "products/[id]/page",
    url: "/products/42",
    props: { id: 42 },
    renderMode: "stream",
    responseKind: "document",
    capabilities: ["html-stream"],
    nonce: "c3RyZWFtLW5vbmNlLTEyMzQ="
  };
  assert.equal(isRenderStreamRequest(request), true);
  assert.equal(isRenderRequest(request), false);
  assert.equal(isRenderStreamRequest({ ...request, protocolVersion: 1 }), false);
  assert.equal(isRenderStreamRequest({ ...request, capabilities: ["unknown"] }), false);
  assert.equal(isRenderStreamRequest({ ...request, nonce: "" }), false);
  assert.equal(isRenderStreamRequest({ ...request, nonce: "unsafe nonce\n" }), false);
});

test("validates correlated streaming frames", () => {
  assert.equal(isRenderStreamFrame({
    protocolVersion: 2,
    requestId: "stream-1",
    kind: "start",
    head: [{ kind: "title", content: "Produto" }]
  }, "stream-1"), true);
  assert.equal(isRenderStreamFrame({
    protocolVersion: 2,
    requestId: "stream-1",
    kind: "start",
    head: [{ kind: "script", attrs: { src: "/scripts/app.js", defer: "" } }]
  }, "stream-1"), true);
  assert.equal(isRenderStreamFrame({
    protocolVersion: 2,
    requestId: "stream-1",
    kind: "html",
    sequence: 0,
    chunk: "<main>"
  }, "another-request"), false);
  assert.equal(isRenderStreamFrame({
    protocolVersion: 2,
    requestId: "stream-1",
    kind: "complete",
    metrics: { renderMilliseconds: -1 }
  }), false);
});
