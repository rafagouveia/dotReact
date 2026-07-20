export const PROTOCOL_VERSION = 1 as const;
export const STREAM_PROTOCOL_VERSION = 2 as const;
export const STREAM_PROTOCOL_HEADER = "x-dotreact-protocol-version" as const;
export const STREAM_MEDIA_TYPE = "application/vnd.dotreact.render-stream+jsonl;v=2" as const;

export interface RenderRequest {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  moduleId: string;
  url: string;
  props: unknown;
  renderMode: "ssr";
  boundaryKind?: "not-found" | "error" | null;
}

export type HeadElement =
  | { kind: "title"; content: string }
  | { kind: "meta"; attrs: Record<string, string> }
  | { kind: "link"; attrs: Record<string, string> }
  | { kind: "script"; attrs: Record<string, string> };

export interface RenderSuccess {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  ok: true;
  html: string;
  head: HeadElement[];
}

export interface RenderFailure {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  ok: false;
  error: {
    code: "MODULE_NOT_FOUND" | "RENDER_FAILED" | "PROTOCOL_MISMATCH" | "INVALID_REQUEST";
    message: string;
    stack?: string;
  };
}

export type RenderResponse = RenderSuccess | RenderFailure;

export interface RenderStreamRequest {
  protocolVersion: typeof STREAM_PROTOCOL_VERSION;
  requestId: string;
  moduleId: string;
  url: string;
  props: unknown;
  renderMode: "stream";
  responseKind: "document" | "navigation" | "prerender" | "flight";
  capabilities: readonly ("html-stream" | "flight")[];
  boundaryKind?: "not-found" | "error" | null;
  /** Per-request CSP nonce passed to React's streaming renderer. */
  nonce?: string;
}

interface RenderStreamFrameBase {
  protocolVersion: typeof STREAM_PROTOCOL_VERSION;
  requestId: string;
}

export interface RenderStreamStartFrame extends RenderStreamFrameBase {
  kind: "start";
  head: HeadElement[];
}

export interface RenderStreamHtmlFrame extends RenderStreamFrameBase {
  kind: "html";
  sequence: number;
  chunk: string;
}

export interface RenderStreamFlightFrame extends RenderStreamFrameBase {
  kind: "flight";
  sequence: number;
  /** Base64-encoded Flight bytes. */
  data: string;
}

export interface RenderStreamCompleteFrame extends RenderStreamFrameBase {
  kind: "complete";
  metrics?: Readonly<Record<string, number>>;
}

export interface RenderStreamErrorFrame extends RenderStreamFrameBase {
  kind: "error";
  phase: "before-shell" | "after-shell";
  code: "MODULE_NOT_FOUND" | "RENDER_FAILED" | "PROTOCOL_MISMATCH" | "INVALID_REQUEST" | "RESPONSE_LIMIT" | "ABORTED";
  message: string;
}

export type RenderStreamFrame =
  | RenderStreamStartFrame
  | RenderStreamHtmlFrame
  | RenderStreamFlightFrame
  | RenderStreamCompleteFrame
  | RenderStreamErrorFrame;

export function isRenderRequest(value: unknown): value is RenderRequest {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return item.protocolVersion === PROTOCOL_VERSION
    && typeof item.requestId === "string"
    && typeof item.moduleId === "string"
    && typeof item.url === "string"
    && item.renderMode === "ssr"
    && (item.boundaryKind === undefined || item.boundaryKind === null || item.boundaryKind === "not-found" || item.boundaryKind === "error")
    && "props" in item;
}

function isBoundaryKind(value: unknown): boolean {
  return value === undefined || value === null || value === "not-found" || value === "error";
}

function isHeadElement(value: unknown): value is HeadElement {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.kind === "title") return typeof item.content === "string";
  if (item.kind !== "meta" && item.kind !== "link" && item.kind !== "script") return false;
  if (typeof item.attrs !== "object" || item.attrs === null || Array.isArray(item.attrs)) return false;
  return Object.values(item.attrs).every(attribute => typeof attribute === "string");
}

export function isRenderStreamRequest(value: unknown): value is RenderStreamRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.protocolVersion === STREAM_PROTOCOL_VERSION
    && typeof item.requestId === "string"
    && item.requestId.length > 0
    && typeof item.moduleId === "string"
    && item.moduleId.length > 0
    && typeof item.url === "string"
    && item.renderMode === "stream"
    && (item.responseKind === "document" || item.responseKind === "navigation"
      || item.responseKind === "prerender" || item.responseKind === "flight")
    && Array.isArray(item.capabilities)
    && item.capabilities.every(capability => capability === "html-stream" || capability === "flight")
    && isBoundaryKind(item.boundaryKind)
    && (item.nonce === undefined || (typeof item.nonce === "string"
      && item.nonce.length >= 16 && item.nonce.length <= 256
      && /^[A-Za-z0-9+/_-]+={0,2}$/.test(item.nonce)))
    && "props" in item;
}

export function isRenderStreamFrame(value: unknown, requestId?: string): value is RenderStreamFrame {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.protocolVersion !== STREAM_PROTOCOL_VERSION || typeof item.requestId !== "string"
    || item.requestId.length === 0 || (requestId !== undefined && item.requestId !== requestId)) return false;
  if (item.kind === "start") return Array.isArray(item.head) && item.head.every(isHeadElement);
  if (item.kind === "html") return Number.isSafeInteger(item.sequence)
    && (item.sequence as number) >= 0 && typeof item.chunk === "string";
  if (item.kind === "flight") return Number.isSafeInteger(item.sequence)
    && (item.sequence as number) >= 0 && typeof item.data === "string";
  if (item.kind === "complete") {
    if (item.metrics === undefined) return true;
    if (typeof item.metrics !== "object" || item.metrics === null || Array.isArray(item.metrics)) return false;
    return Object.values(item.metrics).every(metric => typeof metric === "number" && Number.isFinite(metric) && metric >= 0);
  }
  return item.kind === "error"
    && (item.phase === "before-shell" || item.phase === "after-shell")
    && typeof item.code === "string"
    && ["MODULE_NOT_FOUND", "RENDER_FAILED", "PROTOCOL_MISMATCH", "INVALID_REQUEST", "RESPONSE_LIMIT", "ABORTED"].includes(item.code)
    && typeof item.message === "string";
}
