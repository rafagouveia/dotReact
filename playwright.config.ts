import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 15_000
  },
  reporter: isCI
    ? [
        ["line"],
        ["html", { outputFolder: "output/playwright/report", open: "never" }]
      ]
    : "line",
  outputDir: "output/playwright/test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run dev:e2e -w @dotreact/example-starter",
    url: "http://127.0.0.1:5080/_health/ready",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe"
  }
});
