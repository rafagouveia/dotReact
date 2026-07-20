import assert from "node:assert/strict";
import test from "node:test";
import { Image, buildImageUrl } from "./index.js";

test("buildImageUrl encodes bounded optimizer parameters", () => {
  assert.equal(
    buildImageUrl({ src: "/images/hero photo.png", width: 960, quality: 80, format: "webp" }),
    "/_dotreact/image?src=%2Fimages%2Fhero+photo.png&w=960&f=webp&q=80"
  );
});

test("buildImageUrl rejects unsafe sources and dimensions", () => {
  assert.throws(() => buildImageUrl({ src: "/../secret.png", width: 960 }), /safe root-relative/u);
  assert.throws(() => buildImageUrl({ src: "http://images.example/a.png", width: 960 }), /HTTPS/u);
  assert.throws(() => buildImageUrl({ src: "/image.png", width: 0 }), /width/u);
  assert.throws(() => buildImageUrl({ src: "/image.png", width: 960, quality: 101 }), /quality/u);
});

test("Image returns accessible lazy defaults and priority overrides", () => {
  const lazy = Image({ alt: "A mountain", src: "/mountain.png", width: 640, height: 320 });
  const lazyProps = lazy.props as Record<string, unknown>;
  assert.equal(lazy.type, "img");
  assert.equal(lazyProps.alt, "A mountain");
  assert.equal(lazyProps.loading, "lazy");
  assert.equal(lazyProps.decoding, "async");
  assert.equal(lazyProps.width, 640);
  assert.equal(lazyProps.height, 320);

  const priority = Image({ alt: "Hero", src: "/hero.png", width: 1280, priority: true });
  const priorityProps = priority.props as Record<string, unknown>;
  assert.equal(priorityProps.loading, "eager");
  assert.equal(priorityProps.fetchPriority, "high");
});
