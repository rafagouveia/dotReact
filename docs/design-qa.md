# Benchmark visual QA

- Source visual truth: `C:\Users\rafae\AppData\Local\Temp\dotreact-benchmark-qa\benchmark-before.png`
- Implementation screenshot: `C:\Users\rafae\AppData\Local\Temp\dotreact-benchmark-qa\benchmark-after.png`
- Route: `http://127.0.0.1:5100/#benchmarks`
- Viewport: 1200 × 912
- State: Portuguese, light theme, local-reference benchmark

## Full-view comparison evidence

The source used two wide data tables with equal visual weight for every value. The
implementation preserves the sober blue/neutral DotReact palette and the original
content hierarchy, but makes the comparison scannable through three summary deltas,
normalized throughput bars and a compact metric rail. The section uses the available
horizontal space without horizontal overflow.

## Focused region comparison evidence

The benchmark panel was reviewed at row level because typography, scale labels and
metric alignment are the fidelity-critical surfaces. Implementation names remain
left-aligned, bars share one scenario-local scale, and average latency, p95 and HTML
size use tabular mono values. DotReact is blue; competitors remain neutral so color
does not imply that an unfavorable DotReact result is a win.

## Findings

- No actionable P0/P1/P2 findings remain.
- Typography: display and UI hierarchy match the existing landing page; compact mono
  labels remain secondary and values retain readable weight.
- Spacing: the new 1440 px content frame, 20 px panel gaps and shared row rhythm make
  the section denser without crowding it.
- Colors: only the existing blue accent and neutral tokens are used. The local result
  warning keeps its restrained amber status dot.
- Assets: this data visualization requires no new raster asset, logo or illustrative
  replacement.
- Copy: PT/EN labels describe median throughput, average latency, p95, payload and the
  fact that the result is local rather than verified CI evidence.

## Comparison history

1. Earlier finding: the table-only source was slow to scan and underused horizontal
   space.
2. Fix: replaced it with scenario-local normalized bars, three executive deltas and a
   compact metric rail; preserved raw-data and methodology links.
3. Post-fix evidence: the final 1200 × 912 capture shows no horizontal overflow and the
   benchmark anchor lands 96 px below the sticky header.

## Implementation checklist

- [x] Preserve honest favorable and unfavorable results.
- [x] Add proportional bars using one scale per comparable scenario.
- [x] Show average latency, p95 and payload alongside throughput.
- [x] Keep bilingual content and existing design tokens.
- [x] Validate production build and browser-rendered layout.

## Follow-up polish

- P3: capture a dedicated 390 px browser viewport when the in-app browser exposes
  viewport emulation; responsive grid fallbacks are already present in the component.

final result: passed
