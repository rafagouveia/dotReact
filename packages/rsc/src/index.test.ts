import assert from "node:assert/strict";
import test from "node:test";
import { dotReactRsc } from "./index.js";

test("RSC integration is fail-closed for JavaScript server actions", async () => {
  const plugins = dotReactRsc({
    entries: { rsc: "entry.rsc.tsx", ssr: "entry.ssr.tsx", client: "entry.browser.tsx" }
  });
  const guard = plugins.find(plugin => plugin.name === "dotreact:rsc-csharp-backend-guard");
  assert.ok(guard?.transform);
  const transform = typeof guard.transform === "function" ? guard.transform : guard.transform.handler;
  await assert.rejects(
    async () => await transform.call(
      {} as never,
      '"use server";\nexport async function mutate() {}',
      "/src/action.ts"
    ),
    /typed C# IDotReactAction/
  );
});
