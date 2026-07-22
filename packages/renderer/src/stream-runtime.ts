import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  STREAM_MEDIA_TYPE,
  STREAM_PROTOCOL_HEADER,
  STREAM_PROTOCOL_VERSION,
  isRenderStreamFrame,
  isRenderStreamRequest,
  type RenderStreamErrorFrame,
  type RenderStreamFrame,
  type RenderStreamRequest
} from "@rafagouveia/dotreact-protocol";

interface RenderStreamContext {
  readonly signal: AbortSignal;
}

type RenderStreamSource = AsyncIterable<unknown> | ReadableStream<unknown>;

export interface RenderStreamEntry {
  renderStream(
    request: RenderStreamRequest,
    context: RenderStreamContext
  ): Promise<RenderStreamSource> | RenderStreamSource;
}

export interface RenderStreamHandlerOptions {
  readonly token?: string;
  readonly maxBodyBytes: number;
  readonly maxResponseBytes: number;
  readonly acquire: () => (() => void) | undefined;
  readonly loadEntry: () => Promise<Partial<RenderStreamEntry>>;
  readonly onError?: (error: Error) => void;
}

export class RenderStreamProtocolError extends Error { }
export class RenderStreamResponseLimitError extends Error { }

export class RenderStreamEncoder {
  readonly requestId: string;
  readonly maxBytes: number;
  bytesWritten = 0;
  started = false;
  terminal = false;
  #nextHtmlSequence = 0;
  #nextFlightSequence = 0;

  constructor(requestId: string, maxBytes: number) {
    this.requestId = requestId;
    this.maxBytes = maxBytes;
  }

  encode(value: unknown): Buffer {
    if (!isRenderStreamFrame(value, this.requestId))
      throw new RenderStreamProtocolError("renderStream emitted an invalid or uncorrelated frame.");
    const frame = value as RenderStreamFrame;
    if (this.terminal) throw new RenderStreamProtocolError("renderStream emitted a frame after a terminal frame.");
    if (frame.kind === "start") {
      if (this.started) throw new RenderStreamProtocolError("renderStream emitted more than one start frame.");
      this.started = true;
    } else if (frame.kind === "html") {
      if (!this.started || frame.sequence !== this.#nextHtmlSequence++)
        throw new RenderStreamProtocolError("renderStream emitted an out-of-order HTML frame.");
    } else if (frame.kind === "flight") {
      if (!this.started || frame.sequence !== this.#nextFlightSequence++)
        throw new RenderStreamProtocolError("renderStream emitted an out-of-order Flight frame.");
    } else {
      if (frame.kind === "complete" && !this.started)
        throw new RenderStreamProtocolError("renderStream completed before emitting a start frame.");
      this.terminal = true;
    }

    const encoded = Buffer.from(`${JSON.stringify(frame)}\n`, "utf8");
    if (this.bytesWritten + encoded.byteLength > this.maxBytes)
      throw new RenderStreamResponseLimitError("Renderer stream exceeds the configured response limit.");
    this.bytesWritten += encoded.byteLength;
    return encoded;
  }
}

function streamError(
  requestId: string,
  phase: RenderStreamErrorFrame["phase"],
  code: RenderStreamErrorFrame["code"],
  error: unknown
): RenderStreamErrorFrame {
  return {
    protocolVersion: STREAM_PROTOCOL_VERSION,
    requestId,
    kind: "error",
    phase,
    code,
    message: error instanceof Error ? error.message : String(error)
  };
}

function writeStreamHeaders(response: ServerResponse, status: number): void {
  response.writeHead(status, {
    "content-type": STREAM_MEDIA_TYPE,
    "cache-control": "no-store",
    [STREAM_PROTOCOL_HEADER]: String(STREAM_PROTOCOL_VERSION),
    "x-content-type-options": "nosniff"
  });
}

function sendFailure(
  response: ServerResponse,
  status: number,
  requestId: string,
  code: RenderStreamErrorFrame["code"],
  error: unknown
): void {
  if (response.destroyed) return;
  writeStreamHeaders(response, status);
  response.end(`${JSON.stringify(streamError(requestId, "before-shell", code, error))}\n`);
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw new Error("Render payload exceeds the configured limit.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function* readableStreamValues(stream: ReadableStream<unknown>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function values(source: RenderStreamSource): AsyncIterable<unknown> {
  const asyncSource = source as AsyncIterable<unknown>;
  if (typeof asyncSource[Symbol.asyncIterator] === "function") return asyncSource;
  const readableSource = source as ReadableStream<unknown>;
  if (typeof readableSource.getReader === "function") return readableStreamValues(readableSource);
  throw new RenderStreamProtocolError("renderStream must return an AsyncIterable or ReadableStream.");
}

async function writeWithBackpressure(response: ServerResponse, content: Buffer): Promise<void> {
  if (response.write(content)) return;
  await once(response, "drain");
}

export async function handleRenderStream(
  request: IncomingMessage,
  response: ServerResponse,
  options: RenderStreamHandlerOptions
): Promise<void> {
  if (options.token !== undefined && request.headers.authorization !== `Bearer ${options.token}`) {
    sendFailure(response, 401, "unknown", "INVALID_REQUEST", "Invalid renderer token.");
    return;
  }
  const requestedVersion = request.headers[STREAM_PROTOCOL_HEADER];
  const accepted = (request.headers.accept?.toLowerCase() ?? "").replace(/\s+/gu, "");
  if (requestedVersion !== String(STREAM_PROTOCOL_VERSION)
    || !accepted.includes(STREAM_MEDIA_TYPE.toLowerCase())) {
    sendFailure(response, 406, "unknown", "PROTOCOL_MISMATCH",
      `Streaming requests must negotiate ${STREAM_MEDIA_TYPE} and protocol ${STREAM_PROTOCOL_VERSION}.`);
    return;
  }

  let body: unknown;
  try {
    body = await readJson(request, options.maxBodyBytes);
  } catch (error) {
    sendFailure(response, 400, "unknown", "INVALID_REQUEST", error);
    return;
  }
  if (!isRenderStreamRequest(body)) {
    const version = (body as { protocolVersion?: unknown } | null)?.protocolVersion;
    sendFailure(response, 400, "unknown",
      version !== STREAM_PROTOCOL_VERSION ? "PROTOCOL_MISMATCH" : "INVALID_REQUEST",
      "Invalid render stream request.");
    return;
  }

  const release = options.acquire();
  if (release === undefined) {
    sendFailure(response, 503, body.requestId, "RENDER_FAILED", "Renderer concurrency limit reached or renderer is draining.");
    return;
  }

  const abort = new AbortController();
  const onAborted = () => abort.abort();
  const onClose = () => { if (!response.writableEnded) abort.abort(); };
  request.once("aborted", onAborted);
  response.once("close", onClose);
  const encoder = new RenderStreamEncoder(body.requestId, options.maxResponseBytes);
  try {
    const entry = await options.loadEntry();
    if (typeof entry.renderStream !== "function") {
      sendFailure(response, 501, body.requestId, "RENDER_FAILED", "Server entry must export renderStream().");
      return;
    }
    const source = await entry.renderStream(body, { signal: abort.signal });
    writeStreamHeaders(response, 200);
    for await (const frame of values(source)) {
      if (abort.signal.aborted) throw new DOMException("Render stream was aborted.", "AbortError");
      await writeWithBackpressure(response, encoder.encode(frame));
      if (encoder.terminal) break;
    }
    if (!encoder.terminal)
      await writeWithBackpressure(response, encoder.encode(streamError(
        body.requestId, encoder.started ? "after-shell" : "before-shell", "RENDER_FAILED",
        "renderStream ended without a terminal frame.")));
    response.end();
  } catch (error) {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
    if (!response.headersSent) {
      sendFailure(response, 500, body.requestId, "RENDER_FAILED", error);
    } else if (!response.destroyed && !response.writableEnded) {
      const code = error instanceof RenderStreamResponseLimitError ? "RESPONSE_LIMIT" : abort.signal.aborted ? "ABORTED" : "RENDER_FAILED";
      try {
        await writeWithBackpressure(response, encoder.encode(streamError(
          body.requestId, encoder.started ? "after-shell" : "before-shell", code, error)));
        response.end();
      } catch {
        response.destroy();
      }
    }
  } finally {
    request.off("aborted", onAborted);
    response.off("close", onClose);
    release();
  }
}
