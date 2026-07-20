import assert from "node:assert/strict";
import test from "node:test";
import { script } from "./index.js";

test("declares immutable local and HTTPS scripts with an explicit loading strategy", () => {
  const local = script({ src: "/scripts/analytics.js", id: "analytics", strategy: "lazyOnload" });
  const external = script({ src: "https://cdn.example.test/sdk.js", integrity: `sha384-${"a".repeat(64)}` });
  assert.equal(local.strategy, "lazyOnload");
  assert.equal(external.strategy, "afterInteractive");
  assert.equal(Object.isFrozen(local), true);
});

test("rejects executable, traversing and credentialed script locations", () => {
  assert.throws(() => script({ src: "javascript:alert(1)" }), /root-relative/);
  assert.throws(() => script({ src: "/scripts/../secret.js" }), /root-relative/);
  assert.throws(() => script({ src: "https://user:secret@example.test/sdk.js" }), /root-relative/);
});
