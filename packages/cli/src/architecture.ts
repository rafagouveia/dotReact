import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

type ArchitectureSeverity = "error" | "warning";

interface ArchitectureIssue {
  readonly code: string;
  readonly severity: ArchitectureSeverity;
  readonly path: string;
  readonly message: string;
  readonly suggestion: string;
}

export interface ArchitectureReport {
  readonly issues: readonly ArchitectureIssue[];
  readonly filesScanned: number;
}

const ignoredDirectories = new Set([
  ".git", ".dotreact", ".playwright-cli", "bin", "coverage", "dist",
  "node_modules", "obj", "TestResults", "vendor"
]);

const sourceExtensions = new Set([".cs", ".css", ".drx", ".ts", ".tsx"]);

interface SourceFile {
  readonly absolutePath: string;
  readonly projectPath: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

async function collectSourceFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !sourceExtensions.has(extension(entry.name))) continue;
      files.push({
        absolutePath,
        projectPath: relative(root, absolutePath).replaceAll("\\", "/")
      });
    }
  };
  await visit(root);
  return files;
}

function isBelowPrivateFolder(projectPath: string): boolean {
  const segments = projectPath.split("/").slice(1, -1);
  return segments.some(segment => segment.startsWith("_"));
}

function isActionPath(projectPath: string): boolean {
  if (!projectPath.startsWith("app/") || !projectPath.endsWith(".server.cs")) return false;
  const segments = projectPath.split("/");
  return segments.includes("_actions");
}

function issue(
  code: string,
  path: string,
  message: string,
  suggestion: string,
  severity: ArchitectureSeverity = "error"
): ArchitectureIssue {
  return { code, severity, path, message, suggestion };
}

/** Validates the application-owned surface without inspecting framework-owned runtime files. */
export async function validateProjectArchitecture(root: string): Promise<ArchitectureReport> {
  const appRoot = resolve(root, "app");
  if (!await exists(appRoot)) {
    return {
      filesScanned: 0,
      issues: [issue(
        "DRX001",
        "app/",
        "The App Router root is missing.",
        "Create app/layout.drx and app/page.drx, or regenerate the project from a current template."
      )]
    };
  }

  const files = await collectSourceFiles(root);
  const issues: ArchitectureIssue[] = [];

  for (const file of files) {
    const path = file.projectPath;
    if ((path.startsWith("src/components/") || path.startsWith("src/features/"))) {
      issues.push(issue(
        "DRX002",
        path,
        "Legacy React source zone splits application UI from the App Router.",
        "Move shared UI to app/_components/ and route-specific UI to app/<route>/_components/."
      ));
    }

    if (path.startsWith("Server/wwwroot/")) {
      issues.push(issue(
        "DRX004",
        path,
        "Server/wwwroot is supported by ASP.NET Core, but it creates a second public-assets root outside the App Router convention.",
        "Prefer public/ for framework-managed assets. Keep Server/wwwroot only when the application deliberately owns an ASP.NET-specific static-file pipeline.",
        "warning"
      ));
    }

    if (path.startsWith("app/") && path.endsWith(".tsx") && !isBelowPrivateFolder(path)) {
      issues.push(issue(
        "DRX005",
        path,
        "A React component inside app/ must live below a private folder.",
        "Move it below _components/ or another underscore-prefixed non-route folder."
      ));
    }

    if (!path.endsWith(".cs")) continue;
    const source = await readFile(file.absolutePath, "utf8");
    if (!/\bDotReactAction\s*\(/u.test(source)) continue;
    if (!isActionPath(path)) {
      issues.push(issue(
        "DRX006",
        path,
        "This [DotReactAction] uses an application-owned server layout instead of App Router co-location.",
        "This is supported. Prefer app/_actions/ or app/<route>/_actions/*.server.cs when route co-location is useful.",
        "warning"
      ));
    }
  }

  return { filesScanned: files.length, issues };
}

export function formatArchitectureReport(report: ArchitectureReport): string {
  if (report.issues.length === 0)
    return `DotReact architecture passed: ${report.filesScanned} application source file(s) follow the App Router contract.`;
  return [
    `DotReact architecture found ${report.issues.length} issue(s):`,
    ...report.issues.map(item =>
      `  ${item.severity === "error" ? "error" : "warning"} ${item.code} ${item.path}\n` +
      `    ${item.message}\n` +
      `    Fix: ${item.suggestion}`)
  ].join("\n");
}
