import assert from "node:assert/strict";
import { PassThrough, type Readable } from "node:stream";
import test from "node:test";
import { createElement, Suspense } from "react";
import {
  deserializePostponedState,
  prerenderPartial,
  resumePartial,
  serializePostponedState
} from "./ppr.js";

async function read(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

test("PPR emits a static Suspense shell and resumes its postponed hole", async () => {
  let ready = false;
  let resolveData: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { resolveData = resolve; });
  function Dynamic() {
    if (!ready) throw pending;
    return createElement("strong", { id: "dynamic" }, "dynamic-from-server");
  }
  const tree = createElement("main", null,
    createElement("h1", null, "static-shell"),
    createElement(Suspense, { fallback: createElement("p", { id: "fallback" }, "loading") },
      createElement(Dynamic)));

  const prerendered = await prerenderPartial(tree, { staticBudgetMs: 10, onError: () => "ppr-budget" });
  const shell = await read(prerendered.prelude as Readable);
  assert.match(shell, /static-shell/);
  assert.match(shell, /loading/);
  assert.ok(prerendered.postponed);

  ready = true;
  resolveData?.();
  const restored = deserializePostponedState(serializePostponedState(prerendered.postponed));
  const resumed = await resumePartial(tree, restored);
  const output = new PassThrough();
  const completed = read(output);
  resumed.pipe(output);
  assert.match(await completed, /dynamic-from-server/);
});
