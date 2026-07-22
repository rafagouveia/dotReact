import { renderToReadableStream } from "@rafagouveia/dotreact-rsc/rsc";
import type { ReactNode } from "react";
import { Root, type DotNetModel } from "./root.js";

export interface RscPayload { readonly root: ReactNode; }

export default { fetch: handleRequest };

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const nonce = crypto.randomUUID();
  const securityHeaders = {
    "content-security-policy": `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'`,
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff"
  };
  const model: DotNetModel = {
    message: url.searchParams.get("message") ?? "Modelo C# → RSC → Client Component",
    generatedAt: "deterministic-rsc-example"
  };
  const rscStream = renderToReadableStream<RscPayload>({ root: <Root model={model} /> });
  if (request.headers.get("accept")?.includes("text/x-component")) {
    return new Response(rscStream, {
      headers: { ...securityHeaders, "content-type": "text/x-component;charset=utf-8" }
    });
  }
  const ssr = await import.meta.viteRsc.loadModule<typeof import("./entry.ssr.js")>("ssr", "index");
  const html = await ssr.renderHtml(rscStream, nonce);
  return new Response(html, {
    headers: { ...securityHeaders, "content-type": "text/html;charset=utf-8" }
  });
}

if (import.meta.hot) import.meta.hot.accept();
