import assert from "node:assert/strict";
import test from "node:test";
import {
  DOTREACT_NAVIGATION_MEDIA_TYPE,
  DotReactDocumentNavigation,
  fetchDotReactNavigation
} from "./router.js";

test("navigation requests use the private media type and validate payloads", async () => {
  let observedHeaders: Headers | undefined;
  const payload = await fetchDotReactNavigation("/products/42", async (_url, init) => {
    observedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({
      protocolVersion: 1,
      requestId: "request-1",
      moduleId: "products/[id]/page",
      url: "/products/42",
      props: { id: 42 },
      statusCode: 200,
      staleTimeMs: 15_000
    }), { headers: { "content-type": `${DOTREACT_NAVIGATION_MEDIA_TYPE}; charset=utf-8` } });
  });

  assert.equal(observedHeaders?.get("X-DotReact-Navigation"), "1");
  assert.equal(observedHeaders?.get("Accept"), DOTREACT_NAVIGATION_MEDIA_TYPE);
  assert.equal(payload.moduleId, "products/[id]/page");
  assert.deepEqual(payload.props, { id: 42 });
  assert.equal(payload.staleTimeMs, 15_000);
});

test("non-DotReact responses fall back to a full document navigation", async () => {
  await assert.rejects(
    fetchDotReactNavigation("/outside", async () => new Response("html", {
      status: 200,
      headers: { "content-type": "text/html" }
    })),
    (error: unknown) => error instanceof DotReactDocumentNavigation && error.status === 200
  );
});

test("navigation rejects malformed framework payloads", async () => {
  await assert.rejects(fetchDotReactNavigation("/broken", async () => new Response("{}", {
    headers: { "content-type": DOTREACT_NAVIGATION_MEDIA_TYPE }
  })), /invalid payload/);
});
