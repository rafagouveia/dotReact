const MAGIC = Buffer.from("DRF2", "ascii");
const HEADER_BYTES = 16;
const MAXIMUM_FRAME_BYTES = 32 * 1024 * 1024;

export const RendererFrameKind = {
  authenticate: 1,
  authenticationAccepted: 2,
  renderRequest: 3,
  renderResponse: 4
} as const;

export interface RendererFrame {
  kind: number;
  correlationId: string;
  token: Buffer<ArrayBufferLike>;
  payload: Buffer<ArrayBufferLike>;
}

export function encodeRendererFrame(
  kind: number,
  correlationId = "",
  token: Buffer<ArrayBufferLike> = Buffer.alloc(0),
  payload: Buffer<ArrayBufferLike> = Buffer.alloc(0)
): Buffer<ArrayBufferLike> {
  const correlation = Buffer.from(correlationId, "utf8");
  if (correlation.length > 0xffff || token.length > 0xffff)
    throw new Error("Renderer frame metadata exceeds the supported length.");
  const length = HEADER_BYTES + correlation.length + token.length + payload.length;
  if (length > MAXIMUM_FRAME_BYTES) throw new Error("Renderer frame exceeds the supported length.");
  const output = Buffer.allocUnsafe(length);
  MAGIC.copy(output, 0);
  output[4] = 1;
  output[5] = kind;
  output.fill(0, 6, 8);
  output.writeUInt16BE(correlation.length, 8);
  output.writeUInt16BE(token.length, 10);
  output.writeUInt32BE(payload.length, 12);
  let offset = HEADER_BYTES;
  correlation.copy(output, offset); offset += correlation.length;
  token.copy(output, offset); offset += token.length;
  payload.copy(output, offset);
  return output;
}

/** Incrementally extracts bounded frames from an arbitrary stream chunking pattern. */
export class RendererFrameDecoder {
  #buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  push(chunk: Buffer<ArrayBufferLike>): RendererFrame[] {
    if (chunk.length === 0) return [];
    if (this.#buffer.length + chunk.length > MAXIMUM_FRAME_BYTES)
      throw new Error("Renderer frame exceeds the supported length.");
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    const frames: RendererFrame[] = [];
    while (this.#buffer.length >= HEADER_BYTES) {
      if (!this.#buffer.subarray(0, 4).equals(MAGIC) || this.#buffer[4] !== 1)
        throw new Error("Invalid DotReact renderer frame header.");
      const kind = this.#buffer[5]!;
      if (kind < RendererFrameKind.authenticate || kind > RendererFrameKind.renderResponse)
        throw new Error("Unknown DotReact renderer frame kind.");
      const correlationLength = this.#buffer.readUInt16BE(8);
      const tokenLength = this.#buffer.readUInt16BE(10);
      const payloadLength = this.#buffer.readUInt32BE(12);
      const frameLength = HEADER_BYTES + correlationLength + tokenLength + payloadLength;
      if (frameLength > MAXIMUM_FRAME_BYTES) throw new Error("Renderer frame exceeds the supported length.");
      if (this.#buffer.length < frameLength) break;
      let offset = HEADER_BYTES;
      const correlationEnd = offset + correlationLength;
      const correlationId = this.#buffer.toString("utf8", offset, correlationEnd);
      offset = correlationEnd;
      const tokenEnd = offset + tokenLength;
      const frameToken = Buffer.from(this.#buffer.subarray(offset, tokenEnd));
      offset = tokenEnd;
      const payloadEnd = offset + payloadLength;
      const payload = Buffer.from(this.#buffer.subarray(offset, payloadEnd));
      frames.push({ kind, correlationId, token: frameToken, payload });
      this.#buffer = this.#buffer.subarray(frameLength);
    }
    return frames;
  }
}
