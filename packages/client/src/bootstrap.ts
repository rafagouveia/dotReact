import { createElement, type ComponentType } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { DotReactErrorFallback, DotReactRootBoundary, renderDotReactFatalError, type DotReactGlobalErrorProps } from "./errors.js";
import {
  DotReactApp,
  type DotReactAppProps,
  type DotReactNavigationPayload,
  type DotReactRouteLoader
} from "./router.js";
import { installDotReactWebVitals } from "./vitals.js";

interface DotReactHotContext {
  on(event: string, callback: () => void): void;
}

interface DotReactClientImportMeta extends ImportMeta {
  readonly env?: { readonly DEV?: boolean };
  readonly hot?: DotReactHotContext;
}

declare global {
  interface Window {
    __getReactRefreshIgnoredExports?: (context: { id: string }) => readonly string[];
    __dotReactClientRuntimeConfigured?: boolean;
  }
}

interface DotReactBootstrapPayload {
  readonly protocolVersion: 1;
  readonly requestId: string;
  readonly moduleId: string;
  readonly props: Record<string, unknown>;
  readonly csrfToken?: string | null;
  readonly boundaryKind?: "not-found" | "error" | null;
}

export interface DotReactClientBootstrapOptions {
  readonly pages: DotReactAppProps["pages"];
  readonly routeModules?: NonNullable<DotReactAppProps["routeModules"]>;
  readonly routeLayouts?: NonNullable<DotReactAppProps["routeLayouts"]>;
  readonly boundaries?: NonNullable<DotReactAppProps["boundaries"]>;
  readonly routeLoaders?: NonNullable<DotReactAppProps["routeLoaders"]>;
  /** Optional app/global-error.drx component. It is used only outside development. */
  readonly globalError?: ComponentType<DotReactGlobalErrorProps> | undefined;
  readonly root?: Element | string;
  readonly state?: Element | string;
  readonly window?: Window;
  readonly document?: Document;
  /** Test/advanced override. Vite's development flag is used by default. */
  readonly development?: boolean;
}

function element(document: Document, value: Element | string | undefined, fallbackId: string): Element | null {
  if (typeof value === "string") return document.querySelector(value);
  return value ?? document.getElementById(fallbackId);
}

function bootstrapPayload(text: string): DotReactBootstrapPayload {
  const value = JSON.parse(text) as Partial<DotReactBootstrapPayload> | null;
  if (value === null || value.protocolVersion !== 1 || typeof value.requestId !== "string"
    || typeof value.moduleId !== "string" || typeof value.props !== "object" || value.props === null
    || (value.boundaryKind !== undefined && value.boundaryKind !== null
      && value.boundaryKind !== "not-found" && value.boundaryKind !== "error")) {
    throw new Error("DotReact bootstrap payload is invalid.");
  }
  return value as DotReactBootstrapPayload;
}

function configureDevelopmentRuntime(browserWindow: Window, hot: DotReactHotContext | undefined): void {
  if (hot === undefined || browserWindow.__dotReactClientRuntimeConfigured === true) return;
  browserWindow.__dotReactClientRuntimeConfigured = true;
  let developmentSocketDisconnected = false;
  const previousIgnoredExports = browserWindow.__getReactRefreshIgnoredExports;
  browserWindow.__getReactRefreshIgnoredExports = context => {
    const previous = previousIgnoredExports?.(context) ?? [];
    return context.id.split("?", 1)[0]?.toLowerCase().endsWith(".drx") === true
      ? [...new Set([...previous, "metadata"])]
      : previous;
  };
  hot.on("vite:afterUpdate", () => browserWindow.dispatchEvent(new Event("dotreact:refresh")));
  hot.on("vite:ws:disconnect", () => { developmentSocketDisconnected = true; });
  hot.on("vite:ws:connect", () => {
    // Optimized React modules are process-scoped. Never keep the old graph after
    // a renderer restart because two React dispatchers cannot hydrate one tree.
    if (developmentSocketDisconnected) browserWindow.location.reload();
  });
}

/**
 * Framework-owned client composition root. Generated projects provide only the
 * discovered modules; hydration, root error handling and HMR recovery stay here.
 */
export function bootstrapDotReactClient(options: DotReactClientBootstrapOptions): Root | undefined {
  const moduleMeta = import.meta as DotReactClientImportMeta;
  const development = options.development ?? moduleMeta.env?.DEV === true;
  const browserWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const document = options.document ?? browserWindow?.document;
  if (document === undefined) throw new Error("DotReact client bootstrap requires a browser document.");
  const root = element(document, options.root, "root");
  if (root === null) throw new Error("DotReact root element is missing.");
  if (browserWindow !== undefined && development) configureDevelopmentRuntime(browserWindow, moduleMeta.hot);

  try {
    const state = element(document, options.state, "__DOTREACT_DATA__");
    if (state?.textContent === undefined || state.textContent === null || state.textContent.trim() === "")
      throw new Error("DotReact bootstrap payload is missing.");
    const payload = bootstrapPayload(state.textContent);
    const initial: DotReactNavigationPayload = {
      ...payload,
      url: browserWindow === undefined ? "/" : `${browserWindow.location.pathname}${browserWindow.location.search}`,
      statusCode: payload.boundaryKind === "not-found" ? 404 : payload.boundaryKind === "error" ? 500 : 200
    };
    const appProps: DotReactAppProps = {
      initial,
      pages: options.pages,
      ...(options.routeModules === undefined ? {} : { routeModules: options.routeModules }),
      ...(options.routeLayouts === undefined ? {} : { routeLayouts: options.routeLayouts }),
      ...(options.boundaries === undefined ? {} : { boundaries: options.boundaries }),
      ...(options.routeLoaders === undefined ? {} : { routeLoaders: options.routeLoaders }),
      ...(browserWindow === undefined ? {} : { window: browserWindow }),
      document
    };
    const hydrated = hydrateRoot(root, createElement(DotReactRootBoundary, {
      development,
      ...(options.globalError === undefined ? {} : { globalError: options.globalError })
    }, createElement(DotReactApp, appProps)));
    if (browserWindow !== undefined)
      installDotReactWebVitals({ requestId: payload.requestId, window: browserWindow, document });
    return hydrated;
  } catch (error) {
    renderDotReactFatalError(root, error, { development, ...(browserWindow === undefined ? {} : { window: browserWindow }) });
    return undefined;
  }
}

export interface DotReactLazyClientBootstrapOptions extends Omit<DotReactClientBootstrapOptions,
  "pages" | "routeModules" | "routeLayouts" | "boundaries" | "routeLoaders"> {
  readonly routeLoaders: Readonly<Record<string, DotReactRouteLoader>>;
}

/** Loads only the initial route chunk before hydration and keeps later routes lazy. */
export async function bootstrapDotReactLazyClient(
  options: DotReactLazyClientBootstrapOptions
): Promise<Root | undefined> {
  const browserWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const document = options.document ?? browserWindow?.document;
  if (document === undefined) throw new Error("DotReact client bootstrap requires a browser document.");
  const state = element(document, options.state, "__DOTREACT_DATA__");
  if (state?.textContent === undefined || state.textContent === null || state.textContent.trim() === "")
    throw new Error("DotReact bootstrap payload is missing.");
  const payload = bootstrapPayload(state.textContent);
  const loader = options.routeLoaders[payload.moduleId];
  if (loader === undefined) throw new Error(`Unknown DotReact initial route chunk: ${payload.moduleId}`);
  const loaded = await loader();
  const pages = { [payload.moduleId]: loaded.page };
  const routeModules = { [payload.moduleId]: loaded.page };
  const routeLayouts = { [payload.moduleId]: loaded.layouts };
  const boundaries = { [payload.moduleId]: loaded.boundaries };
  return bootstrapDotReactClient({
    ...options,
    pages,
    routeModules,
    routeLayouts,
    boundaries,
    routeLoaders: options.routeLoaders
  });
}

// Keep the production-safe default available to advanced composition roots.
export { DotReactErrorFallback };
