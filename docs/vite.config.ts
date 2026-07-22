import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

declare const process: { readonly env: Record<string, string | undefined> };

function normalizeBasePath(value: string | undefined): string {
  const basePath = value?.trim() || "/";
  if (!basePath.startsWith("/") || basePath.includes("..") || /[?#\\\\]/.test(basePath)) {
    throw new Error("DOTREACT_DOCS_BASE must be a safe absolute URL path.");
  }

  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.DOTREACT_DOCS_BASE),
  plugins: [tailwindcss(), react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react-vendor", test: /node_modules[\\/]react(?:-dom)?[\\/]/ },
            { name: "syntax-vendor", test: /node_modules[\\/]prism-react-renderer[\\/]/ },
            { name: "deployment-guides", test: /content\.deploy\.tsx$/ }
          ]
        }
      }
    }
  }
});
