export type DotReactWebVitalName = "CLS" | "INP" | "LCP" | "TTFB";
export type DotReactWebVitalRating = "good" | "needs-improvement" | "poor";

export interface DotReactWebVitalsOptions {
  readonly requestId: string;
  readonly endpoint?: string;
  readonly window?: Window;
  readonly document?: Document;
  readonly fetch?: typeof globalThis.fetch;
}

interface WebVitalPayload {
  readonly name: DotReactWebVitalName;
  readonly value: number;
  readonly rating: DotReactWebVitalRating;
  readonly navigationType: "navigate" | "reload" | "back-forward" | "prerender" | "unknown";
}

const thresholds: Readonly<Record<DotReactWebVitalName, readonly [number, number]>> = Object.freeze({
  CLS: [0.1, 0.25],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800]
});

export function rateDotReactWebVital(name: DotReactWebVitalName, value: number): DotReactWebVitalRating {
  const [good, poor] = thresholds[name];
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
}

function navigationType(performance: Performance): WebVitalPayload["navigationType"] {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (entry?.type === "navigate" || entry?.type === "reload" || entry?.type === "back_forward" || entry?.type === "prerender")
    return entry.type === "back_forward" ? "back-forward" : entry.type;
  return "unknown";
}

function traceParent(requestId: string, crypto: Crypto | undefined): string | undefined {
  if (!/^[0-9a-f]{32}$/i.test(requestId) || /^0{32}$/i.test(requestId) || crypto === undefined) return undefined;
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const spanId = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return /^0{16}$/.test(spanId) ? undefined : `00-${requestId.toLowerCase()}-${spanId}-01`;
}

/** Installs the framework-owned, dependency-free Core Web Vitals collector. */
export function installDotReactWebVitals(options: DotReactWebVitalsOptions): () => void {
  const browserWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const document = options.document ?? browserWindow?.document;
  const performance = browserWindow?.performance;
  const Observer = (browserWindow as Window & { readonly PerformanceObserver?: typeof PerformanceObserver })
    .PerformanceObserver;
  const fetchImplementation = options.fetch ?? browserWindow?.fetch.bind(browserWindow);
  if (browserWindow === undefined || document === undefined || performance === undefined
    || Observer === undefined || fetchImplementation === undefined) return () => {};
  const endpoint = options.endpoint
    ?? document.querySelector<HTMLMetaElement>('meta[name="dotreact-vitals-endpoint"]')?.content;
  if (endpoint === undefined || !endpoint.startsWith("/") || endpoint.startsWith("//")) return () => {};

  const current = new Map<DotReactWebVitalName, number>();
  const sent = new Map<DotReactWebVitalName, number>();
  const observers: PerformanceObserver[] = [];
  const navType = navigationType(performance);
  const post = (name: DotReactWebVitalName, value: number): void => {
    if (!Number.isFinite(value) || value < 0 || sent.get(name) === value) return;
    sent.set(name, value);
    const payload: WebVitalPayload = { name, value, rating: rateDotReactWebVital(name, value), navigationType: navType };
    const traceparent = traceParent(options.requestId, browserWindow.crypto);
    void fetchImplementation(endpoint, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(traceparent === undefined ? {} : { traceparent })
      },
      body: JSON.stringify(payload)
    }).catch(() => { /* Browser telemetry must never affect the application. */ });
  };
  const flush = (): void => current.forEach((value, name) => post(name, value));
  const observe = (type: string, callback: (entries: readonly PerformanceEntry[]) => void): void => {
    if (!Observer.supportedEntryTypes.includes(type)) return;
    const observer = new Observer((list: PerformanceObserverEntryList) => callback(list.getEntries()));
    observer.observe({
      type,
      buffered: true,
      ...(type === "event" ? { durationThreshold: 40 } : {})
    });
    observers.push(observer);
  };

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation !== undefined) current.set("TTFB", Math.max(0, navigation.responseStart));
  observe("largest-contentful-paint", entries => {
    const entry = entries.at(-1);
    if (entry !== undefined) current.set("LCP", entry.startTime);
  });
  let cls = 0;
  observe("layout-shift", entries => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { readonly value?: number; readonly hadRecentInput?: boolean };
      if (shift.hadRecentInput !== true && typeof shift.value === "number") cls += shift.value;
    }
    current.set("CLS", cls);
  });
  observe("event", entries => {
    for (const entry of entries) {
      const event = entry as PerformanceEntry & { readonly duration: number; readonly interactionId?: number };
      if ((event.interactionId ?? 0) > 0) current.set("INP", Math.max(current.get("INP") ?? 0, event.duration));
    }
  });

  const onVisibility = (): void => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  browserWindow.addEventListener("pagehide", flush, { passive: true });
  const timer = browserWindow.setTimeout(flush, 10_000);
  return () => {
    browserWindow.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    browserWindow.removeEventListener("pagehide", flush);
    observers.forEach(observer => observer.disconnect());
    flush();
  };
}
