import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const homePageSource = fileURLToPath(
  new URL("../../examples/starter/app/page.drx", import.meta.url)
);
const originalEyebrow = "ASP.NET Core + React SSR + DRX";

test.describe.configure({ mode: "serial" });

test("serves development assets through the ASP.NET Core origin", async ({ page }) => {
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  const html = await response!.text();
  expect(html).not.toMatch(/(?:localhost|127\.0\.0\.1):5173/);
  expect(html).toContain('href="/_dotreact/dev/src/styles.css"');
  expect(html).toContain('href="/_dotreact/dev/__dotreact_route_style.css?moduleKey=cGFnZQ"');
  expect(html.indexOf("__dotreact_route_style.css")).toBeLessThan(html.indexOf("<body>"));
  expect(html).toContain('src="/_dotreact/dev/src/entry-client.tsx"');

  const stylesheet = await page.request.get("/_dotreact/dev/src/styles.css", {
    headers: { accept: "text/css,*/*;q=0.1", "sec-fetch-dest": "style" }
  });
  expect(stylesheet.status()).toBe(200);
  expect(stylesheet.headers()["content-type"]).toContain("text/css");

  const routeStylesheet = await page.request.get("/_dotreact/dev/__dotreact_route_style.css?moduleKey=cGFnZQ", {
    headers: { accept: "text/css,*/*;q=0.1", "sec-fetch-dest": "style" }
  });
  expect(routeStylesheet.status()).toBe(200);
  expect(routeStylesheet.headers()["content-type"]).toContain("text/css");

  const runtime = await page.request.get("/_dotreact/dev/runtime");
  expect(runtime.status()).toBe(200);
  expect(runtime.headers()["cache-control"]).toContain("no-store");
  await expect(runtime.json()).resolves.toMatchObject({ instanceId: expect.any(String) });
});

test("SSR includes props loaded by C# before hydration", async ({ page }) => {
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).toContain("Seu primeiro app DotReact com page.drx");
  expect(html).toContain("Esta view é um arquivo");
  expect(html).toMatch(/Gerado em <!-- -->\d{4}-\d{2}-\d{2}T/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Seu primeiro app DotReact com page.drx"
  );
  await expect(page.locator("[data-layout-backend-label]")).toContainText(
    "Seu primeiro app DotReact com page.drx"
  );
});

test("streams a Suspense fallback before the delayed server content", async () => {
  const startedAt = Date.now();
  const response = await fetch("http://127.0.0.1:5080/streaming");
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let fallbackAt: number | undefined;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    html += decoder.decode(result.value, { stream: true });
    if (fallbackAt === undefined && html.includes("data-stream-fallback")) {
      expect(html).not.toContain("data-stream-content");
      fallbackAt = Date.now() - startedAt;
    }
  }
  html += decoder.decode();

  expect(fallbackAt).toBeDefined();
  expect(fallbackAt!).toBeLessThan(300);
  expect(html).toContain("data-stream-content");
  const csp = response.headers.get("content-security-policy") ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(html).toContain(`nonce="${nonce}"`);
});

test("serves build-scoped ISR artifacts without persisting antiforgery secrets", async () => {
  const first = await fetch("http://127.0.0.1:5080/products/77");
  const firstHtml = await first.text();
  expect(first.status).toBe(200);
  expect(first.headers.get("x-dotreact-prerender")).toBe("Generated");
  expect(firstHtml).toContain("Produto dinâmico #77");
  expect(firstHtml).not.toContain("dotreact-csrf-token");
  expect(firstHtml).not.toContain("csrfToken");

  const second = await fetch("http://127.0.0.1:5080/products/77");
  expect(second.status).toBe(200);
  expect(second.headers.get("x-dotreact-prerender")).toBe("Fresh");
  expect(second.headers.get("etag")).toBe(first.headers.get("etag"));

  const token = await fetch("http://127.0.0.1:5080/_dotreact/csrf");
  expect(token.status).toBe(200);
  expect(await token.json()).toMatchObject({ token: expect.any(String) });
});

test("hydrates the React tree and executes a C# Server Action", async ({ page }) => {
  await page.goto("/");

  const actionButton = page.getByRole("button", { name: "Server Action C#: 0" });
  await expect(actionButton).toBeVisible();
  await actionButton.click();

  await expect(page.getByRole("button", { name: "Server Action C#: 1" })).toBeVisible();
  await expect(page.locator("[data-action-result]")).toHaveText("Server Action C#");
});

test("performs client navigation, preserves the document and receives dynamic C# props", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { (window as typeof window & { __dotreactMarker?: string }).__dotreactMarker = "preserved"; });

  await page.locator("main").getByRole("link", { name: /Abrir rota dinâmica/ }).click();

  await expect(page).toHaveURL(/\/products\/42$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produto dinâmico #42");
  await expect(page.getByText("Loader C# + routing ASP.NET Core")).toBeVisible();
  await expect(page.locator("[data-layout-backend-label]")).toContainText("Produto dinâmico #42");
  expect(await page.evaluate(() => (window as typeof window & { __dotreactMarker?: string }).__dotreactMarker)).toBe("preserved");
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seu primeiro app DotReact com page.drx");
});

test("preserves browser and React state during DRX Fast Refresh", async ({ page }) => {
  test.setTimeout(60_000);
  const originalSource = await readFile(homePageSource, "utf8");
  expect(originalSource).toContain(originalEyebrow);
  const refreshedEyebrow = `${originalEyebrow} · Fast Refresh E2E`;

  await page.goto("/");
  await expect(page.locator(".eyebrow")).toHaveText(originalEyebrow);
  await page.getByRole("button", { name: "Server Action C#: 0" }).click();
  await expect(page.getByRole("button", { name: "Server Action C#: 1" })).toBeVisible();
  const marker = await page.evaluate(() => {
    const value = crypto.randomUUID();
    Object.assign(window, { __dotReactFastRefresh: value });
    return value;
  });

  try {
    await writeFile(homePageSource, originalSource.replace(originalEyebrow, refreshedEyebrow), "utf8");

    await expect(page.locator(".eyebrow")).toHaveText(refreshedEyebrow);
    await expect(page.getByRole("button", { name: "Server Action C#: 1" })).toBeVisible();
    expect(await page.evaluate(() =>
      (window as Window & { __dotReactFastRefresh?: string }).__dotReactFastRefresh)).toBe(marker);
  } finally {
    await writeFile(homePageSource, originalSource, "utf8");
    await expect(page.locator(".eyebrow")).toHaveText(originalEyebrow);
  }
});

test("revalidates C# props without remounting the React page", async ({ page }) => {
  await page.goto("/");
  const actionButton = page.getByRole("button", { name: "Server Action C#: 0" });
  await actionButton.click();
  await expect(page.getByRole("button", { name: "Server Action C#: 1" })).toBeVisible();
  const generated = page.getByText(/^Gerado em /);
  const before = await generated.textContent();

  await page.waitForTimeout(25);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("dotreact:revalidate", { detail: ["/"] })));

  await expect(generated).not.toHaveText(before ?? "");
  await expect(page.getByRole("button", { name: "Server Action C#: 1" })).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
});
