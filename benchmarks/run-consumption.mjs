if (process.platform !== "linux")
  throw new Error("The canonical consumption benchmark requires Linux /proc process-tree accounting.");

process.env.DOTREACT_BENCHMARK_SAMPLE_RESOURCES = "true";
await import("./run-comparison.mjs");
