import react from "@vitejs/plugin-react";
import { dotReactRsc } from "@dotreact/rsc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    ...dotReactRsc({
      entries: {
        rsc: "./src/entry.rsc.tsx",
        ssr: "./src/entry.ssr.tsx",
        client: "./src/entry.browser.tsx"
      },
      standaloneDevServer: true
    }),
    react()
  ]
});
