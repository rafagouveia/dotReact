import { useEffect, useMemo, useState } from "react";
import { docs } from "./content";

export function App() {
  const initialHash = location.hash.slice(1);
  const [current, setCurrent] = useState(docs.some(page => page.id === initialHash) ? initialHash : "overview");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("dotreact-theme") === "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("dotreact-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const onHashChange = () => setCurrent(location.hash.slice(1) || "overview");
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    return normalizedQuery.length === 0
      ? docs
      : docs.filter(page => `${page.title} ${page.summary} ${page.tags.join(" ")}`.toLowerCase().includes(normalizedQuery));
  }, [query]);

  const active = docs.find(page => page.id === current) ?? docs[0]!;
  const groups = [...new Set(visible.map(page => page.group))];

  return <>
    <a className="skip" href="#content">Pular para o conteúdo</a>
    <header>
      <button className="menu" onClick={() => setMenu(!menu)} aria-label="Abrir navegação">☰</button>
      <a className="logo" href="#overview">
        <img src="/dotreact-logo-v4.png" alt="" width="42" height="42" />
        <b>DotReact</b><em>docs</em>
      </a>
      <div className="version">v0.1.0 · pre-release</div>
      <button className="theme" onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? "☀" : "◐"}</button>
    </header>
    <div className="layout">
      <aside className={menu ? "open" : ""}>
        <label className="search">
          <span>⌕</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar na documentação" aria-label="Buscar" />
        </label>
        <nav aria-label="Documentação">
          {groups.map(group => <section key={group}>
            <h2>{group}</h2>
            {visible.filter(page => page.group === group).map(page =>
              <a key={page.id} href={`#${page.id}`} aria-current={active.id === page.id ? "page" : undefined} onClick={() => setMenu(false)}>
                <b>{page.title}</b><small>{page.summary}</small>
              </a>)}
          </section>)}
        </nav>
        {visible.length === 0 && <p className="no-results">Nenhum tópico encontrado.</p>}
        <footer>ASP.NET Core × React 19</footer>
      </aside>
      <main id="content">
        <div className="breadcrumb">Docs <span>/</span> {active.group}</div>
        <h1>{active.title}</h1>
        <p className="lead">{active.summary}</p>
        <div className="article">{active.body}</div>
        <div className="page-foot"><span>DotReact 0.1.0</span><a href="#overview">Voltar ao início ↑</a></div>
      </main>
      <aside className="toc">
        <b>Neste tópico</b>
        {active.tags.map(tag => <span key={tag}>#{tag}</span>)}
        <hr />
        <small>Validado pelo build local e pelos gates do framework.</small>
      </aside>
    </div>
  </>;
}
