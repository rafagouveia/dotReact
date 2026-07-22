import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { PROTOCOL_VERSION } from "@rafagouveia/dotreact-protocol";
import { createDotReactReactRuntime } from "./react-runtime.js";

test("framework React runtime owns SSR markup, metadata and font preloads", () => {
  const page = {
    default: ({ message }: Record<string, unknown>) => createElement("main", null, String(message)),
    metadata: {
      title: "Runtime page",
      description: "Framework-owned SSR",
      scripts: [{ src: "/scripts/consent.js", id: "consent", strategy: "beforeInteractive" as const }]
    }
  };
  const runtime = createDotReactReactRuntime({
    pages: { index: page },
    fontPreloads: [{ rel: "preload", as: "font", href: "/fonts/app.woff2", type: "font/woff2" }]
  });
  const result = runtime.render({
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request-1",
    moduleId: "index",
    url: "/",
    props: { message: "hello" },
    renderMode: "ssr"
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.html, /hello/);
  assert.deepEqual(result.head[0], { kind: "title", content: "Runtime page" });
  assert.equal(result.head.some(item => item.kind === "link" && item.attrs.href === "/fonts/app.woff2"), true);
  assert.equal(result.head.some(item => item.kind === "script" && item.attrs.src === "/scripts/consent.js"), true);
});

test("framework React runtime fails closed for unknown modules", () => {
  const runtime = createDotReactReactRuntime({ pages: {} });
  const result = runtime.render({
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request-2",
    moduleId: "missing",
    url: "/missing",
    props: {},
    renderMode: "ssr"
  });
  assert.equal(result.ok, false);
});
