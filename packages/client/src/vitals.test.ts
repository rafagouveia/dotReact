import assert from "node:assert/strict";
import test from "node:test";
import { rateDotReactWebVital } from "./vitals.js";

test("rates Core Web Vitals using stable public thresholds", () => {
  assert.equal(rateDotReactWebVital("CLS", 0.1), "good");
  assert.equal(rateDotReactWebVital("CLS", 0.11), "needs-improvement");
  assert.equal(rateDotReactWebVital("CLS", 0.3), "poor");
  assert.equal(rateDotReactWebVital("INP", 200), "good");
  assert.equal(rateDotReactWebVital("INP", 500), "needs-improvement");
  assert.equal(rateDotReactWebVital("LCP", 4001), "poor");
  assert.equal(rateDotReactWebVital("TTFB", 801), "needs-improvement");
});
