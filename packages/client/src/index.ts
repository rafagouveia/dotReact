export interface ServerActionCallOptions {
  readonly signal?: AbortSignal;
  /** Stable retry key required by actions marked [DotReactIdempotent]. */
  readonly idempotencyKey?: string;
  /** Receives local paths reported stale by the completed action. */
  readonly onRevalidate?: (paths: readonly string[]) => void;
}

export interface ServerActionOptions {
  readonly document?: Document;
  readonly fetch?: typeof globalThis.fetch;
  /** Default revalidation observer for every call made through this action. */
  readonly onRevalidate?: (paths: readonly string[]) => void;
}

export type ServerAction<TRequest, TResponse> = (
  request: TRequest,
  options?: ServerActionCallOptions
) => Promise<TResponse>;

export class DotReactActionError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(status: number, problem: unknown) {
    super(problemTitle(problem) ?? `DotReact server action failed with HTTP ${status}.`);
    this.name = "DotReactActionError";
    this.status = status;
    this.problem = problem;
  }
}

function problemTitle(problem: unknown): string | undefined {
  if (typeof problem !== "object" || problem === null) return typeof problem === "string" && problem !== "" ? problem : undefined;
  const title = (problem as { title?: unknown }).title;
  return typeof title === "string" && title !== "" ? title : undefined;
}

function hydrationCsrfToken(document: Document): string | undefined {
  const element = document.querySelector("#__DOTREACT_DATA__, #__dotreact_hydration, script[data-dotreact-hydration]");
  const text = element?.textContent;
  if (text === undefined || text === null || text.trim() === "") return undefined;
  try {
    const value = JSON.parse(text) as {
      csrfToken?: unknown;
      csrf?: { token?: unknown };
      security?: { csrfToken?: unknown };
    };
    const token = value.csrfToken ?? value.csrf?.token ?? value.security?.csrfToken;
    return typeof token === "string" && token !== "" ? token : undefined;
  } catch {
    return undefined;
  }
}

export function readCsrfToken(document: Document): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="dotreact-csrf-token"], meta[name="csrf-token"]');
  const content = meta?.content.trim();
  return content !== undefined && content !== "" ? content : hydrationCsrfToken(document);
}

function actionSegments(action: string | readonly string[]): readonly string[] {
  const segments = typeof action === "string" ? action.split("/") : action;
  const safeSegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === ".." || !safeSegment.test(segment))) {
    throw new TypeError("A DotReact server action requires safe path segments beginning with an ASCII letter or digit.");
  }
  return segments;
}

async function responseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try { return await response.json(); } catch { return undefined; }
  }
  const text = await response.text();
  return text === "" ? undefined : text;
}

function validateIdempotencyKey(key: string): void {
  if (key.length === 0 || key.length > 128 || !/^[!-~]+$/.test(key)
    || key.includes("/") || key.includes("\\") || key.includes(",")) {
    throw new TypeError("A DotReact idempotency key must contain 1-128 safe printable ASCII characters.");
  }
}

function revalidationPaths(response: Response): readonly string[] {
  const header = response.headers.get("X-DotReact-Revalidate");
  if (header === null || header === "") return [];
  const paths: string[] = [];
  for (const encoded of header.split(",")) {
    try {
      const path = decodeURIComponent(encoded);
      if (path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !/\p{Cc}/u.test(path)) {
        paths.push(path);
      }
    } catch {
      // An invalid advisory response header cannot change the action result.
    }
  }
  return Object.freeze(paths);
}

export function createServerAction<TRequest, TResponse>(
  action: string | readonly string[],
  options: ServerActionOptions = {}
): ServerAction<TRequest, TResponse> {
  const url = `/_dotreact/actions/${actionSegments(action).map(encodeURIComponent).join("/")}`;

  return async (request, callOptions = {}) => {
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (fetchImplementation === undefined) throw new Error("Fetch is not available in this environment.");
    const currentDocument = options.document ?? (typeof document === "undefined" ? undefined : document);
    const csrfToken = currentDocument === undefined ? undefined : readCsrfToken(currentDocument);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Accept": "application/json, application/problem+json",
      "X-DotReact-Action": "1"
    });
    if (csrfToken !== undefined) headers.set("X-DotReact-CSRF", csrfToken);
    if (callOptions.idempotencyKey !== undefined) {
      validateIdempotencyKey(callOptions.idempotencyKey);
      headers.set("Idempotency-Key", callOptions.idempotencyKey);
    }

    const response = await fetchImplementation(url, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(request),
      ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal })
    });
    const body = await responseBody(response);
    if (!response.ok) throw new DotReactActionError(response.status, body);
    const stalePaths = revalidationPaths(response);
    if (stalePaths.length > 0) {
      options.onRevalidate?.(stalePaths);
      if (callOptions.onRevalidate !== options.onRevalidate) callOptions.onRevalidate?.(stalePaths);
    }
    return body as TResponse;
  };
}
