#!/usr/bin/env node

import { launchDotReact } from "../dist/launcher.js";

try {
  await launchDotReact();
} catch (error) {
  process.stderr.write(`[dotreact] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
