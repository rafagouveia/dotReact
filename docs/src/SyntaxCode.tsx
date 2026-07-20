import { Highlight, themes } from "prism-react-renderer";
import Prism from "prismjs";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-yaml";

function languageFromLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("c#") || normalized.endsWith(".cs") || normalized.includes(".cs ")) return "csharp";
  if (normalized.includes(".drx") || normalized.includes(".tsx") || normalized.includes("react")) return "tsx";
  if (normalized.includes(".ts") || normalized.includes("typescript")) return "typescript";
  if (normalized.includes("json") || normalized.includes("manifest")) return "json";
  if (normalized.includes("powershell")) return "powershell";
  if (normalized.includes("yaml") || normalized.includes("yml")) return "yaml";
  if (normalized.includes("terminal") || normalized.includes("shell") || normalized.includes("bash")) return "bash";
  return "tsx";
}

export function SyntaxCode({ code, label, compact = false, lineNumbers = !compact }: {
  readonly code: string;
  readonly label: string;
  readonly compact?: boolean;
  readonly lineNumbers?: boolean;
}) {
  return <Highlight prism={Prism} theme={themes.nightOwl} code={code.trimEnd()} language={languageFromLabel(label)}>
    {({ tokens, getLineProps, getTokenProps, style }) => <pre className={`syntax-code ${compact ? "compact" : ""}`} style={{ ...style, backgroundColor: "transparent" }}>
      <code>
        {tokens.map((line, lineIndex) => <span {...getLineProps({ line })} className="syntax-line" key={lineIndex}>
          {lineNumbers && <span className="syntax-line-number" aria-hidden="true">{lineIndex + 1}</span>}
          <span className="syntax-line-content">{line.map((token, tokenIndex) => <span {...getTokenProps({ token })} key={tokenIndex} />)}</span>
        </span>)}
      </code>
    </pre>}
  </Highlight>;
}
