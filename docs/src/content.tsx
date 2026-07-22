import { CliLab, CodeBlock, Flow, PairedCode, ReferenceTable, RouteLab, Step, Steps } from "./components";
import type { DocPage } from "./types";
import { guideDocs } from "./content.guides";
import { securityDocs } from "./content.security";
import { deploymentDocs, introDocs } from "./content.deploy";

const pageLoader = `public sealed class ProductPage(GetProduct useCase)
    : IDotReactResultPage<ProductPageProps>
{
    public async ValueTask<DotReactPageResult<ProductPageProps>> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken)
    {
        var id = context.GetRouteValue<int>("id");
        var product = await useCase.ExecuteAsync(id, cancellationToken);
        return product is null
            ? DotReactPageResult<ProductPageProps>.NotFound()
            : DotReactPageResult<ProductPageProps>.Page(
                new ProductPageProps(product.Id, product.Name));
    }
}`;

const pageView = `import type { ProductPageProps } from "../../../src/contracts";
import type { DotReactMetadataResolver } from "@rafagouveia/dotreact-vite";

export const metadata: DotReactMetadataResolver<ProductPageProps> = props => ({
  title: \`${"${props.name}"} · Catálogo\`,
  description: \`Detalhes do produto ${"${props.id}"}.\`
});

export default function ProductPage({ id, name }: ProductPageProps) {
  return <main><h1>{name}</h1><p>Produto #{id}</p></main>;
}`;

const actionClass = `[Authorize]
[DotReactAction("orders/create")]
[DotReactIdempotent(600)]
public sealed class CreateOrderAction(CreateOrder useCase)
    : IDotReactAction<CreateOrderRequest, CreateOrderResponse>
{
    public async ValueTask<DotReactActionResult<CreateOrderResponse>> ExecuteAsync(
        CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(request, cancellationToken);
        return result.IsValid
            ? DotReactActionResult<CreateOrderResponse>.Success(
                result.Value, ["/orders"])
            : DotReactActionResult<CreateOrderResponse>.Validation(result.Errors);
    }
}`;

const actionClient = `import { ordersCreate } from "../actions";

const response = await ordersCreate(
  { productId, quantity },
  {
    signal: abortController.signal,
    idempotencyKey: crypto.randomUUID(),
    onRevalidate(paths) {
      console.log("Dados obsoletos:", paths);
    }
  }
);`;

const hostSetup = `using DotReact.Hosting;

var builder = WebApplication.CreateBuilder(args);
builder.AddDotReactApplication();

var app = builder.Build();
app.UseDotReactApplication();
app.MapDotReactApplication();
app.Run();`;

const authSetup = `builder.AddDotReactApplication();

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/entrar";
        options.AccessDeniedPath = "/acesso-negado";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("catalog.manage", policy =>
        policy.RequireAuthenticatedUser()
              .RequireClaim("permission", "catalog.manage"));
});

var app = builder.Build();
app.UseDotReactApplication();
app.UseAuthentication();
app.UseAuthorization();
app.MapDotReactApplication();`;

const protectedPage = `[Authorize(Policy = "catalog.manage")]
public sealed class CatalogAdminPage(ICatalogQueries queries)
    : IDotReactPage<CatalogAdminProps>
{
    public async ValueTask<CatalogAdminProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken)
    {
        // Executa somente após autenticação + policy.
        var userId = context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        return await queries.LoadAdminAsync(userId, cancellationToken);
    }
}`;

const protectedView = `import type { CatalogAdminProps } from "../../../src/contracts";

export default function CatalogAdminPage(Model: CatalogAdminProps) {
  // CanPublish veio da decisão feita no C#; não substitui a policy da action.
  return <main>
    <h1>Catálogo de {Model.organizationName}</h1>
    {Model.canPublish && <button>Publicar alterações</button>}
  </main>;
}`;

export const docs: readonly DocPage[] = [
  {
    id: "overview", group: "Começar", title: "Visão geral",
    summary: "ASP.NET Core como autoridade; React como renderer SSR e cliente hidratado.",
    tags: ["arquitetura", "SSR", "hidratação"],
    body: <>
      <h2>Um limite explícito entre duas plataformas</h2>
      <p>DotReact existe para equipes que querem a ergonomia de páginas React/TSX, SSR, navegação fluida e Server Actions, mas precisam manter ASP.NET Core como backend e autoridade de segurança. HTTP, autenticação, autorização, serviços e dados ficam no C#; o renderer Node é privado e recebe somente contratos JSON versionados.</p>
      <Flow />
      <div className="callout"><strong>Regra central</strong><span>Não existe C# embutido no JSX. Props geradas e Server Actions explicitamente expostas formam a ponte entre os runtimes.</span></div>
      <h3>O que já funciona</h3>
      <div className="cards">
        <article><b>Renderização</b><span>Streaming SSR/Suspense, hydration, router, layouts, metadata e boundaries.</span></article>
        <article><b>Backend</b><span>Loaders e actions C# com DI, auth, antiforgery e resultados fechados.</span></article>
        <article><b>Produção</b><span>ISR/SSG, imagem otimizada, adapters Azure, probes, CSP com nonce e OTel.</span></article>
      </div>
      <h3>Quando usar</h3>
      <p>É uma boa escolha para portais, SaaS, e-commerce, backoffices e aplicações institucionais em que o domínio e a infraestrutura já são .NET, mas a equipe quer React e arquivos por rota. Não é uma tentativa de executar um backend JavaScript paralelo nem de embutir Razor/C# no TSX.</p>
      <h3>Escolha seu caminho</h3>
      <div className="journey-grid">
        <a href="#first-project"><span>01</span><b>Quero criar uma aplicação</b><small>Scaffold, execução, HMR e primeiro dado C#.</small></a>
        <a href="#next-equivalents"><span>02</span><b>Eu já conheço Next.js</b><small>Veja o equivalente de cada conceito no DotReact.</small></a>
        <a href="#auth-guards"><span>03</span><b>Preciso proteger páginas</b><small>Authentication, policies e auth guard no servidor.</small></a>
        <a href="#hosting-overview"><span>04</span><b>Vou colocar em produção</b><small>Escolha de hosting, Docker, Azure, rollout e operação.</small></a>
      </div>
    </>
  },
  ...introDocs,
  {
    id: "installation", group: "Começar", title: "Instalação e requisitos",
    summary: "Prepare Node, .NET e o modelo vendorizado usado durante o pré-release.",
    tags: ["Node 24", ".NET 10", "pré-release"],
    body: <>
      <h2>Requisitos suportados</h2>
      <ReferenceTable valueHeading="Versão" rows={[
        { name: ".NET SDK", defaultValue: "10.x", description: "Compila o host, TypeGen e os loaders C#." },
        { name: "Node.js", defaultValue: "24.x recomendado; 22.19+ suportado", description: "Executa Vite, CLI, Lighthouse e renderer React." },
        { name: "React", defaultValue: "19.2.x", description: "SSR com react-dom/server e hydrateRoot no cliente." },
        { name: "Vite / TypeScript", defaultValue: "8.1.x / 7.0.x", description: "Build, HMR e verificação semântica de .drx." }
      ]} />
      <h3>Pré-release vendorizado</h3>
      <p>Os pacotes ainda não foram publicados em npm/NuGet. O comando <code>create</code> copia um runtime fixado para <code>vendor/</code> e reescreve referências para dependências locais. O VS Code oculta essa dependência gerenciada da navegação e da busca normais; não a edite como código da aplicação.</p>
      <p>O projeto abre em modo <strong>focus</strong>: páginas, features, componentes, loaders, actions e pontos oficiais de extensão ficam visíveis; contratos gerados, entrypoints, compiladores e deploy permanecem versionados, mas fora da navegação cotidiana. Use <code>dotreact workspace reveal</code> para configurar infraestrutura e <code>dotreact workspace focus</code> para voltar à visão de aplicação.</p>
      <CodeBlock label="PowerShell" code={'npm install\nnpm run build\nnpm run create -- create minha-app --template starter\ncd minha-app\nnpm install\nnpm exec -- dotreact doctor'} />
      <h3>Pronto para versionamento</h3>
      <p>O gerador não cria a pasta <code>.git</code> nem executa <code>git init</code>. Ele entrega somente os arquivos portáveis do repositório: <code>.gitignore</code>, <code>.gitattributes</code>, <code>.editorconfig</code>, <code>.dockerignore</code>, <code>.npmrc</code>, <code>.nvmrc</code>, <code>global.json</code>, regras MSBuild e um workflow GitHub Actions.</p>
      <p>Execute <code>npm install</code> e versione o <code>package-lock.json</code>. Contratos gerados em <code>src/contracts.ts</code>, <code>src/actions.ts</code> e <code>src/backend-manifest.json</code> também devem ser versionados: o CI usa esses arquivos para detectar drift entre C# e TypeScript.</p>
      <p>A extensão do VS Code inclui associação para <code>.drx</code>, check-on-save e CodeLens para loaders. Seu núcleo participa dos testes e gates do workspace.</p>
      <div className="warning"><strong>Publicação pendente</strong><span>A instalação por versões npm/NuGet é um gate externo, não uma capacidade disponível hoje.</span></div>
    </>
  },
  {
    id: "first-project", group: "Começar", title: "Primeiro projeto guiado",
    summary: "Crie, rode, altere uma prop C# e confirme SSR mais hydration.",
    tags: ["tutorial", "starter", "Fast Refresh"],
    body: <>
      <h2>Do scaffold ao primeiro dado C#</h2>
      <CliLab />
      <Steps>
        <Step title="Abra a aplicação"><p>Acesse <code>http://127.0.0.1:5080</code>. O texto inicial já deve existir no HTML retornado pelo servidor.</p></Step>
        <Step title="Mude o loader"><p>Edite <code>app/page.server.cs</code>. O Hot Reload incrementa a revisão do backend e o router busca props SSR novas pela mesma origem.</p></Step>
        <Step title="Mude a view"><p>Edite <code>app/page.drx</code>. Vite aplica Fast Refresh preservando estado React compatível.</p></Step>
        <Step title="Valide os contratos"><CodeBlock label="Terminal" code={'npm exec -- dotreact sync\nnpm exec -- dotreact check'} /></Step>
        <Step title="Teste produção"><p><code>npm exec -- dotreact build</code> gera client e SSR separados. <code>npm exec -- dotreact start</code> publica o host e inicia o renderer privado supervisionado.</p></Step>
      </Steps>
    </>
  },
  {
    id: "configuration", group: "Começar", title: "Configuração do host",
    summary: "Use a fachada de hosting e mantenha somente extensões da aplicação no Program.cs.",
    tags: ["Program.cs", "DI", "middleware"],
    body: <>
      <h2>Composition root enxuto</h2>
      <p>O host ASP.NET é a única porta pública, mas a infraestrutura repetitiva pertence ao framework. <code>DotReact.Hosting</code> aplica discovery, renderer, Redis opcional, imagens, CSP, rate limiting, observabilidade, health checks e defaults de produção. O projeto mantém um ponto explícito para adicionar seus serviços, autenticação e middleware.</p>
      <CodeBlock label="Server/Program.cs" code={hostSetup} />
      <h3>Desenvolvimento versus produção</h3>
      <p>A fachada seleciona automaticamente Vite e React Refresh em desenvolvimento. Em produção, supervisiona o renderer Node privado, usa os bundles compilados, ativa controles de produção e mantém o processo em loopback. Configuração avançada continua disponível por <code>AddDotReactApplication(options =&gt; ...)</code>, sem copiar o bootstrap interno.</p>
      <div className="callout"><strong>Configuração validada no startup</strong><span>URL, timeout, root element e token obrigatório falham cedo quando inválidos.</span></div>
    </>
  },
  {
    id: "pages-loaders", group: "Pages", title: "Loaders e page.drx",
    summary: "Carregue props no C# e renderize uma view React tipada.",
    tags: ["IDotReactPage", "props", "CancellationToken"],
    body: <>
      <h2>Uma rota, um diretório</h2>
      <p><code>page.server.cs</code> lê rota e request, chama um caso de uso e devolve props serializáveis. <code>page.drx</code> renderiza as mesmas props no SSR e na hidratação. Regras de negócio permanecem na Application/Domain.</p>
      <PairedCode csharp={pageLoader} react={pageView} csharpLabel="app/products/[id]/page.server.cs" reactLabel="app/products/[id]/page.drx" />
      <p>O source generator deriva módulo e URL do diretório; não há string de rota duplicada. Use <code>[DotReactPage]</code> somente quando uma constraint ASP.NET explícita for necessária.</p>
      <h3>Escolha do contrato</h3>
      <p>Use <code>IDotReactPage&lt;TProps&gt;</code> quando sempre houver uma página 200. Use <code>IDotReactResultPage&lt;TProps&gt;</code> quando o loader puder responder com page, redirect ou not-found.</p>
      <p>Propague sempre o <code>CancellationToken</code>. O runtime aplica timeout ao carregamento e ao renderer e interrompe trabalho quando o cliente desconecta.</p>
      <h3>CSS modular sem flash</h3>
      <p>Importe o CSS no <code>page.drx</code>, layout ou componente proprietário. No SSR de desenvolvimento, o plugin percorre os imports estáticos da rota e dos layouts e o ASP.NET inclui uma folha bloqueante no <code>&lt;head&gt;</code> antes de enviar o corpo. Em produção, Vite extrai o bundle CSS. Assim a origem continua modular sem exibir HTML sem estilo.</p>
      <CodeBlock label="app/catalog/_components/ProductPanel.tsx" code={'import "./product-panel.css";\n\nexport function ProductPanel() {\n  return <section className="product-panel" />;\n}'} />
      <div className="callout"><strong>O que permanece global</strong><span>Use <code>src/styles.css</code> somente para reset, tokens, fontes e defaults do documento. Não injete tags <code>&lt;style&gt;</code> depois da hidratação para reparar o primeiro paint.</span></div>
    </>
  },
  {
    id: "rendering-model", group: "Fundamentos", title: "Server, universal e client-only",
    summary: "Saiba exatamente onde cada código executa e escolha o menor runtime necessário.",
    tags: ["server", "client", "Model", "casos de uso"],
    body: <>
      <h2>Três responsabilidades, sem mágica ambígua</h2>
      <ReferenceTable valueHeading="Executa em" rows={[
        { name: "Loader/action C#", defaultValue: "ASP.NET Core", description: "Banco, secrets, autorização, policies, validação e efeitos. Nunca vai ao browser." },
        { name: "page.drx / layout.drx", defaultValue: "SSR + browser", description: "Componente universal: produz HTML no servidor e hidrata a mesma árvore no cliente." },
        { name: "DotReactClientOnly", defaultValue: "browser após hydration", description: "APIs como window, geolocation, canvas ou widgets que não têm representação SSR." },
        { name: "*.server.ts", defaultValue: "bundle SSR", description: "Módulo auxiliar exclusivo do entry/renderer; o build falha se ele entrar no bundle do navegador." }
      ]} />
      <h3>Interpolação C# → React</h3>
      <CodeBlock label="app/products/[id]/page.drx" code={'import type { ProductPageProps } from "../../../src/contracts";\nimport { definePage } from "@rafagouveia/dotreact-client/router";\n\nexport default definePage<ProductPageProps>(function Page(Model) {\n  return <h1>{Model.name} · #{Model.id}</h1>;\n});'} />
      <p><code>Model</code> é uma prop TypeScript gerada do record C#. Essa é a interpolação segura: serialização explícita, nullability e drift check. C# arbitrário dentro do JSX não é interpretado.</p>
      <h3>Escolha prática</h3>
      <ul className="feature-list">
        <li>Leia banco ou secret no loader C# e envie somente o DTO necessário.</li>
        <li>Renderize conteúdo indexável diretamente no DRX universal.</li>
        <li>Use estado e eventos React normalmente após hydration.</li>
        <li>Use <code>DotReactClientOnly</code> apenas para uma ilha realmente dependente do navegador.</li>
        <li><code>"use server"</code> não cria backend JavaScript: a operação remota é uma Server Action C# tipada.</li>
      </ul>
    </>
  },
  {
    id: "fonts-assets", group: "Fundamentos", title: "Fontes e arquivos públicos",
    summary: "Use public/ como origem única e gere preload e CSS de fontes locais no framework.",
    tags: ["@rafagouveia/dotreact-font", "public", "preload", "CLS"],
    body: <>
      <h2>Uma pasta pública, uma configuração de fonte</h2>
      <p>Coloque os assets administrados pelo App Router — favicon, imagens e fontes — em <code>public/</code>. No desenvolvimento, o host serve essa pasta; no build, o Vite a copia para o artefato publicado. <code>Server/wwwroot</code> continua disponível quando a aplicação opta conscientemente por um pipeline estático ASP.NET separado.</p>
      <CodeBlock label="app/fonts.ts" code={'import { localFont } from "@rafagouveia/dotreact-font";\n\nexport const satoshi = localFont({\n  family: "Satoshi",\n  variable: "--font-sans",\n  display: "swap",\n  src: [\n    { path: "/fonts/Satoshi-Regular.woff2", weight: 400 },\n    { path: "/fonts/Satoshi-Bold.woff2", weight: 700, preload: false }\n  ]\n});'} />
      <CodeBlock label="vite.config.ts + CSS" code={'import { satoshi } from "./app/fonts";\n\ndotReact({ pagesDir: "app", fonts: [satoshi] });\n\n/* src/styles.css */\n:root { font-family: var(--font-sans); }'} />
      <p>O plugin valida URLs locais, gera <code>@font-face</code>, inclui a folha bloqueante no SSR e preloads somente as faces críticas. Use <code>preload: false</code> nos pesos que não aparecem acima da dobra.</p>
      <div className="callout"><strong>Escopo atual</strong><span>Fontes locais são estáveis. Download e self-host automático de Google Fonts, cálculo automático de métricas de fallback e subset por caracteres continuam no roadmap.</span></div>
      <h3>Scripts de terceiros sem bloquear a página inteira</h3>
      <CodeBlock label="metadata da página" code={'import { script } from "@rafagouveia/dotreact-script";\n\nexport const metadata = {\n  scripts: [\n    script({ src: "/scripts/consent.js", strategy: "beforeInteractive" }),\n    script({\n      src: "https://cdn.example.com/analytics.js",\n      id: "analytics",\n      strategy: "lazyOnload",\n      integrity: "sha384-YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh"\n    })\n  ]\n};'} />
      <p><code>@rafagouveia/dotreact-script</code> aceita apenas arquivos externos locais ou HTTPS. O framework deduplica scripts, emite os críticos no SSR e agenda os demais após a hidratação ou o evento <code>load</code>.</p>
    </>
  },
  {
    id: "next-equivalents", group: "Migração do Next.js", title: "Comece por aqui",
    summary: "Traduza os conceitos do App Router para uma arquitetura cujo backend continua sendo C#.",
    tags: ["Next.js", "equivalências", "App Router", "guia de migração"],
    body: <>
      <h2>O mesmo problema, responsabilidades diferentes</h2>
      <p>DotReact adota a ergonomia que torna o Next produtivo — arquivo por rota, layouts, boundaries, navegação parcial, SSR, geração estática e actions — mas não replica o backend JavaScript. Tudo que acessa identidade, banco, secrets ou executa efeitos pertence ao ASP.NET Core.</p>
      <div className="callout"><strong>Regra de tradução</strong><span>Quando um recurso Next executaria no servidor, pergunte primeiro se ele é UI ou backend. UI server-side vai para o renderer React; dados, segurança e efeitos vão para loaders, actions, middleware ou endpoints C#.</span></div>
      <ReferenceTable valueHeading="Equivalente DotReact" rows={[
        { name: "app/**/page.tsx", defaultValue: "app/**/page.drx + page.server.cs", description: "A view é React universal; o loader C# co-localizado entrega props tipadas antes do SSR." },
        { name: "layout.tsx", defaultValue: "layout.drx", description: "Composição aninhada, estado preservado e acesso às pageProps do C#." },
        { name: "loading.tsx", defaultValue: "loading.drx", description: "Fallback durante navegação; Suspense também transmite fallback no SSR inicial." },
        { name: "not-found.tsx / error.tsx", defaultValue: "not-found.drx / error.drx", description: "Boundary mais próxima associada à árvore da rota." },
        { name: "generateMetadata", defaultValue: "export const metadata", description: "Objeto ou resolver tipado; somente title/meta/link estruturados são aceitos." },
        { name: "next/link + useRouter", defaultValue: "DotReactLink + useDotReactRouter", description: "Prefetch, History API, refresh, scroll e invalidação sem reload do documento." },
        { name: "Server Actions", defaultValue: "IDotReactAction<TReq,TRes>", description: "Action explicitamente exposta, gerada para TypeScript e protegida por auth/antiforgery." },
        { name: "Route Handlers", defaultValue: "Minimal APIs / Controllers", description: "Uploads, webhooks, APIs públicas e respostas não-UI usam ASP.NET Core normal." },
        { name: "middleware.ts", defaultValue: "ASP.NET middleware + endpoint metadata", description: "Autenticação, policies, rate limiting, tenancy e headers ficam no pipeline público." },
        { name: "generateStaticParams", defaultValue: "IDotReactStaticPathProvider<TPage>", description: "Produz rotas tipadas para o manifest e o export automático." },
        { name: "revalidate / ISR", defaultValue: "DotReactPrerender + Redis", description: "Fresh/stale windows, single-flight, tags e invalidação após actions." },
        { name: "next/image", defaultValue: "@rafagouveia/dotreact-image", description: "Componente acessível e endpoint ASP.NET endurecido com processor SkiaSharp substituível." },
        { name: "use client", defaultValue: "React universal por padrão", description: "Estado e eventos hidratam normalmente; DotReactClientOnly isola APIs exclusivas do browser." },
        { name: "React Server Components", defaultValue: "@rafagouveia/dotreact-rsc experimental", description: "Flight/PPR reais no laboratório versionado; não fazem parte da API DRX estável." }
      ]} />
      <h2>Como escolher o local de execução</h2>
      <div className="decision-grid">
        <article><span>01 · Backend</span><b>Tem secret, banco ou autorização?</b><p>Implemente no loader, Server Action, caso de uso ou endpoint ASP.NET. Nunca importe essa dependência em DRX.</p></article>
        <article><span>02 · Universal</span><b>Precisa aparecer no primeiro HTML?</b><p>Renderize em <code>page.drx</code> ou <code>layout.drx</code> usando props serializadas pelo C#.</p></article>
        <article><span>03 · Cliente</span><b>Depende de window ou interação?</b><p>Use hooks React normalmente. Para uma API impossível no SSR, envolva somente a ilha com <code>DotReactClientOnly</code>.</p></article>
      </div>
      <h2>Receitas rápidas</h2>
      <ReferenceTable valueHeading="Comece por" rows={[
        { name: "Dashboard autenticado", defaultValue: "[Authorize] + loader", description: "A policy protege o endpoint antes da consulta; o React recebe apenas o DTO permitido." },
        { name: "Formulário com mutação", defaultValue: "IDotReactAction", description: "Contrato gerado, antiforgery, validação, idempotência opcional e revalidation." },
        { name: "Landing page", defaultValue: "DotReactPrerender", description: "SSG/ISR público, metadata e imagem otimizada; sem dados personalizados." },
        { name: "Upload ou webhook", defaultValue: "Minimal API", description: "Endpoint explícito com limite, validação de mídia ou assinatura do corpo bruto." },
        { name: "Widget somente browser", defaultValue: "DotReactClientOnly", description: "Fallback SSR determinístico e ativação após hydration." }
      ]} />
      <h2>Ordem recomendada para migrar</h2>
      <Steps>
        <Step title="Inventarie as rotas"><p>Liste páginas, layouts, route groups, handlers, Proxy/Middleware, redirects, metadata e modos de cache. Marque quais módulos acessam banco, identidade, cookies ou secrets.</p></Step>
        <Step title="Mova a fronteira de backend"><p>Transforme leitura de dados em loaders C#, mutações em Server Actions C# e APIs/webhooks em Minimal APIs ou Controllers. Não porte código servidor Node para o renderer.</p></Step>
        <Step title="Converta a árvore visual"><p>Migre <code>page.tsx</code>, <code>layout.tsx</code> e boundaries para arquivos <code>.drx</code>. Troque dados importados no servidor por props geradas do contrato C#.</p></Step>
        <Step title="Reconstrua as garantias"><p>Aplique autenticação, policies, antiforgery, idempotência, cache e observabilidade no pipeline ASP.NET antes de validar navegação parcial e hydration.</p></Step>
        <Step title="Verifique cada rota"><p>Teste acesso direto com SSR, navegação pelo cliente, refresh, estados anônimo/autenticado, falha do renderer e invalidação depois de actions.</p></Step>
      </Steps>
      <div className="callout"><strong>Migração incremental</strong><span>Next.js e DotReact não compartilham o mesmo runtime público. Migre por rota ou domínio atrás de um gateway/reverse proxy e mantenha somente um framework responsável por cada URL durante a transição.</span></div>
    </>
  },
  {
    id: "next-middleware", group: "Migração do Next.js", title: "Middleware, Proxy e pipeline",
    summary: "Traduza proxy.ts ou middleware.ts para o pipeline explícito do ASP.NET Core.",
    tags: ["Next.js 16", "proxy.ts", "middleware", "ASP.NET Core"],
    body: <>
      <h2>Proxy no Next.js, pipeline no DotReact</h2>
      <p>No Next.js 16, o antigo <code>middleware.ts</code> passou a se chamar <code>proxy.ts</code>. Ele executa antes da conclusão da request e pode redirecionar, reescrever ou alterar headers. No DotReact essa responsabilidade não fica no renderer: ela usa o pipeline ASP.NET Core, que é a entrada pública e possui DI, autenticação, autorização, rate limiting e observabilidade.</p>
      <div className="callout"><strong>Escolha o mecanismo mais específico</strong><span>Use middleware para comportamento transversal, <code>UseWhen</code> para um ramo de paths, policy/endpoint metadata para autorização, endpoint filter para uma família de endpoints e Minimal API/Controller quando a request deve produzir uma resposta própria.</span></div>
      <ReferenceTable valueHeading="Use no DotReact" rows={[
        { name: "proxy.ts: headers", defaultValue: "ASP.NET middleware", description: "Headers de request/response, correlação, locale, tenant e regras transversais." },
        { name: "proxy.ts: matcher", defaultValue: "UseWhen / MapWhen", description: "Cria um ramo por path, host, método ou outra propriedade da request." },
        { name: "redirects / rewrites", defaultValue: "Redirect middleware / RewriteOptions", description: "Regras estáticas ou condicionais antes do roteamento DotReact." },
        { name: "auth otimista", defaultValue: "UseAuthentication + policy", description: "Identifique o usuário no pipeline e faça a autorização definitiva no loader/action." },
        { name: "rate limit", defaultValue: "AddRateLimiter + RequireRateLimiting", description: "Política global ou associada aos endpoints públicos." },
        { name: "NextResponse direta", defaultValue: "Minimal API / Controller", description: "JSON, arquivo, webhook, upload, callback e respostas HTTP que não são páginas." },
        { name: "instrumentation.ts", defaultValue: "OpenTelemetry + middleware", description: "Trace, métricas e logs correlacionados do host ao renderer." }
      ]} />
      <h2>Pipeline recomendado</h2>
      <CodeBlock label="Program.cs" code={`var app = builder.Build();

app.UseForwardedHeaders();          // somente proxies confiáveis
app.UseDotReactSecurityHeaders();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.UseWhen(
    context => context.Request.Path.StartsWithSegments("/workspace"),
    branch => branch.UseMiddleware<TenantContextMiddleware>());

app.MapApiEndpoints();              // webhooks, uploads e APIs
app.MapDotReactHealthChecks();
app.MapDotReactPages();
app.MapDotReactActions();
app.MapDotReactImages();
app.MapDotReactFallback();`} />
      <h3>Middleware com DI e resposta antecipada</h3>
      <CodeBlock label="TenantContextMiddleware.cs" code={`public sealed class TenantContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        ITenantResolver tenantResolver)
    {
        var tenant = await tenantResolver.ResolveAsync(
            context.Request.Host,
            context.RequestAborted);

        if (tenant is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        context.Items["Tenant"] = tenant;
        context.Response.Headers.Append("Vary", "Host");
        await next(context);
    }
}`} />
      <h3>Ordem e segurança</h3>
      <ul className="feature-list">
        <li><code>UseAuthentication()</code> vem antes de <code>UseAuthorization()</code>; ambos vêm antes dos endpoints DotReact.</li>
        <li>Um redirect baseado em cookie pode melhorar UX, mas não substitui a policy do loader e de cada action.</li>
        <li>Não faça consultas lentas universais em middleware. Resolva dados da página no loader e propague <code>RequestAborted</code>.</li>
        <li>Headers e cookies personalizados mudam a representação: marque a resposta privada e não a coloque em cache compartilhado.</li>
      </ul>
      <p>Referência de origem: <a href="https://nextjs.org/docs/app/getting-started/proxy" target="_blank" rel="noreferrer">Proxy no Next.js 16</a>. O nome antigo continua citado porque muitos projetos ainda possuem <code>middleware.ts</code>.</p>
    </>
  },
  {
    id: "next-feature-status", group: "Migração do Next.js", title: "Paridade e roadmap",
    summary: "Veja o que é estável, nativo do ASP.NET, experimental, planejado ou fora de escopo.",
    tags: ["matriz de suporte", "roadmap", "App Router", "migração"],
    body: <>
      <h2>Paridade não significa copiar o runtime</h2>
      <p>A meta é oferecer a mesma capacidade de produto quando ela combina com a arquitetura: React para UI e ASP.NET Core como autoridade. Um recurso pode ser equivalente sem ter o mesmo nome ou arquivo. A tabela abaixo evita prometer compatibilidade onde ainda não existe.</p>
      <h3>Suporte estável no framework</h3>
      <ReferenceTable valueHeading="Status" rows={[
        { name: "Pages, layouts e rotas dinâmicas", defaultValue: "Estável", description: "page.drx, layout.drx, parâmetros, catch-all e discovery validado." },
        { name: "loading, error e not-found", defaultValue: "Estável", description: "Boundaries pela árvore de rota, SSR e navegação parcial." },
        { name: "SSR, hydration, Suspense e streaming", defaultValue: "Estável", description: "HTML inicial, protocolo streaming, cancelamento e CSP nonce." },
        { name: "Link, prefetch e navegação client-side", defaultValue: "Estável", description: "History API, scroll, loading e preservação de layouts compatíveis." },
        { name: "Server Actions e contratos", defaultValue: "Estável", description: "C# tipado, antiforgery, auth, idempotência e revalidation." },
        { name: "SSG, ISR e export", defaultValue: "Estável", description: "Paths tipados, stale/fresh window e coordenação Redis opcional." },
        { name: "Metadata, imagens, fontes e scripts", defaultValue: "Estável", description: "Metadata estruturada, imagens, @rafagouveia/dotreact-font e @rafagouveia/dotreact-script com estratégias seguras." }
      ]} />
      <h3>Equivalente nativo do ASP.NET Core</h3>
      <ReferenceTable valueHeading="Implementação" rows={[
        { name: "Proxy / Middleware", defaultValue: "Pipeline ASP.NET", description: "Middleware, UseWhen, endpoint filters, policies e rewrites." },
        { name: "Route Handlers / API Routes", defaultValue: "Minimal APIs / Controllers", description: "Todos os métodos HTTP, uploads, webhooks, streaming e OpenAPI." },
        { name: "Cookies, headers e redirects", defaultValue: "HttpContext", description: "APIs HTTP do host público, com políticas e testes de integração." },
        { name: "Authentication e sessions", defaultValue: "ASP.NET Identity/auth handlers", description: "Cookies, JWT/OIDC, claims, policies e autorização por recurso." },
        { name: "Env e secrets", defaultValue: "IConfiguration + providers", description: "Ambiente, user secrets, containers e Azure Key Vault sem expor ao bundle." },
        { name: "Instrumentation", defaultValue: "OpenTelemetry", description: "Traces, métricas e logs do request, loader, renderer e cache." },
        { name: "Draft/preview mode", defaultValue: "Cookie + loader policy", description: "Cookie protegido altera a consulta e força resposta privada/dinâmica." }
      ]} />
      <h3>Experimental ou roadmap</h3>
      <ReferenceTable valueHeading="Status" rows={[
        { name: "React Server Components / Flight", defaultValue: "Experimental", description: "Pacote @rafagouveia/dotreact-rsc isolado; não integra a API DRX estável." },
        { name: "Partial Prerendering", defaultValue: "Experimental", description: "Shell estático e retomada de holes existem no laboratório RSC." },
        { name: "Parallel e Intercepting Routes", defaultValue: "Roadmap", description: "Ainda não há convenções @slot/(.) equivalentes no router estável." },
        { name: "MDX integrado ao roteamento", defaultValue: "Roadmap", description: "Hoje pode ser compilado pelo app, mas não existe plugin oficial DotReact." },
        { name: "Fontes remotas e ajuste métrico automático", defaultValue: "Roadmap", description: "Fontes locais já possuem CSS e preload; download remoto, subsets e métricas automáticas ainda não." },
        { name: "Cache de função estilo use cache", defaultValue: "Roadmap", description: "ISR e cache de página existem; memoização arbitrária continua responsabilidade da aplicação .NET." }
      ]} />
      <h3>Fora de escopo deliberadamente</h3>
      <div className="warning"><strong>Edge Runtime JavaScript</strong><span>DotReact mantém o backend público em ASP.NET Core. O renderer Node é privado e não vira um runtime de API na borda. Distribuição global deve usar CDN, Azure Front Door, containers ou infraestrutura .NET apropriada.</span></div>
      <h3>Como acompanhar uma lacuna</h3>
      <p>Uma lacuna entra como roadmap somente com caso de uso, contrato público proposto, impacto em segurança e plano de testes. Até isso existir, a documentação indica a composição manual suportada ou declara explicitamente que o recurso não existe.</p>
      <p>Referências de comparação: <a href="https://nextjs.org/docs/app/getting-started/project-structure" target="_blank" rel="noreferrer">estrutura do App Router</a>, <a href="https://nextjs.org/docs/app/getting-started/linking-and-navigating" target="_blank" rel="noreferrer">navegação e streaming</a> e <a href="https://nextjs.org/docs/app/getting-started/route-handlers" target="_blank" rel="noreferrer">Route Handlers</a>.</p>
    </>
  },
  {
    id: "layouts", group: "Pages", title: "Layouts aninhados",
    summary: "Componha shell visual da raiz ao diretório mais próximo.",
    tags: ["layout.drx", "children", "composição"],
    body: <>
      <h2>Convenção de diretórios</h2>
      <CodeBlock label="Árvore" code={'app/\n  layout.drx\n  page.drx\n  page.server.cs\n  (shop)/\n    products/\n      layout.drx\n      [id]/\n        page.drx\n        page.server.cs\n      _components/'} />
      <p>A página de produto é renderizada como <code>RootLayout → ProductsLayout → ProductPage</code>. O mesmo registry virtual é consumido no SSR e na hydration, evitando árvores diferentes.</p>
      <CodeBlock label="app/(shop)/products/layout.drx" code={'import { defineLayout, type DotReactLayoutProps } from "@rafagouveia/dotreact-client/router";\nimport type { ProductPageProps } from "../../../src/contracts";\n\nexport default defineLayout<ProductPageProps>(function ProductsLayout({ children, pageProps, url }: DotReactLayoutProps<ProductPageProps>) {\n  return <section className="catalog" data-route={url}>\n    <p>Catálogo carregado pelo C#: {pageProps.name}</p>\n    {children}\n  </section>;\n});'} />
      <div className="callout"><strong>Organização sem rota acidental</strong><span><code>(shop)</code> agrupa arquivos sem entrar na URL. Diretórios iniciados por <code>_</code> são privados; mesmo um <code>page.drx</code> dentro deles não vira endpoint.</span></div>
      <div className="callout"><strong>Dados do backend no shell</strong><span>Cada layout recebe <code>pageProps</code> — o mesmo DTO C# da página — e a URL atual. O checker calcula a união dos contratos das páginas descendentes; um layout específico pode usar <code>defineLayout&lt;TProps&gt;</code>, enquanto um layout raiz deve estreitar a união com type guards.</span></div>
    </>
  },
  {
    id: "boundaries-metadata", group: "Pages", title: "Boundaries e metadata",
    summary: "Renderize 404/erro próximos e gere head estruturado sem HTML arbitrário.",
    tags: ["not-found.drx", "error.drx", "metadata"],
    body: <>
      <h2>Boundary mais próximo</h2>
      <p>DotReact já fornece fallbacks seguros de loading, 404 e erro no core. <code>not-found.drx</code>, <code>error.drx</code> e <code>loading.drx</code> são opcionais: quando criados, sobrescrevem somente o fallback correspondente na árvore da rota. <code>app/global-error.drx</code> personaliza falhas fatais em produção, sem substituir o overlay técnico do framework em desenvolvimento.</p>
      <CodeBlock label="app/not-found.drx" code={'interface BoundaryProps {\n  statusCode: number;\n  requestId: string;\n  message?: string;\n}\n\nexport default function NotFound(props: BoundaryProps) {\n  return <main><h1>Não encontrado</h1><p>{props.message}</p></main>;\n}'} />
      <h3>Metadata estruturada</h3>
      <p>Uma page ou boundary pode exportar <code>metadata</code> como objeto ou função das props. O runtime aceita title, description, noIndex e links estruturados; não aceita HTML arbitrário no head.</p>
      <CodeBlock label="page.drx" code={'export const metadata: DotReactMetadataResolver<ProductProps> = props => ({\n  title: `${props.name} · Loja`,\n  description: `Produto ${props.id}`,\n  noIndex: !props.published,\n  links: [{ rel: "canonical", href: `/products/${props.id}` }]\n});'} />
    </>
  },
  {
    id: "routing", group: "Pages", title: "Routing por arquivo e manual",
    summary: "Use convenção canônica ou padrões ASP.NET explícitos com constraints.",
    tags: ["[id]", "catch-all", "MapDotReactPage"],
    body: <>
      <h2>Convenção compartilhada</h2>
      <RouteLab />
      <ReferenceTable valueHeading="Rota" rows={[
        { name: "page", defaultValue: "/", description: "Página raiz." },
        { name: "products/[id]/page", defaultValue: "/products/{id}", description: "Parâmetro simples convertido por DotReactPageContext." },
        { name: "docs/[...slug]/page", defaultValue: "/docs/{**slug}", description: "Catch-all ASP.NET." },
        { name: "(shop)/products/page", defaultValue: "/products", description: "Route group organiza arquivos sem entrar na URL." }
      ]} />
      <h3>Route values e query string tipados</h3>
      <p><code>GetRouteValue&lt;T&gt;</code> converte parâmetros da rota. Para query string, <code>GetQueryValue&lt;T&gt;</code> trata escalares e <code>GetQueryValues&lt;T&gt;</code> trata chaves repetidas, sempre com parsing invariável para nullable value types, enums, Guid, bool e números.</p>
      <CodeBlock label="C# loader" code={'var id = context.GetRouteValue<int>("id");\nvar page = context.GetQueryValue<int?>("page") ?? 1;\nvar sort = context.GetQueryValue<SortOrder?>("sort");\nvar tags = context.GetQueryValues<string>("tag", maxValues: 20); // ?tag=a&tag=b'} />
      <p>Uma chave escalar ausente retorna <code>null</code> quando <code>T</code> é nullable; em um tipo obrigatório, a ausência é inválida. A coleção ausente é vazia, preserva ordem e possui limite configurável de cardinalidade. Valores malformados geram <code>BadHttpRequestException</code>, e múltiplos valores continuam rejeitados no método escalar.</p>
      <h3>Constraints e registro manual</h3>
      <p>Use o atributo de dois argumentos quando precisar de constraints ASP.NET:</p>
      <CodeBlock label="C#" code={'[DotReactPage("/products/{id:int}", "products/[id]/page")]'} />
      <p><code>MapDotReactPage(pattern, moduleId, loader)</code> continua suportado para migrações e integrações existentes. Os exemplos oficiais e novos projetos usam discovery por assembly e a convenção <code>page.drx</code>.</p>
      <CodeBlock label="Program.cs" code={'app.MapDotReactPage("/reports/{year:int}", "reports/page",\n  async (context, cancellationToken) =>\n      await reportLoader.LoadAsync(context, cancellationToken));'} />
      <h3>Autorização de páginas</h3>
      <p>Nos loaders descobertos, <code>[Authorize]</code>, policies, roles e <code>[AllowAnonymous]</code> são propagados para o endpoint SSR. Páginas são anônimas por padrão; marque o loader quando a rota exigir autenticação. A autorização sempre acontece no servidor antes de carregar props.</p>
    </>
  },
  {
    id: "navigation-streaming", group: "Pages", title: "Router, loading e streaming",
    summary: "Navegação client-side preserva layouts; o documento inicial usa streaming SSR v2.",
    tags: ["DotReactLink", "prefetch", "Suspense", "loading.drx"],
    body: <>
      <h2>Fluxo semelhante ao App Router</h2>
      <p><code>DotReactLink</code> mantém um link nativo e acessível, faz prefetch por intenção após breve hover ou foco, busca somente props C# no media type privado e troca a rota com History API. <code>prefetch="viewport"</code> é opt-in; assim uma sidebar extensa não dispara dezenas de requests. Payloads usam cache LRU limitado com TTL informado pelo servidor. Layouts compartilhados mantêm identidade e estado; back/forward, scroll, refresh e invalidação de Server Actions fazem parte do router.</p>
      <p>Em desenvolvimento, <code>X-DotReact-Render-Mode</code> diferencia <code>streaming-ssr</code>, <code>ssr</code>, <code>client-navigation</code> e resoluções de prerender no DevTools. O header é omitido em produção.</p>
      <CodeBlock label="page.drx" code={'<DotReactLink href="/products/42">Produto 42</DotReactLink>\n\n// app/products/loading.drx\nexport default function Loading() {\n  return <p aria-busy="true">Carregando catálogo…</p>;\n}'} />
      <h3>Streaming e Suspense reais</h3>
      <p>O caminho padrão usa SSR bufferizado, com menos frames e alocações. Adicione <code>[DotReactStreaming]</code> ao loader de uma página com uma boundary Suspense relevante; com <code>EnableStreaming = true</code>, ASP.NET usa então o protocolo JSONL v2 e <code>ResponseHeadersRead</code>. O entry React usa <code>renderToPipeableStream</code>: shell e fallback chegam antes da boundary assíncrona. Backpressure, cancelamento, ordem, tamanho, correlação e erros antes/depois do shell são validados nos dois processos.</p>
      <CodeBlock label="page.server.cs" code={'[DotReactStreaming]\npublic sealed class ReportsPage : IDotReactPage<ReportsProps>\n{\n    // carregue somente os props iniciais; a boundary React pode continuar depois\n}'} />
      <p>Scripts de continuação recebem um nonce por requisição; a CSP de produção continua sem <code>unsafe-inline</code>. O exemplo <code>/streaming</code> e o E2E provam que o fallback chega antes do conteúdo atrasado.</p>
    </>
  },
  {
    id: "auth-guards", group: "Full-stack", title: "Autenticação e rotas protegidas",
    summary: "Implemente auth guard, policies, roles e autorização por recurso no pipeline ASP.NET.",
    tags: ["auth guard", "Authorize", "policies", "cookies", "401/403"],
    body: <>
      <h2>O guard verdadeiro fica no servidor</h2>
      <p>Esconder um botão ou redirecionar em um hook React melhora a experiência, mas não protege dados. A proteção efetiva é metadata de autorização no endpoint ASP.NET: ela executa antes do loader, antes do acesso ao banco e antes do renderer receber qualquer prop.</p>
      <div className="guard-flow">
        <span><i>1</i><b>Request</b><small>cookie ou bearer token</small></span>
        <em>→</em>
        <span><i>2</i><b>Authentication</b><small>constrói ClaimsPrincipal</small></span>
        <em>→</em>
        <span><i>3</i><b>Policy</b><small>usuário, role, claim ou recurso</small></span>
        <em>→</em>
        <span><i>4</i><b>Loader/action</b><small>executa somente se permitido</small></span>
      </div>
      <h2>1. Configure authentication e authorization</h2>
      <p>Use qualquer handler oficial do ASP.NET Core: cookie, JWT bearer, Microsoft Identity ou o provedor corporativo da aplicação. O exemplo abaixo mostra cookie. Em produção, <code>Secure</code> pressupõe HTTPS.</p>
      <CodeBlock label="Server/Program.cs" code={authSetup} />
      <div className="warning"><strong>A ordem importa</strong><span><code>UseAuthentication()</code> vem antes de <code>UseAuthorization()</code>; ambos vêm antes de <code>MapDotReactPages()</code> e <code>MapDotReactActions()</code>. Em Azure, termine HTTPS no ingress e configure forwarded headers somente para proxies confiáveis.</span></div>
      <h2>2. Proteja a página no loader</h2>
      <PairedCode csharp={protectedPage} react={protectedView} csharpLabel="app/admin/catalog/page.server.cs" reactLabel="app/admin/catalog/page.drx" />
      <p>Durante uma navegação parcial, se o handler de cookie redirecionar para login e responder HTML, o router reconhece que não recebeu o media type DotReact e promove a operação para uma navegação completa. Assim, a página de login continua sendo responsabilidade normal do host.</p>
      <h2>3. Proteja cada mutação</h2>
      <p>Server Actions são endpoints públicos do ponto de vista de segurança. No DotReact elas exigem usuário autenticado por padrão. Use <code>[Authorize(Policy = "catalog.manage")]</code> para uma policy específica; use <code>[AllowAnonymous]</code> somente quando a operação foi desenhada e revisada como pública.</p>
      <CodeBlock label="C# action" code={'[Authorize(Policy = "catalog.manage")]\n[DotReactAction("catalog/publish")]\npublic sealed class PublishCatalogAction :\n    IDotReactAction<PublishRequest, PublishResponse>\n{\n    // O runtime valida auth + antiforgery antes de ExecuteAsync.\n}'} />
      <h3>Autorização por registro</h3>
      <p>Quando a decisão depende do proprietário ou estado de um registro, combine <code>[DotReactAuthorizeResource]</code> com <code>IDotReactActionResourceProvider&lt;TRequest&gt;</code>. O runtime faz binding, carrega o recurso e chama <code>IAuthorizationService</code>; recurso inexistente retorna 404 e policy negada retorna 403.</p>
      <h2>O que fazer no React</h2>
      <ReferenceTable valueHeading="Responsabilidade" rows={[
        { name: "Mostrar/ocultar controles", defaultValue: "UX", description: "Envie flags como canEdit no DTO para evitar ações que certamente serão negadas." },
        { name: "Bloquear acesso a dados", defaultValue: "C#", description: "Use [Authorize], policy ou autorização por recurso. Nunca confie na flag enviada ao browser." },
        { name: "Expiração de sessão", defaultValue: "ASP.NET + router", description: "401/redirect causa login ou navegação de documento; não mantenha token sensível em localStorage." },
        { name: "Tenant atual", defaultValue: "Middleware/claims", description: "Resolva e valide tenant no servidor antes de montar cache keys ou consultas." },
        { name: "Cache de página privada", defaultValue: "private/no-store", description: "Não use DotReactPrerender nem cache compartilhado para conteúdo personalizado." }
      ]} />
      <div className="callout"><strong>Checklist do auth guard</strong><span>Handler registrado, middleware na ordem correta, policy no loader e em cada action, antiforgery mantido, cache privado, teste anônimo 401/redirect e teste autenticado 200.</span></div>
    </>
  },
  {
    id: "server-actions", group: "Full-stack", title: "Server Actions",
    summary: "Mutações C# tipadas com auth, antiforgery, resultados e progressive forms.",
    tags: ["actions", "Problem Details", "antiforgery"],
    body: <>
      <h2>Exposição explícita</h2>
      <p>Somente classes marcadas com <code>[DotReactAction]</code> são descobertas. A action é um adapter fino que traduz request, invoca um caso de uso e mapeia o resultado.</p>
      <PairedCode csharp={actionClass} react={actionClient} csharpLabel="app/orders/_actions/CreateOrderAction.server.cs" reactLabel="app/orders/page.drx" />
      <h3>Segurança padrão</h3>
      <div className="cards">
        <article><b>Autorização</b><span>Sem atributo, a action exige usuário autorizado. <code>[AllowAnonymous]</code> é explícito.</span></article>
        <article><b>Antiforgery</b><span>O client adquire o token no primeiro POST; formulário sem JS renderiza token explícito.</span></article>
        <article><b>Binding</b><span>JSON e form fields simples são aceitos; uploads exigem endpoint dedicado.</span></article>
      </div>
      <p>SSR e navegação não criam cookie antiforgery antecipadamente. Na primeira mutação, o client chama <code>/_dotreact/csrf</code>, mantém o token em memória e o envia em <code>X-DotReact-CSRF</code>. Páginas somente leitura evitam criptografia e bytes de cookie; a validação same-origin permanece obrigatória.</p>
      <h3>Policies e recurso de domínio</h3>
      <p><code>[Authorize(Policy = "orders.write")]</code> aplica policies normais no endpoint. Quando a decisão depende do registro carregado, use <code>[DotReactAuthorizeResource]</code> e implemente <code>IDotReactActionResourceProvider&lt;TRequest&gt;</code>. O runtime faz binding, carrega o recurso e chama <code>IAuthorizationService</code> antes da action; recurso ausente retorna 404 e policy negada retorna 403.</p>
      <CodeBlock label="C#" code={'[DotReactAction("orders/update")]\n[DotReactAuthorizeResource("orders.owner")]\npublic sealed class UpdateOrderAction :\n  IDotReactAction<UpdateOrderRequest, OrderDto>,\n  IDotReactActionResourceProvider<UpdateOrderRequest>\n{\n  public ValueTask<object?> LoadAuthorizationResourceAsync(\n    UpdateOrderRequest request, CancellationToken ct) => LoadOrder(request.Id, ct);\n  // ExecuteAsync roda somente depois da autorização do recurso.\n}'} />
      <h3>Resultados HTTP</h3>
      <p><code>Success</code>, <code>Validation</code>, <code>NotFound</code> e <code>Conflict</code> tornam-se 200, 400, 404 e 409. Falhas usam Problem Details e o cliente lança <code>DotReactActionError</code>.</p>
    </>
  },
  {
    id: "actions-reliability", group: "Full-stack", title: "Idempotência e revalidation",
    summary: "Controle retries, replay local e sinais de dados obsoletos.",
    tags: ["Idempotency-Key", "replay", "revalidation"],
    body: <>
      <h2>Retry explícito</h2>
      <p><code>[DotReactIdempotent]</code> exige um <code>Idempotency-Key</code> imprimível e limitado. O store padrão é process-local, limitado e coalesce chamadas concorrentes com o mesmo caller, action, chave e payload.</p>
      <CodeBlock label="C#" code={'[DotReactIdempotent(600)]\n[DotReactAction("payments/confirm")]\npublic sealed class ConfirmPaymentAction : IDotReactAction<ConfirmRequest, ConfirmResponse> { /* ... */ }'} />
      <CodeBlock label="TypeScript" code={'await paymentsConfirm(input, {\n  idempotencyKey: operationId,\n  onRevalidate: paths => refreshLocalData(paths)\n});'} />
      <div className="warning"><strong>Multi-réplica</strong><span>Defina <code>DOTREACT_REDIS_CONNECTION</code> ou registre <code>AddDotReactRedis</code>. O plugin usa lease renovável e commit Lua atômico para coordenar replay entre instâncias; sem Redis, o default continua process-local.</span></div>
      <CodeBlock label="Program.cs" code={'var redis = ConfigurationOptions.Parse(connectionString);\nservices.AddDotReactRedis(redis); // ISR + tags + idempotência compartilhados'} />
      <h3>Cache distribuído automático</h3>
      <p>Páginas anônimas com <code>[DotReactCache(60, Tags = ["catalog"])]</code> armazenam somente o resultado serializado do loader; HTML, usuário e token antiforgery nunca são compartilhados. <code>AddDotReactApplication()</code> configura memória distribuída para uma única instância e troca automaticamente para Redis quando <code>DOTREACT_REDIS_CONNECTION</code> existe, reutilizando um único multiplexer por processo.</p>
      <CodeBlock label="Configuração de produção" code={'# uma instância: nenhuma dependência externa\n# múltiplas réplicas: cache, invalidação, sessões e idempotência compartilhados\nDOTREACT_REDIS_CONNECTION=<connection-string>\nDOTREACT_REDIS_KEY_PREFIX=orders:production'} />
      <CodeBlock label="Action com invalidação seletiva" code={'return DotReactActionResult<ProductDto>.Success(\n  product,\n  revalidatePaths: ["/products", $"/products/{product.Id}"],\n  revalidateTags: ["catalog"]);'} />
      <p>Em uma action bem-sucedida, paths e tags são invalidados automaticamente antes da resposta. A invalidação do cache de props gira tokens versionados sem enumerar chaves Redis; entradas antigas ficam inacessíveis imediatamente e somem pelo TTL. O header e o callback cliente continuam usando paths para atualizar a UI local.</p>
    </>
  },
  {
    id: "static-images", group: "Full-stack", title: "SSG, ISR e imagens",
    summary: "Gere HTML build-scoped, regenere com SWR e sirva imagens raster otimizadas.",
    tags: ["DotReactPrerender", "ISR", "export", "Image"],
    body: <>
      <h2>Static generation e ISR no backend C#</h2>
      <CodeBlock label="app/products/[id]/page.server.cs" code={'[DotReactPrerender(60, StaleWhileRevalidateSeconds = 300, Tags = ["products"])]\npublic sealed class ProductPage : IDotReactResultPage<ProductPageProps> { /* loader */ }\n\npublic sealed class ProductPaths : IDotReactStaticPathProvider<ProductPage> {\n  public async IAsyncEnumerable<DotReactStaticPath> GetPathsAsync(CancellationToken token) {\n    yield return new(new Dictionary<string,string> { ["id"] = "1" }, ["products"]);\n  }\n}'} />
      <p>O store é isolado por <code>PrerenderBuildId</code>, limitado por bytes/entradas e substituível por uma implementação distribuída. Cold miss usa single-flight; conteúdo vencido pode ser servido enquanto uma regeneração segura ocorre ao fundo; falha conserva o último artefato válido. Server Actions invalidam paths e tags do cache de props e do ISR.</p>
      <p>Artefatos Redis finitos expiram após a janela stale mais a retenção de recuperação. Artefatos estáticos também recebem retenção máxima — 30 dias por padrão — e podem ser regenerados, impedindo que builds abandonados consumam armazenamento indefinidamente.</p>
      <p>Artefatos persistidos nunca contêm cookie, token CSRF ou estado de usuário. Quando uma página estática executa sua primeira Server Action, o client adquire um token antiforgery por <code>/_dotreact/csrf</code> e o reutiliza.</p>
      <p><code>/_dotreact/prerender-manifest</code> expande os providers tipados, limita a cardinalidade e rejeita paths duplicados/incompletos. Hits fresh pulam o loader C#; o HTML usa request ID determinístico e não emite cookie antiforgery.</p>
      <CodeBlock label="Export estático" code={'# descobre as rotas no manifest C#\nnpm exec -- dotreact export --url http://127.0.0.1:5080 --out dist/static\n\n# --routes continua disponível como override explícito\nnpm exec -- dotreact export --routes /,/products/1'} />
      <h3>Image component + processor real</h3>
      <PairedCode csharp={'// AddDotReactApplication usa public/ por convenção.\n// Configure apenas origens remotas adicionais quando necessário.\nbuilder.AddDotReactApplication(options => { /* extensões */ });'} react={'import { Image } from "@rafagouveia/dotreact-image";\n\n<Image src="/images/product.jpg" width={640} height={480}\n  quality={75} alt="Produto" />'} csharpLabel="Program.cs" reactLabel="page.drx" />
      <p>O plugin SkiaSharp separado faz resize e encode JPEG/PNG/WebP em Windows/Linux. O endpoint limita origem, bytes, pixels, width e quality, bloqueia SSRF/traversal e responde ETag/cache. O core continua aceitando outro <code>IDotReactImageProcessor</code>.</p>
    </>
  },
  {
    id: "contracts", group: "Full-stack", title: "TypeGen e contratos",
    summary: "Gere props e action clients determinísticos a partir do assembly C#.",
    tags: ["TypeGen", "manifest", "drift"],
    body: <>
      <h2>Uma fonte de verdade</h2>
      <p>TypeGen carrega o assembly compilado, descobre páginas/actions e produz três artefatos consumidos pelo frontend.</p>
      <ReferenceTable valueHeading="Origem" rows={[
        { name: "src/contracts.ts", defaultValue: "Tipos C#", description: "Interfaces, enums, nullability, coleções e tipos fechados." },
        { name: "src/actions.ts", defaultValue: "Actions descobertas", description: "Clientes createServerAction tipados." },
        { name: "src/backend-manifest.json", defaultValue: "Pages/actions", description: "Module IDs, patterns e tipos usados pelo checker Vite." }
      ]} />
      <CodeBlock label="package.json" code={'"generate": "dotnet build Server/Server.csproj -c Release && dotnet run --project .../DotReact.TypeGen.csproj -- Server/bin/Release/net10.0/Server.dll src/contracts.ts --discover --manifest src/backend-manifest.json --actions src/actions.ts",\n"check:contracts": "... mesmos argumentos ... --check"'} />
      <h3>Precisão e limites</h3>
      <p><code>DateTime</code>, <code>DateTimeOffset</code> e <code>Guid</code> viram string. <code>long</code>, <code>ulong</code> e <code>decimal</code> só viram strings quando o contrato JSON C# declara <code>JsonNumberHandling.WriteAsString</code>; números inseguros falham em vez de perder precisão.</p>
      <p>Hierarquias fechadas declaradas com <code>JsonPolymorphic</code> e <code>JsonDerivedType</code> viram unions TypeScript discriminadas e determinísticas, inclusive quando aparecem em propriedades ou coleções. Discriminadores ausentes, duplicados ou ambíguos falham durante a geração, antes de chegarem ao navegador.</p>
      <h3>Múltiplos assemblies</h3>
      <CodeBlock label="Program.cs + TypeGen" code={'builder.AddDotReactApplication(options =>\n    options.FeatureAssemblies.Add(typeof(CatalogFeature).Assembly));\n\n# repita --assembly para cada DLL adicional\ndotreact-typegen Server.dll src/contracts.ts --assembly Catalog.dll --discover'} />
      <p>Runtime e TypeGen agregam os assemblies, ordenam o resultado e rejeitam colisões globais de route pattern, module ID, action ID e nome de export TypeScript.</p>
    </>
  },
  {
    id: "cli", group: "Ferramentas", title: "Referência da CLI",
    summary: "Templates, generators, checks, análise e lifecycle de produção.",
    tags: ["dotreact", "generators", "benchmark"],
    body: <>
      <h2>Comandos implementados</h2>
      <ReferenceTable valueHeading="Argumentos principais" rows={[
        { name: "create", defaultValue: "<name> --template starter|minimal", description: "Cria projeto vendorizado e transacional." },
        { name: "templates", description: "Lista starter e minimal." },
        { name: "generate page", defaultValue: "<route> [--dry-run]", description: "Cria page.drx e companion C# sem sobrescrever." },
        { name: "generate layout", defaultValue: "<route>", description: "Cria layout.drx." },
        { name: "generate boundary", defaultValue: "<route> --kind error|not-found|loading|global-error", description: "Cria um override opcional do fallback do core; global-error personaliza falhas fatais em produção." },
        { name: "generate component", defaultValue: "<PascalCaseName> [--route route]", description: "Cria UI privada em app/_components ou junto da rota." },
        { name: "generate action", defaultValue: "<PascalCaseName> [--route route]", description: "Cria adapter C# em app/**/_actions com autorização segura por padrão." },
        { name: "sync", description: "Executa o script npm generate." },
        { name: "check", description: "Executa drift check e typecheck." },
        { name: "dev / build / start", description: "O executor do framework coordena contratos, bundles client/SSR, Release ASP.NET, publish e runtime." },
        { name: "analyze", defaultValue: "--max-client-kb / --max-ssr-kb", description: "Mede bundle raw/gzip e aplica budgets." },
        { name: "benchmark", defaultValue: "[url] --compare baseline --json", description: "Mede TTFB, resposta completa, p50/p95/p99, throughput e budgets comparativos." },
        { name: "export", defaultValue: "[--routes] --url --out", description: "Descobre o prerender manifest C# ou usa override e materializa HTML portátil." },
        { name: "architecture", description: "Valida o contrato App Router e apresenta correções acionáveis." },
        { name: "security", defaultValue: "[--static-only]", description: "Procura sinks inseguros e, no modo completo, audita dependências npm e .NET." },
        { name: "health", description: "Executa doctor e o gate completo do projeto: contratos, testes, build, budgets e auditorias." },
        { name: "doctor", description: "Valida runtimes, zonas, scripts, assets públicos, Lighthouse, Docker e manifests Azure." },
        { name: "workspace", defaultValue: "focus|reveal|status", description: "Alterna entre a visão limpa da aplicação e a infraestrutura avançada." }
      ]} />
      <CodeBlock label="Terminal" code={'npm exec -- dotreact generate page catalog/[slug] --dry-run\nnpm exec -- dotreact generate page catalog/[slug]\nnpm exec -- dotreact generate component ProductCard --route catalog\nnpm exec -- dotreact generate action SaveProduct --route catalog\nnpm exec -- dotreact generate boundary catalog --kind loading\nnpm exec -- dotreact sync\nnpm exec -- dotreact architecture\nnpm exec -- dotreact check\nnpm exec -- dotreact security\nnpm exec -- dotreact build\nnpm exec -- dotreact analyze --max-client-kb 100 --max-ssr-kb 50\nnpm exec -- dotreact health\nnpm exec -- dotreact workspace focus'} />
      <p>Durante o pré-release, projetos gerados incluem <code>vendor/cli</code> como dependência local. Portanto <code>npm exec dotreact</code> funciona sem instalação global e sem depender do checkout original do framework.</p>
      <p><code>add</code> é alias de <code>generate</code>. Generators rejeitam traversal e colisões; não há flag de overwrite.</p>
    </>
  },
  {
    id: "vscode-extension", group: "Ferramentas", title: "Extensão do VS Code",
    summary: "Edite DRX, navegue para loaders C# e execute o checker oficial sem sair do editor.",
    tags: ["VS Code", "DRX", "diagnósticos"],
    body: <>
      <h2>A experiência oficial de edição</h2>
      <p>A extensão associa <code>.drx</code> ao serviço TypeScript React nativo do VS Code. Syntax highlight, autocomplete, formatação, navegação e ferramentas React continuam funcionando porque DRX é TSX comum; a extensão não mantém um segundo parser nem interpreta C# dentro da view.</p>
      <div className="cards">
        <article><b>Diagnósticos confiáveis</b><span>O mesmo checker semântico usado pelo build publica problemas diretamente no editor.</span></article>
        <article><b>Navegação entre runtimes</b><span>O CodeLens abre o <code>page.server.cs</code> associado à view sem procurar manualmente pelo backend.</span></article>
        <article><b>Execução controlada</b><span>Salvamentos repetidos são agrupados e existe no máximo um checker ativo por workspace.</span></article>
      </div>
      <h3>Instalar durante o pré-release</h3>
      <CodeBlock label="Terminal" code={'npm ci\nnpm run package:vsix -w dotreact-vscode\ncode --install-extension editors/vscode-dotreact/dotreact-vscode.vsix'} />
      <p>Quando a publicação no Marketplace estiver ativa, procure por <strong>DotReact — React SSR para .NET</strong> na aba Extensions. Atualizações passam a ser entregues pelo próprio VS Code; o VSIX manual continua disponível como artefato testado do workflow de release.</p>
      <h3>Comandos e configurações</h3>
      <ReferenceTable valueHeading="Finalidade" rows={[
        { name: "DotReact: Verificar projeto", description: "Executa a validação semântica de app/, contratos e manifest do backend." },
        { name: "DotReact: Abrir loader C#", description: "Abre primeiro o loader colocalizado e mantém fallback para registros explícitos." },
        { name: "DotReact: Exibir saída da validação", description: "Mostra duração, falhas do processo e detalhes que não cabem no painel Problems." },
        { name: "dotreact.checkOnSave", defaultValue: "true", description: "Valida depois de salvar um arquivo .drx." },
        { name: "dotreact.validation.debounceMs", defaultValue: "350", description: "Agrupa rajadas de salvamento entre 100 e 2000 ms." }
      ]} />
      <CodeBlock label="settings.json" code={'{\n  "dotreact.checkOnSave": true,\n  "dotreact.validation.debounceMs": 350\n}'} />
      <h3>Segurança e desempenho</h3>
      <p>A associação de linguagem permanece disponível em Restricted Mode, mas a extensão não executa o checker instalado pelo projeto enquanto o workspace não for confiável. Workspaces virtuais também não executam o toolchain local. O processo usa <code>execFile</code> sem shell, argumentos fechados, timeout e limite de saída.</p>
      <p>O checker é resolvido tanto de pacotes publicados em <code>@rafagouveia/dotreact-vite</code> quanto do runtime <code>vendor/vite</code> usado no preview. A validação é coalescida por workspace, preserva diagnósticos de outras raízes e evita varrer o backend quando o loader está junto da rota.</p>
      <div className="callout"><strong>Autoridade única</strong><span>O editor acelera o feedback, mas <code>dotreact check</code> e o build continuam sendo os gates oficiais. Desabilitar check-on-save não reduz a validação do CI.</span></div>
      <h3>Publicação e versionamento</h3>
      <p>Cada release executa teste unitário, inicia um Extension Host real, empacota o VSIX e publica exatamente o artefato testado por um ambiente GitHub protegido. Tags <code>vscode-v*</code> promovem versões estáveis; execuções manuais podem publicar um pré-release. GitHub OIDC e Microsoft Entra ID fornecem uma credencial curta ao job, sem PAT permanente ou secret dentro do pacote.</p>
    </>
  },
  {
    id: "options-env", group: "Referência", title: "Options e variáveis de ambiente",
    summary: "Consulte defaults do host, renderer, actions, segurança e runtime Node.",
    tags: ["DotReactOptions", "env", "limites"],
    body: <>
      <h2>DotReactOptions</h2>
      <ReferenceTable rows={[
        { name: "RendererUrl", defaultValue: "http://127.0.0.1:5178", description: "Base HTTP do sidecar." },
        { name: "RendererSocketPath", defaultValue: "automático por plataforma", description: "Named Pipe no Windows ou socket Unix em Linux/macOS, substituindo o TCP interno." },
        { name: "RendererFrameSocketPath", defaultValue: "automático no renderer gerenciado", description: "Canal separado, persistente e multiplexado para SSR bufferizado; não é exposto na rede." },
        { name: "RendererFrameConnectionCount", defaultValue: "1 no core; igual aos workers no facade", description: "Pool limitado de canais persistentes. Evita uma conexão por request e mantém o consumo previsível." },
        { name: "RendererFrameMaxInFlightPerConnection", defaultValue: "32", description: "Limita renders ativos por canal e impede concorrência interna sem controle." },
        { name: "RendererMaxQueuedRequests", defaultValue: "-1 (automático)", description: "Fila global de SSR bufferizado e streaming. O automático acompanha a capacidade ativa, limitado a 256; ao lotar, responde 503 sem reter memória indefinidamente." },
        { name: "RendererOverloadRetryAfter", defaultValue: "1 s", description: "Valor de Retry-After enviado quando o budget de SSR está saturado." },
        { name: "RendererToken", defaultValue: "null", description: "Bearer compartilhado; produção gerenciada gera credencial em memória." },
        { name: "RequireRendererToken", defaultValue: "false", description: "Quando true exige token de ao menos 32 caracteres." },
        { name: "Development", defaultValue: "false", description: "Habilita diagnósticos e integração Vite de desenvolvimento." },
        { name: "RequestTimeout", defaultValue: "10 s", description: "Timeout de loader mais renderer." },
        { name: "EnableStreaming", defaultValue: "false no core; true no facade", description: "Habilita a capacidade. Cada página ainda precisa optar com [DotReactStreaming]." },
        { name: "PrerenderBuildId", defaultValue: "development", description: "Identificador imutável que isola artefatos SSG/ISR por deployment." },
        { name: "MaxStaticPaths", defaultValue: "10000", description: "Limite fail-closed do prerender manifest por request." },
        { name: "MaxSerializedPropsBytes", defaultValue: "512 KiB", description: "Bloqueia props grandes antes de SSR, hydration e navegação parcial." },
        { name: "MaxCoalescedRenders", defaultValue: "2048", description: "Limite de renders idênticos em voo coordenados sem persistir HTML de usuário." },
        { name: "ClientScriptSrc", defaultValue: "/_dotreact/client.js", description: "Entry module de hydration." },
        { name: "ClientStyleSrc", defaultValue: "null", description: "Stylesheet global do client; o facade define o caminho do bundle ou do gateway Vite." },
        { name: "ClientRouteStyleSrc", defaultValue: "null", description: "Template da folha CSS bloqueante por rota; o facade configura automaticamente no desenvolvimento." },
        { name: "ReactRefreshPreambleSrc", defaultValue: "null", description: "Runtime React Refresh usado somente em dev." },
        { name: "DevelopmentRuntimeProbePath", defaultValue: "null", description: "Probe same-origin que recarrega props SSR após o host C# reiniciar." },
        { name: "RootElementId", defaultValue: "root", description: "Elemento que recebe SSR e hydrateRoot." }
      ]} />
      <div className="callout"><strong>Domínios e proxies em desenvolvimento</strong><span>O facade publica scripts, CSS, módulos e Fast Refresh em <code>/_dotreact/dev/</code> pelo próprio ASP.NET Core. A porta privada do Vite não aparece no HTML; Cloudflare Tunnel, HTTPS e reverse proxies usam sempre a mesma origem pública. Mantenha <code>DOTNET_WATCH_SUPPRESS_BROWSER_REFRESH=1</code>, pois a recarga C# já é coordenada pelo probe do DotReact.</span></div>
      <h3>DotReactNodeRendererOptions</h3>
      <ReferenceTable rows={[
        { name: "Port", defaultValue: "5178", description: "Porta loopback do renderer." },
        { name: "UseInterprocessSocket / SocketPath", defaultValue: "true", description: "Evita TCP entre ASP.NET e Node com Named Pipe no Windows ou socket Unix em Linux/macOS." },
        { name: "UseFramedTransport / FrameSocketPath", defaultValue: "true", description: "Multiplexa SSR bufferizado em um canal autenticado por worker. HTTP continua atendendo streaming, health e fallback." },
        { name: "StartupTimeout / ShutdownTimeout", defaultValue: "30 s / 10 s", description: "Readiness e drain supervisionado." },
        { name: "NodeMemoryMb", defaultValue: "384", description: "Heap máximo do V8." },
        { name: "WorkerCount", defaultValue: "CPUs disponíveis, máximo 4", description: "Pool isolado de renderers no mesmo loopback; escala SSR dinâmico sem expor o Node." },
        { name: "MaxConcurrencyPerWorker", defaultValue: "32", description: "Limite de renders React simultâneos por worker, compartilhado com o backpressure do host." },
        { name: "MaxRestarts", defaultValue: "3 em 5 min", description: "Limite de crash loop, com backoff inicial de 1 s." },
        { name: "PublicEnvironmentVariables", defaultValue: "vazio", description: "Allowlist explícita de valores não secretos. O renderer nunca herda o environment privado do host ASP.NET." }
      ]} />
      <h3>Renderer Node</h3>
      <ReferenceTable rows={[
        { name: "DOTREACT_RENDERER_PORT", defaultValue: "5178", description: "Porta privada." },
        { name: "DOTREACT_RENDERER_IPC", defaultValue: "true", description: "Permite desativar o transporte IPC nativo e voltar ao loopback autenticado para diagnóstico ou compatibilidade." },
        { name: "DOTREACT_RENDERER_SOCKET", defaultValue: "gerado pelo host", description: "Caminho interno passado somente ao processo Node supervisionado." },
        { name: "DOTREACT_RENDERER_FRAMED_PROTOCOL", defaultValue: "true", description: "Desative somente para diagnóstico ou renderer externo; retorna ao protocolo HTTP binário/JSON compatível." },
        { name: "DOTREACT_RENDERER_FRAME_SOCKET", defaultValue: "gerado pelo host", description: "Named Pipe ou socket Unix privado usado pelo canal multiplexado." },
        { name: "DOTREACT_RENDERER_HOST", defaultValue: "127.0.0.1", description: "Produção aceita somente loopback." },
        { name: "DOTREACT_RENDERER_TOKEN", description: "Obrigatório em produção, mínimo 32 caracteres." },
        { name: "DOTREACT_RENDERER_WORKERS", defaultValue: "CPUs disponíveis, máximo 4", description: "Override entre 1 e 32 workers para ajustar CPU e memória do host." },
        { name: "DOTREACT_MAX_RENDER_QUEUE", defaultValue: "-1 (automático)", description: "Ajusta a fila global de SSR. Use 0 para fail-fast ou mantenha -1 para o framework dimensionar pela capacidade dos workers." },
        { name: "DOTREACT_RENDERER_BINARY_PROTOCOL", defaultValue: "true no renderer gerenciado", description: "Mantém props em UTF-8 e envia HTML bruto no transporte bufferizado. Use false somente para diagnosticar compatibilidade com o endpoint JSON legado." },
        { name: "DOTREACT_SERVER_ENTRY", description: "Caminho do bundle SSR compilado." },
        { name: "DOTREACT_MAX_RENDER_BODY_BYTES", defaultValue: "1048576", description: "Limite do request interno." },
        { name: "DOTREACT_MAX_RENDER_RESPONSE_BYTES", defaultValue: "4194304", description: "Limite do response interno." },
        { name: "DOTREACT_MAX_RENDER_CONCURRENCY", defaultValue: "32", description: "Renders simultâneos." },
        { name: "DOTREACT_KEEP_ALIVE_TIMEOUT_MS", defaultValue: "65000", description: "Keep-alive HTTP." },
        { name: "DOTREACT_RENDER_REQUEST_TIMEOUT_MS", defaultValue: "30000", description: "Timeout do servidor Node." },
        { name: "OTEL_EXPORTER_OTLP_ENDPOINT", description: "Ativa exportação OTLP no starter quando definida." },
        { name: "DOTREACT_REDIS_CONNECTION", description: "Ativa stores Redis compartilhados de ISR, tags, idempotência e revogação de sessões." },
        { name: "DOTREACT_REDIS_KEY_PREFIX", description: "Override opcional do namespace Redis. O default é derivado do nome da aplicação para isolar produtos." },
        { name: "DOTREACT_BUILD_ID", description: "Build/revision imutável; possui fallbacks específicos de Azure." },
        { name: "DOTREACT_PRODUCTION_RUNTIME", defaultValue: "true fora de Development/Testing", description: "Override avançado para desativar supervisão Node e rate limiting em testes de integração; produção deve manter true." }
      ]} />
      <h3>DotReactDistributedCacheOptions</h3>
      <ReferenceTable rows={[
        { name: "KeyPrefix", defaultValue: "dotreact:pages:v2:", description: "Namespace de cache por aplicação/schema." },
        { name: "MaxEntryBytes", defaultValue: "1 MiB", description: "Limite do resultado serializado do loader." },
        { name: "InvalidationTokenLifetime", defaultValue: "25 horas", description: "Retém versões de path/tag por mais tempo que qualquer entrada para impedir que valores invalidados voltem a ficar acessíveis." }
      ]} />
      <h3>DotReactRedisOptions</h3>
      <ReferenceTable rows={[
        { name: "ArtifactRetentionAfterStale", defaultValue: "1 dia", description: "Mantém o último ISR válido para recuperação após a janela stale." },
        { name: "StaticArtifactRetention", defaultValue: "30 dias", description: "Limite de retenção de artefatos estáticos por build; um miss posterior regenera o conteúdo." }
      ]} />
      <h3>Actions e segurança</h3>
      <p>Configure <code>DotReactActionOptions</code> com <code>services.Configure&lt;DotReactActionOptions&gt;</code>. Defaults: request 256 KiB, replay 512 KiB, 1.024 entradas, chave até 128 caracteres e retenção de 10 minutos.</p>
      <p><code>AddDotReactRateLimiting</code> usa por padrão 120 requests/minuto, sem fila, particionando usuários autenticados e protegendo também o otimizador de imagens. Cada processo aceita no máximo quatro transforms simultâneos por padrão. <code>DotReactSecurityHeadersOptions</code> controla CSP, frame, referrer, permissions e COOP; origins adicionais precisam ser HTTPS/WSS exatas.</p>
      <div className="warning"><strong>Cache compartilhado</strong><span><code>[DotReactCache]</code> exige <code>[AllowAnonymous]</code>. Dados por usuário ou tenant precisam de cache privado com chave de identidade explícita.</span></div>
    </>
  },
  {
    id: "troubleshooting", group: "Referência", title: "Troubleshooting",
    summary: "Diagnostique renderer, contracts, hydration, CSP, actions e produção.",
    tags: ["erros", "doctor", "diagnóstico"],
    body: <>
      <h2>Checklist por sintoma</h2>
      <div className="troubleshooting">
        <article><h3>Readiness falha</h3><p>Execute <code>dotreact doctor</code>, confirme o renderer na porta configurada e consulte <code>/_health/ready</code>. Em produção, valide paths de <code>production-server.js</code> e <code>entry-server.js</code>.</p></article>
        <article><h3>MODULE_NOT_FOUND</h3><p>Compare o module ID do atributo C# com <code>src/backend-manifest.json</code> e a posição do <code>page.drx</code>. Rode <code>dotreact sync</code> e <code>dotreact check</code>.</p></article>
        <article><h3>Hydration mismatch</h3><p>SSR e cliente devem importar <code>virtual:dotreact/pages</code>. Evite valores não determinísticos produzidos diretamente durante render React; carregue-os no C# como props.</p></article>
        <article><h3>Action retorna 400</h3><p>Verifique Problem Details, contrato gerado e token <code>X-DotReact-CSRF</code>. Upload de arquivo não é aceito em Server Actions.</p></article>
        <article><h3>Query string retorna 400</h3><p><code>GetQueryValue&lt;T&gt;</code> rejeita valores inválidos e múltiplos valores para uma chave escalar. Use um tipo nullable quando a chave for opcional.</p></article>
        <article><h3>Action retorna 401/403</h3><p>Actions exigem autorização por padrão. Configure autenticação/policy ou use <code>[AllowAnonymous]</code> somente quando a operação realmente for pública.</p></article>
        <article><h3>CSP bloqueia Vite ou CDN</h3><p>Em dev, confirme <code>ClientScriptSrc</code> e React Refresh. Em produção, adicione apenas origins confiáveis a <code>AdditionalScriptSources</code>, styles ou connect.</p></article>
        <article><h3>TypeGen acusa precisão insegura</h3><p>Troque o contrato por um tipo seguro ou configure serialização numérica como string no C#. Não force TypeScript <code>number</code> para <code>long</code> arbitrário.</p></article>
        <article><h3>Renderer reinicia repetidamente</h3><p>Consulte métricas <code>DotReact.Hosting.Node</code>, heap configurado e logs redigidos. Após o limite de crash loop, o host encerra para recuperação da plataforma.</p></article>
      </div>
    </>
  },
  {
    id: "examples", group: "Projeto", title: "Exemplos oficiais",
    summary: "Escolha o starter DRX, o CRUD SOLID ou o laboratório RSC isolado.",
    tags: ["starter", "CRUD", "SQLite", "RSC"],
    body: <>
      <h2>Starter</h2>
      <p>Demonstra a experiência recomendada: <code>page.drx</code>, rota dinâmica, layout preservado, router/prefetch, loading, streaming/Suspense, ISR, imagem SkiaSharp, action gerada, CSP, OTel, Docker e renderer supervisionado.</p>
      <CodeBlock label="Terminal" code={'npm run generate -w @rafagouveia/dotreact-example-starter\nnpm run dev -w @rafagouveia/dotreact-example-starter\n# http://127.0.0.1:5080'} />
      <h2>CRUD SQLite</h2>
      <p>Demonstra a arquitetura atual de ponta a ponta: separação Domain/Application/Infrastructure/Presentation, rota <code>page.drx</code>, loader C# descoberto, SSR e hidratação, contratos e actions gerados, autorização por policy, revalidação automática e persistência SQLite. A API ASP.NET convencional permanece apenas como exemplo de Route Handler; a interface usa Server Actions tipadas.</p>
      <CodeBlock label="Terminal" code={'npm run generate -w @rafagouveia/dotreact-example-crud\nnpm run dev -w @rafagouveia/dotreact-example-crud\n# http://127.0.0.1:5090'} />
      <div className="warning"><strong>Segurança e persistência</strong><span>A autenticação de demonstração existe somente em Development/Testing e falha fechada em Production. Substitua-a por identidade real e migre o SQLite para persistência externa antes de escalar horizontalmente.</span></div>
      <h2>RSC experimental</h2>
      <p><code>examples/rsc</code> separa ambientes Vite rsc/ssr/client, renderiza um Server Component com modelo serializável, injeta Flight no HTML e hidrata um <code>"use client"</code> stateful. O guard rejeita <code>"use server"</code>: mutações continuam obrigatoriamente em C#.</p>
      <CodeBlock label="Terminal" code={'npm run build -w @rafagouveia/dotreact-example-rsc\nnpm run dev -w @rafagouveia/dotreact-example-rsc\n# http://127.0.0.1:5110'} />
    </>
  },
  {
    id: "architecture-protocol", group: "Projeto", title: "Arquitetura e protocolo",
    summary: "Entenda processos, ownership, envelope v1 e falhas entre runtimes.",
    tags: ["protocol v1", "sidecar", "SOLID"],
    body: <>
      <h2>Ownership por camada</h2>
      <ReferenceTable valueHeading="Depende de" rows={[
        { name: "Domain", defaultValue: "nada externo", description: "Entidades, invariantes e regras centrais." },
        { name: "Application", defaultValue: "Domain + ports", description: "Um caso de uso por operação e efeitos injetados." },
        { name: "Infrastructure", defaultValue: "Application", description: "EF, banco, relógio e integrações concretas." },
        { name: "Presentation", defaultValue: "Application + DotReact", description: "Loaders, actions e endpoints finos." },
        { name: "Renderer Node", defaultValue: "Protocol + React", description: "Importa módulos e produz HTML; não contém backend." }
      ]} />
      <h3>App Router e backend SOLID</h3>
      <CodeBlock label="Contrato obrigatório + exemplo livre de backend" code={'app/                           # contrato do framework\n  _components/\n  billing/[id]/\n    _components/\n    _actions/                   # convenção, não obrigação\n      CloseInvoiceAction.server.cs\n    page.server.cs\n    page.drx\nServer/                        # estrutura escolhida pelo produto\n  Modules/                     # exemplo: vertical slices\n  Program.cs\npublic/                        # assets administrados pelo App Router\nsrc/                           # somente contratos gerados'} />
      <p>Loader, Server Action, Minimal API ou controller é um adapter de Presentation: lê o transporte, aplica autorização, chama um caso de uso e mapeia o resultado. Cada caso de uso público fica em seu próprio arquivo e depende de portas pequenas definidas pela Application. Domain não conhece ASP.NET, banco, serialização ou React; Infrastructure implementa as portas; Composition escolhe as implementações.</p>
      <p>Pastas iniciadas por <code>_</code> são privadas e nunca viram segmentos de URL. <code>dotreact architecture</code> rejeita React fora do <code>app/</code>. Organização de C# e assets ASP.NET específicos dentro de <code>Server/</code> recebem no máximo recomendações e nunca invalidam o build.</p>
      <div className="callout"><strong>Server é livre</strong><span>Você pode usar vertical slices, Clean Architecture, módulos, controllers, Minimal APIs ou uma estrutura simples. O framework verifica contratos técnicos, não nomes de pastas do backend.</span></div>
      <h3>Por que não src/app?</h3>
      <p>O Next.js aceita tanto <code>app/</code> quanto <code>src/app/</code>; <code>src</code> é opcional. Na linha estável atual, DotReact usa somente <code>app/</code> na raiz e reserva <code>src/</code> para contratos gerados. Isso reduz raízes ambíguas entre o source generator C#, Vite, SSR e hidratação. Não é uma limitação do React, mas uma convenção explícita do framework.</p>
      <h3>Jobs e cron sem execução duplicada</h3>
      <p>Jobs reutilizam casos de uso da Application; não acessam React nem o renderer. Trabalho leve e descartável pode usar <code>BackgroundService</code> em <code>Server/Jobs</code>. Processamento durável ou agendado deve rodar em worker dedicado, Azure Container Apps Jobs, Azure Functions ou scheduler escolhido pela aplicação. Assim, escalar o web para três réplicas não executa a mesma rotina três vezes.</p>
      <div className="warning"><strong>Interface não é sinônimo de SOLID</strong><span>Abstraia efeitos voláteis — persistência, APIs, filas, arquivos, identidade e tempo. Não crie interface para toda classe, repositório genérico ou serviço amplo. O objetivo é responsabilidade e direção de dependência, não quantidade de arquivos.</span></div>
      <h3>Envelope SSR v1</h3>
      <CodeBlock label="Request interno" code={'{\n  "protocolVersion": 1,\n  "requestId": "trace-id",\n  "moduleId": "products/[id]/page",\n  "url": "/products/42",\n  "props": { "id": 42, "name": "Produto" },\n  "renderMode": "ssr"\n}'} />
      <p>A resposta contém <code>ok</code>, HTML e head estruturado ou um erro fechado. ASP.NET valida versão e request ID. O renderer é protegido por token, limites de corpo/resposta/concurrency e loopback em produção.</p>
      <h3>Streaming v2</h3>
      <p>O protocolo v1 continua estável para renderização bufferizada. O v2 usa JSON Lines e frames correlacionados <code>start</code>, <code>html</code>, <code>flight</code>, <code>complete</code> e <code>error</code>. O cliente .NET lê incrementalmente e negocia media type/header de versão; versões incompatíveis falham antes do shell.</p>
    </>
  },
  {
    id: "production", group: "Operações", title: "Segurança e produção",
    summary: "Execute um edge público, renderer privado e defaults seguros.",
    tags: ["CSP", "health", "Azure"],
    body: <>
      <h2>Topologia de produção</h2>
      <p>ASP.NET escuta a porta pública. O hosted service inicia Node em loopback, gera/propaga a credencial, aguarda readiness, reinicia falhas dentro de uma janela limitada e drena no shutdown.</p>
      <div className="cards">
        <article><b>Liveness</b><span><code>/_health/live</code> verifica o host.</span></article>
        <article><b>Readiness</b><span><code>/_health/ready</code> inclui o renderer.</span></article>
        <article><b>Assets</b><span>Fingerprinted: immutable; nomes estáveis: revalidate.</span></article>
      </div>
      <p>SSR personalizado e actions usam <code>private,no-store</code>. Somente páginas anotadas para prerender entram no store de HTML público; o artefato é rejeitado se contiver indicadores de antiforgery/cookie.</p>
      <p><code>UseDotReactSecurityHeaders</code> gera CSP estrita com nonce por requisição, nosniff, frame, referrer, permissions, COOP e HSTS no facade de produção. Scripts HTTPS externos precisam de Subresource Integrity; origins adicionais aceitam somente HTTPS/WSS exatas.</p>
      <p>O cookie antiforgery de produção usa <code>Secure</code>, <code>HttpOnly</code> e <code>SameSite=Strict</code>. Em múltiplas réplicas, persista e proteja o key ring do ASP.NET Core Data Protection para que autenticação e antiforgery sejam consistentes entre instâncias.</p>
      <h3>Container e Azure</h3>
      <p>O Dockerfile usa Node e ASP.NET no mesmo container, executa como usuário não-root e expõe 8080. Os templates Bicep cobrem App Service e Container Apps; deployment real e registry privado dependem de credenciais externas.</p>
      <p><code>@rafagouveia/dotreact-adapter/azure</code> emite manifest determinístico para App Service/Container Apps, valida streaming, imagem, shared cache e PPR de forma fail-closed e nunca grava valores de secrets. PPR no adapter exige Azure Managed Redis explicitamente.</p>
      <p>Em múltiplas réplicas, configure <code>DOTREACT_REDIS_CONNECTION</code> para o Azure Managed Redis e <code>DOTREACT_BUILD_ID</code> para o ID imutável do rollout. O starter também usa <code>CONTAINER_APP_REVISION</code> ou <code>WEBSITE_DEPLOYMENT_ID</code> como fallback.</p>
    </>
  },
  {
    id: "observability-performance", group: "Operações", title: "Observabilidade e performance",
    summary: "Meça renderer, actions, lifecycle Node e budgets antes de otimizar.",
    tags: ["OpenTelemetry", "p95", "cache"],
    body: <>
      <h2>Fontes estáveis</h2>
      <div className="meter"><span>ActivitySource + Meter</span><strong>DotReact.AspNetCore</strong><small>renderer, actions, props e Web Vitals, sem conteúdo sensível como labels</small></div>
      <div className="meter"><span>Node host meter</span><strong>DotReact.Hosting.Node</strong><small>startup, unexpected exits, restarts e crash-loop limit</small></div>
      <p>DotReact publica ActivitySource e Meter estáveis. Quando <code>OTEL_EXPORTER_OTLP_ENDPOINT</code> está definido, o facade instala instrumentação de ASP.NET, HttpClient e as fontes DotReact; sem exporter, não cria um pipeline que processaria spans apenas para descartá-los. O runtime do navegador coleta CLS, INP, LCP e TTFB com amostras e labels limitados.</p>
      <h3>SSR e hidratação seletiva</h3>
      <p>Toda página DRX é renderizada no servidor. No build de produção, o compilador percorre página, layouts e componentes locais: hooks, eventos JSX, APIs do navegador, <code>"use client"</code>, pacote desconhecido ou import não resolvido mantêm a hidratação. Quando a rota é comprovadamente server-only, o documento não envia bootstrap de props, modulepreload nem runtime React. Em desenvolvimento, todas as rotas hidratam para preservar Fast Refresh.</p>
      <h3>Ferramentas de medição</h3>
      <CodeBlock label="Terminal" code={'dotreact analyze --max-client-kb 100 --max-initial-client-kb 75 --max-async-chunk-kb 30 --max-css-kb 40 --max-ssr-kb 50\ndotreact benchmark http://127.0.0.1:5080/ --requests 500 --concurrency 16\ndotreact benchmark https://candidate.example.com/ --compare https://baseline.example.com/ --max-p95-ratio 1.25 --min-throughput-ratio 0.80 --json\n# suite equivalente DotReact × Razor × Blazor × Next interativo/RSC\nnpm run benchmark:compare'} />
      <p>O analyzer separa total, JavaScript inicial, maior chunk assíncrono, CSS e SSR. O build gera um manifesto privado por rota; ASP.NET coloca CSS fingerprintado e modulepreload no head antes do HTML. Em desenvolvimento, <code>Server-Timing</code> mostra loader/renderer, <code>X-DotReact-Props-Bytes</code> mede a fronteira e <code>X-DotReact-Render-Mode</code> identifica SSR, streaming, prerender ou navegação. Esses diagnósticos não são expostos em produção.</p>
      <p>O benchmark separa TTFB do tempo da resposta completa, limita o body, relata falhas, bytes, throughput, média, p50/p95/p99, agrega cada métrica pela mediana e publica a dispersão entre rodadas. Antes da carga, valida título, vinte linhas e modelo de interação; durante a suíte, alterna a ordem dos alvos. SSR server-only e SSR interativo são categorias diferentes. Cache e ISR não entram no ranking enquanto todos os concorrentes não tiverem documento, chave e TTL equivalentes.</p>
      <p>Resultados públicos exigem build de produção, um worker de renderer, runner Linux dedicado e limpo, dez rodadas e dados brutos. A home mostra ganhos e perdas com o mesmo peso. Execuções locais são rotuladas como referência de engenharia: não medem hidratação no navegador, CPU/RSS, custo Azure nem substituem Lighthouse e Web Vitals.</p>
    </>
  },
  {
    id: "compatibility", group: "Projeto", title: "Compatibilidade e depreciação",
    summary: "SemVer coordenado, superfícies públicas, janelas de migração e gates de release.",
    tags: ["SemVer", "Obsolete", "protocolo"],
    body: <>
      <h2>Contrato público explícito</h2>
      <p>APIs C#, exports TypeScript, CLI, convenções <code>.drx</code>, schemas, protocolo, configuração e geração determinística são superfícies de compatibilidade. Internals e nomes de bundles não são.</p>
      <div className="cards">
        <article><b>Patch</b><span>Correções compatíveis e segurança.</span></article>
        <article><b>Minor</b><span>Capacidades aditivas; durante 0.x, breaking changes exigem migração documentada.</span></article>
        <article><b>Major</b><span>Breaking changes intencionais após 1.0.</span></article>
      </div>
      <h3>Deprecação</h3>
      <p>A substituição nasce primeiro. C# usa <code>ObsoleteAttribute</code>, TypeScript usa <code>@deprecated</code> e CLI avisa em stderr. Durante 0.x, a API antiga permanece por ao menos uma minor; após 1.0, por duas minors ou 90 dias. Correções de vulnerabilidade podem abreviar a janela com advisory e migração.</p>
      <p>O documento normativo está em <code>COMPATIBILITY.md</code>. O protocolo e o manifest possuem versões independentes e rejeitam versões obrigatórias desconhecidas.</p>
    </>
  },
  {
    id: "roadmap", group: "Projeto", title: "Limitações e roadmap",
    summary: "Separe comportamento estável, recursos experimentais e gates externos.",
    tags: ["streaming", "RSC", "publicação"],
    body: <>
      <h2>Escopo honesto</h2>
      <div className="status-grid">
        <article><b className="done">Implementado</b><p>Streaming SSR/Suspense, hydration, router/prefetch, loading, layouts tipados com props C#, queries escalares/coleções, SSG/ISR/export automático, imagem, Redis, multi-assembly, policies, actions, TypeGen, VSIX, segurança, OTel, CLI e adapters Azure.</p></article>
        <article><b className="later">Experimental funcional</b><p><code>@rafagouveia/dotreact-rsc</code> usa o plugin oficial Vite com versões pinadas; o exemplo entrega HTML + Flight real. PPR gera shell Suspense estático e retoma o hole com APIs React 19.2. A integração segue isolada até o contrato de bundler React ter estabilidade SemVer.</p></article>
        <article><b className="external">Gate externo</b><p>Publicar npm/NuGet, scan final da imagem e validar deployments com registry e credenciais Azure.</p></article>
      </div>
      <h3>Decisões deliberadas</h3>
      <ul className="feature-list">
        <li>React Server Components/Flight funcionam no laboratório opt-in, mas não são anunciados como API DRX estável.</li>
        <li>Não há C# executado dentro de JSX.</li>
        <li>Cache HTML é opt-in por <code>DotReactPrerender</code> e proíbe representação personalizada.</li>
        <li>Invalidação automática aceita paths e tags; stores locais e Redis tornam versões antigas inalcançáveis sem enumerar chaves.</li>
        <li>Idempotência/ISR distribuídos usam o plugin opcional <code>DotReact.Redis</code>; sem configuração, os stores são locais.</li>
        <li>SQLite não é recomendada para múltiplas réplicas.</li>
      </ul>
      <h3>Lacunas em relação ao Next.js</h3>
      <p>A matriz mantida em <a href="#next-feature-status">Paridade e roadmap</a> é a fonte de verdade para migração. Fontes locais e estratégias de Script já são estáveis. RSC e PPR permanecem experimentais; Parallel/Intercepting Routes, MDX oficial, fontes remotas com métricas automáticas e cache arbitrário de funções estão no roadmap. Edge Runtime JavaScript permanece fora de escopo porque o backend público do DotReact é ASP.NET Core.</p>
    </>
  },
  ...guideDocs,
  ...securityDocs,
  ...deploymentDocs
];
