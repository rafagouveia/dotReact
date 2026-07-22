import { createFromReadableStream } from "@blackredsolutionsteam/dotreact-rsc/browser";
import { StrictMode, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";
import type { RscPayload } from "./entry.rsc.js";

const initial = await createFromReadableStream<RscPayload>(rscStream);

function BrowserRoot() {
  const [payload] = useState(initial);
  return payload.root;
}

hydrateRoot(document, <StrictMode><BrowserRoot /></StrictMode>);
