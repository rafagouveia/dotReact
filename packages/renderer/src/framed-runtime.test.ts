import assert from "node:assert/strict";
import test from "node:test";
import { RendererFrameDecoder, RendererFrameKind, encodeRendererFrame } from "./framed-runtime.js";

test("framed renderer protocol survives split and coalesced chunks", () => {
  const first = encodeRendererFrame(RendererFrameKind.authenticate, "", Buffer.from("secret"));
  const second = encodeRendererFrame(RendererFrameKind.renderRequest, "request-1", Buffer.alloc(0), Buffer.from("body"));
  const decoder = new RendererFrameDecoder();
  assert.deepEqual(decoder.push(first.subarray(0, 7)), []);
  const frames = decoder.push(Buffer.concat([first.subarray(7), second]));
  assert.equal(frames.length, 2);
  assert.equal(frames[0]?.token.toString(), "secret");
  assert.equal(frames[1]?.correlationId, "request-1");
  assert.equal(frames[1]?.payload.toString(), "body");
});

test("framed renderer protocol rejects invalid magic", () => {
  const frame = encodeRendererFrame(RendererFrameKind.renderRequest, "request-1");
  frame[0] = 0;
  assert.throws(() => new RendererFrameDecoder().push(frame), /header/);
});

test("framed renderer protocol keeps thousands of coalesced correlations paired", () => {
  const expected = Array.from({ length: 2_000 }, (_, index) => ({
    id: `request-${index}`,
    payload: Buffer.from(`payload-${index}`)
  }));
  const wire = Buffer.concat(expected.map(item =>
    encodeRendererFrame(RendererFrameKind.renderRequest, item.id, Buffer.alloc(0), item.payload)));
  const decoder = new RendererFrameDecoder();
  const actual = [];
  for (let offset = 0; offset < wire.length; offset += 7919)
    actual.push(...decoder.push(wire.subarray(offset, offset + 7919)));
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < expected.length; index++) {
    assert.equal(actual[index]?.correlationId, expected[index]?.id);
    assert.equal(actual[index]?.payload.toString(), expected[index]?.payload.toString());
  }
});
