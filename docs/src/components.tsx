import { useState, type ReactNode } from "react";
import { useLocale } from "./i18n";
import { SyntaxCode } from "./SyntaxCode";
import type { ReferenceRow } from "./types";

export function CodeBlock({ code, label }: { readonly code: string; readonly label: string }) {
  const [copied, setCopied] = useState(false);
  const locale = useLocale();

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="code-card">
      <div className="code-head">
        <span>{label}</span>
        <button onClick={() => void copy()}>{copied ? (locale === "pt" ? "Copiado" : "Copied") : (locale === "pt" ? "Copiar" : "Copy")}</button>
      </div>
      <SyntaxCode code={code} label={label} />
    </div>
  );
}

export function PairedCode({
  csharp,
  react,
  csharpLabel,
  reactLabel
}: {
  readonly csharp: string;
  readonly react: string;
  readonly csharpLabel: string;
  readonly reactLabel: string;
}) {
  const [tab, setTab] = useState<"csharp" | "react">("csharp");
  const locale = useLocale();
  return (
    <div>
      <div className="tabs" role="tablist" aria-label={locale === "pt" ? "Linguagem do exemplo" : "Example language"}>
        <button role="tab" aria-selected={tab === "csharp"} onClick={() => setTab("csharp")}>C#</button>
        <button role="tab" aria-selected={tab === "react"} onClick={() => setTab("react")}>React</button>
      </div>
      <CodeBlock
        label={tab === "csharp" ? csharpLabel : reactLabel}
        code={tab === "csharp" ? csharp : react}
      />
    </div>
  );
}

export function Flow() {
  const [active, setActive] = useState(0);
  const locale = useLocale();
  const steps = locale === "pt" ? ["ASP.NET edge", "Loader C#", "JSON tipado", "React SSR", "HTML + hidratação"] : ["ASP.NET edge", "C# loader", "Typed JSON", "React SSR", "HTML + hydration"];
  const descriptions = locale === "pt" ? [
    "Recebe HTTP, executa autenticação e seleciona o endpoint ASP.NET.", "Resolve dependências e carrega as props no backend C#.",
    "System.Text.Json transporta somente o contrato serializável pelo protocolo v1.", "O renderer Node privado importa o módulo React e produz o markup.",
    "ASP.NET monta o documento, inclui as mesmas props e o browser executa hydrateRoot."
  ] : [
    "Receives HTTP, authenticates the caller and selects the ASP.NET endpoint.", "Resolves dependencies and loads props in the C# backend.",
    "System.Text.Json transports only the serializable v1 protocol contract.", "The private Node renderer imports the React module and produces markup.",
    "ASP.NET assembles the document, includes the same props and the browser runs hydrateRoot."
  ];
  return (
    <div className="flow" aria-label={locale === "pt" ? "Fluxo de renderização" : "Rendering flow"}>
      {steps.map((step, index) => (
        <button key={step} className={active === index ? "active" : ""} onClick={() => setActive(index)}>
          <small>0{index + 1}</small>{step}
        </button>
      ))}
      <p>{descriptions[active]}</p>
    </div>
  );
}

export function RouteLab() {
  const locale = useLocale();
  const [moduleId, setModuleId] = useState("catalog/[slug]/page");
  const segments = moduleId.trim().split("/");
  const valid = /^(?:(?:[A-Za-z0-9][A-Za-z0-9._-]*|\([A-Za-z_][A-Za-z0-9_]*\)|\[[A-Za-z_][A-Za-z0-9_]*\]|\[\.\.\.[A-Za-z_][A-Za-z0-9_]*\])\/)*page$/.test(moduleId);
  const routeSegments = segments.slice(0, -1)
    .filter(segment => !(segment.startsWith("(") && segment.endsWith(")")))
    .map(segment => segment.startsWith("[...")
      ? `{**${segment.slice(4, -1)}}`
      : segment.startsWith("[") ? `{${segment.slice(1, -1)}}` : segment);
  const route = routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
  return (
    <div className="lab">
      <label htmlFor="module-id">Module ID</label>
      <input id="module-id" value={moduleId} onChange={event => setModuleId(event.target.value)} />
      <div className={valid ? "result ok" : "result bad"}>
        <span>{valid ? (locale === "pt" ? "Rota inferida" : "Inferred route") : (locale === "pt" ? "Module ID inválido" : "Invalid module ID")}</span>
        <strong>{valid ? route : (locale === "pt" ? "Use segmentos canônicos terminando em /page" : "Use canonical segments ending in /page")}</strong>
      </div>
    </div>
  );
}

export function CliLab() {
  const locale = useLocale();
  const [template, setTemplate] = useState("starter");
  const [name, setName] = useState(locale === "pt" ? "minha-app" : "my-app");
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]/g, "-") || (locale === "pt" ? "minha-app" : "my-app");
  return (
    <div className="lab grid-lab">
      <label>Template
        <select value={template} onChange={event => setTemplate(event.target.value)}>
          <option value="starter">{locale === "pt" ? "Starter completo" : "Complete starter"}</option>
          <option value="minimal">Minimal</option>
        </select>
      </label>
      <label>{locale === "pt" ? "Projeto" : "Project"}
        <input value={name} onChange={event => setName(event.target.value)} />
      </label>
      <CodeBlock label="Terminal" code={`npm run create -- create ${safeName} --template ${template}\ncd ${safeName}\nnpm install\ndotreact doctor\ndotreact dev`} />
    </div>
  );
}

export function ReferenceTable({ rows, valueHeading = "Padrão" }: {
  readonly rows: readonly ReferenceRow[];
  readonly valueHeading?: string;
}) {
  const locale = useLocale();
  return (
    <div className="reference-table-wrap">
      <table className="reference-table">
        <thead><tr><th>{locale === "pt" ? "Nome" : "Name"}</th><th>{valueHeading === "Padrão" && locale !== "pt" ? "Default" : valueHeading}</th><th>{locale === "pt" ? "Uso" : "Usage"}</th></tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.name}>
            <td><code>{row.name}</code></td>
            <td>{row.defaultValue ?? "—"}</td>
            <td>{row.description}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Steps({ children }: { readonly children: ReactNode }) {
  return <ol className="steps">{children}</ol>;
}

export function Step({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <li><strong>{title}</strong><div>{children}</div></li>;
}
