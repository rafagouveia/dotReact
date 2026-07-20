import viteRsc from "@vitejs/plugin-rsc";
import type { Plugin } from "vite";

export interface DotReactRscEntries {
  readonly rsc: string;
  readonly ssr: string;
  readonly client: string;
}

export interface DotReactRscOptions {
  readonly entries: DotReactRscEntries;
  /** Enables the plugin's standalone HTTP handler for the isolated RSC example only. */
  readonly standaloneDevServer?: boolean;
}

/**
 * Experimental official-Vite RSC integration. JavaScript `use server` modules are rejected because
 * DotReact Server Actions and all application backend behavior remain owned by ASP.NET Core.
 */
export function dotReactRsc(options: DotReactRscOptions): Plugin[] {
  const backendGuard: Plugin = {
    name: "dotreact:rsc-csharp-backend-guard",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("node_modules") || id.startsWith("\0")) return null;
      if (/^\s*["']use server["'];?/u.test(code)) {
        throw new Error(
          `DotReact RSC does not allow JavaScript Server Actions in '${id}'. ` +
          "Implement the mutation as a typed C# IDotReactAction instead."
        );
      }
      return null;
    }
  };
  return [
    backendGuard,
    ...viteRsc({
      entries: options.entries,
      ...(options.standaloneDevServer === true ? {} : { serverHandler: false }),
      validateImports: true
    })
  ];
}

export default dotReactRsc;
