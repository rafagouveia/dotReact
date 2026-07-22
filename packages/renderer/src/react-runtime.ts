import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { DotReactApp, type DotReactAppProps, type DotReactMetadata, type DotReactNavigationPayload, type DotReactPageModule } from "@rafagouveia/dotreact-client/router";
import {
  PROTOCOL_VERSION,
  STREAM_PROTOCOL_VERSION,
  type HeadElement,
  type RenderRequest,
  type RenderResponse,
  type RenderStreamFrame,
  type RenderStreamRequest
} from "@rafagouveia/dotreact-protocol";

export interface DotReactReactRegistry {
  readonly pages: DotReactAppProps["pages"];
  readonly routeModules?: NonNullable<DotReactAppProps["routeModules"]>;
  readonly routeLayouts?: NonNullable<DotReactAppProps["routeLayouts"]>;
  readonly boundaries?: NonNullable<DotReactAppProps["boundaries"]>;
  readonly fontPreloads?: readonly Readonly<Record<string, string>>[];
  readonly defaultMetadata?: DotReactMetadata;
}

export interface DotReactRenderStreamContext {
  readonly signal: AbortSignal;
}

export interface DotReactReactRuntime {
  render(request: RenderRequest): RenderResponse;
  renderStream(
    request: RenderStreamRequest,
    context: DotReactRenderStreamContext
  ): AsyncGenerator<RenderStreamFrame>;
}

interface MetadataModule {
  readonly metadata?: DotReactMetadata | ((props: Record<string, unknown>) => DotReactMetadata);
}

/** Creates the framework-owned React SSR runtime for a generated route registry. */
export function createDotReactReactRuntime(registry: DotReactReactRegistry): DotReactReactRuntime {
  const routeModules = registry.routeModules ?? registry.pages;
  const routeLayouts = registry.routeLayouts ?? {};
  const boundaries = registry.boundaries ?? {};
  const fontPreloads = registry.fontPreloads ?? [];

  const resolvePageModule = (
    request: { readonly moduleId: string; readonly boundaryKind?: "not-found" | "error" | null }
  ): DotReactPageModule | undefined => request.boundaryKind === "not-found"
    ? boundaries[request.moduleId]?.notFound
    : request.boundaryKind === "error"
      ? boundaries[request.moduleId]?.error
      : registry.pages[request.moduleId];

  const app = (
    request: { readonly requestId: string; readonly moduleId: string; readonly url: string; readonly boundaryKind?: "not-found" | "error" | null },
    props: Record<string, unknown>
  ) => createElement(DotReactApp, {
    initial: navigationPayload(request, props),
    pages: registry.pages,
    routeModules,
    routeLayouts,
    boundaries
  });

  const head = (module: MetadataModule, props: Record<string, unknown>): HeadElement[] => {
    const configured = module.metadata;
    const pageMetadata = typeof configured === "function" ? configured(props) : configured ?? {};
    const links = [...new Map(
      [...(registry.defaultMetadata?.links ?? []), ...(pageMetadata.links ?? [])]
        .map(link => [`${link.rel ?? ""}\0${link.href ?? ""}`, link] as const)
    ).values()];
    const scripts = [...new Map(
      [...(registry.defaultMetadata?.scripts ?? []), ...(pageMetadata.scripts ?? [])]
        .map(script => [script.id ?? script.src, script] as const)
    ).values()];
    const metadata = {
      ...(registry.defaultMetadata ?? {}),
      ...pageMetadata,
      links,
      scripts
    };
    return [
      { kind: "title", content: metadata.title ?? "DotReact" },
      ...(metadata.description === undefined ? [] : [{ kind: "meta" as const, attrs: { name: "description", content: metadata.description } }]),
      ...(metadata.noIndex === true ? [{ kind: "meta" as const, attrs: { name: "robots", content: "noindex,nofollow" } }] : []),
      ...fontPreloads.map(attrs => ({ kind: "link" as const, attrs: { ...attrs } })),
      ...(metadata.links ?? []).map(attrs => ({ kind: "link" as const, attrs: { ...attrs } })),
      ...(metadata.scripts ?? []).filter(script => (script.strategy ?? "afterInteractive") === "beforeInteractive")
        .map(script => ({
          kind: "script" as const,
          attrs: {
            src: script.src,
            "data-dotreact-script": script.id ?? script.src,
            defer: "",
            ...(script.type === undefined ? {} : { type: script.type }),
            ...(script.integrity === undefined ? {} : { integrity: script.integrity }),
            ...(script.crossOrigin === undefined ? {} : { crossorigin: script.crossOrigin }),
            ...(script.referrerPolicy === undefined ? {} : { referrerpolicy: script.referrerPolicy })
          }
        }))
    ];
  };

  return Object.freeze({
    render(request: RenderRequest): RenderResponse {
      const pageModule = resolvePageModule(request);
      if (pageModule === undefined) return {
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        ok: false,
        error: { code: "MODULE_NOT_FOUND", message: `Unknown page module: ${request.moduleId}` }
      };
      const props = request.props as Record<string, unknown>;
      return {
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        ok: true,
        html: renderToString(app(request, props)),
        head: head(pageModule, props)
      };
    },

    async *renderStream(
      request: RenderStreamRequest,
      context: DotReactRenderStreamContext
    ): AsyncGenerator<RenderStreamFrame> {
      const pageModule = resolvePageModule(request);
      if (pageModule === undefined) {
        yield {
          protocolVersion: STREAM_PROTOCOL_VERSION,
          requestId: request.requestId,
          kind: "error",
          phase: "before-shell",
          code: "MODULE_NOT_FOUND",
          message: `Unknown page module: ${request.moduleId}`
        };
        return;
      }

      const props = request.props as Record<string, unknown>;
      const output = new PassThrough();
      const startedAt = performance.now();
      let shellStarted = false;
      let renderError: Error | undefined;
      let settleShell: (() => void) | undefined;
      let rejectShell: ((error: Error) => void) | undefined;
      const shellReady = new Promise<void>((resolve, reject) => {
        settleShell = resolve;
        rejectShell = reject;
      });
      const stream = renderToPipeableStream(app(request, props), {
        ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
        onShellReady() { stream.pipe(output); settleShell?.(); },
        onShellError(error) { rejectShell?.(toError(error)); },
        onError(error) { renderError ??= toError(error); }
      });
      const abort = (): void => stream.abort(context.signal.reason);
      context.signal.addEventListener("abort", abort, { once: true });
      if (context.signal.aborted) abort();
      try {
        await shellReady;
        shellStarted = true;
        yield {
          protocolVersion: STREAM_PROTOCOL_VERSION,
          requestId: request.requestId,
          kind: "start",
          head: head(pageModule, props)
        };
        let sequence = 0;
        for await (const chunk of output) yield {
          protocolVersion: STREAM_PROTOCOL_VERSION,
          requestId: request.requestId,
          kind: "html",
          sequence: sequence++,
          chunk: Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)
        };
        if (renderError !== undefined) throw renderError;
        yield {
          protocolVersion: STREAM_PROTOCOL_VERSION,
          requestId: request.requestId,
          kind: "complete",
          metrics: { durationMs: performance.now() - startedAt }
        };
      } catch (error) {
        yield {
          protocolVersion: STREAM_PROTOCOL_VERSION,
          requestId: request.requestId,
          kind: "error",
          phase: shellStarted ? "after-shell" : "before-shell",
          code: context.signal.aborted ? "ABORTED" : "RENDER_FAILED",
          message: toError(error).message
        };
      } finally {
        context.signal.removeEventListener("abort", abort);
        stream.abort();
        output.destroy();
      }
    }
  });
}

function navigationPayload(
  request: { readonly requestId: string; readonly moduleId: string; readonly url: string; readonly boundaryKind?: "not-found" | "error" | null },
  props: Record<string, unknown>
): DotReactNavigationPayload {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    moduleId: request.moduleId,
    url: request.url,
    props,
    ...(request.boundaryKind === undefined || request.boundaryKind === null
      ? {} : { boundaryKind: request.boundaryKind }),
    statusCode: request.boundaryKind === "not-found" ? 404 : request.boundaryKind === "error" ? 500 : 200
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
