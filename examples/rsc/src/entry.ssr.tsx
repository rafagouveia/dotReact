import { createFromReadableStream } from "@blackredsolutionsteam/dotreact-rsc/ssr";
import { use } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { injectRSCPayload } from "rsc-html-stream/server";
import type { RscPayload } from "./entry.rsc.js";

export async function renderHtml(
  rscStream: ReadableStream<Uint8Array>,
  nonce: string
): Promise<ReadableStream<Uint8Array>> {
  const [forSsr, forHydration] = rscStream.tee();
  let payload: Promise<RscPayload> | undefined;
  function SsrRoot() {
    payload ??= createFromReadableStream<RscPayload>(forSsr);
    return use(payload).root;
  }
  const bootstrapScriptContent = await import.meta.viteRsc.loadBootstrapScriptContent("index");
  const html = await renderToReadableStream(<SsrRoot />, { bootstrapScriptContent, nonce });
  return html.pipeThrough(injectRSCPayload(forHydration, { nonce }));
}
