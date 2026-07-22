import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

type SecuritySeverity = "high" | "medium";

interface SecurityFinding {
  readonly rule: string;
  readonly severity: SecuritySeverity;
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly suggestion: string;
}

export interface SecurityReport {
  readonly filesScanned: number;
  readonly findings: readonly SecurityFinding[];
}

const roots = ["app", "Server"] as const;
const extensions = new Set([".cs", ".drx", ".html", ".js", ".jsx", ".ts", ".tsx"]);
const ignored = new Set(["bin", "dist", "node_modules", "obj", "vendor"]);

interface Rule {
  readonly id: string;
  readonly severity: SecuritySeverity;
  readonly pattern: RegExp;
  readonly message: string;
  readonly suggestion: string;
  readonly clientOnly?: boolean;
  readonly serverOnly?: boolean;
}

const rules: readonly Rule[] = [
  {
    id: "DRXSEC001",
    severity: "high",
    pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/u,
    message: "Raw HTML insertion can bypass React escaping and create an XSS sink.",
    suggestion: "Render structured data through JSX. If rich HTML is required, centralize a reviewed sanitizer and CSP policy.",
    clientOnly: true
  },
  {
    id: "DRXSEC002",
    severity: "high",
    pattern: /\beval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`]/u,
    message: "String-to-code execution is incompatible with a strict Content Security Policy.",
    suggestion: "Replace dynamic code with typed data and explicit function dispatch.",
    clientOnly: true
  },
  {
    id: "DRXSEC003",
    severity: "high",
    pattern: /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\s*\(\s*["'`](?:access[_-]?token|auth|jwt|refresh[_-]?token|session)/iu,
    message: "Authentication material must not be persisted in browser Web Storage.",
    suggestion: "Use the framework HTTP-only cookie session or a short-lived in-memory token flow.",
    clientOnly: true
  },
  {
    id: "DRXSEC004",
    severity: "medium",
    pattern: /\.postMessage\s*\([^\n,]+,\s*["'`]\*["'`]\s*\)/u,
    message: "postMessage uses a wildcard target origin.",
    suggestion: "Send to an exact trusted origin and validate event.origin plus the message schema on receipt.",
    clientOnly: true
  },
  {
    id: "DRXSEC005",
    severity: "high",
    pattern: /import\.meta\.env\.[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET)[A-Z0-9_]*/u,
    message: "A secret-like environment variable is referenced by browser-delivered source.",
    suggestion: "Keep secrets in ASP.NET Core configuration and expose only a bounded public contract to the browser.",
    clientOnly: true
  },
  {
    id: "DRXSEC006",
    severity: "high",
    pattern: /DangerousAcceptAnyServerCertificateValidator|ServerCertificateCustomValidationCallback\s*=.*(?:=>\s*true|return\s+true)/u,
    message: "TLS certificate validation is disabled for an outbound server connection.",
    suggestion: "Use the platform trust store or validate an explicitly pinned certificate in a reviewed infrastructure adapter.",
    serverOnly: true
  },
  {
    id: "DRXSEC007",
    severity: "high",
    pattern: /(?:FromSqlRaw|ExecuteSqlRaw(?:Async)?)\s*\(\s*\$/u,
    message: "Interpolated data is passed to a raw SQL API and can produce SQL injection.",
    suggestion: "Use FromSqlInterpolated/ExecuteSqlInterpolated or explicit database parameters in Infrastructure.",
    serverOnly: true
  }
];

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

function isClientSource(path: string): boolean {
  return /\.(?:drx|html|js|jsx|ts|tsx)$/iu.test(path) && !path.endsWith(".server.ts");
}

function isServerSource(path: string): boolean {
  return path.endsWith(".cs") || path.endsWith(".server.ts");
}

/** Performs a deterministic source audit; dependency audits are executed separately by the CLI. */
export async function scanProjectSecurity(projectRoot: string): Promise<SecurityReport> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await visit(path);
      } else if (entry.isFile() && extensions.has(extension(entry.name))) {
        files.push(path);
      }
    }
  };
  await Promise.all(roots.map(root => visit(resolve(projectRoot, root))));

  const findings: SecurityFinding[] = [];
  for (const file of files) {
    const projectPath = relative(projectRoot, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");
    const lines = source.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      for (const rule of rules) {
        if (rule.clientOnly === true && !isClientSource(projectPath)) continue;
        if (rule.serverOnly === true && !isServerSource(projectPath)) continue;
        if (!rule.pattern.test(lines[index]!)) continue;
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          path: projectPath,
          line: index + 1,
          message: rule.message,
          suggestion: rule.suggestion
        });
      }
    }
  }
  return { filesScanned: files.length, findings };
}

export function formatSecurityReport(report: SecurityReport): string {
  if (report.findings.length === 0)
    return `DotReact security scan passed: ${report.filesScanned} application source file(s) checked.`;
  return [
    `DotReact security scan found ${report.findings.length} finding(s):`,
    ...report.findings.map(finding =>
      `  ${finding.severity} ${finding.rule} ${finding.path}:${finding.line}\n` +
      `    ${finding.message}\n` +
      `    Fix: ${finding.suggestion}`)
  ].join("\n");
}
