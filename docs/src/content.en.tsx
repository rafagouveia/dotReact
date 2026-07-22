import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { CodeBlock, PairedCode, ReferenceTable } from "./components";
import { docs as docsPt } from "./content";
import { englishText } from "./content.en.catalog";
import type { DocPage, ReferenceRow } from "./types";

interface EnglishPage {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
}

const pages: readonly EnglishPage[] = [
  { id: "overview", group: "Getting started", title: "Overview", summary: "ASP.NET Core remains the authority while React renders on the server and hydrates in the browser.", tags: ["architecture", "SSR", "hydration"] },
  { id: "purpose-applications", group: "Getting started", title: "Purpose and use cases", summary: "Understand the problem DotReact solves and identify applications that fit its architecture.", tags: ["purpose", "use cases", "decision"] },
  { id: "beginner-learning-path", group: "Getting started", title: "Beginner learning path", summary: "Follow a short sequence from the first command to a secure production deployment.", tags: ["beginner", "learning path", "glossary"] },
  { id: "installation", group: "Getting started", title: "Installation and requirements", summary: "Prepare the supported .NET, Node.js, React and Vite toolchain.", tags: ["Node.js", ".NET", "setup"] },
  { id: "first-project", group: "Getting started", title: "Your first project", summary: "Create, run and understand a DotReact application from the first request to hydration.", tags: ["tutorial", "CLI", "HMR"] },
  { id: "configuration", group: "Getting started", title: "Host configuration", summary: "Keep the ASP.NET host small while the framework owns renderer and production defaults.", tags: ["configuration", "DI", "host"] },
  { id: "rendering-model", group: "Fundamentals", title: "Server, universal and client-only", summary: "Choose the execution model that matches data access, interactivity and bundle cost.", tags: ["SSR", "client", "boundaries"] },
  { id: "fonts-assets", group: "Fundamentals", title: "Fonts, scripts and public assets", summary: "Use public/ as the single asset root and let DotReact optimize fonts and external scripts.", tags: ["@rafagouveia/dotreact-font", "@rafagouveia/dotreact-script", "preload"] },
  { id: "next-equivalents", group: "Migrating from Next.js", title: "Start here", summary: "Map familiar Next.js concepts to their explicit DotReact equivalents.", tags: ["Next.js", "migration", "mental model"] },
  { id: "next-middleware", group: "Migrating from Next.js", title: "Middleware, Proxy and pipeline", summary: "Translate proxy.ts or middleware.ts into the explicit ASP.NET Core request pipeline.", tags: ["Next.js 16", "Proxy", "middleware", "ASP.NET Core"] },
  { id: "next-feature-status", group: "Migrating from Next.js", title: "Parity and roadmap", summary: "See which Next.js capabilities are stable, native to ASP.NET, experimental, planned or deliberately out of scope.", tags: ["support matrix", "roadmap", "App Router"] },
  { id: "pages-loaders", group: "Pages", title: "Loaders and page.drx", summary: "Co-locate a React route module with a typed C# page loader.", tags: ["pages", "loaders", "props"] },
  { id: "layouts", group: "Pages", title: "Nested layouts", summary: "Compose stable shells around pages without moving backend work into presentation.", tags: ["layouts", "composition", "routing"] },
  { id: "boundaries-metadata", group: "Pages", title: "Boundaries and metadata", summary: "Override framework loading, not-found and error fallbacks only where the application needs custom UI.", tags: ["metadata", "errors", "loading"] },
  { id: "routing", group: "Pages", title: "File and manual routing", summary: "Use conventional files for most routes and explicit registration for advanced modules.", tags: ["routing", "parameters", "discovery"] },
  { id: "navigation-streaming", group: "Pages", title: "Navigation, loading and streaming", summary: "Deliver partial client navigation while preserving SSR and progressive rendering.", tags: ["router", "Suspense", "streaming"] },
  { id: "auth-guards", group: "Full-stack", title: "Authentication and protected routes", summary: "Protect pages and actions with ASP.NET authentication, policies and resource authorization.", tags: ["authentication", "authorization", "policies"] },
  { id: "server-actions", group: "Full-stack", title: "Server Actions", summary: "Call typed C# mutations from React without creating an ad-hoc JavaScript backend.", tags: ["actions", "mutations", "type safety"] },
  { id: "actions-reliability", group: "Full-stack", title: "Idempotency and revalidation", summary: "Make mutations retry-safe and invalidate stale data automatically.", tags: ["idempotency", "cache", "revalidation"] },
  { id: "static-images", group: "Full-stack", title: "SSG, ISR and images", summary: "Pre-render stable routes, revalidate them safely and optimize image delivery.", tags: ["SSG", "ISR", "images"] },
  { id: "contracts", group: "Full-stack", title: "TypeGen and contracts", summary: "Generate TypeScript types and action clients from the compiled C# application.", tags: ["TypeGen", "contracts", "build"] },
  { id: "cli", group: "Tooling", title: "CLI reference", summary: "Create, inspect, validate and export DotReact applications.", tags: ["CLI", "scaffold", "doctor"] },
  { id: "vscode-extension", group: "Tooling", title: "VS Code extension", summary: "Edit DRX, navigate to C# loaders and run the official checker without leaving the editor.", tags: ["VS Code", "DRX", "diagnostics"] },
  { id: "options-env", group: "Reference", title: "Options and environment variables", summary: "Reference host, renderer, security, cache and observability configuration.", tags: ["options", "environment", "secrets"] },
  { id: "troubleshooting", group: "Reference", title: "Troubleshooting", summary: "Diagnose renderer connectivity, hydration, routes, contracts and development refresh.", tags: ["diagnostics", "errors", "HMR"] },
  { id: "production", group: "Operations", title: "Security and production", summary: "Harden the public host and isolate the private rendering runtime.", tags: ["security", "deployment", "Azure"] },
  { id: "observability-performance", group: "Operations", title: "Observability and performance", summary: "Measure the complete request across ASP.NET, renderer, cache and browser delivery.", tags: ["OpenTelemetry", "metrics", "budgets"] },
  { id: "examples", group: "Project", title: "Official examples", summary: "Explore focused projects for the starter, CRUD, streaming and React Server Components research.", tags: ["examples", "CRUD", "RSC"] },
  { id: "architecture-protocol", group: "Project", title: "Architecture and protocol", summary: "Understand ownership, trust boundaries and the versioned renderer contract.", tags: ["architecture", "protocol", "SOLID"] },
  { id: "compatibility", group: "Project", title: "Compatibility and deprecation", summary: "Follow the public API, versioning and deprecation policy.", tags: ["SemVer", "compatibility", "API"] },
  { id: "roadmap", group: "Project", title: "Limitations and roadmap", summary: "See what is stable, experimental or intentionally outside the current framework scope.", tags: ["roadmap", "status", "limitations"] },
  { id: "project-lifecycle", group: "Guides", title: "From zero to the first feature", summary: "Create a project, validate the environment and deliver one complete route without editing managed runtime files.", tags: ["tutorial", "CLI", "feature"] },
  { id: "project-organization", group: "Guides", title: "Organization and SOLID", summary: "Keep routes, domain rules, use cases and infrastructure predictable as the product grows.", tags: ["SOLID", "architecture", "folders"] },
  { id: "crud-guide", group: "Guides", title: "Database integration and complete CRUD", summary: "Connect EF Core, choose SQLite, PostgreSQL or SQL Server, and deliver a persisted CRUD through Server Actions.", tags: ["database", "EF Core", "CRUD"] },
  { id: "testing-workflow", group: "Guides", title: "Testing and quality", summary: "Use fast feature checks and a complete release gate before integration.", tags: ["testing", "CI", "contracts"] },
  { id: "templates-starter", group: "Guides", title: "Templates and runtime updates", summary: "Choose a scaffold and keep npm, NuGet and TypeGen on the same framework version.", tags: ["starter", "minimal", "upgrade"] },
  { id: "security-model", group: "Security", title: "Security model", summary: "Understand assets, trust boundaries and DotReact's secure-by-default behavior.", tags: ["threat model", "defense in depth", "ASP.NET"] },
  { id: "security-pages-actions", group: "Security", title: "Pages, actions and authorization", summary: "Protect reads and writes with policies, resource authorization, antiforgery and server-side validation.", tags: ["authorization", "CSRF", "policies"] },
  { id: "security-rendering", group: "Security", title: "SSR, XSS, scripts and secrets", summary: "Prevent props, metadata, remote dependencies or the renderer from becoming execution and disclosure channels.", tags: ["XSS", "CSP", "SRI"] },
  { id: "security-sessions", group: "Security", title: "Cookie sessions", summary: "Create, renew and revoke sessions without exposing identifiers to JavaScript.", tags: ["sessions", "cookies", "logout"] },
  { id: "security-identity-social", group: "Security", title: "Identity and social login", summary: "Integrate local accounts, Google, Microsoft or another provider without moving OAuth into React.", tags: ["Identity", "OAuth", "OpenID Connect"] },
  { id: "security-tokens", group: "Security", title: "Tokens and APIs", summary: "Choose cookies for browsers and bearer tokens only for clients and APIs that actually need them.", tags: ["bearer", "JWT", "API"] },
  { id: "security-data-cache", group: "Security", title: "Data, cache and isolation", summary: "Prevent data leakage across callers, tenants, builds and replicas.", tags: ["cache", "tenant", "Data Protection"] },
  { id: "security-production-checklist", group: "Security", title: "Production security checklist", summary: "Review application, infrastructure, supply chain and incident response before accepting traffic.", tags: ["production", "hardening", "checklist"] },
  { id: "hosting-overview", group: "Hosting and deployment", title: "Where to host", summary: "Compare deployment targets and understand the single-container production topology.", tags: ["hosting", "Docker", "Azure"] },
  { id: "production-readiness", group: "Hosting and deployment", title: "Prepare for production", summary: "Turn a local project into a reproducible release before choosing a platform.", tags: ["production", "configuration", "release"] },
  { id: "deploy-docker", group: "Hosting and deployment", title: "Deploy with Docker", summary: "Build, run and validate the OCI image produced by the starter.", tags: ["Docker", "container", "OCI"] },
  { id: "deploy-azure-app-service", group: "Hosting and deployment", title: "Azure App Service", summary: "Deploy the container with managed identity, health checks and a staging-slot strategy.", tags: ["Azure", "App Service", "Bicep"] },
  { id: "deploy-azure-container-apps", group: "Hosting and deployment", title: "Azure Container Apps", summary: "Use revisions, probes and progressive traffic without exposing the renderer.", tags: ["Azure", "Container Apps", "canary"] },
  { id: "domains-reverse-proxy", group: "Hosting and deployment", title: "Domains, HTTPS and reverse proxies", summary: "Publish the correct origin without breaking CSS, scripts, refresh or security.", tags: ["domain", "HTTPS", "proxy"] },
  { id: "deployment-pipeline", group: "Hosting and deployment", title: "CI/CD and releases", summary: "Turn local gates into an auditable, reproducible promotion pipeline.", tags: ["CI/CD", "GitHub Actions", "supply chain"] },
  { id: "deployment-operations", group: "Hosting and deployment", title: "Operate, observe and roll back", summary: "Define health signals, smoke tests, alerts and an executable rollback.", tags: ["operations", "observability", "rollback"] }
];

function englishCode(code: string): string {
  const replacements: readonly (readonly [string, string])[] = [
    ["# 1. Valide o projeto antes de empacotar", "# 1. Validate the project before packaging"],
    ["# 2. Gere uma imagem imutável", "# 2. Build an immutable image"],
    ["# 3. Teste a imagem pelo mesmo endpoint usado em produção", "# 3. Test the image through the same endpoint used in production"],
    ["# Escolha o provider usado pelo ambiente", "# Choose the provider used by this environment"],
    ["# Base do tutorial e migrations", "# Tutorial baseline and migrations"],
    ["# Para testar a troca de provider, instale também os adapters de produção", "# To test provider switching, also install the production adapters"],
    ["# Produção: instale um destes no lugar do provider SQLite", "# Production: install one of these instead of the SQLite provider"],
    ["# produção: a plataforma fornece como secret", "# production: the platform supplies this as a secret"],
    ["# execute a aplicação e confirme SSR + persistência", "# run the application and verify SSR plus persistence"],
    ["# crie um item, atualize a página e confirme que ele continua no banco", "# create an item, refresh the page, and verify that it remains in the database"],
    ["# fornecer pelo secret store, nunca pelo Git", "# provide through the secret store, never through Git"],
    ["# não deve encontrar origem privada no HTML", "# must not find a private origin in the HTML"],
    ["# depois do deploy", "# after deployment"],
    ["Credenciais inválidas.", "Invalid credentials."],
    ["C:/caminho/dotreact", "C:/path/to/dotreact"],
    ["# descobre as rotas no manifest C#", "# discover routes from the C# manifest"],
    ["# --routes continua disponível como override explícito", "# --routes remains available as an explicit override"],
    ["# repita --assembly para cada DLL adicional", "# repeat --assembly for every additional DLL"],
    ["// Executa somente após autenticação + policy.", "// Runs only after authentication and policy evaluation."],
    ["// CanPublish veio da decisão feita no C#; não substitui a policy da action.", "// CanPublish came from the C# decision; it does not replace the action policy."],
    ["// O runtime valida auth + antiforgery antes de ExecuteAsync.", "// The runtime validates auth and antiforgery before ExecuteAsync."],
    ["// ExecuteAsync roda somente depois da autorização do recurso.", "// ExecuteAsync runs only after resource authorization."],
    ["// AddDotReactApplication usa public/ por convenção.", "// AddDotReactApplication uses public/ by convention."],
    ["// Configure apenas origens remotas adicionais quando necessário.", "// Configure additional remote origins only when required."],
    ["Produto 42", "Product 42"],
    ["Catálogo carregado pelo C#", "Catalog loaded by C#"],
    ["Não encontrado", "Not found"],
    [" · Loja", " · Store"],
    ["Produto ${props.id}", "Product ${props.id}"],
    ["\"name\": \"Produto\"", "\"name\": \"Product\""],
    ["único processo público", "only public process"],
    ["token efêmero", "ephemeral token"],
    ["privado, sem banco ou secrets", "private, without database access or secrets"],
    ["assets relativos em", "relative assets at"],
    ["// somente proxies confiáveis", "// trusted proxies only"],
    ["// webhooks, uploads e APIs", "// webhooks, uploads, and APIs"],
    ["Carregando catálogo…", "Loading catalog…"],
    ["alt=\"Produto\"", "alt=\"Product\""],
    ["<commit-ou-revisao>", "<commit-or-revision>"],
    ["<endpoint-do-coletor>", "<collector-endpoint>"]
  ];
  return replacements.reduce((result, [source, replacement]) => result.replaceAll(source, replacement), code);
}

function localizeNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return translateText(node);
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === CodeBlock) {
    const props = element.props as { readonly code: string; readonly label: string };
    return <CodeBlock code={englishCode(props.code)} label={translateText(props.label).trim()} />;
  }
  if (element.type === PairedCode) {
    const props = element.props as {
      readonly csharp: string;
      readonly react: string;
      readonly csharpLabel: string;
      readonly reactLabel: string;
    };
    return <PairedCode {...props} csharp={englishCode(props.csharp)} react={englishCode(props.react)} csharpLabel={translateText(props.csharpLabel).trim()} reactLabel={translateText(props.reactLabel).trim()} />;
  }
  if (element.type === ReferenceTable) {
    const props = element.props as { readonly rows: readonly ReferenceRow[]; readonly valueHeading?: string };
    return <ReferenceTable
      valueHeading={props.valueHeading ? translateText(props.valueHeading).trim() : undefined}
      rows={props.rows.map(row => ({
        name: translateText(row.name).trim(),
        defaultValue: row.defaultValue ? translateText(row.defaultValue).trim() : undefined,
        description: translateText(row.description).trim()
      }))}
    />;
  }

  if (element.type === "code") return element;
  const props = element.props;
  const localizedProps: Record<string, unknown> = {};
  if (Object.hasOwn(props, "children"))
    localizedProps.children = Children.map(props.children as ReactNode, localizeNode);
  if (typeof props.title === "string") localizedProps.title = translateText(props.title).trim();
  if (typeof props["aria-label"] === "string") localizedProps["aria-label"] = translateText(props["aria-label"]).trim();
  return cloneElement(element, localizedProps);
}

function translateText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return value;
  const translated = englishText[normalized];
  if (!translated) throw new Error(`Missing English translation: ${normalized}`);
  const leading = value.match(/^\s*/u)?.[0] ?? "";
  const trailing = value.match(/\s*$/u)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export const docsEn: readonly DocPage[] = pages.map(page => {
  const portuguesePage = docsPt.find(candidate => candidate.id === page.id);
  if (!portuguesePage) throw new Error(`Missing Portuguese source page: ${page.id}`);
  return { ...page, body: localizeNode(portuguesePage.body) };
});
