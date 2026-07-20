import { createElement, type CSSProperties, type ReactElement } from "react";
import type { DotReactBoundaryModules, DotReactPageModule } from "./router.js";

/** Stable props supplied by the framework to route-level error boundaries. */
export interface DotReactRouteBoundaryProps {
  readonly statusCode: number;
  readonly requestId: string;
  readonly message?: string;
}

const pageStyle: CSSProperties = {
  boxSizing: "border-box",
  display: "grid",
  minHeight: "min(32rem, 70vh)",
  placeItems: "center",
  padding: "2rem",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: "#111827"
};

const panelStyle: CSSProperties = {
  width: "min(100%, 34rem)",
  padding: "1.5rem",
  border: "1px solid #dbe2ea",
  borderRadius: "0.75rem",
  background: "#ffffff"
};

const labelStyle: CSSProperties = {
  margin: "0 0 0.5rem",
  color: "#526071",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase"
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(1.4rem, 3vw, 2rem)",
  lineHeight: 1.15,
  letterSpacing: "-0.025em"
};

const textStyle: CSSProperties = {
  margin: "0.75rem 0 0",
  color: "#526071",
  lineHeight: 1.6
};

const requestStyle: CSSProperties = {
  margin: "1rem 0 0",
  color: "#718096",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "0.75rem"
};

function boundaryPage(label: string, title: string, description: string, requestId?: string): ReactElement {
  return createElement("main", { style: pageStyle },
    createElement("section", { style: panelStyle, role: label.startsWith("500") ? "alert" : undefined },
      createElement("p", { style: labelStyle }, label),
      createElement("h1", { style: titleStyle }, title),
      createElement("p", { style: textStyle }, description),
      requestId === undefined || requestId === "" ? null
        : createElement("p", { style: requestStyle }, `Request ID: ${requestId}`)));
}

/** Framework fallback used when the application does not declare `not-found.drx`. */
export function DotReactDefaultNotFoundBoundary(props: Record<string, unknown>): ReactElement {
  const requestId = typeof props.requestId === "string" ? props.requestId : undefined;
  return boundaryPage("404 · DotReact", "Página não encontrada", "A página solicitada não existe ou não está mais disponível.", requestId);
}

/** Framework fallback used when the application does not declare `error.drx`. */
export function DotReactDefaultErrorBoundary(props: Record<string, unknown>): ReactElement {
  const requestId = typeof props.requestId === "string" ? props.requestId : undefined;
  return boundaryPage("500 · DotReact", "Não foi possível carregar esta página", "Ocorreu um erro inesperado. Tente novamente em instantes.", requestId);
}

/** Framework fallback used while a client navigation has no custom `loading.drx`. */
export function DotReactDefaultLoadingBoundary(): ReactElement {
  return createElement("div", {
    role: "status",
    "aria-live": "polite",
    "aria-busy": true,
    style: {
      boxSizing: "border-box",
      width: "100%",
      padding: "1rem",
      color: "#526071",
      fontFamily: pageStyle.fontFamily,
      fontSize: "0.875rem"
    }
  }, "Carregando…");
}

function pageModule(component: DotReactPageModule["default"]): DotReactPageModule {
  return Object.freeze({ default: component });
}

/**
 * Route fallbacks owned by the runtime. The Vite virtual module replaces each
 * member independently when the project declares the matching DRX convention.
 */
export const dotReactDefaultBoundaries: Required<DotReactBoundaryModules> = Object.freeze({
  notFound: pageModule(DotReactDefaultNotFoundBoundary),
  error: pageModule(DotReactDefaultErrorBoundary),
  loading: pageModule(DotReactDefaultLoadingBoundary)
});
