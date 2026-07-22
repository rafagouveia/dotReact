import { CodeBlock, PairedCode, ReferenceTable, Step, Steps } from "./components";
import type { DocPage } from "./types";

const pageLoader = `using Accounting.Application.Invoices;
using DotReact.AspNetCore;

namespace Accounting.Pages.Invoices;

public sealed class InvoicePage(IGetInvoice useCase)
    : IDotReactResultPage<InvoicePageProps>
{
    public async ValueTask<DotReactPageResult<InvoicePageProps>> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken)
    {
        var id = context.GetRouteValue<Guid>("id");
        var invoice = await useCase.ExecuteAsync(id, cancellationToken);
        return invoice is null
            ? DotReactPageResult<InvoicePageProps>.NotFound()
            : DotReactPageResult<InvoicePageProps>.Page(InvoicePageProps.From(invoice));
    }
}`;

const pageView = `import { definePage } from "@rafagouveia/dotreact-client/router";
import type { InvoicePageProps } from "../../../src/contracts";

export default definePage<InvoicePageProps>(function InvoicePage(props) {
  return (
    <main>
      <h1>{props.number}</h1>
      <p>{props.customerName}</p>
      <strong>{props.formattedTotal}</strong>
    </main>
  );
});`;

const databasePackages = `# Base do tutorial e migrations
dotnet add Server/Infrastructure package Microsoft.EntityFrameworkCore.Sqlite
dotnet add Server/Infrastructure package Microsoft.EntityFrameworkCore.Design

# Para testar a troca de provider, instale também os adapters de produção
dotnet add Server/Infrastructure package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add Server/Infrastructure package Microsoft.EntityFrameworkCore.SqlServer`;

const databaseConfiguration = `{
  "Database": { "Provider": "sqlite" },
  "ConnectionStrings": {
    "WorkItems": "Data Source=App_Data/work-items.db"
  }
}

# produção: a plataforma fornece como secret
ConnectionStrings__WorkItems=<connection-string>
Database__Provider=postgres`;

const databaseContext = `public sealed class WorkItemsDbContext(
    DbContextOptions<WorkItemsDbContext> options) : DbContext(options)
{
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var item = modelBuilder.Entity<WorkItem>();
        item.ToTable("WorkItems");
        item.HasKey(value => value.Id);
        item.Property(value => value.Title).IsRequired().HasMaxLength(120);
        item.Property(value => value.Status).HasConversion<string>();
        item.HasIndex(value => value.Status);
    }
}`;

const databaseRegistration = `services.AddDbContext<WorkItemsDbContext>((provider, options) =>
{
    var configuration = provider.GetRequiredService<IConfiguration>();
    var connection = configuration.GetConnectionString("WorkItems")
        ?? throw new InvalidOperationException("ConnectionStrings:WorkItems is required.");

    switch (configuration["Database:Provider"]?.ToLowerInvariant())
    {
        case "postgres": options.UseNpgsql(connection); break;
        case "sqlserver": options.UseSqlServer(connection); break;
        default: options.UseSqlite(connection); break;
    }
});

services.AddScoped<EfWorkItemRepository>();
services.AddScoped<IWorkItemReadRepository>(sp => sp.GetRequiredService<EfWorkItemRepository>());
services.AddScoped<IWorkItemWriteRepository>(sp => sp.GetRequiredService<EfWorkItemRepository>());`;

const databaseRepository = `public sealed class EfWorkItemRepository(WorkItemsDbContext db)
    : IWorkItemReadRepository, IWorkItemWriteRepository
{
    public async Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken ct) =>
        await db.WorkItems.AsNoTracking().OrderByDescending(x => x.Id).ToListAsync(ct);

    public async Task AddAsync(WorkItem item, CancellationToken ct)
    {
        db.WorkItems.Add(item);
        await db.SaveChangesAsync(ct);
    }
}`;

const databaseMigrationCommands = `dotnet new tool-manifest
dotnet tool install dotnet-ef
dotnet ef migrations add InitialCreate --project Server/Infrastructure --startup-project Server
dotnet ef database update --project Server/Infrastructure --startup-project Server

# execute a aplicação e confirme SSR + persistência
npm run dev
# crie um item, atualize a página e confirme que ele continua no banco`;

export const guideDocs: readonly DocPage[] = [
  {
    id: "project-lifecycle", group: "Guias", title: "Do zero à primeira feature",
    summary: "Crie o projeto, valide o ambiente e entregue uma rota completa sem tocar no runtime gerenciado.",
    tags: ["tutorial", "CLI", "feature"],
    body: <>
      <h2>Comece por uma entrega vertical pequena</h2>
      <p>Um projeto DotReact nasce pronto para SSR, hydration, segurança, assets e produção. O primeiro trabalho da equipe não é configurar Vite ou montar um segundo backend: é descrever o domínio, criar um caso de uso C# e expor somente o contrato necessário para uma página DRX.</p>
      <CodeBlock label="Terminal" code={'npm run create -- create accounting-portal --template starter\ncd accounting-portal\nnpm install\nnpm exec -- dotreact doctor\nnpm run dev'} />
      <Steps>
        <Step title="Registre a identidade"><p>Atualize <code>docs/ai/PROJECT.md</code> com produto, usuários, módulos, persistência e alvo de deploy. O CLI já aplica o nome informado ao package, namespace C#, assembly, metadata e manifesto.</p></Step>
        <Step title="Gere a rota"><p>Use <code>dotreact generate page invoices/[id]</code>. O comando cria somente os arquivos públicos da feature e não altera o runtime.</p></Step>
        <Step title="Implemente o caso de uso"><p>Coloque regras em Domain/Application. O loader apenas converte rota, chama o caso de uso e cria props públicas.</p></Step>
        <Step title="Renderize e interaja"><p>Leia as props tipadas no <code>page.drx</code>. Mutações entram por Server Actions C# geradas, nunca por um backend React paralelo.</p></Step>
        <Step title="Feche os gates"><p>Rode geração, contratos, typecheck, testes, build e auditorias antes do commit.</p></Step>
      </Steps>
      <PairedCode csharp={pageLoader} react={pageView} csharpLabel="app/invoices/[id]/page.server.cs" reactLabel="app/invoices/[id]/page.drx" />
      <div className="callout"><strong>Resultado esperado</strong><span>Acesso direto entrega HTML SSR; a navegação interna usa payload parcial; a mesma árvore React hidrata sem refazer a consulta no browser.</span></div>
    </>
  },
  {
    id: "project-organization", group: "Guias", title: "Organização e SOLID",
    summary: "Mantenha app, domínio, casos de uso e infraestrutura previsíveis conforme o projeto cresce.",
    tags: ["SOLID", "arquitetura", "pastas"],
    body: <>
      <h2>Organize por capacidade de negócio</h2>
      <p><code>app/</code> organiza a experiência por rota. <code>Server/</code> organiza comportamento por feature e camada. Não transforme Controllers, Services ou Components em depósitos globais. Cada operação deve ter um motivo coeso para mudar.</p>
      <CodeBlock label="Estrutura recomendada" code={'app/\n  invoices/\n    [id]/\n      page.drx\n      page.server.cs\n      InvoicePageProps.cs\n    _components/\n      InvoiceStatus.tsx\nServer/\n  Invoices/\n    Domain/\n      Invoice.cs\n    Application/\n      GetInvoice/\n        IGetInvoice.cs\n        GetInvoice.cs\n      CreateInvoice/\n        CreateInvoice.cs\n    Infrastructure/\n      EfInvoiceStore.cs\n    Presentation/\n      Actions/\n        CreateInvoiceAction.cs\n  Composition/\n    InvoiceModule.cs\npublic/\n  fonts/\n  images/'} />
      <ReferenceTable valueHeading="Responsabilidade" rows={[
        { name: "Domain", defaultValue: "regras e invariantes", description: "Sem ASP.NET, EF, React, Vite ou serialização." },
        { name: "Application", defaultValue: "casos de uso e ports", description: "Depende do Domain e define interfaces pequenas para efeitos externos." },
        { name: "Infrastructure", defaultValue: "adapters", description: "Implementa persistência, filas, relógio e integrações definidos pela Application." },
        { name: "Presentation", defaultValue: "HTTP e contratos", description: "Loaders, actions e APIs traduzem entrada/saída; não carregam regra de negócio." },
        { name: "app", defaultValue: "composição visual", description: "Rotas DRX, layouts, boundaries e componentes privados de apresentação." }
      ]} />
      <h3>Regras que evitam acoplamento</h3>
      <ul className="feature-list">
        <li>Um caso de uso por operação; evite um <code>InvoiceService</code> com vinte métodos.</li>
        <li>DTO de página é apresentação pública, não entidade EF nem agregado de domínio.</li>
        <li>Componentes exclusivos da rota ficam em <code>_components</code>; o prefixo privado impede criação acidental de rota.</li>
        <li>Tempo, armazenamento e integrações são injetados. Regra de negócio não instancia infraestrutura.</li>
        <li><code>Program.cs</code> permanece composition root: registra módulos e ordena middleware.</li>
      </ul>
    </>
  },
  {
    id: "crud-guide", group: "Guias", title: "Banco de dados e CRUD completo",
    summary: "Conecte EF Core, escolha SQLite/PostgreSQL/SQL Server e entregue um CRUD persistido com Server Actions.",
    tags: ["banco de dados", "EF Core", "CRUD"],
    body: <>
      <h2>Uma integração real, do provider até a página React</h2>
      <p>O exemplo abaixo cria <code>WorkItems</code> com EF Core. SQLite deixa o primeiro teste rápido; PostgreSQL ou SQL Server entram em produção trocando configuração e provider, sem mover regras para a Presentation.</p>
      <ReferenceTable valueHeading="Indicado para" rows={[
        { name: "SQLite", defaultValue: "local, demo, uma réplica", description: "Arquivo simples, zero serviço externo e ótima experiência inicial. Não use o mesmo arquivo entre réplicas." },
        { name: "PostgreSQL", defaultValue: "produção e scale-out", description: "Provider Npgsql, banco gerenciado e bom padrão para containers e Azure." },
        { name: "SQL Server", defaultValue: "ecossistema Microsoft", description: "Provider oficial EF Core, Azure SQL e integração madura com ferramentas .NET." }
      ]} />
      <h3>1. Gere a feature e escolha o provider</h3>
      <CodeBlock label="Terminal" code={'npm exec -- dotreact generate page work-items\nnpm exec -- dotreact generate action CreateWorkItem\nnpm exec -- dotreact generate action UpdateWorkItem\nnpm exec -- dotreact generate action DeleteWorkItem\n\n' + databasePackages} />
      <p>O tutorial instala os três providers para o switch compilar como está. No produto real, remova os cases e pacotes que não serão usados. Tudo fica em Infrastructure; Domain e Application continuam sem referência ao EF Core.</p>
      <h3>2. Configure sem colocar secret no Git</h3>
      <CodeBlock label="appsettings.Development.json + ambiente" code={databaseConfiguration} />
      <p>O arquivo local pode conter apenas a conexão de desenvolvimento. Em produção, injete a connection string pelo secret store da plataforma.</p>
      <h3>3. Mapeie o banco em Infrastructure</h3>
      <CodeBlock label="Server/Infrastructure/Persistence/WorkItemsDbContext.cs" code={databaseContext} />
      <p>O mapeamento define tabela, limites e índices. A entidade <code>WorkItem</code> continua no Domain e protege invariantes sem conhecer banco ou framework.</p>
      <h3>4. Registre o adapter e implemente o port</h3>
      <CodeBlock label="Server/Composition/InfrastructureServices.cs" code={databaseRegistration} />
      <CodeBlock label="Server/Infrastructure/Persistence/EfWorkItemRepository.cs" code={databaseRepository} />
      <p>A Application depende de <code>IWorkItemReadRepository</code> e <code>IWorkItemWriteRepository</code>. EF Core é apenas uma implementação substituível escolhida na composição.</p>
      <h3>5. Ligue casos de uso, Actions e React</h3>
      <Steps>
        <Step title="Leia"><p>O loader chama <code>ListWorkItems</code> e entrega DTOs públicos à página DRX durante SSR.</p></Step>
        <Step title="Crie"><p>A Action protegida valida o request, chama <code>CreateWorkItem</code> e só então o repositório executa <code>SaveChangesAsync</code>.</p></Step>
        <Step title="Edite e exclua"><p>Use casos separados retornam Validation, NotFound ou Conflict sem transformar exceções esperadas em erro 500.</p></Step>
        <Step title="Revalide"><p>Após o commit, a Action retorna <code>revalidatePaths: ["/work-items"]</code>; o cliente busca props atuais.</p></Step>
      </Steps>
      <CodeBlock label="Resultado de criação" code={'return DotReactActionResult<WorkItemDto>.Success(\n    created,\n    revalidatePaths: ["/work-items"]);'} />
      <h3>6. Crie a migration e prove que persistiu</h3>
      <CodeBlock label="Terminal" code={databaseMigrationCommands} />
      <div className="callout"><strong>Resultado observável</strong><span>Acesso direto retorna a lista no HTML SSR; criar um item atualiza a rota; F5 lê o mesmo registro do banco; uma entrada inválida não grava nem invalida cache.</span></div>
      <h3>Checklist antes de chamar de completo</h3>
      <ul className="feature-list">
        <li>entrada inválida não grava nem invalida cache;</li>
        <li>registro inexistente retorna 404;</li>
        <li>concorrência desatualizada retorna 409;</li>
        <li>usuário sem policy não executa o caso de uso;</li>
        <li>persistência de teste não reutiliza o banco de desenvolvimento;</li>
        <li>SSR inicial e navegação parcial exibem o mesmo estado persistido.</li>
      </ul>
      <div className="callout"><strong>Exemplo executável</strong><span>O diretório <code>examples/crud</code> contém essa arquitetura funcionando: abra o dashboard, crie, edite e exclua itens e confirme a persistência após atualizar a página.</span></div>
    </>
  },
  {
    id: "testing-workflow", group: "Guias", title: "Testes e qualidade",
    summary: "Use gates rápidos durante a feature e uma verificação completa antes de integrar.",
    tags: ["testes", "CI", "contratos"],
    body: <>
      <h2>Teste cada fronteira pelo comportamento que ela promete</h2>
      <ReferenceTable valueHeading="Escopo" rows={[
        { name: "Domain", defaultValue: "unitário", description: "Invariantes, cálculos e transições sem framework ou banco." },
        { name: "Application", defaultValue: "unitário", description: "Caso de uso com ports falsos, cancelamento e resultados esperados." },
        { name: "Infrastructure", defaultValue: "integração", description: "Mapeamento, transação, isolamento e comportamento do banco real de teste." },
        { name: "Presentation", defaultValue: "integração HTTP", description: "Auth, policy, antiforgery, status, Problem Details e serialização." },
        { name: "DRX", defaultValue: "typecheck + browser", description: "Contrato de props, SSR, hydration, navegação, loading e boundary." }
      ]} />
      <CodeBlock label="Gates locais" code={'npm run generate\nnpm run check:contracts\nnpm run typecheck\nnpm test\nnpm run build\nnpm audit --audit-level=high\nnpm run audit:dotnet'} />
      <p><code>check:contracts</code> falha quando o assembly C# e os arquivos gerados divergem. Não corrija o TypeScript gerado manualmente: ajuste o contrato C#, regenere e revise a mudança completa.</p>
      <h3>Definition of done</h3>
      <ul className="feature-list">
        <li>comportamento e erros esperados estão testados;</li>
        <li>acesso anônimo/autorizado foi exercitado quando aplicável;</li>
        <li>SSR direto, refresh e navegação client-side foram verificados;</li>
        <li>não há secret, dado pessoal ou URL sensível em logs/telemetria;</li>
        <li>contratos gerados e migrations pertencem ao mesmo change set;</li>
        <li>build de produção e auditorias terminam sem erro.</li>
      </ul>
    </>
  },
  {
    id: "templates-starter", group: "Guias", title: "Templates e atualização",
    summary: "Escolha o scaffold certo e mantenha projetos vendorizados coerentes com o runtime do framework.",
    tags: ["starter", "minimal", "upgrade"],
    body: <>
      <h2>Dois pontos de partida, o mesmo padrão</h2>
      <ReferenceTable valueHeading="Indicado para" rows={[
        { name: "starter", defaultValue: "aprender e validar", description: "Inclui rota dinâmica, streaming, action, assets, Docker, Azure, CI e documentação técnica." },
        { name: "minimal", defaultValue: "produto limpo", description: "Mantém uma rota SSR, infraestrutura de produção e documentação, removendo demos e actions." }
      ]} />
      <p>O nome passado ao <code>create</code> define package npm, namespace/root namespace C#, assembly, metadata inicial, manifesto e perfil do projeto. Um projeto <code>Arxis</code> não deve conservar <code>DotReact.Starter</code> em código de aplicação.</p>
      <CodeBlock label="Criar e manter" code={'npm run create -- create arxis --template minimal\ncd arxis\nnpm install\n\n# enquanto o preview usa vendor/\nnode C:/caminho/dotreact/packages/cli/dist/index.js upgrade --from C:/caminho/dotreact\nnpm install\nnpm run verify'} />
      <h3>O que o upgrade pode alterar</h3>
      <ul className="feature-list">
        <li>somente <code>vendor/</code> e seu manifesto de versão gerenciada;</li>
        <li>nunca <code>app/</code>, <code>Server/</code>, <code>public/</code>, produto ou banco;</li>
        <li>usa staging e restauração para não deixar runtime parcial;</li>
        <li>depois do upgrade, reinstale/recompile o runtime e rode todos os gates.</li>
      </ul>
      <div className="warning"><strong>Preview</strong><span>Até npm/NuGet serem publicados, o runtime é uma snapshot versionada. Não copie arquivos isolados nem edite <code>vendor/</code>; use o comando de upgrade ou regenere conscientemente.</span></div>
    </>
  }
];
