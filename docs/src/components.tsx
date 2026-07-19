import { useState, type ReactNode } from "react";
import type { ReferenceRow } from "./types";

export function CodeBlock({ code, label }: { readonly code: string; readonly label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="code-card">
      <div className="code-head">
        <span>{label}</span>
        <button onClick={() => void copy()}>{copied ? "Copiado" : "Copiar"}</button>
      </div>
      <pre><code>{code}</code></pre>
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
  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Linguagem do exemplo">
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
  const steps = ["ASP.NET edge", "Loader C#", "JSON tipado", "React SSR", "HTML + hydration"];
  const descriptions = [
    "Recebe HTTP, executa autenticação e seleciona o endpoint ASP.NET.",
    "Resolve dependências e carrega as props no backend C#.",
    "System.Text.Json transporta somente o contrato serializável pelo protocolo v1.",
    "O renderer Node privado importa o módulo React e produz o markup.",
    "ASP.NET monta o documento, inclui as mesmas props e o browser executa hydrateRoot."
  ];
  return (
    <div className="flow" aria-label="Fluxo de renderização">
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
        <span>{valid ? "Rota inferida" : "Module ID inválido"}</span>
        <strong>{valid ? route : "Use segmentos canônicos terminando em /page"}</strong>
      </div>
    </div>
  );
}

export function CliLab() {
  const [template, setTemplate] = useState("starter");
  const [name, setName] = useState("minha-app");
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]/g, "-") || "minha-app";
  return (
    <div className="lab grid-lab">
      <label>Template
        <select value={template} onChange={event => setTemplate(event.target.value)}>
          <option value="starter">Starter completo</option>
          <option value="minimal">Minimal</option>
        </select>
      </label>
      <label>Projeto
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
  return (
    <div className="reference-table-wrap">
      <table className="reference-table">
        <thead><tr><th>Nome</th><th>{valueHeading}</th><th>Uso</th></tr></thead>
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
