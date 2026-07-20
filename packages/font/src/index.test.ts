import assert from "node:assert/strict";
import test from "node:test";
import { createFontPreloadLinks, createFontStyleSheet, localFont } from "./index.js";

test("local fonts generate blocking CSS and SSR preload hints", () => {
  const font = localFont({
    family: "Satoshi",
    variable: "--font-sans",
    src: [
      { path: "/fonts/Satoshi-Regular.woff2", weight: 400 },
      { path: "/fonts/Satoshi-Bold.woff2", weight: 700, preload: false }
    ]
  });
  assert.equal(font.style.fontFamily, "var(--font-sans)");
  assert.match(createFontStyleSheet([font]), /font-display: swap/);
  assert.match(createFontStyleSheet([font]), /--font-sans: "Satoshi", system-ui, sans-serif/);
  assert.deepEqual(createFontPreloadLinks([font]).map(link => link.href), [
    "/fonts/Satoshi-Regular.woff2"
  ]);
});

test("local fonts reject external and traversal paths", () => {
  assert.throws(() => localFont({ family: "Unsafe", src: { path: "https://example.test/font.woff2" } }), /root-relative/);
  assert.throws(() => localFont({ family: "Unsafe", src: { path: "/fonts/../secret.woff2" } }), /traversal/);
});
