import {
  PROTOCOL_VERSION,
  type RenderFailure,
  type RenderRequest,
  type RenderResponse
} from "@rafagouveia/dotreact-protocol";

const MAGIC = Buffer.from("DTR2", "ascii");
const REQUEST_HEADER_BYTES = 24;
const RESPONSE_HEADER_BYTES = 20;

/** Media type for the allocation-conscious buffered renderer transport. */
export const BINARY_RENDER_MEDIA_TYPE = "application/vnd.dotreact.render+binary;v=2";

/** Decodes a bounded binary request while keeping props as the only JSON value. */
export function decodeBinaryRenderRequest(body: Buffer): RenderRequest {
  if (body.byteLength < REQUEST_HEADER_BYTES || !body.subarray(0, 4).equals(MAGIC) || body[4] !== 1)
    throw new Error("Invalid DotReact binary render request header.");
  const boundary = body[5];
  if (boundary === undefined || boundary > 2) throw new Error("Invalid DotReact boundary kind.");
  const lengths = [12, 16, 20].map(offset => body.readUInt32BE(offset));
  const propsLength = body.readUInt32BE(8);
  const expected = REQUEST_HEADER_BYTES + propsLength + lengths.reduce((total, length) => total + length, 0);
  if (expected !== body.byteLength) throw new Error("Invalid DotReact binary render request length.");
  let offset = REQUEST_HEADER_BYTES;
  const props = JSON.parse(body.toString("utf8", offset, offset += propsLength)) as unknown;
  const requestId = body.toString("utf8", offset, offset += lengths[0]!);
  const moduleId = body.toString("utf8", offset, offset += lengths[1]!);
  const url = body.toString("utf8", offset, offset += lengths[2]!);
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    moduleId,
    url,
    props,
    renderMode: "ssr",
    ...(boundary === 0 ? {} : { boundaryKind: boundary === 1 ? "not-found" : "error" })
  };
}

/** Encodes HTML as raw UTF-8 instead of escaping it inside a JSON response. */
export function encodeBinaryRenderResponse(response: RenderResponse): Buffer {
  const requestId = Buffer.from(response.requestId, "utf8");
  const html = Buffer.from(response.ok ? response.html : "", "utf8");
  const metadata = Buffer.from(JSON.stringify(response.ok ? response.head : response.error), "utf8");
  const output = Buffer.allocUnsafe(RESPONSE_HEADER_BYTES + requestId.length + html.length + metadata.length);
  MAGIC.copy(output, 0);
  output[4] = response.ok ? 1 : 2;
  output.fill(0, 5, 8);
  output.writeUInt32BE(requestId.length, 8);
  output.writeUInt32BE(html.length, 12);
  output.writeUInt32BE(metadata.length, 16);
  let offset = RESPONSE_HEADER_BYTES;
  requestId.copy(output, offset); offset += requestId.length;
  html.copy(output, offset); offset += html.length;
  metadata.copy(output, offset);
  return output;
}

export function binaryFailure(requestId: string, error: unknown): RenderFailure {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message: error instanceof Error ? error.message : String(error)
    }
  };
}
