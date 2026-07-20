import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { docs as docsPt } from "./content";
import { docsEn } from "./content.en";
import { detectLocale, LocaleProvider, type Locale } from "./i18n";
import { LandingPage } from "./LandingPage";
import { dotReactLogoSource } from "./assets";

export type ThemePreference = "system" | "light" | "dark";

interface ArticleHeading {
  readonly id: string;
  readonly label: string;
  readonly level: 2 | 3;
}

const copy = {
  pt: {
    groups: ["Começar", "Guias", "Fundamentos", "Pages", "Full-stack", "Segurança", "Hospedagem e deploy", "Operações", "Migração do Next.js", "Ferramentas", "Referência", "Projeto"],
    skip: "Pular para o conteúdo", open: "Abrir navegação", close: "Fechar navegação",
    search: "Buscar na documentação", searchPlaceholder: "Buscar na documentação...", clear: "Limpar",
    noResults: "Nenhum resultado encontrado", noResultsHint: "Tente outro termo ou limpe a busca.",
    docs: "Documentação", appearance: "Aparência", system: "Sistema", light: "Claro", dark: "Escuro",
    language: "Idioma", onThisPage: "Nesta página", previous: "Anterior", next: "Próximo",
    backTop: "Voltar ao topo", verified: "Documentação verificada", home: "Início"
  },
  en: {
    groups: ["Getting started", "Guides", "Fundamentals", "Pages", "Full-stack", "Security", "Hosting and deployment", "Operations", "Migrating from Next.js", "Tooling", "Reference", "Project"],
    skip: "Skip to content", open: "Open navigation", close: "Close navigation",
    search: "Search documentation", searchPlaceholder: "Search documentation...", clear: "Clear",
    noResults: "No results found", noResultsHint: "Try another term or clear the search.",
    docs: "Documentation", appearance: "Appearance", system: "System", light: "Light", dark: "Dark",
    language: "Language", onThisPage: "On this page", previous: "Previous", next: "Next",
    backTop: "Back to top", verified: "Documentation verified", home: "Home"
  }
} as const;

function initialTheme(): ThemePreference {
  const saved = localStorage.getItem("dotreact-theme");
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function LanguageSwitch({ locale, onChange, label }: {
  readonly locale: Locale;
  readonly onChange: (locale: Locale) => void;
  readonly label: string;
}) {
  return <div className="flex h-8 items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label={label}>
    {(["pt", "en"] as const).map(option => <button key={option} type="button" aria-pressed={locale === option} onClick={() => onChange(option)}
      className={`h-6 rounded px-2 text-[10px] font-semibold uppercase transition-colors ${locale === option ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>
      {option}
    </button>)}
  </div>;
}

function ThemeSwitch({ theme, onChange, labels }: {
  readonly theme: ThemePreference;
  readonly onChange: (theme: ThemePreference) => void;
  readonly labels: { readonly appearance: string; readonly system: string; readonly light: string; readonly dark: string };
}) {
  return <div className="flex h-8 items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label={labels.appearance}>
    {(["system", "light", "dark"] as const).map(option => {
      const text = option === "system" ? labels.system : option === "light" ? labels.light : labels.dark;
      return <button key={option} type="button" title={text} aria-label={text} aria-pressed={theme === option} onClick={() => onChange(option)}
        className={`grid size-6 place-items-center rounded text-[12px] transition-colors ${theme === option ? "bg-slate-100 text-slate-950 dark:bg-slate-700 dark:text-white" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>
        {option === "system" ? "◐" : option === "light" ? "☼" : "☾"}
      </button>;
    })}
  </div>;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const localizedDocs = locale === "pt" ? docsPt : docsEn;
  const validIds = docsPt.map(page => page.id);
  const initialHash = location.hash.slice(1);
  const [current, setCurrent] = useState(validIds.includes(initialHash) ? initialHash : "landing");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [headings, setHeadings] = useState<readonly ArticleHeading[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const t = copy[locale];
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = locale === "pt" ? "pt-BR" : "en";
    localStorage.setItem("dotreact-theme", theme);
    localStorage.setItem("dotreact-locale", locale);
  }, [locale, resolvedTheme, theme]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = location.hash.slice(1);
      if (validIds.includes(hash)) setCurrent(hash);
      else if (hash === "" || hash === "home") setCurrent("landing");
    };
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setMenu(true);
      }
    };
    addEventListener("keydown", onShortcut);
    return () => removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const seen = new Map<string, number>();
      const discovered = [...(articleRef.current?.querySelectorAll("h2, h3") ?? [])].map(element => {
        const base = slugify(element.textContent ?? "section") || "section";
        const occurrence = seen.get(base) ?? 0;
        seen.set(base, occurrence + 1);
        const id = occurrence === 0 ? base : `${base}-${occurrence + 1}`;
        element.id = id;
        return { id, label: element.textContent ?? id, level: element.tagName === "H2" ? 2 : 3 } as ArticleHeading;
      });
      setHeadings(discovered);
      scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [current, locale]);

  const groupOrder: readonly string[] = t.groups;
  const orderedDocs = useMemo(() => [...localizedDocs].sort((left, right) =>
    groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group)), [groupOrder, localizedDocs]);
  const visible = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase(locale).trim();
    return normalizedQuery.length === 0 ? orderedDocs : orderedDocs.filter(page =>
      `${page.title} ${page.summary} ${page.tags.join(" ")} ${page.group}`.toLocaleLowerCase(locale).includes(normalizedQuery));
  }, [locale, orderedDocs, query]);

  const activeIndex = Math.max(0, orderedDocs.findIndex(page => page.id === current));
  const active = orderedDocs[activeIndex] ?? orderedDocs[0]!;
  const previous = activeIndex > 0 ? orderedDocs[activeIndex - 1] : undefined;
  const next = activeIndex < orderedDocs.length - 1 ? orderedDocs[activeIndex + 1] : undefined;
  const groups = [...new Set(visible.map(page => page.group))].sort((left, right) => groupOrder.indexOf(left) - groupOrder.indexOf(right));
  const progressStyle = { "--doc-progress": `${((activeIndex + 1) / orderedDocs.length) * 100}%` } as CSSProperties;

  const updateLocale = (value: Locale) => {
    setLocale(value);
    setQuery("");
  };

  useEffect(() => {
    document.title = current === "landing" ? "DotReact" : `${active.title} · DotReact`;
  }, [active.title, current]);

  if (current === "landing") return <LocaleProvider locale={locale}>
    <LandingPage locale={locale} theme={theme} onLocaleChange={updateLocale} onThemeChange={setTheme} />
  </LocaleProvider>;

  return <LocaleProvider locale={locale}>
    <div className="min-h-screen bg-[var(--dr-surface-strong)] text-slate-950 selection:bg-blue-100 selection:text-blue-950 dark:text-slate-100">
      <a className="fixed -top-20 left-4 z-[100] rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white focus:top-3" href="#content">{t.skip}</a>

      <header className="sticky top-0 z-[var(--dr-layer-header)] flex h-[var(--dr-header-height)] items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/95 sm:px-6" style={progressStyle}>
        <div className="absolute inset-x-0 bottom-[-1px] h-px bg-transparent"><div className="h-full w-[var(--doc-progress)] bg-blue-600 transition-[width]" /></div>
        <button className="mr-3 grid size-8 place-content-center gap-1 rounded-md border border-slate-200 lg:hidden dark:border-slate-700" onClick={() => setMenu(!menu)} aria-label={t.open} aria-expanded={menu}>
          <span className="h-px w-3.5 bg-slate-700 dark:bg-slate-200" /><span className="h-px w-3.5 bg-slate-700 dark:bg-slate-200" /><span className="h-px w-3.5 bg-slate-700 dark:bg-slate-200" />
        </button>
        <a className="flex shrink-0 items-center gap-2 no-underline" href="#home" aria-label="DotReact">
          <img className="size-8 object-contain" src={dotReactLogoSource} alt="" width="32" height="32" />
          <b className="text-[15px] font-semibold tracking-[-.02em] text-slate-950 dark:text-white">DotReact</b>
          <span className="hidden border-l border-slate-200 pl-2 text-[12px] text-slate-500 sm:inline dark:border-slate-700 dark:text-slate-400">{t.docs}</span>
        </a>
        <span className="ml-3 hidden rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[8px] text-slate-500 md:inline dark:border-slate-700">v0.1</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <LanguageSwitch locale={locale} onChange={updateLocale} label={t.language} />
          <ThemeSwitch theme={theme} onChange={setTheme} labels={t} />
        </div>
      </header>

      {menu && <button className="fixed inset-0 top-[var(--dr-header-height)] z-[var(--dr-layer-overlay)] border-0 bg-slate-950/35 lg:hidden" aria-label={t.close} onClick={() => setMenu(false)} />}

      <div className="mx-auto grid min-h-[calc(100vh-var(--dr-header-height))] max-w-[1440px] lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,820px)_220px]">
        <aside className={`fixed top-[var(--dr-header-height)] bottom-0 left-0 z-[var(--dr-layer-sidebar)] h-[calc(100vh-var(--dr-header-height))] w-[260px] overflow-y-auto border-r border-[var(--dr-border)] bg-[var(--dr-surface)] px-4 py-5 transition-transform lg:sticky lg:bottom-auto lg:left-auto lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}>
          <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
            <span className="text-sm text-slate-400" aria-hidden="true">⌕</span>
            <input className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.search} />
            <kbd className="font-mono text-[8px] text-slate-400">⌘K</kbd>
          </label>
          {query && <div className="mt-2 flex justify-between px-1 text-[9px] text-slate-400"><span>{visible.length}</span><button className="font-medium text-blue-700 dark:text-blue-400" onClick={() => setQuery("")}>{t.clear}</button></div>}
          <nav className="mt-5" aria-label={t.docs}>
            {groups.map(group => <section className="mb-6" key={group}>
              <h2 className="mb-1.5 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-wide text-slate-950 dark:text-slate-200"><span className="size-1.5 rounded-full bg-blue-600" />{group}</h2>
              <div className="grid gap-0.5">
                {visible.filter(page => page.group === group).map(page => <a key={page.id} href={`#${page.id}`} aria-current={active.id === page.id ? "page" : undefined} onClick={() => setMenu(false)}
                  className={`border-l-2 py-1.5 pr-2 pl-3 text-[12px] leading-5 no-underline transition-colors ${active.id === page.id
                    ? "border-blue-600 bg-blue-100/80 font-medium text-blue-900 shadow-[inset_0_0_0_1px_rgba(37,99,235,.08)] dark:bg-blue-950/60 dark:text-blue-300"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-white"}`}>
                  {page.title}
                </a>)}
              </div>
            </section>)}
          </nav>
          {visible.length === 0 && <div className="mt-8 border-l-2 border-slate-200 pl-3 dark:border-slate-700"><b className="text-[11px]">{t.noResults}</b><p className="mt-1 text-[9px] leading-4 text-slate-400">{t.noResultsHint}</p></div>}
        </aside>

        <main id="content" className="min-w-0 bg-[var(--dr-canvas)] px-5 py-10 sm:px-9 lg:px-12 lg:py-12 xl:px-16">
          <section className="relative overflow-hidden rounded-xl border border-[var(--dr-border)] bg-[var(--dr-surface)] p-6 sm:p-8">
            <div className="relative flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <a className="no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#overview">{t.docs}</a><span>/</span><span>{active.group}</span>
            </div>
            <h1 className="relative mt-5 max-w-3xl text-[clamp(2.25rem,5vw,3rem)] leading-[1.08] font-semibold tracking-[-.04em] text-slate-950 dark:text-white">{active.title}</h1>
            <p className="relative mt-4 max-w-3xl text-[16px] leading-7 text-slate-700 dark:text-slate-300">{active.summary}</p>
            <div className="relative mt-5 flex flex-wrap gap-2" aria-label="Tags">
              {active.tags.map(tag => <span className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-[10px] text-blue-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300" key={tag}>{tag}</span>)}
            </div>
          </section>

          <div ref={articleRef} className="article mt-10">{active.body}</div>

          <nav className="mt-16 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2 dark:border-slate-800" aria-label="Pagination">
            {previous ? <a href={`#${previous.id}`} className="group no-underline"><small className="text-[9px] font-medium text-slate-400">← {t.previous}</small><b className="mt-1 block text-[12px] font-medium text-slate-700 group-hover:text-blue-700 dark:text-slate-300 dark:group-hover:text-blue-400">{previous.title}</b></a> : <span />}
            {next ? <a href={`#${next.id}`} className="group text-right no-underline"><small className="text-[9px] font-medium text-slate-400">{t.next} →</small><b className="mt-1 block text-[12px] font-medium text-slate-700 group-hover:text-blue-700 dark:text-slate-300 dark:group-hover:text-blue-400">{next.title}</b></a> : <span />}
          </nav>
          <div className="mt-10 flex justify-between text-[10px] text-slate-400"><span>DotReact 0.1 · {t.verified}</span><a className="text-slate-500 no-underline hover:text-blue-700 dark:hover:text-blue-400" href="#content">{t.backTop} ↑</a></div>
        </main>

        <aside className="sticky top-[var(--dr-header-height)] hidden h-[calc(100vh-var(--dr-header-height))] border-l border-[var(--dr-border)] bg-[var(--dr-surface)] px-6 py-12 2xl:block">
          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{t.onThisPage}</div>
          <nav className="mt-3 grid" aria-label={t.onThisPage}>
            {headings.map(heading => <a key={heading.id} href={`#${heading.id}`} className={`border-l border-slate-200 py-1.5 leading-4 text-slate-500 no-underline hover:border-blue-600 hover:text-blue-700 dark:border-slate-800 dark:text-slate-400 dark:hover:text-blue-400 ${heading.level === 3 ? "pl-5 text-[10px]" : "pl-3 text-[11px]"}`}>{heading.label}</a>)}
          </nav>
        </aside>
      </div>
    </div>
  </LocaleProvider>;
}
