import {
  Component,
  createElement,
  type ComponentType,
  type ErrorInfo,
  type ReactElement,
  type ReactNode
} from "react";

export interface DotReactErrorFallbackProps {
  readonly error: Error;
  readonly development?: boolean;
  readonly componentStack?: string;
  readonly onReset?: () => void;
  readonly window?: Window;
}

export interface DotReactRootBoundaryProps {
  readonly children?: ReactNode;
  readonly development?: boolean;
  readonly window?: Window;
  readonly onError?: (error: Error, componentStack?: string) => void;
  /** Application-owned production fallback. Development always uses the framework diagnostics overlay. */
  readonly globalError?: ComponentType<DotReactGlobalErrorProps>;
}

/** Props received by app/global-error.drx for uncaught client errors in production. */
export interface DotReactGlobalErrorProps {
  readonly error: Error;
  readonly reset: () => void;
}

interface DotReactRootBoundaryState {
  readonly error?: Error;
  readonly componentStack?: string;
}

type DotReactStackFrameKind = "app" | "framework" | "dependency" | "runtime";

interface DotReactStackFrame {
  readonly key: string;
  readonly functionName: string;
  readonly location: string;
  readonly displayLocation: string;
  readonly line: number;
  readonly column: number;
  readonly kind: DotReactStackFrameKind;
}

interface DotReactSourceLine {
  readonly number: number;
  readonly text: string;
  readonly highlighted: boolean;
}

interface DotReactDiagnosticSource {
  readonly file: string;
  readonly editorUri: string;
  readonly line: number;
  readonly column: number;
  readonly lines: readonly DotReactSourceLine[];
}

interface DotReactDiagnosticOverlayProps extends DotReactErrorFallbackProps {
  readonly diagnostic: string;
  readonly frames: readonly DotReactStackFrame[];
}

interface DotReactDiagnosticOverlayState {
  readonly selectedFrameKey: string | undefined;
  readonly source: DotReactDiagnosticSource | undefined;
  readonly sourceError: string | undefined;
  readonly loadingSource: boolean;
  readonly showInternalFrames: boolean;
  readonly copied: boolean;
}

function asError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try { return new Error(JSON.stringify(value)); }
  catch { return new Error("An unknown client-side error occurred."); }
}

function cspNonce(document: Document): string | undefined {
  const value = document.querySelector<HTMLElement>("script[nonce],style[nonce]")?.nonce;
  return value === undefined || value === "" ? undefined : value;
}

function frameKind(location: string): DotReactStackFrameKind {
  const value = location.replaceAll("\\", "/").toLowerCase();
  if (value.includes("/vendor/client/") || value.includes("/@dotreact/") || value.includes("/packages/client/"))
    return "framework";
  if (value.includes("/node_modules/") || value.includes("/.vite/deps/")) return "dependency";
  if (value.includes("/app/") || value.includes("/src/")) return "app";
  return "runtime";
}

function displayLocation(location: string): string {
  try {
    const parsed = new URL(location);
    return decodeURIComponent(parsed.pathname)
      .replace(/^\/_dotreact\/dev\//, "")
      .replace(/^\/@fs\//, "");
  } catch {
    return location.replaceAll("\\", "/");
  }
}

function stackFrames(stack: string): readonly DotReactStackFrame[] {
  const frames: DotReactStackFrame[] = [];
  for (const raw of stack.split("\n")) {
    const match = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(raw);
    if (match?.[2] === undefined || match[3] === undefined || match[4] === undefined) continue;
    const location = match[2];
    const line = Number.parseInt(match[3], 10);
    const column = Number.parseInt(match[4], 10);
    frames.push({
      key: `${location}:${line}:${column}:${frames.length}`,
      functionName: match[1]?.trim() || "anonymous",
      location,
      displayLocation: displayLocation(location),
      line,
      column,
      kind: frameKind(location)
    });
  }
  return frames;
}

function kindLabel(kind: DotReactStackFrameKind): string {
  if (kind === "app") return "app";
  if (kind === "framework") return "dotreact";
  if (kind === "dependency") return "vendor";
  return "runtime";
}

function diagnosticEndpoint(frame: DotReactStackFrame, browserWindow: Window): string {
  let prefix = "/_dotreact/dev/";
  try {
    const framePath = new URL(frame.location, browserWindow.location.href).pathname;
    const marker = framePath.indexOf("/_dotreact/dev/");
    if (marker >= 0) prefix = `${framePath.slice(0, marker)}/_dotreact/dev/`;
  } catch { /* use the canonical development prefix */ }
  const query = new URLSearchParams({
    url: frame.location,
    line: String(frame.line),
    column: String(frame.column)
  });
  return `${prefix}__dotreact_diagnostics/frame?${query}`;
}

const codeTokenPattern = /(\/\/.*$|\/\*[\s\S]*?\*\/|`(?:\\.|[^`])*`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b(?:as|async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|of|return|switch|throw|true|try|type|typeof|undefined|var|void|while|yield)\b|\b\d+(?:\.\d+)?\b)/g;

function highlightedCode(value: string): readonly ReactNode[] {
  const values: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(codeTokenPattern)) {
    const index = match.index;
    if (index > cursor) values.push(value.slice(cursor, index));
    const token = match[0];
    const kind = token.startsWith("//") || token.startsWith("/*")
      ? "comment"
      : token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")
        ? "string"
        : /^\d/.test(token) ? "number" : "keyword";
    values.push(createElement("span", { className: `dotreact-token-${kind}`, key: `${index}:${token}` }, token));
    cursor = index + token.length;
  }
  if (cursor < value.length) values.push(value.slice(cursor));
  return values;
}

const errorStyles = `
:root{color-scheme:dark}
.dotreact-error-overlay{position:fixed;inset:0;z-index:2147483647;overflow:auto;background:rgba(5,5,6,.985);color:#f4f4f5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:clamp(.6rem,2vw,1.25rem)}
.dotreact-error-shell{width:min(100%,58rem);max-height:calc(100dvh - 3rem);display:flex;flex-direction:column;margin:1rem auto;background:#111113;border:1px solid #29292d;border-radius:.75rem;box-shadow:0 2rem 6rem rgba(0,0,0,.55);overflow:hidden}
.dotreact-error-topbar{height:2.65rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0 .9rem;border-bottom:1px solid #29292d;background:#151517}.dotreact-error-topbar-left,.dotreact-error-topbar-right{display:flex;align-items:center;gap:.55rem}.dotreact-error-indicator{width:.52rem;height:.52rem;border-radius:50%;background:#ff5f57;box-shadow:0 0 0 .2rem rgba(255,95,87,.12)}.dotreact-error-eyebrow{font:700 .67rem/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.055em;text-transform:uppercase;color:#a1a1aa}.dotreact-error-runtime{padding:.22rem .4rem;border:1px solid #343438;border-radius:.3rem;color:#71717a;font:650 .61rem/1 ui-monospace,SFMono-Regular,Consolas,monospace}.dotreact-error-count{color:#71717a;font:600 .65rem/1 ui-monospace,SFMono-Regular,Consolas,monospace}
.dotreact-error-content{min-height:0;overflow:auto;padding:1rem 1.1rem 1.1rem}.dotreact-error-classification{display:flex;align-items:center;gap:.45rem;margin-bottom:.45rem;color:#ff827c;font:700 .67rem/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.04em}.dotreact-error-content h1{margin:0;color:#fafafa;font-size:clamp(1.08rem,2vw,1.36rem);line-height:1.32;letter-spacing:-.025em;overflow-wrap:anywhere}.dotreact-error-message{margin:.4rem 0 0;color:#a1a1aa;font-size:.77rem;line-height:1.5}
.dotreact-error-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.65rem;margin-top:.9rem}.dotreact-error-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem}.dotreact-error-button,.dotreact-error-link{height:2rem;display:inline-flex;align-items:center;justify-content:center;gap:.38rem;box-sizing:border-box;border:1px solid #343438;border-radius:.42rem;background:#18181b;color:#e4e4e7;padding:0 .66rem;font:650 .7rem/1 inherit;text-decoration:none;cursor:pointer}.dotreact-error-button:hover,.dotreact-error-link:hover{border-color:#52525b;background:#202024}.dotreact-error-button-primary{background:#f4f4f5;border-color:#f4f4f5;color:#111113}.dotreact-error-button-primary:hover{background:#d4d4d8;border-color:#d4d4d8}.dotreact-error-shortcut{color:#71717a;font:600 .65rem/1.35 ui-monospace,SFMono-Regular,Consolas,monospace}
.dotreact-source{margin-top:1rem;border:1px solid #2a2a2e;border-radius:.55rem;background:#0b0b0d;overflow:hidden}.dotreact-source-head{min-height:2.3rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.45rem .7rem;border-bottom:1px solid #26262a;background:#141416}.dotreact-source-file{min-width:0;display:flex;align-items:center;gap:.45rem;color:#d4d4d8;font:650 .69rem/1.3 ui-monospace,SFMono-Regular,Consolas,monospace}.dotreact-source-file strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dotreact-source-position{flex:none;color:#ff827c}.dotreact-source-editor{flex:none;color:#a1a1aa;font-size:.67rem;text-decoration:none}.dotreact-source-editor:hover{color:#fff}.dotreact-source-body{overflow:auto;padding:.4rem 0}.dotreact-code-line{min-width:max-content;display:grid;grid-template-columns:3rem minmax(36rem,1fr);position:relative;font:500 .73rem/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}.dotreact-code-line[data-active=true]{background:rgba(255,95,87,.095)}.dotreact-code-line[data-active=true]::before{content:"";position:absolute;inset:0 auto 0 0;width:2px;background:#ff5f57}.dotreact-code-number{padding:0 .75rem 0 .4rem;text-align:right;color:#52525b;user-select:none}.dotreact-code-line[data-active=true] .dotreact-code-number{color:#ff827c}.dotreact-code-text{padding-right:1rem;color:#d4d4d8;white-space:pre}.dotreact-token-keyword{color:#c4b5fd}.dotreact-token-string{color:#a7c7a0}.dotreact-token-number{color:#e9b872}.dotreact-token-comment{color:#66666f;font-style:italic}.dotreact-source-empty{padding:1rem;color:#71717a;font-size:.73rem}.dotreact-source-error{color:#fda4af}
.dotreact-stack{margin-top:.75rem;border:1px solid #29292d;border-radius:.55rem;overflow:hidden;background:#0d0d0f}.dotreact-stack-head{min-height:2.35rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.45rem .7rem;border-bottom:1px solid #29292d}.dotreact-stack-title{display:flex;align-items:center;gap:.5rem;color:#d4d4d8;font-size:.72rem;font-weight:700}.dotreact-stack-meta{color:#71717a;font:600 .64rem/1 ui-monospace,SFMono-Regular,Consolas,monospace}.dotreact-stack-list{list-style:none;margin:0;padding:0;max-height:13.5rem;overflow:auto}.dotreact-frame{margin:0;border-bottom:1px solid #222226}.dotreact-frame:last-child{border-bottom:0}.dotreact-frame-button{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:.75rem;border:0;background:transparent;padding:.48rem .7rem;text-align:left;color:inherit;cursor:pointer}.dotreact-frame-button:hover,.dotreact-frame-button[data-selected=true]{background:#18181b}.dotreact-frame-function{display:block;color:#e4e4e7;font:600 .7rem/1.25 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dotreact-frame-location{display:flex;min-width:0;gap:0;margin-top:.16rem;color:#71717a;font:500 .64rem/1.25 ui-monospace,SFMono-Regular,Consolas,monospace}.dotreact-frame-path{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dotreact-frame-line{flex:none;color:#a1a1aa}.dotreact-frame-kind{padding:.2rem .35rem;border:1px solid #303034;border-radius:.3rem;color:#71717a;font:700 .55rem/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.035em}.dotreact-frame[data-kind=app] .dotreact-frame-kind{border-color:#6b3b3b;color:#ff9b96}.dotreact-frame[data-kind=app] .dotreact-frame-path{color:#d4d4d8}.dotreact-stack-footer{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.45rem .7rem;border-top:1px solid #29292d;background:#121214}.dotreact-stack-toggle{border:0;background:transparent;padding:0;color:#a1a1aa;font-size:.67rem;cursor:pointer}.dotreact-stack-toggle:hover{color:#fff}.dotreact-error-details{margin-top:.7rem}.dotreact-error-details summary{cursor:pointer;color:#71717a;font-size:.67rem}.dotreact-error-details pre{max-height:13rem;overflow:auto;margin:.5rem 0 0;padding:.65rem;border:1px solid #29292d;border-radius:.45rem;background:#09090b;color:#a1a1aa;font:500 .65rem/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.dotreact-source-body{max-height:13rem}.dotreact-stack-list{max-height:9.5rem}.dotreact-frame-button{padding:.42rem .7rem}
@media(max-width:680px){.dotreact-error-overlay{padding:0}.dotreact-error-shell{min-height:100%;max-height:100dvh;margin:0;border-width:0;border-radius:0}.dotreact-error-content{padding:.9rem}.dotreact-error-shortcut,.dotreact-error-runtime{display:none}.dotreact-code-line{grid-template-columns:2.5rem minmax(28rem,1fr)}.dotreact-source-editor{font-size:0}.dotreact-source-editor::after{content:"VS Code";font-size:.67rem}}
`;

class DotReactDiagnosticOverlay extends Component<DotReactDiagnosticOverlayProps, DotReactDiagnosticOverlayState> {
  state: DotReactDiagnosticOverlayState = {
    selectedFrameKey: undefined,
    source: undefined,
    sourceError: undefined,
    loadingSource: false,
    showInternalFrames: false,
    copied: false
  };

  componentDidMount(): void {
    const first = this.props.frames.find(frame => frame.kind === "app")
      ?? this.props.frames.find(frame => frame.kind === "framework");
    if (first !== undefined) void this.selectFrame(first);
  }

  private browserWindow(): Window | undefined {
    return this.props.window ?? (typeof window === "undefined" ? undefined : window);
  }

  private readonly selectFrame = async (frame: DotReactStackFrame): Promise<void> => {
    const browserWindow = this.browserWindow();
    this.setState({ selectedFrameKey: frame.key, source: undefined, sourceError: undefined, loadingSource: true });
    if (browserWindow === undefined) {
      this.setState({ loadingSource: false });
      return;
    }
    try {
      const response = await browserWindow.fetch(diagnosticEndpoint(frame, browserWindow), {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("O código-fonte desse frame não está disponível.");
      const source = await response.json() as DotReactDiagnosticSource;
      this.setState({ source, sourceError: undefined, loadingSource: false });
    } catch (error) {
      this.setState({
        source: undefined,
        sourceError: error instanceof Error ? error.message : "Não foi possível carregar o código-fonte.",
        loadingSource: false
      });
    }
  };

  private readonly copyDiagnostic = (): void => {
    void this.browserWindow()?.navigator.clipboard?.writeText(this.props.diagnostic).then(() => {
      this.setState({ copied: true });
      this.browserWindow()?.setTimeout(() => this.setState({ copied: false }), 1_500);
    });
  };

  private renderSource(): ReactElement {
    const { source, sourceError, loadingSource } = this.state;
    return createElement("section", { className: "dotreact-source", "aria-label": "Código-fonte" },
      createElement("div", { className: "dotreact-source-head" },
        createElement("div", { className: "dotreact-source-file" },
          createElement("span", { "aria-hidden": "true" }, "◇"),
          createElement("strong", null, source?.file ?? (loadingSource ? "Localizando código-fonte…" : "Código-fonte")),
          source === undefined ? null : createElement("span", { className: "dotreact-source-position" }, `:${source.line}:${source.column}`)),
        source === undefined ? null : createElement("a", {
          className: "dotreact-source-editor",
          href: source.editorUri,
          title: "Abrir este arquivo e posição no Visual Studio Code"
        }, "Abrir no VS Code ↗")),
      source !== undefined
        ? createElement("div", { className: "dotreact-source-body" },
            ...source.lines.map(line => createElement("div", {
              className: "dotreact-code-line",
              "data-active": String(line.highlighted),
              key: line.number
            },
            createElement("span", { className: "dotreact-code-number" }, line.number),
            createElement("code", { className: "dotreact-code-text" }, ...highlightedCode(line.text)))))
        : createElement("div", {
            className: `dotreact-source-empty${sourceError === undefined ? "" : " dotreact-source-error"}`
          }, sourceError ?? (loadingSource
            ? "Carregando contexto da falha…"
            : "Selecione um frame da aplicação para inspecionar o código.")));
  }

  render(): ReactElement {
    const { error, development = false, onReset, diagnostic, frames } = this.props;
    const browserWindow = this.browserWindow();
    const visibleFrames = this.state.showInternalFrames
      ? frames
      : frames.filter(frame => frame.kind === "app" || frame.kind === "framework");
    const appFrameCount = frames.filter(frame => frame.kind === "app").length;
    return createElement("div", { className: "dotreact-error-overlay", role: "alert", "aria-live": "assertive" },
      createElement("style", { nonce: browserWindow === undefined ? undefined : cspNonce(browserWindow.document) }, errorStyles),
      createElement("section", { className: "dotreact-error-shell", "aria-labelledby": "dotreact-error-title" },
        createElement("header", { className: "dotreact-error-topbar" },
          createElement("div", { className: "dotreact-error-topbar-left" },
            createElement("span", { className: "dotreact-error-indicator", "aria-hidden": "true" }),
            createElement("span", { className: "dotreact-error-eyebrow" }, development ? "Unhandled Runtime Error" : "Application Error"),
            development ? createElement("span", { className: "dotreact-error-runtime" }, "DOTREACT / CLIENT") : null),
          createElement("div", { className: "dotreact-error-topbar-right" },
            createElement("span", { className: "dotreact-error-count" }, "1 error"))),
        createElement("div", { className: "dotreact-error-content" },
          development ? createElement("div", { className: "dotreact-error-classification" }, error.name) : null,
          createElement("h1", { id: "dotreact-error-title" },
            development ? error.message : "Não foi possível exibir esta página."),
          createElement("p", { className: "dotreact-error-message" }, development
            ? "O render do cliente foi interrompido. Inspecione o frame destacado; ao salvar a correção, o Fast Refresh tentará recuperar a página."
            : "Ocorreu um erro inesperado. Tente novamente ou recarregue a página."),
          createElement("div", { className: "dotreact-error-toolbar" },
            createElement("div", { className: "dotreact-error-actions" },
              createElement("button", {
                className: "dotreact-error-button dotreact-error-button-primary",
                type: "button",
                onClick: () => browserWindow?.location.reload()
              }, "Recarregar"),
              onReset === undefined ? null : createElement("button", {
                className: "dotreact-error-button",
                type: "button",
                onClick: onReset
              }, "Tentar novamente"),
              development && diagnostic !== "" ? createElement("button", {
                className: "dotreact-error-button",
                type: "button",
                onClick: this.copyDiagnostic
              }, this.state.copied ? "Stack copiada" : "Copiar diagnóstico") : null),
            development ? createElement("span", { className: "dotreact-error-shortcut" }, "Fast Refresh ativo") : null),
          development ? this.renderSource() : null,
          development && frames.length > 0 ? createElement("section", { className: "dotreact-stack", "aria-label": "Stack trace" },
            createElement("div", { className: "dotreact-stack-head" },
              createElement("span", { className: "dotreact-stack-title" }, "Stack trace"),
              createElement("span", { className: "dotreact-stack-meta" }, `${frames.length} frames · ${appFrameCount} app`)),
            createElement("ol", { className: "dotreact-stack-list" },
              ...visibleFrames.map(frame => createElement("li", {
                className: "dotreact-frame",
                "data-kind": frame.kind,
                key: frame.key
              }, createElement("button", {
                className: "dotreact-frame-button",
                "data-selected": String(this.state.selectedFrameKey === frame.key),
                type: "button",
                title: `Inspecionar ${frame.displayLocation}`,
                onClick: () => { void this.selectFrame(frame); }
              },
              createElement("span", { className: "dotreact-frame-main" },
                createElement("span", { className: "dotreact-frame-function" }, frame.functionName),
                createElement("span", { className: "dotreact-frame-location" },
                  createElement("span", { className: "dotreact-frame-path" }, frame.displayLocation),
                  createElement("span", { className: "dotreact-frame-line" }, `:${frame.line}:${frame.column}`))),
              createElement("span", { className: "dotreact-frame-kind" }, kindLabel(frame.kind)))))),
            frames.length === visibleFrames.length ? null : createElement("div", { className: "dotreact-stack-footer" },
              createElement("button", {
                className: "dotreact-stack-toggle",
                type: "button",
                onClick: () => this.setState({ showInternalFrames: true })
              }, `Mostrar ${frames.length - visibleFrames.length} frames internos`),
              createElement("span", { className: "dotreact-stack-meta" }, "dependências ocultas"))) : null,
          development && diagnostic !== "" ? createElement("details", { className: "dotreact-error-details" },
            createElement("summary", null, "Stack original"),
            createElement("pre", null, diagnostic)) : null)));
  }
}

/** Framework-owned last-resort UI for errors that escape route boundaries. */
export function DotReactErrorFallback(props: DotReactErrorFallbackProps): ReactElement {
  const diagnostic = [props.error.stack ?? `${props.error.name}: ${props.error.message}`, props.componentStack]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join("\n\nComponent stack:\n");
  return createElement(DotReactDiagnosticOverlay, {
    ...props,
    diagnostic,
    frames: stackFrames(diagnostic).slice(0, 30)
  });
}

/** Root React boundary used by generated clients to prevent blank screens. */
export class DotReactRootBoundary extends Component<DotReactRootBoundaryProps, DotReactRootBoundaryState> {
  state: DotReactRootBoundaryState = {};

  private readonly resetAfterRefresh = (): void => this.setState({});

  componentDidMount(): void {
    const browserWindow = this.props.window ?? (typeof window === "undefined" ? undefined : window);
    browserWindow?.addEventListener("dotreact:refresh", this.resetAfterRefresh);
  }

  static getDerivedStateFromError(value: unknown): DotReactRootBoundaryState {
    return { error: asError(value) };
  }

  componentDidCatch(value: unknown, info: ErrorInfo): void {
    const error = asError(value);
    const componentStack = info.componentStack ?? undefined;
    this.setState(componentStack === undefined ? { error } : { error, componentStack });
    this.props.onError?.(error, componentStack);
  }

  componentWillUnmount(): void {
    const browserWindow = this.props.window ?? (typeof window === "undefined" ? undefined : window);
    browserWindow?.removeEventListener("dotreact:refresh", this.resetAfterRefresh);
  }

  render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    if (this.props.development !== true && this.props.globalError !== undefined) {
      return createElement(this.props.globalError, {
        error: this.state.error,
        reset: () => this.setState({})
      });
    }
    return createElement(DotReactErrorFallback, {
      error: this.state.error,
      ...(this.props.development === undefined ? {} : { development: this.props.development }),
      ...(this.state.componentStack === undefined ? {} : { componentStack: this.state.componentStack }),
      ...(this.props.window === undefined ? {} : { window: this.props.window }),
      onReset: () => this.setState({})
    });
  }
}

/** Renders a safe DOM fallback when bootstrapping fails before React can mount. */
export function renderDotReactFatalError(
  container: Element,
  value: unknown,
  options: { readonly development?: boolean; readonly window?: Window } = {}
): void {
  const error = asError(value);
  const browserWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const document = container.ownerDocument;
  const style = document.createElement("style");
  const nonce = cspNonce(document);
  if (nonce !== undefined) style.nonce = nonce;
  style.textContent = errorStyles;
  const overlay = document.createElement("div");
  overlay.className = "dotreact-error-overlay";
  overlay.setAttribute("role", "alert");
  const shell = document.createElement("section");
  shell.className = "dotreact-error-shell";
  const topbar = document.createElement("header");
  topbar.className = "dotreact-error-topbar";
  topbar.innerHTML = '<div class="dotreact-error-topbar-left"><span class="dotreact-error-indicator"></span><span class="dotreact-error-eyebrow">Bootstrap Error</span><span class="dotreact-error-runtime">DOTREACT / CLIENT</span></div><span class="dotreact-error-count">1 error</span>';
  const content = document.createElement("div");
  content.className = "dotreact-error-content";
  const classification = document.createElement("div");
  classification.className = "dotreact-error-classification";
  classification.textContent = options.development === true ? error.name : "Application Error";
  const title = document.createElement("h1");
  title.textContent = options.development === true ? error.message : "Não foi possível iniciar esta página.";
  const message = document.createElement("p");
  message.className = "dotreact-error-message";
  message.textContent = options.development === true
    ? "A inicialização do cliente falhou antes da hidratação. Recarregue após corrigir a causa."
    : "Ocorreu um erro inesperado. Recarregue a página para tentar novamente.";
  const actions = document.createElement("div");
  actions.className = "dotreact-error-actions";
  const reload = document.createElement("button");
  reload.className = "dotreact-error-button dotreact-error-button-primary";
  reload.type = "button";
  reload.textContent = "Recarregar";
  reload.addEventListener("click", () => browserWindow?.location.reload());
  actions.append(reload);
  content.append(classification, title, message, actions);
  if (options.development === true) {
    const details = document.createElement("details");
    details.className = "dotreact-error-details";
    const summary = document.createElement("summary");
    summary.textContent = "Stack original";
    const pre = document.createElement("pre");
    pre.textContent = error.stack ?? `${error.name}: ${error.message}`;
    details.append(summary, pre);
    content.append(details);
  }
  shell.append(topbar, content);
  overlay.append(style, shell);
  container.replaceChildren(overlay);
}
