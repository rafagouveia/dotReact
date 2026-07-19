const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "suite.cjs");
  const options = {
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ["--disable-extensions"]
  };
  if (process.env.VSCODE_EXECUTABLE_PATH) {
    options.vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;
  }
  await runTests(options);
}

main().catch(error => {
  console.error("DotReact VS Code integration tests failed:", error);
  process.exitCode = 1;
});

