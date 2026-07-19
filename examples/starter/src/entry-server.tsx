import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import type { HeadElement, RenderRequest, RenderResponse } from "@dotreact/protocol";
import { PROTOCOL_VERSION } from "@dotreact/protocol";
import type { DotReactMetadata, DotReactMetadataResolver } from "@dotreact/vite";
import { boundaries, pages } from "virtual:dotreact/pages";

export function render(request: RenderRequest): RenderResponse {
  const pageModule = request.boundaryKind === "not-found"
    ? boundaries[request.moduleId]?.notFound
    : request.boundaryKind === "error"
      ? boundaries[request.moduleId]?.error
      : pages[request.moduleId];
  if (!pageModule) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      ok: false,
      error: { code: "MODULE_NOT_FOUND", message: `Unknown page module: ${request.moduleId}` }
    };
  }
  const Page = pageModule.default;
  const props = request.props as Record<string, unknown>;
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    html: renderToString(createElement(Page as unknown as ComponentType<Record<string, unknown>>, props)),
    head: resolveHead(pageModule as { metadata?: DotReactMetadataResolver<Record<string, unknown>> }, props)
  };
}

function resolveHead(
  pageModule: { metadata?: DotReactMetadataResolver<Record<string, unknown>> },
  props: Record<string, unknown>
): HeadElement[] {
  const configured = pageModule.metadata;
  const metadata: DotReactMetadata = typeof configured === "function" ? configured(props) : configured ?? {};
  return [
    { kind: "title" as const, content: metadata.title ?? "DotReact" },
    ...(metadata.description === undefined ? [] : [{ kind: "meta" as const, attrs: { name: "description", content: metadata.description } }]),
    ...(metadata.noIndex === true ? [{ kind: "meta" as const, attrs: { name: "robots", content: "noindex,nofollow" } }] : []),
    ...(metadata.links ?? []).map(attrs => ({ kind: "link" as const, attrs: { ...attrs } }))
  ];
}
