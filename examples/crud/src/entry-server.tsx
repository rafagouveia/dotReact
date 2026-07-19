import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { PROTOCOL_VERSION, type RenderRequest, type RenderResponse } from "@dotreact/protocol";
import { pages, type PageId } from "./pages";

export function render(request: RenderRequest): RenderResponse {
  const Page = pages[request.moduleId as PageId];
  if (!Page) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      ok: false,
      error: { code: "MODULE_NOT_FOUND", message: `Unknown page module: ${request.moduleId}` }
    };
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    html: renderToString(createElement(
      Page as unknown as ComponentType<Record<string, unknown>>,
      request.props as Record<string, unknown>
    )),
    head: [
      { kind: "title", content: "Workboard · DotReact" },
      {
        kind: "meta",
        attrs: {
          name: "description",
          content: "A production-shaped CRUD dashboard rendered by C# and React."
        }
      }
    ]
  };
}
