import { createElement, type ImgHTMLAttributes, type ReactElement } from "react";

export type DotReactImageFormat = "auto" | "jpeg" | "png" | "webp";

export interface DotReactImageUrlOptions {
  readonly src: string;
  readonly width: number;
  readonly quality?: number;
  readonly format?: DotReactImageFormat;
  readonly endpoint?: string;
}

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "width" | "height"> {
  readonly alt: string;
  readonly src: string;
  readonly width: number;
  /** Required to reserve the aspect ratio before CSS and image bytes arrive. */
  readonly height: number;
  readonly quality?: number;
  readonly format?: DotReactImageFormat;
  readonly endpoint?: string;
  /** Loads eagerly and asks the browser to prioritize this image. */
  readonly priority?: boolean;
}

function validateSource(src: string): void {
  if (src.startsWith("/")) {
    if (src.startsWith("//") || src.includes("\\") || src.includes("?") || src.includes("#")
      || src.split("/").some((segment) => segment === "." || segment === "..")) {
      throw new TypeError("A local DotReact image source must be a safe root-relative path.");
    }
    return;
  }
  let parsed: URL;
  try { parsed = new URL(src); } catch { throw new TypeError("A remote DotReact image source must be an absolute HTTPS URL."); }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new TypeError("A remote DotReact image source must be an absolute HTTPS URL without credentials.");
  }
}

function positiveInteger(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${name} must be an integer from 1 through ${maximum}.`);
  }
}

function endpointPath(endpoint: string): string {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || /[?#\\\r\n]/u.test(endpoint)) {
    throw new TypeError("The DotReact image endpoint must be a safe application-relative path.");
  }
  return endpoint;
}

export function buildImageUrl(options: DotReactImageUrlOptions): string {
  validateSource(options.src);
  positiveInteger(options.width, "width", 8192);
  if (options.quality !== undefined) positiveInteger(options.quality, "quality", 100);
  const endpoint = endpointPath(options.endpoint ?? "/_dotreact/image");
  const query = new URLSearchParams({
    src: options.src,
    w: String(options.width),
    f: options.format ?? "auto"
  });
  if (options.quality !== undefined) query.set("q", String(options.quality));
  return `${endpoint}?${query.toString()}`;
}

/** Renders a typed img element backed by the DotReact image endpoint. */
export function Image({
  alt,
  src,
  width,
  height,
  quality,
  format,
  endpoint,
  priority = false,
  loading,
  decoding,
  ...attributes
}: ImageProps): ReactElement {
  positiveInteger(height, "height", 8192);
  const optimizedSource = buildImageUrl({
    src,
    width,
    ...(quality === undefined ? {} : { quality }),
    ...(format === undefined ? {} : { format }),
    ...(endpoint === undefined ? {} : { endpoint })
  });
  return createElement("img", {
    ...attributes,
    alt,
    src: optimizedSource,
    width,
    height,
    loading: loading ?? (priority ? "eager" : "lazy"),
    decoding: decoding ?? "async",
    ...(priority ? { fetchPriority: "high" as const } : {})
  });
}
