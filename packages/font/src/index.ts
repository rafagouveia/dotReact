export type DotReactFontDisplay = "auto" | "block" | "swap" | "fallback" | "optional";

export interface DotReactFontSource {
  /** Root-relative URL served from the application's public directory. */
  readonly path: string;
  readonly weight?: number | string;
  readonly style?: "normal" | "italic" | "oblique";
  readonly format?: "woff2" | "woff" | "truetype" | "opentype";
  /** Preloads this face during SSR. Keep this enabled only for above-the-fold weights. */
  readonly preload?: boolean;
}

export interface DotReactLocalFontOptions {
  readonly family: string;
  readonly src: DotReactFontSource | readonly DotReactFontSource[];
  readonly variable?: `--${string}`;
  readonly display?: DotReactFontDisplay;
  readonly fallback?: readonly string[];
  readonly preload?: boolean;
}

export interface DotReactFont {
  readonly family: string;
  readonly variable: `--${string}`;
  readonly className: string;
  readonly style: Readonly<{ fontFamily: string }>;
  readonly sources: readonly Readonly<Required<Pick<DotReactFontSource, "path" | "style" | "format" | "preload">> & Pick<DotReactFontSource, "weight">>[];
  readonly display: DotReactFontDisplay;
  readonly fallback: readonly string[];
  readonly preload: boolean;
}

export interface DotReactFontPreloadLink {
  readonly rel: "preload";
  readonly as: "font";
  readonly href: string;
  readonly type: string;
  readonly crossorigin: "anonymous";
}

const familyPattern = /^[\p{L}\p{N} _-]{1,80}$/u;
const variablePattern = /^--[A-Za-z_][A-Za-z0-9_-]{0,79}$/;
const weightPattern = /^(?:[1-9][0-9]{0,2}|1000)(?: (?:[1-9][0-9]{0,2}|1000))?$/;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "local";
}

function formatOf(source: DotReactFontSource): "woff2" | "woff" | "truetype" | "opentype" {
  if (source.format !== undefined) return source.format;
  const pathname = source.path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (pathname.endsWith(".woff2")) return "woff2";
  if (pathname.endsWith(".woff")) return "woff";
  if (pathname.endsWith(".ttf")) return "truetype";
  if (pathname.endsWith(".otf")) return "opentype";
  throw new Error(`DotReact could not infer the font format for '${source.path}'. Set format explicitly.`);
}

function validatePublicPath(value: string): void {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\0"))
    throw new Error(`DotReact local font paths must be root-relative public URLs: ${value}`);
  const pathname = value.split(/[?#]/, 1)[0] ?? "";
  if (pathname.split("/").some(part => part === "." || part === ".."))
    throw new Error(`DotReact local font paths cannot contain traversal segments: ${value}`);
}

function normalizedWeight(weight: number | string | undefined): number | string | undefined {
  if (weight === undefined) return undefined;
  const value = String(weight);
  if (!weightPattern.test(value)) throw new Error(`Invalid DotReact font weight '${value}'.`);
  return weight;
}

/** Declares a self-hosted font that DotReact bundles into CSS and preloads during SSR. */
export function localFont(options: DotReactLocalFontOptions): DotReactFont {
  if (!familyPattern.test(options.family)) throw new Error("DotReact font family contains unsupported characters.");
  const variable = options.variable ?? `--dotreact-font-${slug(options.family)}`;
  if (!variablePattern.test(variable)) throw new Error(`Invalid DotReact font CSS variable '${variable}'.`);
  const input = Array.isArray(options.src) ? options.src : [options.src];
  if (input.length === 0) throw new Error(`DotReact font '${options.family}' requires at least one source.`);
  const sources = input.map(source => {
    validatePublicPath(source.path);
    const weight = normalizedWeight(source.weight);
    return Object.freeze({
      path: source.path,
      ...(weight === undefined ? {} : { weight }),
      style: source.style ?? "normal",
      format: formatOf(source),
      preload: source.preload ?? true
    });
  });
  const fallback = Object.freeze([...(options.fallback ?? ["system-ui", "sans-serif"])]);
  if (fallback.some(value => value.length === 0 || /[;{}]/.test(value)))
    throw new Error(`DotReact font '${options.family}' has an invalid fallback.`);
  const className = `dotreact-font-${slug(options.family)}`;
  return Object.freeze({
    family: options.family,
    variable,
    className,
    style: Object.freeze({ fontFamily: `var(${variable})` }),
    sources: Object.freeze(sources),
    display: options.display ?? "swap",
    fallback,
    preload: options.preload ?? true
  });
}

function cssString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function fontStack(font: DotReactFont): string {
  return [cssString(font.family), ...font.fallback.map(value => value.includes(" ") ? cssString(value) : value)].join(", ");
}

/** Framework integration API used by the Vite plugin. */
export function createFontStyleSheet(fonts: readonly DotReactFont[]): string {
  const faces = fonts.flatMap(font => font.sources.map(source => [
    "@font-face {",
    `  font-family: ${cssString(font.family)};`,
    `  src: url(${cssString(source.path)}) format(${cssString(source.format)});`,
    ...(source.weight === undefined ? [] : [`  font-weight: ${source.weight};`]),
    `  font-style: ${source.style};`,
    `  font-display: ${font.display};`,
    "}"
  ].join("\n")));
  const variables = fonts.map(font => `  ${font.variable}: ${fontStack(font)};`);
  const classes = fonts.map(font => `.${font.className} { font-family: var(${font.variable}); }`);
  if (faces.length === 0) return "";
  return `${faces.join("\n\n")}\n\n:root {\n${variables.join("\n")}\n}\n\n${classes.join("\n")}\n`;
}

/** Framework integration API used to emit SSR resource hints. */
export function createFontPreloadLinks(fonts: readonly DotReactFont[]): readonly DotReactFontPreloadLink[] {
  const links = fonts.flatMap(font => font.preload ? font.sources.filter(source => source.preload).map(source => ({
    rel: "preload" as const,
    as: "font" as const,
    href: source.path,
    type: source.format === "woff2" ? "font/woff2" : source.format === "woff" ? "font/woff"
      : source.format === "truetype" ? "font/ttf" : "font/otf",
    crossorigin: "anonymous" as const
  })) : []);
  return Object.freeze(links.map(link => Object.freeze(link)));
}
