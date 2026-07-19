export const PROTOCOL_VERSION = 1 as const;

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
  | { kind: "link"; attrs: Record<string, string> };

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
