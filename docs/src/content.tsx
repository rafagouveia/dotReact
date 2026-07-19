import { CliLab, CodeBlock, Flow, PairedCode, ReferenceTable, RouteLab, Step, Steps } from "./components";
import type { DocPage } from "./types";

const pageLoader = `[DotReactPage("products/[id]/page")]
public sealed class ProductPage(GetProduct useCase)
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

const pageView = `import type { ProductPageProps } from "../../../contracts";
import type { DotReactMetadataResolver } from "@dotreact/vite";

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

const hostSetup = `builder.Services.AddDotReact(options =>
{
    options.RendererUrl = new Uri("http://127.0.0.1:5178");
    options.RendererToken = configuration["DOTREACT_RENDERER_TOKEN"];
    options.RequireRendererToken = !builder.Environment.IsDevelopment();
    options.Development = builder.Environment.IsDevelopment();
});
builder.Services.AddDotReactPages(typeof(Program).Assembly);
builder.Services.AddDotReactActions(typeof(Program).Assembly);
builder.Services.AddDotReactSecurityHeaders();

var app = builder.Build();
app.UseDotReactSecurityHeaders();
app.UseDotReactStaticFiles();
app.MapDotReactHealthChecks();
app.MapDotReactPages();
app.MapDotReactActions();
app.MapDotReactFallback();`;

export const docs: readonly DocPage[] = [
  {
    id: "overview", group: "Começar", title: "Visão geral",
    summary: "ASP.NET Core como autoridade; React como renderer SSR e cliente hidratado.",
    tags: ["arquitetura", "SSR", "hidratação"],
    body: <>
      <h2>Um limite explícito entre duas plataformas</h2>
      <p>DotReact mantém HTTP, autenticação, autorização, serviços e dados no C#. O renderer Node é privado e recebe um envelope JSON versionado. React produz o HTML e hidrata a mesma árvore no navegador.</p>
      <Flow />
      <div className="callout"><strong>Regra central</strong><span>Não existe C# embutido no JSX. Props geradas e Server Actions explicitamente expostas formam a ponte entre os runtimes.</span></div>
      <h3>O que já funciona</h3>
      <div className="cards">
        <article><b>Renderização</b><span>SSR, hydration, layouts, metadata e boundaries React.</span></article>
        <article><b>Backend</b><span>Loaders e actions C# com DI, auth, antiforgery e resultados fechados.</span></article>
        <article><b>Produção</b><span>Bundles separados, renderer supervisionado, probes, CSP e OTel.</span></article>
      </div>
    </>
  },
  {
    id: "installation", group: "Começar", title: "Instalação e requisitos",
    summary: "Prepare Node, .NET e o modelo vendorizado usado durante o pré-release.",
    tags: ["Node 24", ".NET 10", "pré-release"],
    body: <>
      <h2>Requisitos suportados</h2>
      <ReferenceTable valueHeading="Versão" rows={[
        { name: ".NET SDK", defaultValue: "10.x", description: "Compila o host, TypeGen e os loaders C#." },
        { name: "Node.js", defaultValue: "24.x produção; 20.19+ dev", description: "Executa Vite, CLI e renderer React." },
        { name: "React", defaultValue: "19.2.x", description: "SSR com react-dom/server e hydrateRoot no cliente." },
        { name: "Vite / TypeScript", defaultValue: "8.1.x / 7.0.x", description: "Build, HMR e verificação semântica de .drx." }
      ]} />
      <h3>Pré-release vendorizado</h3>
      <p>Os pacotes ainda não foram publicados em npm/NuGet. O comando <code>create</code> copia uma versão pequena do framework para <code>framework/</code> e reescreve referências para dependências locais. Não edite essa pasta como código da aplicação.</p>
      <CodeBlock label="PowerShell" code={'npm install\nnpm run build\nnpm run create -- create minha-app --template starter\ncd minha-app\nnpm install\ndotreact doctor'} />
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
        <Step title="Mude o loader"><p>Edite <code>Server/Pages/Home/page.drx.cs</code> e altere a mensagem. <code>dotnet watch</code> recompila o backend.</p></Step>
        <Step title="Mude a view"><p>Edite <code>src/pages/page.drx</code>. Vite aplica Fast Refresh sem substituir o backend C#.</p></Step>
        <Step title="Valide os contratos"><CodeBlock label="Terminal" code={'dotreact sync\ndotreact check'} /></Step>
        <Step title="Teste produção"><p><code>dotreact build</code> gera client e SSR separados. <code>dotreact start</code> publica o host e inicia o renderer privado supervisionado.</p></Step>
      </Steps>
    </>
  },
  {
    id: "configuration", group: "Começar", title: "Configuração do host",
    summary: "Registre runtime, discovery, segurança, static files e endpoints na ordem correta.",
    tags: ["Program.cs", "DI", "middleware"],
    body: <>
      <h2>Composition root</h2>
      <p>O host ASP.NET é a única porta pública. Registre o renderer, páginas e actions no container; depois aplique middleware antes de mapear endpoints.</p>
      <CodeBlock label="Server/Program.cs" code={hostSetup} />
      <h3>Desenvolvimento versus produção</h3>
      <p>Em desenvolvimento, <code>ClientScriptSrc</code> e React Refresh apontam para Vite. Em produção, <code>AddDotReactNodeRenderer</code> recebe os caminhos do renderer compilado e do <code>entry-server.js</code>. O processo Node deve escutar somente em loopback.</p>
      <div className="callout"><strong>Configuração validada no startup</strong><span>URL, timeout, root element e token obrigatório falham cedo quando inválidos.</span></div>
    </>
  },
  {
    id: "pages-loaders", group: "Pages", title: "Loaders e page.drx",
    summary: "Carregue props no C# e renderize uma view React tipada.",
    tags: ["IDotReactPage", "props", "CancellationToken"],
    body: <>
      <h2>Uma página, dois adapters</h2>
      <p>O companion <code>page.drx.cs</code> pertence à Presentation: lê rota e request, chama um caso de uso e devolve props serializáveis. Regras de negócio permanecem na Application/Domain.</p>
      <PairedCode csharp={pageLoader} react={pageView} csharpLabel="Server/Pages/Products/ById/page.drx.cs" reactLabel="src/pages/products/[id]/page.drx" />
      <h3>Escolha do contrato</h3>
      <p>Use <code>IDotReactPage&lt;TProps&gt;</code> quando sempre houver uma página 200. Use <code>IDotReactResultPage&lt;TProps&gt;</code> quando o loader puder responder com page, redirect ou not-found.</p>
      <p>Propague sempre o <code>CancellationToken</code>. O runtime aplica timeout ao carregamento e ao renderer e interrompe trabalho quando o cliente desconecta.</p>
    </>
  },
  {
    id: "layouts", group: "Pages", title: "Layouts aninhados",
    summary: "Componha shell visual da raiz ao diretório mais próximo.",
    tags: ["layout.drx", "children", "composição"],
    body: <>
      <h2>Convenção de diretórios</h2>
      <CodeBlock label="Árvore" code={'src/pages/\n  layout.drx\n  page.drx\n  products/\n    layout.drx\n    [id]/\n      page.drx'} />
      <p>A página de produto é renderizada como <code>RootLayout → ProductsLayout → ProductPage</code>. O mesmo registry virtual é consumido no SSR e na hydration, evitando árvores diferentes.</p>
      <CodeBlock label="src/pages/products/layout.drx" code={'import type { ReactNode } from "react";\n\nexport default function ProductsLayout({ children }: { children: ReactNode }) {\n  return <section className="catalog">{children}</section>;\n}'} />
      <div className="callout"><strong>Escopo atual</strong><span>Layouts recebem somente <code>children</code>. Layout loaders C# independentes ainda não existem.</span></div>
    </>
  },
  {
    id: "boundaries-metadata", group: "Pages", title: "Boundaries e metadata",
    summary: "Renderize 404/erro próximos e gere head estruturado sem HTML arbitrário.",
    tags: ["not-found.drx", "error.drx", "metadata"],
    body: <>
      <h2>Boundary mais próximo</h2>
      <p><code>not-found.drx</code> trata <code>DotReactPageResult.NotFound()</code>; <code>error.drx</code> trata falhas seguras. O plugin associa cada página ao boundary mais próximo em seus ancestrais e o fallback raiz cobre rotas sem endpoint.</p>
      <CodeBlock label="src/pages/not-found.drx" code={'interface BoundaryProps {\n  statusCode: number;\n  requestId: string;\n  message?: string;\n}\n\nexport default function NotFound(props: BoundaryProps) {\n  return <main><h1>Não encontrado</h1><p>{props.message}</p></main>;\n}'} />
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
      <p><code>GetRouteValue&lt;T&gt;</code> converte parâmetros da rota. Para query string escalar, <code>GetQueryValue&lt;T&gt;</code> usa parsing invariável e suporta nullable value types, enums, Guid, bool e números.</p>
      <CodeBlock label="C# loader" code={'var id = context.GetRouteValue<int>("id");\nvar page = context.GetQueryValue<int?>("page") ?? 1;\nvar sort = context.GetQueryValue<SortOrder?>("sort");'} />
      <p>Uma chave ausente retorna <code>null</code> quando <code>T</code> é nullable; em um tipo obrigatório, a ausência é inválida. Valores malformados geram <code>BadHttpRequestException</code>, e múltiplos valores são rejeitados para evitar interpretação ambígua.</p>
      <h3>Constraints e registro manual</h3>
      <p>Use o atributo de dois argumentos quando precisar de constraints ASP.NET:</p>
      <CodeBlock label="C#" code={'[DotReactPage("/products/{id:int}", "products/[id]/page")]'} />
      <p><code>MapDotReactPage(pattern, moduleId, loader)</code> continua suportado para apps existentes e registries manuais, como o exemplo CRUD.</p>
      <CodeBlock label="Program.cs" code={'app.MapDotReactPage("/reports/{year:int}", "reports/page",\n  async (context, cancellationToken) =>\n      await reportLoader.LoadAsync(context, cancellationToken));'} />
    </>
  },
  {
    id: "server-actions", group: "Full-stack", title: "Server Actions",
    summary: "Mutações C# tipadas com auth, antiforgery, resultados e progressive forms.",
    tags: ["actions", "Problem Details", "antiforgery"],
    body: <>
      <h2>Exposição explícita</h2>
      <p>Somente classes marcadas com <code>[DotReactAction]</code> são descobertas. A action é um adapter fino que traduz request, invoca um caso de uso e mapeia o resultado.</p>
      <PairedCode csharp={actionClass} react={actionClient} csharpLabel="Server/Actions/CreateOrderAction.cs" reactLabel="src/pages/orders/page.drx" />
      <h3>Segurança padrão</h3>
      <div className="cards">
        <article><b>Autorização</b><span>Sem atributo, a action exige usuário autorizado. <code>[AllowAnonymous]</code> é explícito.</span></article>
        <article><b>Antiforgery</b><span>JSON e formulário precisam do token emitido no documento SSR.</span></article>
        <article><b>Binding</b><span>JSON e form fields simples são aceitos; uploads exigem endpoint dedicado.</span></article>
      </div>
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
      <div className="warning"><strong>Multi-réplica</strong><span>Substitua <code>IDotReactActionIdempotencyStore</code> por um store distribuído e atômico. O default em memória não coordena instâncias.</span></div>
      <h3>Cache distribuído automático</h3>
      <p>Páginas anônimas com <code>[DotReactCache(60)]</code> armazenam somente o resultado serializado do loader em <code>IDistributedCache</code>; HTML, usuário e token antiforgery nunca são compartilhados. Configure Redis/SQL antes de <code>AddDotReactDistributedCaching</code>.</p>
      <CodeBlock label="Program.cs" code={'builder.Services.AddStackExchangeRedisCache(options =>\n  options.Configuration = connectionString);\nbuilder.Services.AddDotReactDistributedCaching();'} />
      <p>Em uma action bem-sucedida, os paths de <code>Success(value, revalidatePaths)</code> são removidos automaticamente do cache distribuído antes da resposta. O header e o callback cliente continuam disponíveis para atualizar UI local.</p>
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
      <CodeBlock label="Program.cs + TypeGen" code={'var features = new[] { typeof(Program).Assembly, typeof(CatalogFeature).Assembly };\nbuilder.Services.AddDotReactPages(features);\nbuilder.Services.AddDotReactActions(features);\n\n# repita --assembly para cada DLL adicional\ndotreact-typegen Server.dll src/contracts.ts --assembly Catalog.dll --discover'} />
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
        { name: "generate boundary", defaultValue: "<route> --kind error|not-found", description: "Cria boundary React." },
        { name: "generate action", defaultValue: "<PascalCaseName>", description: "Cria action C# e DTOs iniciais." },
        { name: "sync", description: "Executa o script npm generate." },
        { name: "check", description: "Executa drift check e typecheck." },
        { name: "dev / build / start", description: "Orquestra os scripts do projeto e o publish local." },
        { name: "analyze", defaultValue: "--max-client-kb / --max-ssr-kb", description: "Mede bundle raw/gzip e aplica budgets." },
        { name: "benchmark", defaultValue: "[url] --requests --concurrency", description: "Mede p50/p95/p99 SSR e falhas." },
        { name: "doctor", description: "Valida runtimes, estrutura e scripts obrigatórios." }
      ]} />
      <CodeBlock label="Terminal" code={'npm exec -- dotreact generate page catalog/[slug] --dry-run\nnpm exec -- dotreact generate page catalog/[slug]\nnpm exec -- dotreact sync\nnpm exec -- dotreact check\nnpm exec -- dotreact analyze --max-client-kb 100 --max-ssr-kb 50\nnpm exec -- dotreact benchmark http://127.0.0.1:5080/ --requests 100 --concurrency 8'} />
      <p>Durante o pré-release, projetos gerados incluem <code>framework/cli</code> como dependência local. Portanto <code>npm exec dotreact</code> funciona sem instalação global e sem depender do checkout original do framework.</p>
      <p><code>add</code> é alias de <code>generate</code>. Generators rejeitam traversal e colisões; não há flag de overwrite.</p>
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
        { name: "RendererToken", defaultValue: "null", description: "Bearer compartilhado; produção gerenciada gera credencial em memória." },
        { name: "RequireRendererToken", defaultValue: "false", description: "Quando true exige token de ao menos 32 caracteres." },
        { name: "Development", defaultValue: "false", description: "Habilita diagnósticos e integração Vite de desenvolvimento." },
        { name: "RequestTimeout", defaultValue: "10 s", description: "Timeout de loader mais renderer." },
        { name: "ClientScriptSrc", defaultValue: "/_dotreact/client.js", description: "Entry module de hydration." },
        { name: "ReactRefreshPreambleSrc", defaultValue: "null", description: "Runtime React Refresh usado somente em dev." },
        { name: "RootElementId", defaultValue: "root", description: "Elemento que recebe SSR e hydrateRoot." }
      ]} />
      <h3>DotReactNodeRendererOptions</h3>
      <ReferenceTable rows={[
        { name: "Port", defaultValue: "5178", description: "Porta loopback do renderer." },
        { name: "StartupTimeout / ShutdownTimeout", defaultValue: "30 s / 10 s", description: "Readiness e drain supervisionado." },
        { name: "NodeMemoryMb", defaultValue: "384", description: "Heap máximo do V8." },
        { name: "MaxRestarts", defaultValue: "3 em 5 min", description: "Limite de crash loop, com backoff inicial de 1 s." }
      ]} />
      <h3>Renderer Node</h3>
      <ReferenceTable rows={[
        { name: "DOTREACT_RENDERER_PORT", defaultValue: "5178", description: "Porta privada." },
        { name: "DOTREACT_RENDERER_HOST", defaultValue: "127.0.0.1", description: "Produção aceita somente loopback." },
        { name: "DOTREACT_RENDERER_TOKEN", description: "Obrigatório em produção, mínimo 32 caracteres." },
        { name: "DOTREACT_SERVER_ENTRY", description: "Caminho do bundle SSR compilado." },
        { name: "DOTREACT_MAX_RENDER_BODY_BYTES", defaultValue: "1048576", description: "Limite do request interno." },
        { name: "DOTREACT_MAX_RENDER_RESPONSE_BYTES", defaultValue: "4194304", description: "Limite do response interno." },
        { name: "DOTREACT_MAX_RENDER_CONCURRENCY", defaultValue: "32", description: "Renders simultâneos." },
        { name: "DOTREACT_KEEP_ALIVE_TIMEOUT_MS", defaultValue: "65000", description: "Keep-alive HTTP." },
        { name: "DOTREACT_RENDER_REQUEST_TIMEOUT_MS", defaultValue: "30000", description: "Timeout do servidor Node." },
        { name: "OTEL_EXPORTER_OTLP_ENDPOINT", description: "Ativa exportação OTLP no starter quando definida." }
      ]} />
      <h3>DotReactDistributedCacheOptions</h3>
      <ReferenceTable rows={[
        { name: "KeyPrefix", defaultValue: "dotreact:pages:v1:", description: "Namespace de cache por aplicação/schema." },
        { name: "MaxEntryBytes", defaultValue: "1 MiB", description: "Limite do resultado serializado do loader." }
      ]} />
      <h3>Actions e segurança</h3>
      <p>Configure <code>DotReactActionOptions</code> com <code>services.Configure&lt;DotReactActionOptions&gt;</code>. Defaults: request 256 KiB, replay 512 KiB, 1.024 entradas, chave até 128 caracteres e retenção de 10 minutos.</p>
      <p><code>AddDotReactRateLimiting</code> usa por padrão 120 requests/minuto, sem fila, particionando usuários autenticados. <code>DotReactSecurityHeadersOptions</code> controla CSP, frame, referrer, permissions e COOP.</p>
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
    summary: "Escolha o starter DRX ou o CRUD de compatibilidade e arquitetura SOLID.",
    tags: ["starter", "CRUD", "SQLite"],
    body: <>
      <h2>Starter</h2>
      <p>Demonstra a experiência recomendada: <code>page.drx</code>, rota dinâmica, layout, metadata, boundaries, action gerada, CSP, rate limit, OTel, Docker e renderer supervisionado.</p>
      <CodeBlock label="Terminal" code={'npm run generate -w @dotreact/example-starter\nnpm run dev -w @dotreact/example-starter\n# http://127.0.0.1:5080'} />
      <h2>CRUD SQLite</h2>
      <p>Demonstra separação Domain/Application/Infrastructure/Presentation, casos de uso e ports, TypeGen explícito, API ASP.NET convencional e registry React manual. Esse formato permanece suportado como compatibilidade; ele não usa a convenção <code>.drx</code>.</p>
      <CodeBlock label="Terminal" code={'npm run generate -w @dotreact/example-crud\nnpm run dev -w @dotreact/example-crud\n# http://127.0.0.1:5090'} />
      <div className="warning"><strong>SQLite</strong><span>O banco local é adequado para demonstração e instância única. Migre para persistência externa antes de escalar horizontalmente.</span></div>
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
      <h3>Envelope SSR v1</h3>
      <CodeBlock label="Request interno" code={'{\n  "protocolVersion": 1,\n  "requestId": "trace-id",\n  "moduleId": "products/[id]/page",\n  "url": "/products/42",\n  "props": { "id": 42, "name": "Produto" },\n  "renderMode": "ssr"\n}'} />
      <p>A resposta contém <code>ok</code>, HTML e head estruturado ou um erro fechado. ASP.NET valida versão e request ID. O renderer é protegido por token, limites de corpo/resposta/concurrency e loopback em produção.</p>
      <p>Streaming exigiria um contrato de transporte diferente; por isso não foi adicionado silenciosamente ao protocolo v1.</p>
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
      <p>SSR e actions usam <code>private,no-store</code>. Cache HTML compartilhado e compressão dinâmica do documento não são defaults enquanto props personalizadas e antiforgery dividem a representação.</p>
      <p><code>UseDotReactSecurityHeaders</code> gera CSP estrita, nosniff, frame, referrer, permissions e COOP. Ajuste origins conscientemente para CDN ou integrações externas.</p>
      <h3>Container e Azure</h3>
      <p>O Dockerfile usa Node e ASP.NET no mesmo container, executa como usuário não-root e expõe 8080. Os templates Bicep cobrem App Service e Container Apps; deployment real e registry privado dependem de credenciais externas.</p>
    </>
  },
  {
    id: "observability-performance", group: "Operações", title: "Observabilidade e performance",
    summary: "Meça renderer, actions, lifecycle Node e budgets antes de otimizar.",
    tags: ["OpenTelemetry", "p95", "cache"],
    body: <>
      <h2>Fontes estáveis</h2>
      <div className="meter"><span>ActivitySource + Meter</span><strong>DotReact.AspNetCore</strong><small>renderer HTTP e Server Actions, sem props/tokens/URLs como labels</small></div>
      <div className="meter"><span>Node host meter</span><strong>DotReact.Hosting.Node</strong><small>startup, unexpected exits, restarts e crash-loop limit</small></div>
      <p>O starter registra ASP.NET, HttpClient e fontes DotReact. Defina <code>OTEL_EXPORTER_OTLP_ENDPOINT</code> para adicionar o exporter OTLP; sem a variável, nenhuma conexão é tentada.</p>
      <h3>Ferramentas de medição</h3>
      <CodeBlock label="Terminal" code={'dotreact analyze --max-client-kb 100 --max-ssr-kb 50\ndotreact benchmark http://127.0.0.1:5080/ --requests 500 --concurrency 16'} />
      <p>O benchmark relata failures, p50, p95 e p99. Compare o mesmo build, máquina, URL e concurrency antes/depois. O renderer possui keep-alive, timeouts, <code>Content-Length</code> e concurrency limitada.</p>
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
    summary: "Separe comportamento disponível, trabalho pós-MVP e gates externos.",
    tags: ["streaming", "RSC", "publicação"],
    body: <>
      <h2>Escopo honesto</h2>
      <div className="status-grid">
        <article><b className="done">Implementado</b><p>SSR/hydration, DRX, multi-assembly, policies de página/recurso, cache distribuído de props, actions, TypeGen, VSIX, produção, segurança, OTel, CLI, Docker e Azure IaC.</p></article>
        <article><b className="later">Pós-MVP</b><p>Streaming/Suspense, static generation, navegação cliente e idempotência distribuída de referência.</p></article>
        <article><b className="external">Gate externo</b><p>Publicar npm/NuGet, scan final da imagem e validar deployments com registry e credenciais Azure.</p></article>
      </div>
      <h3>Decisões deliberadas</h3>
      <ul className="feature-list">
        <li>React Server Components não fazem parte do MVP.</li>
        <li>Não há C# executado dentro de JSX.</li>
        <li>Não existe cache compartilhado de HTML SSR personalizado.</li>
        <li>Invalidação automática usa paths exatos; não implementa um router cliente.</li>
        <li>Idempotência distribuída exige store fornecido pela aplicação.</li>
        <li>SQLite não é recomendada para múltiplas réplicas.</li>
      </ul>
    </>
  }
];
