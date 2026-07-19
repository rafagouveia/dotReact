import assert from "node:assert/strict";
import test from "node:test";
import { createServerAction, DotReactActionError, readCsrfToken } from "./index.js";

function fakeDocument(metaToken?: string, hydration?: unknown): Document {
  return {
    querySelector(selector: string) {
      if (selector.startsWith("meta") && metaToken !== undefined) return { content: metaToken };
      if (selector.startsWith("#") && hydration !== undefined) return { textContent: JSON.stringify(hydration) };
      return null;
    }
  } as unknown as Document;
}

test("posts typed JSON to encoded action segments with same-origin credentials and CSRF", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const action = createServerAction<{ name: string }, { id: number }>(["work-items", "create.fast"], {
    document: fakeDocument("csrf-1"),
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 42 }), { headers: { "content-type": "application/json" } });
    }
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await action({ name: "First" }, { signal }), { id: 42 });
  assert.equal(capturedUrl, "/_dotreact/actions/work-items/create.fast");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(capturedInit?.credentials, "same-origin");
  assert.equal(capturedInit?.body, JSON.stringify({ name: "First" }));
  assert.equal(capturedInit?.signal, signal);
  const headers = capturedInit?.headers as Headers;
  assert.equal(headers.get("X-DotReact-Action"), "1");
  assert.equal(headers.get("X-DotReact-CSRF"), "csrf-1");
});

test("reads CSRF from hydration when no meta token exists", () => {
  assert.equal(readCsrfToken(fakeDocument(undefined, { security: { csrfToken: "hydrated" } })), "hydrated");
});

test("throws a structured action error and never retries", async () => {
  let calls = 0;
  const action = createServerAction<object, object>("items/create", {
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ title: "Validation failed", errors: { name: ["Required"] } }), {
        status: 422,
        headers: { "content-type": "application/problem+json" }
      });
    }
  });
  await assert.rejects(action({}), (error: unknown) => {
    assert.ok(error instanceof DotReactActionError);
    assert.equal(error.status, 422);
    assert.equal(error.message, "Validation failed");
    assert.deepEqual(error.problem, { title: "Validation failed", errors: { name: ["Required"] } });
    return true;
  });
  assert.equal(calls, 1);
});

test("rejects empty action path segments", () => {
  assert.throws(() => createServerAction("items//create"), /safe path segments/);
  assert.throws(() => createServerAction(["items", ".."]), /safe path segments/);
  assert.throws(() => createServerAction(["items", "bad\\segment"]), /safe path segments/);
});

test("sends an explicit idempotency key and surfaces safe revalidation paths", async () => {
  const observed: string[][] = [];
  let capturedHeaders: Headers | undefined;
  const action = createServerAction<object, { ok: boolean }>("items/create", {
    onRevalidate: (paths) => observed.push([...paths]),
    fetch: async (_url, init) => {
      capturedHeaders = init?.headers as Headers;
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json",
          "X-DotReact-Revalidate": `${encodeURIComponent("/items?view=all")},${encodeURIComponent("/dashboard")}`
        }
      });
    }
  });

  await action({}, { idempotencyKey: "create-018f-1" });

  assert.equal(capturedHeaders?.get("Idempotency-Key"), "create-018f-1");
  assert.deepEqual(observed, [["/items?view=all", "/dashboard"]]);
});

test("rejects unsafe idempotency keys before fetch", async () => {
  let calls = 0;
  const action = createServerAction("items/create", { fetch: async () => {
    calls++;
    return new Response("{}");
  } });

  await assert.rejects(action({}, { idempotencyKey: "bad/key" }), /safe printable ASCII/);
  assert.equal(calls, 0);
});
