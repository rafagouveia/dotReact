import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DotReactErrorFallback, DotReactRootBoundary, type DotReactGlobalErrorProps } from "./errors.js";

test("development fallback exposes useful diagnostics", () => {
  const error = new Error("Broken report component");
  error.stack = "Error: Broken report component\n    at ReportPage (https://example.test/_dotreact/dev/app/reports/page.drx:18:7)\n    at DotReactApp (https://example.test/_dotreact/dev/vendor/client/dist/router.js:131:28)";
  const html = renderToStaticMarkup(createElement(DotReactErrorFallback, {
    error,
    development: true,
    componentStack: "at ReportPage"
  }));

  assert.match(html, /Broken report component/);
  assert.match(html, /ReportPage/);
  assert.match(html, /app\/reports\/page.drx/);
  assert.match(html, /Unhandled Runtime Error/);
  assert.match(html, />app</);
  assert.match(html, /DotReact/);
  assert.match(html, /Stack trace/);
  assert.match(html, /Código-fonte/);
  assert.match(html, /Copiar diagnóstico/);
});

test("production fallback does not expose technical diagnostics", () => {
  const error = new Error("secret database path C:\\private\\data.db");
  const html = renderToStaticMarkup(createElement(DotReactErrorFallback, {
    error,
    development: false
  }));

  assert.match(html, /Não foi possível exibir esta página/);
  assert.doesNotMatch(html, /secret database path/);
  assert.doesNotMatch(html, /private/);
});

test("application global error replaces the generic production fallback but never development diagnostics", () => {
  function GlobalError({ error }: DotReactGlobalErrorProps) {
    return createElement("main", null, `Custom production fallback: ${error.name}`);
  }
  const production = new DotReactRootBoundary({ development: false, globalError: GlobalError });
  production.state = DotReactRootBoundary.getDerivedStateFromError(new TypeError("private detail"));
  const productionHtml = renderToStaticMarkup(production.render());
  assert.match(productionHtml, /Custom production fallback: TypeError/);

  const development = new DotReactRootBoundary({ development: true, globalError: GlobalError });
  development.state = DotReactRootBoundary.getDerivedStateFromError(new TypeError("visible diagnostic"));
  const developmentHtml = renderToStaticMarkup(development.render());
  assert.match(developmentHtml, /Unhandled Runtime Error/);
  assert.doesNotMatch(developmentHtml, /Custom production fallback/);
});
