import assert from "node:assert/strict";
import test from "node:test";
import { decodeBinaryRenderRequest, encodeBinaryRenderResponse } from "./binary-runtime.js";

test("binary renderer request keeps arbitrary props and UTF-8 route data", () => {
  const props = Buffer.from(JSON.stringify({ total: 42, label: "Conciliação" }));
  const requestId = Buffer.from("request-1");
  const moduleId = Buffer.from("app/relatório/page");
  const url = Buffer.from("/relatório?mês=7");
  const body = Buffer.alloc(24 + props.length + requestId.length + moduleId.length + url.length);
  body.write("DTR2", 0, "ascii");
  body[4] = 1;
  body[5] = 0;
  body.writeUInt32BE(props.length, 8);
  body.writeUInt32BE(requestId.length, 12);
  body.writeUInt32BE(moduleId.length, 16);
  body.writeUInt32BE(url.length, 20);
  let offset = 24;
  props.copy(body, offset); offset += props.length;
  requestId.copy(body, offset); offset += requestId.length;
  moduleId.copy(body, offset); offset += moduleId.length;
  url.copy(body, offset);

  assert.deepEqual(decodeBinaryRenderRequest(body), {
    protocolVersion: 1,
    requestId: "request-1",
    moduleId: "app/relatório/page",
    url: "/relatório?mês=7",
    props: { total: 42, label: "Conciliação" },
    renderMode: "ssr"
  });
});

test("binary response stores HTML outside JSON", () => {
  const response = encodeBinaryRenderResponse({
    protocolVersion: 1,
    requestId: "r1",
    ok: true,
    html: "<main>\"sem escape\"</main>",
    head: [{ kind: "title", content: "Teste" }]
  });
  assert.equal(response.toString("ascii", 0, 4), "DTR2");
  assert.equal(response[4], 1);
  assert.match(response.toString("utf8"), /<main>"sem escape"<\/main>/);
});
