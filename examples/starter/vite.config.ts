import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dotReact } from "@dotreact/vite";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [dotReact({ backendManifest: "src/backend-manifest.json" }), react()],
  build: isSsrBuild ? {
    outDir: "dist/server",
    rollupOptions: {
      output: { entryFileNames: "entry-server.js" }
    }
  } : {
    outDir: "dist/client",
    manifest: true,
    rollupOptions: {
      input: "/src/entry-client.tsx",
      output: {
        entryFileNames: "_dotreact/client.js",
        assetFileNames: "_dotreact/[name]-[hash][extname]"
      }
    }
  }
}));
