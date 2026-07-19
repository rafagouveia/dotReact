import assert from "node:assert/strict";
import test from "node:test";
import { isRenderRequest } from "./index.js";

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
