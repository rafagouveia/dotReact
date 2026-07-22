import type { DotReactScriptDescriptor } from "@blackredsolutionsteam/dotreact-client/router";

const idPattern = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const integrityPattern = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}(?:\s+sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})*$/;

/** Declares a CSP-compatible external script for page metadata. Inline JavaScript is intentionally unsupported. */
export function script(descriptor: DotReactScriptDescriptor): Readonly<DotReactScriptDescriptor> {
  if (!isSafeSource(descriptor.src))
    throw new Error("DotReact scripts must use a root-relative public URL or credential-free HTTPS URL.");
  const remote = isRemoteSource(descriptor.src);
  if (remote && (descriptor.integrity === undefined || !integrityPattern.test(descriptor.integrity)))
    throw new Error("Remote DotReact scripts require a valid sha256, sha384 or sha512 integrity token.");
  if (descriptor.id !== undefined && !idPattern.test(descriptor.id))
    throw new Error(`Invalid DotReact script id '${descriptor.id}'.`);
  if (descriptor.integrity !== undefined && !integrityPattern.test(descriptor.integrity))
    throw new Error("DotReact script integrity must contain a valid sha256, sha384 or sha512 token.");
  if (descriptor.type !== undefined && (descriptor.type.length === 0 || /[\r\n<>]/.test(descriptor.type)))
    throw new Error("DotReact script type is invalid.");
  if (descriptor.referrerPolicy !== undefined && !/^[a-z-]+$/.test(descriptor.referrerPolicy))
    throw new Error("DotReact script referrerPolicy is invalid.");
  return Object.freeze({
    strategy: "afterInteractive",
    ...(remote ? { crossOrigin: "anonymous" as const } : {}),
    ...descriptor
  });
}

function isRemoteSource(source: string): boolean {
  try { return new URL(source).protocol === "https:"; }
  catch { return false; }
}

function isSafeSource(source: string): boolean {
  if (source.startsWith("/") && !source.startsWith("//") && !source.includes("\\") && !source.includes("\0"))
    return !source.split(/[?#]/, 1)[0]!.split("/").some(segment => segment === "." || segment === "..");
  try {
    const parsed = new URL(source);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch { return false; }
}

export type { DotReactScriptDescriptor, DotReactScriptStrategy } from "@blackredsolutionsteam/dotreact-client/router";
