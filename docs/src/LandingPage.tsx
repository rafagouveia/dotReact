import type { Locale } from "./i18n";
import type { ThemePreference } from "./App";
import { SyntaxCode } from "./SyntaxCode";
import { dotReactLogoSource } from "./assets";

const copy = {
  pt: {
    nav: ["Propósito", "Arquitetura", "Recursos"], open: "Documentação", language: "Idioma", appearance: "Aparência",
    preview: "Framework full-stack em preview",
    hero: "React na interface.", heroAccent: ".NET como autoridade.",
    lead: "DotReact combina a experiência de desenvolvimento do React com um backend ASP.NET Core explícito, seguro e tipado — sem Blazor e sem transformar Node.js em um segundo backend.",
    start: "Criar primeiro projeto", explore: "Explorar documentação",
    codeStatus: "Contrato gerado · SSR concluído · hidratação pronta",
    purposeEyebrow: "Por que o DotReact existe",
    purposeTitle: "Uma arquitetura para equipes que não querem escolher entre React e .NET.",
    purposeText: "O framework define responsabilidades claras. C# concentra regras de negócio, segurança e dados; React concentra composição visual e interação no navegador.", purposeLink: "Ver onde aplicar",
    values: [
      ["Backend soberano", "ASP.NET Core controla HTTP, autenticação, autorização, injeção de dependência, domínio e persistência."],
      ["React sem adaptações", "Componentes, hooks, Suspense, hidratação e Fast Refresh com a experiência nativa do ecossistema."],
      ["Fronteira tipada", "DTOs C# geram contratos TypeScript. Divergências falham durante o build, antes de chegarem à produção."],
      ["Operação real", "Streaming SSR, cache distribuído, CSP, OpenTelemetry, containers e integração com Azure."]
    ],
    archEyebrow: "Arquitetura explícita", archTitle: "Uma fronteira pequena, versionada e observável.",
    archText: "O renderer Node é um processo privado e substituível. Ele recebe um identificador de módulo, URL e props serializáveis; não acessa banco, segredos ou serviços de domínio.", archLink: "Ler arquitetura e protocolo",
    nodes: [["ASP.NET Core", "Entrada pública", "HTTP · auth · domínio"], ["Contrato JSON", "Fronteira versionada", "props · trace · protocol"], ["React renderer", "Processo privado", "SSR · Suspense · stream"]],
    browser: "O navegador recebe HTML pronto, o bundle React e as mesmas props para hidratação.",
    capEyebrow: "Recursos do framework", capTitle: "Do primeiro request à produção.", compare: "Comparar com Next.js",
    capabilities: [
      ["Pages e layouts", "Roteamento por arquivo, layouts aninhados, metadata e boundaries."],
      ["Streaming SSR", "Suspense, backpressure, cancelamento e CSP nonce."],
      ["Navegação parcial", "Link, prefetch, History API, loading e revalidação."],
      ["Server Actions C#", "Autorização, antiforgery, idempotência e contratos gerados."],
      ["SSG e ISR", "Rotas estáticas tipadas, stale-while-revalidate e Redis."],
      ["Observabilidade", "Tracing distribuído, métricas, health checks e budgets."]
    ],
    finalTitle: "Construa interfaces React sem mover seu backend para JavaScript.",
    finalText: "Comece pelo tutorial guiado e siga até uma publicação segura em Docker ou Azure.", now: "Começar agora", deploy: "Hospedagem e deploy", footerDocs: "Documentação", compatibility: "Compatibilidade"
  },
  en: {
    nav: ["Purpose", "Architecture", "Features"], open: "Documentation", language: "Language", appearance: "Appearance",
    preview: "Full-stack framework preview",
    hero: "React at the interface.", heroAccent: ".NET as the authority.",
    lead: "DotReact combines the React developer experience with an explicit, secure and typed ASP.NET Core backend—without Blazor and without turning Node.js into a second backend.",
    start: "Create your first project", explore: "Explore documentation",
    codeStatus: "Contract generated · SSR complete · hydration ready",
    purposeEyebrow: "Why DotReact exists",
    purposeTitle: "An architecture for teams that should not have to choose between React and .NET.",
    purposeText: "The framework defines clear responsibilities. C# owns business rules, security and data; React owns visual composition and browser interaction.", purposeLink: "See where it fits",
    values: [
      ["Sovereign backend", "ASP.NET Core controls HTTP, authentication, authorization, dependency injection, domain and persistence."],
      ["Native React", "Components, hooks, Suspense, hydration and Fast Refresh with the native ecosystem experience."],
      ["Typed boundary", "C# DTOs generate TypeScript contracts. Drift fails during the build, before reaching production."],
      ["Production operation", "Streaming SSR, distributed cache, CSP, OpenTelemetry, containers and Azure integration."]
    ],
    archEyebrow: "Explicit architecture", archTitle: "A small, versioned and observable boundary.",
    archText: "The Node renderer is a private, replaceable process. It receives a module identifier, URL and serializable props; it never accesses databases, secrets or domain services.", archLink: "Read architecture and protocol",
    nodes: [["ASP.NET Core", "Public edge", "HTTP · auth · domain"], ["JSON contract", "Versioned boundary", "props · trace · protocol"], ["React renderer", "Private process", "SSR · Suspense · stream"]],
    browser: "The browser receives ready HTML, the React bundle and the same props for hydration.",
    capEyebrow: "Framework capabilities", capTitle: "From the first request to production.", compare: "Compare with Next.js",
    capabilities: [
      ["Pages and layouts", "File routing, nested layouts, metadata and boundaries."],
      ["Streaming SSR", "Suspense, backpressure, cancellation and CSP nonces."],
      ["Partial navigation", "Links, prefetch, History API, loading and revalidation."],
      ["C# Server Actions", "Authorization, antiforgery, idempotency and generated contracts."],
      ["SSG and ISR", "Typed static routes, stale-while-revalidate and Redis."],
      ["Observability", "Distributed tracing, metrics, health checks and budgets."]
    ],
    finalTitle: "Build React interfaces without moving your backend to JavaScript.",
    finalText: "Start with the guided tutorial and continue through a secure Docker or Azure deployment.", now: "Get started", deploy: "Hosting and deployment", footerDocs: "Documentation", compatibility: "Compatibility"
  }
} as const;

const architectureIcons = ["C#", "{}", "⚛"] as const;

export function LandingPage({ locale, theme, onLocaleChange, onThemeChange }: {
  readonly locale: Locale;
  readonly theme: ThemePreference;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly onThemeChange: (theme: ThemePreference) => void;
}) {
  const t = copy[locale];
  return <div className="min-h-screen bg-[var(--dr-canvas)] text-slate-950 selection:bg-blue-100 selection:text-blue-950 dark:text-white">
    <header className="relative z-10 border-b border-[var(--dr-border)] bg-[var(--dr-canvas)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8">
        <a href="#home" className="flex items-center gap-2 no-underline">
          <img className="size-9 object-contain" src={dotReactLogoSource} alt="" width="36" height="36" />
          <b className="text-[16px] font-semibold tracking-[-.025em]">DotReact</b>
        </a>
        <nav className="ml-12 hidden items-center gap-7 text-[11px] font-medium text-slate-500 md:flex dark:text-slate-400">
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#purpose">{t.nav[0]}</a>
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#architecture">{t.nav[1]}</a>
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#capabilities">{t.nav[2]}</a>
        </nav>
        <div className="flex-1" />
        <div className="mr-2 flex h-8 items-center rounded-md border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label={t.language}>
          {(["pt", "en"] as const).map(option => <button key={option} onClick={() => onLocaleChange(option)} aria-pressed={locale === option} className={`h-6 rounded px-2 text-[10px] font-semibold uppercase ${locale === option ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950" : "text-slate-400"}`}>{option}</button>)}
        </div>
        <button type="button" title={t.appearance} aria-label={t.appearance} onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")} className="mr-3 grid size-8 place-items-center rounded-md border border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">{theme === "dark" ? "☼" : "☾"}</button>
        <a href="#overview" className="hidden rounded-md bg-slate-950 px-4 py-2.5 text-[10px] font-semibold text-white no-underline sm:block dark:bg-white dark:text-slate-950">{t.open}</a>
      </div>
    </header>

    <main>
      <section className="relative isolate overflow-hidden border-b border-[var(--dr-border)] bg-[var(--dr-surface)]">
        <div className="mx-auto grid min-h-[650px] max-w-7xl items-center gap-16 px-5 py-20 lg:grid-cols-[1fr_.92fr] lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-3 py-1.5 text-[9px] font-medium text-slate-700 dark:text-slate-300"><span className="size-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />{t.preview}</div>
            <h1 className="mt-7 max-w-3xl text-[clamp(3rem,7vw,5.5rem)] leading-[.96] font-semibold tracking-[-.07em]"><span>{t.hero}</span><br /><span className="text-blue-700 dark:text-blue-400">{t.heroAccent}</span></h1>
            <p className="mt-7 max-w-2xl text-[16px] leading-8 text-slate-600 dark:text-slate-400">{t.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#first-project" className="rounded-md bg-blue-700 px-5 py-3.5 text-center text-[11px] font-semibold text-white no-underline hover:bg-blue-800">{t.start} →</a>
              <a href="#overview" className="rounded-md border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-5 py-3.5 text-center text-[11px] font-semibold text-slate-800 no-underline hover:border-blue-500 dark:text-slate-200">{t.explore}</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] text-slate-400"><span>React 19.2</span><span>ASP.NET Core 10</span><span>Type-safe</span><span>Azure-ready</span></div>
          </div>

          <div className="overflow-hidden rounded-xl border border-blue-900/60 bg-[#07101f] shadow-[0_28px_80px_rgba(30,64,175,.20)]">
            <div className="flex h-10 items-center border-b border-slate-700 px-4"><span className="font-mono text-[8px] text-slate-500">product/page · DotReact</span></div>
            <div className="grid sm:grid-cols-2">
              <CodePanel label="C# · loader" server code={'[DotReactPage("products/[id]/page")]\npublic sealed class ProductPage\n  : IDotReactPage<ProductProps>\n{\n  public async ValueTask<...>\n  LoadAsync(...) {\n    // DB, auth, domain\n    return new(product);\n  }\n}'} />
              <CodePanel label="React · page.drx" code={'export default function\nProductPage(Model) {\n  return (\n    <main>\n      <h1>{Model.name}</h1>\n      <button>Buy</button>\n    </main>\n  );\n}'} />
            </div>
            <div className="border-t border-slate-700 px-5 py-3 font-mono text-[8px] text-slate-500">● &nbsp;{t.codeStatus}</div>
          </div>
        </div>
      </section>

      <section id="purpose" className="bg-[var(--dr-canvas)] py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl"><Eyebrow>{t.purposeEyebrow}</Eyebrow><h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{t.purposeTitle}</h2><p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-400">{t.purposeText}</p><a href="#purpose-applications" className="mt-6 inline-flex text-[11px] font-semibold text-blue-700 no-underline dark:text-blue-400">{t.purposeLink} →</a></div>
          <div className="mt-12 grid border-t-2 border-l border-[var(--dr-border)] border-t-blue-700 md:grid-cols-2 lg:grid-cols-4 dark:border-t-blue-400">
            {t.values.map(([title, description], index) => <article key={title} className="min-h-52 border-r border-b border-[var(--dr-border)] bg-[var(--dr-surface)] p-6"><span className="font-mono text-[9px] text-blue-700 dark:text-blue-400">0{index + 1}</span><h3 className="mt-8 text-sm font-semibold">{title}</h3><p className="mt-3 text-[11px] leading-6 text-slate-600 dark:text-slate-400">{description}</p></article>)}
          </div>
        </div>
      </section>

      <section id="architecture" className="border-y border-[var(--dr-border)] bg-[var(--dr-surface)] py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr]">
          <div><Eyebrow>{t.archEyebrow}</Eyebrow><h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{t.archTitle}</h2><p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-400">{t.archText}</p><a href="#architecture-protocol" className="mt-7 inline-flex text-[11px] font-semibold text-blue-700 no-underline dark:text-blue-400">{t.archLink} →</a></div>
          <div className="rounded-xl border border-[var(--dr-border)] bg-[var(--dr-canvas)] p-5 sm:p-7">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">{t.nodes.map(([title, subtitle, detail], index) => {
              return <div key={title} className="contents"><article className="min-h-48 rounded-lg border border-[var(--dr-border)] bg-[var(--dr-surface)] p-5"><div className="flex items-center justify-between"><span className="grid size-8 place-items-center rounded-md bg-blue-700 font-mono text-[10px] font-bold text-white dark:bg-blue-500">{architectureIcons[index]}</span><span className="font-mono text-[9px] font-semibold text-blue-700 dark:text-blue-300">0{index + 1}</span></div><b className="mt-7 block text-[13px] font-semibold tracking-[-.01em]">{title}</b><small className="mt-1.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">{subtitle}</small><p className="mt-6 font-mono text-[8px] text-blue-800/65 dark:text-blue-300/70">{detail}</p></article>{index < 2 && <span className="hidden text-blue-700 sm:block dark:text-blue-400">→</span>}</div>;
            })}</div>
            <p className="mt-4 flex items-center justify-center gap-2 rounded-md border border-[var(--dr-border)] bg-[var(--dr-surface)] px-4 py-3.5 text-center text-[10px] font-medium text-slate-800 dark:text-slate-300"><span className="grid size-5 place-items-center rounded bg-blue-700 text-[10px] text-white dark:bg-blue-500">◎</span>{t.browser}</p>
          </div>
        </div>
      </section>

      <section id="capabilities" className="bg-slate-950 py-24 text-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div className="max-w-2xl"><Eyebrow dark>{t.capEyebrow}</Eyebrow><h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{t.capTitle}</h2></div><a href="#next-equivalents" className="text-[11px] font-semibold text-blue-400 no-underline">{t.compare} →</a></div>
          <div className="mt-12 grid border-t border-l border-slate-800 sm:grid-cols-2 lg:grid-cols-3">{t.capabilities.map(([title, description], index) => <article key={title} className="border-r border-b border-slate-800 p-7"><span className="font-mono text-[9px] text-blue-400">0{index + 1}</span><h3 className="mt-7 text-sm font-semibold">{title}</h3><p className="mt-3 text-[10px] leading-6 text-slate-400">{description}</p></article>)}</div>
        </div>
      </section>

      <section className="border-b border-[var(--dr-border)] bg-[var(--dr-surface)]"><div className="mx-auto max-w-4xl px-5 py-28 text-center sm:px-8"><img className="mx-auto size-16 object-contain" src={dotReactLogoSource} alt="" width="64" height="64" /><h2 className="mt-8 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{t.finalTitle}</h2><p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-400">{t.finalText}</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><a href="#first-project" className="rounded-md bg-blue-700 px-6 py-3.5 text-[11px] font-semibold text-white no-underline">{t.now} →</a><a href="#hosting-overview" className="rounded-md border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-6 py-3.5 text-[11px] font-semibold no-underline">{t.deploy} →</a></div></div></section>
    </main>

    <footer className="border-t border-slate-200 py-8 dark:border-slate-800"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 text-[9px] text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>DotReact 0.1 · ASP.NET Core × React</span><div className="flex gap-5"><a href="#overview" className="no-underline hover:text-blue-600">{t.footerDocs}</a><a href="#hosting-overview" className="no-underline hover:text-blue-600">{t.deploy}</a><a href="#roadmap" className="no-underline hover:text-blue-600">Roadmap</a><a href="#compatibility" className="no-underline hover:text-blue-600">{t.compatibility}</a></div></div></footer>
  </div>;
}

function Eyebrow({ children, dark = false }: { readonly children: string; readonly dark?: boolean }) {
  return <span className={`text-[10px] font-semibold tracking-wider uppercase ${dark ? "text-blue-400" : "text-blue-700 dark:text-blue-400"}`}>{children}</span>;
}

function CodePanel({ label, code, server = false }: { readonly label: string; readonly code: string; readonly server?: boolean }) {
  return <div className={`p-5 ${server ? "border-b border-slate-700 sm:border-r sm:border-b-0" : ""}`}><div className="mb-4 font-mono text-[8px] text-blue-400">{label}</div><SyntaxCode code={code} label={label} compact /></div>;
}
