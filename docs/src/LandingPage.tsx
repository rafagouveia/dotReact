import type { Locale } from "./i18n";
import type { ThemePreference } from "./App";
import { SyntaxCode } from "./SyntaxCode";
import { dotReactLogoSource } from "./assets";
import benchmarkSnapshot from "../../benchmarks/published/latest.json";

const copy = {
  pt: {
    nav: ["Propósito", "Arquitetura", "Benchmarks", "Recursos"], open: "Documentação", language: "Idioma", appearance: "Aparência",
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
    nodes: [["ASP.NET Core", "Entrada pública", "HTTP · auth · domínio"], ["Contrato tipado", "Fronteira versionada", "UTF-8 · trace · protocol"], ["React renderer", "Processo privado", "SSR · Suspense · stream"]],
    browser: "O navegador recebe HTML pronto, o bundle React e as mesmas props para hidratação.",
    benchEyebrow: "Desempenho sem marketing", benchTitle: "Resultados publicados com metodologia aberta.",
    benchText: "Comparamos o mesmo conteúdo, em builds de produção, e mostramos vitórias, derrotas, dispersão e limitações. Não existe um vencedor universal.",
    benchLocal: "Referência local — ainda não é resultado de CI isolado", benchVerified: "Resultado verificado em ambiente dedicado",
    scenarioServer: "SSR dinâmico · server-only", scenarioInteractive: "SSR dinâmico · interativo",
    implementation: "Implementação", throughput: "req/s mediana", latency: "p95 / p99", payload: "bytes/resposta", failures: "falhas",
    higher: "maior é melhor", lower: "menor é melhor", method: "Metodologia completa", raw: "Dados brutos",
    throughputLabel: "Throughput mediano", averageLatencyLabel: "Latência avg", latencyLabel: "Latência p95", payloadLabel: "Documento HTML", comparisonLabel: "Comparativo relativo",
    resourceTitle: "Eficiência de execução", cpuPerRequest: "CPU / 1.000 respostas", peakMemory: "Pico de memória", resourceNote: "Medido no Linux com uma única árvore de servidor ativa; cada cenário começa em um processo novo.",
    razorParity: "Comparação com Razor", blazorGap: "Distância do líder server-only", nextLead: "Vantagem no cenário interativo",
    versusRazor: "vs. Razor Pages", versusBlazor: "vs. Blazor SSR", versusNext: "vs. Next.js", allSuccessful: "0 falhas em todas as execuções",
    winTitle: "Onde foi melhor", winText: "Neste ensaio local, o SSR interativo do DotReact entregou mais respostas HTTP e um documento menor que o Next.js interativo.",
    lossTitle: "Onde precisa melhorar", lossText: "No SSR server-only, o painel mostra a distância atual para Razor e Blazor sem suavizar o resultado. Como o ensaio é local, nenhuma diferença vira alegação pública definitiva.",
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
    nav: ["Purpose", "Architecture", "Benchmarks", "Features"], open: "Documentation", language: "Language", appearance: "Appearance",
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
    nodes: [["ASP.NET Core", "Public edge", "HTTP · auth · domain"], ["Typed contract", "Versioned boundary", "UTF-8 · trace · protocol"], ["React renderer", "Private process", "SSR · Suspense · stream"]],
    browser: "The browser receives ready HTML, the React bundle and the same props for hydration.",
    benchEyebrow: "Performance without marketing", benchTitle: "Published results with an open methodology.",
    benchText: "We compare the same content in production builds and disclose wins, losses, dispersion and limitations. There is no universal winner.",
    benchLocal: "Local reference — not yet an isolated CI result", benchVerified: "Result verified on dedicated infrastructure",
    scenarioServer: "Dynamic SSR · server-only", scenarioInteractive: "Dynamic SSR · interactive",
    implementation: "Implementation", throughput: "median req/s", latency: "p95 / p99", payload: "bytes/response", failures: "failures",
    higher: "higher is better", lower: "lower is better", method: "Full methodology", raw: "Raw data",
    throughputLabel: "Median throughput", averageLatencyLabel: "Average latency", latencyLabel: "p95 latency", payloadLabel: "HTML document", comparisonLabel: "Relative comparison",
    resourceTitle: "Execution efficiency", cpuPerRequest: "CPU / 1,000 responses", peakMemory: "Peak memory", resourceNote: "Measured on Linux with one live server tree; every scenario starts in a fresh process.",
    razorParity: "Razor comparison", blazorGap: "Distance from server-only leader", nextLead: "Interactive scenario lead",
    versusRazor: "vs. Razor Pages", versusBlazor: "vs. Blazor SSR", versusNext: "vs. Next.js", allSuccessful: "0 failures across every run",
    winTitle: "Where it performed better", winText: "In this local run, DotReact interactive SSR served more HTTP responses and a smaller document than interactive Next.js.",
    lossTitle: "Where it needs work", lossText: "For server-only SSR, the panel shows the current distance from Razor and Blazor without softening the result. Because this is a local run, no delta becomes a definitive public claim.",
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
    <header className="sticky top-0 z-20 border-b border-[var(--dr-border)] bg-[var(--dr-canvas)]/95 shadow-[0_1px_12px_rgba(15,23,42,.035)] backdrop-blur-lg dark:shadow-none">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8">
        <a href="#home" className="flex items-center gap-2 no-underline">
          <img className="size-9 object-contain" src={dotReactLogoSource} alt="" width="36" height="36" />
          <b className="text-[16px] font-semibold tracking-[-.025em]">DotReact</b>
        </a>
        <nav className="ml-12 hidden items-center gap-8 text-[13px] font-medium text-slate-500 md:flex dark:text-slate-400">
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#purpose">{t.nav[0]}</a>
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#architecture">{t.nav[1]}</a>
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#benchmarks">{t.nav[2]}</a>
          <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#capabilities">{t.nav[3]}</a>
        </nav>
        <div className="flex-1" />
        <div className="mr-2 flex h-9 items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label={t.language}>
          {(["pt", "en"] as const).map(option => <button key={option} onClick={() => onLocaleChange(option)} aria-pressed={locale === option} className={`h-7 rounded-md px-2.5 text-xs font-semibold uppercase transition ${locale === option ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>{option}</button>)}
        </div>
        <button type="button" title={t.appearance} aria-label={t.appearance} onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")} className="mr-3 grid size-9 place-items-center rounded-lg border border-slate-200 text-sm text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900">{theme === "dark" ? "☼" : "☾"}</button>
        <a href="#overview" className="hidden rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white no-underline shadow-sm transition hover:-translate-y-px hover:bg-slate-800 sm:block dark:bg-white dark:text-slate-950">{t.open}</a>
      </div>
    </header>

    <main>
      <section className="relative isolate overflow-hidden border-b border-[var(--dr-border)] bg-[var(--dr-surface)]">
        <div className="mx-auto grid min-h-[650px] max-w-7xl items-center gap-16 px-5 py-20 lg:grid-cols-[1fr_.92fr] lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm dark:text-slate-300"><span className="size-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />{t.preview}</div>
            <h1 className="mt-7 max-w-3xl text-[clamp(3rem,7vw,5.5rem)] leading-[.96] font-semibold tracking-[-.07em]"><span>{t.hero}</span><br /><span className="text-blue-700 dark:text-blue-400">{t.heroAccent}</span></h1>
            <p className="mt-7 max-w-2xl text-[16px] leading-8 text-slate-600 dark:text-slate-400">{t.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#first-project" className="rounded-lg bg-blue-700 px-5 py-3.5 text-center text-sm font-semibold text-white no-underline shadow-sm shadow-blue-950/15 transition hover:-translate-y-px hover:bg-blue-800">{t.start} →</a>
              <a href="#overview" className="rounded-lg border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-5 py-3.5 text-center text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-px hover:border-slate-400 dark:text-slate-200">{t.explore}</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-slate-500 dark:text-slate-400"><span>React 19.2</span><span>ASP.NET Core 10</span><span>Type-safe</span><span>Azure-ready</span></div>
          </div>

          <div className="overflow-hidden rounded-xl border border-blue-900/60 bg-[#07101f] shadow-[0_28px_80px_rgba(30,64,175,.20)]">
            <div className="flex h-11 items-center border-b border-slate-700 px-4"><span className="font-mono text-[11px] text-slate-400">product/page · DotReact</span></div>
            <div className="grid sm:grid-cols-2">
              <CodePanel label="C# · loader" server code={'[DotReactPage(\n  "products/[id]/page")]\npublic sealed class ProductPage\n  : IDotReactPage<ProductProps>\n{\n  public async ValueTask<...>\n  LoadAsync(...) {\n    // DB, auth, domain\n    return new(product);\n  }\n}'} />
              <CodePanel label="React · page.drx" code={'export default function\nProductPage(Model) {\n  return (\n    <main>\n      <h1>{Model.name}</h1>\n      <button>Buy</button>\n    </main>\n  );\n}'} />
            </div>
            <div className="border-t border-slate-700 px-5 py-3 font-mono text-[10px] text-slate-400">● &nbsp;{t.codeStatus}</div>
          </div>
        </div>
      </section>

      <section id="purpose" className="bg-[var(--dr-canvas)] py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl"><Eyebrow>{t.purposeEyebrow}</Eyebrow><h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{t.purposeTitle}</h2><p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">{t.purposeText}</p><a href="#purpose-applications" className="mt-6 inline-flex text-sm font-semibold text-blue-700 no-underline dark:text-blue-400">{t.purposeLink} →</a></div>
          <div className="mt-12 grid border-t-2 border-l border-[var(--dr-border)] border-t-blue-700 md:grid-cols-2 lg:grid-cols-4 dark:border-t-blue-400">
            {t.values.map(([title, description], index) => <article key={title} className="min-h-56 border-r border-b border-[var(--dr-border)] bg-[var(--dr-surface)] p-6"><span className="font-mono text-[11px] text-blue-700 dark:text-blue-400">0{index + 1}</span><h3 className="mt-8 text-base font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p></article>)}
          </div>
        </div>
      </section>

      <section id="architecture" className="border-y border-[var(--dr-border)] bg-[var(--dr-surface)] py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr]">
          <div><Eyebrow>{t.archEyebrow}</Eyebrow><h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{t.archTitle}</h2><p className="mt-5 text-base leading-8 text-slate-600 dark:text-slate-300">{t.archText}</p><a href="#architecture-protocol" className="mt-7 inline-flex text-sm font-semibold text-blue-700 no-underline dark:text-blue-400">{t.archLink} →</a></div>
          <div className="rounded-xl border border-[var(--dr-border)] bg-[var(--dr-canvas)] p-5 sm:p-7">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">{t.nodes.map(([title, subtitle, detail], index) => {
              return <div key={title} className="contents"><article className="min-h-52 rounded-lg border border-[var(--dr-border)] bg-[var(--dr-surface)] p-5"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-md bg-blue-700 font-mono text-xs font-bold text-white dark:bg-blue-500">{architectureIcons[index]}</span><span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">0{index + 1}</span></div><b className="mt-7 block text-[15px] font-semibold tracking-[-.01em]">{title}</b><small className="mt-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{subtitle}</small><p className="mt-6 font-mono text-[11px] leading-5 text-blue-800/70 dark:text-blue-300/70">{detail}</p></article>{index < 2 && <span className="hidden text-blue-700 sm:block dark:text-blue-400">→</span>}</div>;
            })}</div>
            <p className="mt-4 flex items-center justify-center gap-2 rounded-md border border-[var(--dr-border)] bg-[var(--dr-surface)] px-4 py-4 text-center text-xs font-medium leading-5 text-slate-800 dark:text-slate-300"><span className="grid size-6 shrink-0 place-items-center rounded bg-blue-700 text-xs text-white dark:bg-blue-500">◎</span>{t.browser}</p>
          </div>
        </div>
      </section>

      <section id="benchmarks" className="border-b border-[var(--dr-border)] bg-[var(--dr-surface)] py-20">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
          <div className="grid gap-8 border-b border-[var(--dr-border)] pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-3xl"><Eyebrow>{t.benchEyebrow}</Eyebrow><h2 className="mt-3 text-4xl font-semibold tracking-[-.045em] sm:text-[3.25rem] sm:leading-[1.04]">{t.benchTitle}</h2><p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">{t.benchText}</p></div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <div className="rounded-lg border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-3.5 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300"><span className={`mr-2 inline-block size-1.5 rounded-full ${benchmarkSnapshot.verification === "verified" ? "bg-emerald-500" : "bg-amber-500"}`} />{benchmarkSnapshot.verification === "verified" ? t.benchVerified : t.benchLocal}</div>
              <a href="#observability-performance" className="rounded-lg border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-3.5 py-2.5 text-xs font-semibold text-blue-700 no-underline transition hover:border-slate-400 dark:text-blue-400">{t.method} →</a>
            </div>
          </div>

          <BenchmarkHighlights labels={t} locale={locale} />

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
            <BenchmarkChart title={t.scenarioServer} rows={benchmarkSnapshot.rows.filter(row => row.scenario.includes("server-only"))} labels={t} locale={locale} />
            <BenchmarkChart title={t.scenarioInteractive} rows={benchmarkSnapshot.rows.filter(row => row.scenario.includes("interativo"))} labels={t} locale={locale} />
          </div>

          <BenchmarkResources labels={t} locale={locale} />

          <div className="mt-5 grid overflow-hidden rounded-xl border border-[var(--dr-border)] bg-[var(--dr-canvas)] md:grid-cols-2">
            <article className="p-5 md:border-r md:border-[var(--dr-border)]"><span className="font-mono text-[10px] font-semibold tracking-wider text-blue-700 uppercase dark:text-blue-400">01 · {t.winTitle}</span><p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">{t.winText}</p></article>
            <article className="border-t border-[var(--dr-border)] p-5 md:border-t-0"><span className="font-mono text-[10px] font-semibold tracking-wider text-slate-500 uppercase">02 · {t.lossTitle}</span><p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">{t.lossText}</p></article>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-[var(--dr-border)] pt-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-slate-500"><span>{benchmarkSnapshot.environment.cpu.trim()} · {benchmarkSnapshot.environment.logicalCores} threads</span><span>{benchmarkSnapshot.methodology.rounds} rounds · {benchmarkSnapshot.methodology.requests} requests · c{benchmarkSnapshot.methodology.concurrency}</span><span>{benchmarkSnapshot.environment.platform}/{benchmarkSnapshot.environment.arch}</span></div>
            <div className="flex items-center gap-4 text-xs font-semibold"><span className="text-slate-500">{t.allSuccessful}</span><a href="/benchmarks/latest.json" className="text-blue-700 no-underline dark:text-blue-400">{t.raw} →</a></div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="bg-slate-950 py-24 text-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div className="max-w-2xl"><Eyebrow dark>{t.capEyebrow}</Eyebrow><h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">{t.capTitle}</h2></div><a href="#next-equivalents" className="text-sm font-semibold text-blue-400 no-underline">{t.compare} →</a></div>
          <div className="mt-12 grid border-t border-l border-slate-800 sm:grid-cols-2 lg:grid-cols-3">{t.capabilities.map(([title, description], index) => <article key={title} className="border-r border-b border-slate-800 p-7"><span className="font-mono text-[11px] text-blue-400">0{index + 1}</span><h3 className="mt-7 text-base font-semibold">{title}</h3><p className="mt-3 text-[13px] leading-6 text-slate-400">{description}</p></article>)}</div>
        </div>
      </section>

      <section className="border-b border-[var(--dr-border)] bg-[var(--dr-surface)]"><div className="mx-auto max-w-4xl px-5 py-28 text-center sm:px-8"><img className="mx-auto size-16 object-contain" src={dotReactLogoSource} alt="" width="64" height="64" /><h2 className="mt-8 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{t.finalTitle}</h2><p className="mx-auto mt-5 max-w-xl text-base leading-8 text-slate-600 dark:text-slate-300">{t.finalText}</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><a href="#first-project" className="rounded-lg bg-blue-700 px-6 py-3.5 text-sm font-semibold text-white no-underline shadow-sm shadow-blue-950/15 transition hover:-translate-y-px hover:bg-blue-800">{t.now} →</a><a href="#hosting-overview" className="rounded-lg border border-[var(--dr-border)] bg-[var(--dr-canvas)] px-6 py-3.5 text-sm font-semibold no-underline shadow-sm transition hover:-translate-y-px hover:border-slate-400">{t.deploy} →</a></div></div></section>
    </main>

    <footer className="border-t border-slate-200 py-8 dark:border-slate-800"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>DotReact 0.1 · ASP.NET Core × React</span><div className="flex flex-wrap gap-5"><a href="#overview" className="no-underline hover:text-blue-600">{t.footerDocs}</a><a href="#hosting-overview" className="no-underline hover:text-blue-600">{t.deploy}</a><a href="#roadmap" className="no-underline hover:text-blue-600">Roadmap</a><a href="#compatibility" className="no-underline hover:text-blue-600">{t.compatibility}</a></div></div></footer>
  </div>;
}

function Eyebrow({ children, dark = false }: { readonly children: string; readonly dark?: boolean }) {
  return <span className={`text-xs font-semibold tracking-wider uppercase ${dark ? "text-blue-400" : "text-blue-700 dark:text-blue-400"}`}>{children}</span>;
}

function CodePanel({ label, code, server = false }: { readonly label: string; readonly code: string; readonly server?: boolean }) {
  return <div className={`p-5 ${server ? "border-b border-slate-700 sm:border-r sm:border-b-0" : ""}`}><div className="mb-4 font-mono text-[11px] text-blue-400">{label}</div><SyntaxCode code={code} label={label} compact /></div>;
}

function BenchmarkHighlights({ labels, locale }: {
  readonly labels: typeof copy.pt | typeof copy.en;
  readonly locale: Locale;
}) {
  const serverRows = benchmarkSnapshot.rows.filter(row => row.scenario.includes("server-only"));
  const interactiveRows = benchmarkSnapshot.rows.filter(row => row.scenario.includes("interativo"));
  const dotReactServer = serverRows.find(row => row.implementation === "DotReact");
  const razor = serverRows.find(row => row.implementation === "Razor Pages");
  const blazor = serverRows.find(row => row.implementation === "Blazor static SSR");
  const dotReactInteractive = interactiveRows.find(row => row.implementation === "DotReact");
  const next = interactiveRows.find(row => row.implementation === "Next.js");
  const items = [
    [labels.razorParity, ratioLabel(dotReactServer?.throughput, razor?.throughput, locale, true), labels.versusRazor],
    [labels.blazorGap, ratioLabel(dotReactServer?.throughput, blazor?.throughput, locale, true), labels.versusBlazor],
    [labels.nextLead, multipleLabel(dotReactInteractive?.throughput, next?.throughput, locale), labels.versusNext]
  ] as const;

  return <div className="mt-5 grid overflow-hidden rounded-xl border border-[var(--dr-border)] bg-[var(--dr-canvas)] sm:grid-cols-3">{items.map(([title, value, detail], index) => <article key={title} className={`p-5 ${index > 0 ? "border-t border-[var(--dr-border)] sm:border-t-0 sm:border-l" : ""}`}><span className="text-xs font-medium text-slate-500">{title}</span><div className="mt-2 flex items-end justify-between gap-4"><strong className="font-mono text-2xl font-semibold tracking-[-.04em] text-slate-950 dark:text-white">{value}</strong><span className="pb-1 text-[10px] font-medium text-slate-500">{detail}</span></div></article>)}</div>;
}

function BenchmarkChart({ title, rows, labels, locale }: {
  readonly title: string;
  readonly rows: readonly (typeof benchmarkSnapshot.rows)[number][];
  readonly labels: typeof copy.pt | typeof copy.en;
  readonly locale: Locale;
}) {
  const maximum = Math.max(...rows.map(row => row.throughput));
  return <article className="overflow-hidden rounded-xl border border-[var(--dr-border)] bg-[var(--dr-canvas)]"><header className="flex flex-col gap-2 border-b border-[var(--dr-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-[15px] font-semibold">{title}</h3><span className="mt-1 block font-mono text-[10px] text-slate-500">{labels.higher}: req/s · {labels.lower}: ms/bytes</span></div><span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{labels.comparisonLabel}</span></header>
    <div className="divide-y divide-[var(--dr-border)]">{rows.map(row => {
      const width = Math.max(5, (row.throughput / maximum) * 100);
      const isDotReact = row.implementation === "DotReact";
      return <div key={`${row.scenario}-${row.implementation}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(130px,.72fr)_minmax(180px,1.4fr)_auto] sm:items-center">
        <div><div className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${isDotReact ? "bg-blue-700 dark:bg-blue-400" : "bg-slate-300 dark:bg-slate-600"}`} /><strong className="text-[13px] font-semibold">{row.implementation}</strong></div><span className="mt-1 block pl-3.5 font-mono text-[10px] text-slate-500">{formatNumber(row.throughput, 0, locale)} req/s</span></div>
        <div><div className="h-2.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800"><div className={`h-full rounded-full ${isDotReact ? "bg-blue-700 dark:bg-blue-400" : "bg-slate-400 dark:bg-slate-600"}`} style={{ width: `${width}%` }} /></div><div className="mt-2 flex justify-between font-mono text-[9px] text-slate-500"><span>0</span><span>{formatNumber(maximum, 0, locale)} req/s</span></div></div>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-right"><div><dt className="text-[9px] font-medium text-slate-500 uppercase">{labels.averageLatencyLabel}</dt><dd className="mt-0.5 font-mono text-[11px]">{formatNumber(row.meanMs, 1, locale)} ms</dd></div><div><dt className="text-[9px] font-medium text-slate-500 uppercase">{labels.latencyLabel}</dt><dd className="mt-0.5 font-mono text-[11px]">{formatNumber(row.p95Ms, 1, locale)} ms</dd></div><div><dt className="text-[9px] font-medium text-slate-500 uppercase">{labels.payloadLabel}</dt><dd className="mt-0.5 font-mono text-[11px]">{formatCompactBytes(row.bytesPerResponse, locale)}</dd></div></dl>
      </div>;
    })}</div>
  </article>;
}

function BenchmarkResources({ labels, locale }: {
  readonly labels: typeof copy.pt | typeof copy.en;
  readonly locale: Locale;
}) {
  const usage = benchmarkSnapshot.resourceUsage as unknown as Record<string, {
    readonly cpuMillisecondsPer1000Requests: number;
    readonly peakRssBytes: number;
  }> | null;
  if (usage === null) return null;
  const rows = Object.entries(usage);
  const maximumCpu = Math.max(...rows.map(([, value]) => value.cpuMillisecondsPer1000Requests));
  return <article className="mt-5 overflow-hidden rounded-xl border border-[var(--dr-border)] bg-[var(--dr-canvas)]">
    <header className="flex flex-col gap-1 border-b border-[var(--dr-border)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-[15px] font-semibold">{labels.resourceTitle}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{labels.resourceNote}</p></div><span className="font-mono text-[10px] text-slate-500">{labels.lower}</span></header>
    <div className="grid divide-y divide-[var(--dr-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">{rows.map(([name, value]) => <div key={name} className="p-5"><strong className="text-[13px] font-semibold">{name}</strong><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-700 dark:bg-blue-400" style={{ width: `${Math.max(4, value.cpuMillisecondsPer1000Requests / maximumCpu * 100)}%` }} /></div><dl className="mt-3 grid grid-cols-2 gap-4"><div><dt className="text-[9px] font-medium text-slate-500 uppercase">{labels.cpuPerRequest}</dt><dd className="mt-1 font-mono text-xs">{formatNumber(value.cpuMillisecondsPer1000Requests, 1, locale)} ms</dd></div><div><dt className="text-[9px] font-medium text-slate-500 uppercase">{labels.peakMemory}</dt><dd className="mt-1 font-mono text-xs">{formatMemory(value.peakRssBytes, locale)}</dd></div></dl></div>)}</div>
  </article>;
}

function formatNumber(value: number, digits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatCompactBytes(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
}

function formatMemory(value: number, locale: Locale): string {
  return `${formatNumber(value / 1024 / 1024, 1, locale)} MB`;
}

function ratioLabel(candidate: number | undefined, baseline: number | undefined, locale: Locale, signed: boolean): string {
  if (!candidate || !baseline) return "—";
  const delta = ((candidate / baseline) - 1) * 100;
  const value = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", { signDisplay: signed ? "always" : "auto", maximumFractionDigits: 1 }).format(delta);
  return `${value}%`;
}

function multipleLabel(candidate: number | undefined, baseline: number | undefined, locale: Locale): string {
  if (!candidate || !baseline) return "—";
  return `${new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 }).format(candidate / baseline)}×`;
}
