import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackHost, readIntegerEnvironment } from "./http-runtime.js";

test("reads bounded renderer tuning values deterministically", () => {
  assert.equal(readIntegerEnvironment({}, "LIMIT", 32, 1, 64), 32);
  assert.equal(readIntegerEnvironment({ LIMIT: "8" }, "LIMIT", 32, 1, 64), 8);
  for (const value of ["0", "65", "1.5", "8ms", "-1"])
    assert.throws(() => readIntegerEnvironment({ LIMIT: value }, "LIMIT", 32, 1, 64), /LIMIT/);
});

test("production binding accepts loopback hosts only", () => {
  for (const host of ["127.0.0.1", "::1", "localhost"]) assert.equal(isLoopbackHost(host), true);
  for (const host of ["0.0.0.0", "::", "example.com", "127.0.0.2"]) assert.equal(isLoopbackHost(host), false);
});
