import { CodeBlock, ReferenceTable, Step, Steps } from "./components";
import type { DocPage } from "./types";

const productionTopology = `Internet / CDN / WAF
          |
          v
  ASP.NET Core :8080        <- único processo público
  auth | policies | data
          |
          v  loopback + token efêmero
  React renderer :5178      <- privado, sem banco ou secrets
          |
          v
  HTML SSR + assets relativos em /_dotreact e /assets`;

const dockerCommands = `# 1. Valide o projeto antes de empacotar
npm ci
npm run verify

# 2. Gere uma imagem imutável
docker build --pull -t registry.example.com/accounting/app:1.4.0 .

# 3. Teste a imagem pelo mesmo endpoint usado em produção
docker run --rm -p 8080:8080 \\
  -e DOTREACT_BUILD_ID=1.4.0 \\
  registry.example.com/accounting/app:1.4.0

curl --fail http://127.0.0.1:8080/_health/live
curl --fail http://127.0.0.1:8080/_health/ready
curl --fail http://127.0.0.1:8080/`;

const releasePipeline = `checkout
  -> npm ci
  -> check:contracts + typecheck + tests
  -> npm/NuGet audit
  -> build da imagem + SBOM + scan
  -> push por digest imutável
  -> validar Bicep
  -> deploy sem migração destrutiva
  -> readiness + SSR + assets + Server Action
  -> promover tráfego
  -> observar métricas e manter rollback disponível`;

export const introDocs: readonly DocPage[] = [
  {
    id: "purpose-applications", group: "Começar", title: "Para que serve e onde aplicar",
    summary: "Entenda o problema que o DotReact resolve e reconheça projetos que se beneficiam da arquitetura.",
    tags: ["propósito", "casos de uso", "decisão"],
    body: <>
      <h2>React para a experiência; .NET para a autoridade</h2>
      <p>DotReact serve para construir aplicações React com SSR, hydration, navegação parcial e componentes interativos sem transferir autenticação, autorização, domínio ou persistência para JavaScript. A aplicação pública continua sendo um host ASP.NET Core; React é o renderer universal da interface.</p>
      <h3>Projetos com bom encaixe</h3>
      <div className="cards">
        <article><b>SaaS e portais autenticados</b><span>Dashboards, áreas do cliente, multi-tenant e fluxos protegidos por policies C#.</span></article>
        <article><b>Backoffices e operações</b><span>CRUDs, conciliação, onboarding, documentos e processos com regras auditáveis.</span></article>
        <article><b>Catálogos e e-commerce</b><span>SSR para descoberta, páginas dinâmicas, cache público e checkout governado no backend.</span></article>
        <article><b>Sites institucionais</b><span>Metadata, SSG/ISR, imagens, formulários protegidos e conteúdo entregue rapidamente.</span></article>
        <article><b>Produtos .NET modernizados</b><span>React substitui uma camada visual antiga sem duplicar o domínio existente.</span></article>
        <article><b>Migração de Next.js</b><span>Rotas migram por domínio enquanto APIs e decisões passam para ASP.NET Core.</span></article>
      </div>
      <h3>Quando escolher outra solução</h3>
      <ReferenceTable valueHeading="Decisão" rows={[
        { name: "Backend já é .NET", defaultValue: "DotReact é adequado", description: "Reaproveita DI, auth, domínio, observabilidade e operação ASP.NET." },
        { name: "Equipe quer React + SSR", defaultValue: "DotReact é adequado", description: "Mantém TSX, hooks, Suspense e Fast Refresh na interface." },
        { name: "Produto é somente uma SPA estática", defaultValue: "Avalie Vite puro", description: "Sem SSR ou backend .NET, o runtime completo pode ser desnecessário." },
        { name: "Backend precisa ser Node/Edge JS", defaultValue: "Use outro framework", description: "DotReact deliberadamente mantém o backend público em ASP.NET Core." },
        { name: "UI precisa ser .NET sem React", defaultValue: "Avalie Blazor/Razor", description: "DotReact existe especificamente para equipes que escolheram React." }
      ]} />
      <div className="callout"><strong>Exemplo real</strong><span>O Arxis usa páginas DRX para a operação de onboarding contábil, casos de uso C# para regras e SQLite como adapter local. A interface hidrata; a autoridade nunca sai do backend.</span></div>
    </>
  },
  {
    id: "beginner-learning-path", group: "Começar", title: "Trilha para iniciantes",
    summary: "Siga uma ordem curta e verificável do primeiro comando até um deploy seguro.",
    tags: ["iniciante", "trilha", "glossário"],
    body: <>
      <h2>Aprenda por entregas completas</h2>
      <p>Não tente aprender o runtime inteiro antes de criar uma tela. Cada etapa abaixo termina com algo observável no navegador e prepara somente os conceitos necessários para a próxima.</p>
      <Steps>
        <Step title="Entenda o limite"><p>Leia <a href="#overview">Visão geral</a> e <a href="#rendering-model">Server, universal e client-only</a>. Confirme por que C# decide e React apresenta.</p></Step>
        <Step title="Crie e altere"><p>Faça o <a href="#first-project">Primeiro projeto guiado</a>. Mude uma prop C#, um componente DRX e observe Hot Reload/Fast Refresh.</p></Step>
        <Step title="Entregue uma feature"><p>Siga <a href="#project-lifecycle">Do zero à primeira feature</a> e depois o <a href="#crud-guide">CRUD SQLite</a>.</p></Step>
        <Step title="Proteja"><p>Aplique authentication, policy e autorização por recurso usando <a href="#security-pages-actions">Páginas, actions e autorização</a>.</p></Step>
        <Step title="Publique"><p>Escolha uma plataforma em <a href="#hosting-overview">Onde hospedar</a>, valide o container e conclua o checklist de produção.</p></Step>
      </Steps>
      <h3>Glossário mínimo</h3>
      <ReferenceTable valueHeading="Significado" rows={[
        { name: "SSR", description: "React produz HTML no servidor antes de o JavaScript carregar." },
        { name: "Hydration", description: "O browser conecta eventos React ao HTML já entregue." },
        { name: "DRX", description: "TSX confiável do projeto usado para páginas, layouts e boundaries." },
        { name: "Loader", description: "Adapter C# que chama um caso de uso e cria props públicas da página." },
        { name: "Server Action", description: "Mutação C# explícita chamada por um cliente TypeScript gerado." },
        { name: "Renderer", description: "Processo Node privado que transforma componentes e props em HTML." },
        { name: "ISR", description: "HTML público cacheado que pode ser regenerado após um intervalo." }
      ]} />
      <div className="warning"><strong>Evite o atalho</strong><span>Não comece editando <code>vendor/</code>, entrypoints gerados ou bootstrap do renderer. O caminho diário é <code>app/</code>, <code>Server/</code>, <code>src/</code> e <code>public/</code>.</span></div>
    </>
  }
];

export const deploymentDocs: readonly DocPage[] = [
  {
    id: "hosting-overview", group: "Hospedagem e deploy", title: "Onde hospedar",
    summary: "Compare plataformas e entenda a topologia única usada em qualquer ambiente de produção.",
    tags: ["hosting", "Docker", "Azure"],
    body: <>
      <h2>Hospede o container, não dois sites públicos</h2>
      <p>O artefato de produção contém ASP.NET Core, bundles React e o renderer Node supervisionado. Somente a porta 8080 do ASP.NET fica pública. ASP.NET e renderer usam um Unix-domain socket privado em Linux/Azure e um Named Pipe no Windows; TCP autenticado em loopback fica disponível apenas como fallback explícito. Nenhum transporte do renderer recebe tráfego da Internet.</p>
      <CodeBlock label="Topologia de produção" code={productionTopology} />
      <ReferenceTable valueHeading="Indicado para" rows={[
        { name: "Azure App Service", defaultValue: "operação simples", description: "Container Linux, Always On, health check e slot de staging. Há Bicep oficial no starter." },
        { name: "Azure Container Apps", defaultValue: "revisões e escala", description: "Ingress gerenciado, probes, múltiplas revisões e tráfego progressivo. Há Bicep oficial." },
        { name: "Docker em Linux", defaultValue: "infra própria", description: "Funciona em VM ou serviço compatível com OCI; sua equipe opera TLS, updates, logs e rollback." },
        { name: "Kubernetes", defaultValue: "plataforma existente", description: "A imagem e os probes são portáveis, mas o framework ainda não fornece manifests Kubernetes oficiais." },
        { name: "Hospedagem estática", defaultValue: "somente export", description: "Aceita páginas exportadas sem loaders/actions em runtime; uma aplicação full-stack exige ASP.NET." }
      ]} />
      <h3>Como decidir</h3>
      <ul className="feature-list">
        <li>Comece com uma réplica quando o banco for SQLite.</li>
        <li>Escolha Container Apps quando revisão/canary e scale-to-demand forem requisitos centrais.</li>
        <li>Escolha App Service quando slots e operação web tradicional reduzirem complexidade.</li>
        <li>Use banco externo, Redis e Data Protection compartilhada antes de aumentar réplicas.</li>
      </ul>
      <h3>Comparação com Razor e Blazor</h3>
      <p>Para o Azure, DotReact é um web app ASP.NET Core em container: domínio, TLS, identidade, probes, logs e escala seguem o mesmo modelo operacional de uma aplicação .NET comum. A diferença é interna: o artefato inclui Node para SSR, então reserve mais memória que numa página Razor equivalente. Após a hidratação, DotReact não mantém conexão de aplicação persistente; Blazor Server interativo normalmente mantém um circuito SignalR por usuário.</p>
      <ReferenceTable valueHeading="Efeito de custo" rows={[
        { name: "Razor Pages", defaultValue: "menor baseline", description: "Um runtime ASP.NET e HTML no servidor; costuma exigir menos memória para a mesma página." },
        { name: "DotReact", defaultValue: "ASP.NET + Node privado", description: "Mesma unidade de deploy, com memória adicional do renderer; bundle/hidratação e cache mudam o custo por carga." },
        { name: "Blazor Server interativo", defaultValue: "conexões persistentes", description: "O custo depende de circuitos, estado por usuário e SignalR; compare com concorrência real, não apenas requests por segundo." },
        { name: "Container Apps Consumption", defaultValue: "uso medido", description: "Pode escalar a zero; uma réplica mínima evita cold start, mas mantém consumo faturável." },
        { name: "App Service", defaultValue: "instância do plano", description: "O plano dedicado é cobrado enquanto alocado; várias aplicações podem compartilhar a mesma capacidade." }
      ]} />
      <div className="callout"><strong>Regra de decisão</strong><span>Não presuma que uma tecnologia é sempre mais barata. Rode <code>npm run benchmark:compare</code>, meça memória/RPS/LCP com a página real e dimensione a menor SKU que mantém os SLOs.</span></div>
    </>
  },
  {
    id: "production-readiness", group: "Hospedagem e deploy", title: "Preparar para produção",
    summary: "Transforme um projeto local em um release reproduzível antes de escolher a plataforma.",
    tags: ["produção", "configuração", "release"],
    body: <>
      <h2>Produção começa antes do Docker build</h2>
      <Steps>
        <Step title="Feche os contratos"><p>Rode <code>npm run verify</code>. Contratos, TypeScript, DRX, testes, build e auditorias precisam pertencer ao mesmo commit.</p></Step>
        <Step title="Escolha persistência"><p>SQLite serve para uma réplica e baixo volume. Para scale-out, use banco externo e migrations compatíveis com as duas versões durante rollout.</p></Step>
        <Step title="Separe configuração"><p>Deixe defaults não secretos no projeto. Connection strings, chaves e tokens vêm do secret store da plataforma.</p></Step>
        <Step title="Defina o build ID"><p><code>DOTREACT_BUILD_ID</code> deve ser commit, versão ou revisão imutável para separar ISR/SSG entre releases.</p></Step>
        <Step title="Configure observabilidade"><p>Exporte OpenTelemetry, retenha logs estruturados e alerte readiness, 5xx, 429 e reinícios do renderer.</p></Step>
        <Step title="Planeje rollback"><p>Mantenha a imagem anterior e garanta que alterações de banco sejam backward-compatible durante toda a janela.</p></Step>
      </Steps>
      <CodeBlock label="Configuração não secreta" code={'ASPNETCORE_ENVIRONMENT=Production\nASPNETCORE_HTTP_PORTS=8080\nDOTREACT_BUILD_ID=<commit-ou-revisao>\nDOTREACT_REDIS_KEY_PREFIX=dotreact.minha-aplicacao\nOTEL_EXPORTER_OTLP_ENDPOINT=<endpoint-do-coletor>\n\n# fornecer pelo secret store, nunca pelo Git\nDOTREACT_REDIS_CONNECTION=<secret>'} />
      <div className="callout"><strong>Definition of ready</strong><span>A mesma imagem passou localmente, o banco suporta rollout/rollback, os probes refletem dependências reais e nenhum secret entrou no bundle ou no repositório.</span></div>
    </>
  },
  {
    id: "deploy-docker", group: "Hospedagem e deploy", title: "Deploy com Docker",
    summary: "Compile, execute e valide a imagem OCI gerada pelo starter.",
    tags: ["Docker", "container", "OCI"],
    body: <>
      <h2>Uma imagem contém toda a aplicação</h2>
      <p>O Dockerfile multi-stage compila contratos, cliente, SSR e servidor .NET. O estágio final usa o runtime ASP.NET, copia o renderer compilado, executa como usuário não-root e expõe somente 8080.</p>
      <CodeBlock label="Shell (bash)" code={dockerCommands} />
      <h3>O que validar dentro da imagem</h3>
      <ul className="feature-list">
        <li><code>/_health/live</code> confirma que o processo ASP.NET está vivo;</li>
        <li><code>/_health/ready</code> confirma que o renderer supervisionado está pronto;</li>
        <li>uma rota real retorna HTML SSR e referências de asset na origem pública;</li>
        <li><code>/_dotreact/client.js</code> responde 200;</li>
        <li>uma Server Action protegida funciona com auth e antiforgery;</li>
        <li>o processo não executa como root e recebe SIGINT para shutdown coordenado.</li>
      </ul>
      <div className="warning"><strong>Não use <code>latest</code></strong><span>Publique uma tag versionada e promova pelo digest SHA-256. Rollback depende de saber exatamente qual imagem estava saudável.</span></div>
    </>
  },
  {
    id: "deploy-azure-app-service", group: "Hospedagem e deploy", title: "Azure App Service",
    summary: "Publique o container com managed identity, health check e estratégia de slot.",
    tags: ["Azure", "App Service", "Bicep"],
    body: <>
      <h2>Menor carga operacional para um web app tradicional</h2>
      <p>O template <code>deploy/azure/app-service.bicep</code> cria plano Linux, Web App em container, HTTPS obrigatório, TLS mínimo, porta 8080, Always On e health check de readiness.</p>
      <Steps>
        <Step title="Crie e publique a imagem"><p>Envie um digest imutável ao registry. Para ACR privado, crie uma user-assigned managed identity com <code>AcrPull</code>.</p></Step>
        <Step title="Preencha parâmetros"><p>Copie o exemplo e substitua nome global, digest, resource ID e client ID da identidade. Não coloque senha de registry.</p></Step>
        <Step title="Valide o Bicep"><p>Compile o template antes de criar recursos e revise o what-if na assinatura correta.</p></Step>
        <Step title="Faça deploy em staging"><p>Use um slot, aguarde <code>/_health/ready</code>, teste SSR, assets e action e somente então faça swap.</p></Step>
        <Step title="Observe e reverta"><p>Mantenha o slot/imagem anterior disponível. Em regressão, faça swap de volta sem reconstruir.</p></Step>
      </Steps>
      <CodeBlock label="Azure CLI (PowerShell)" code={'az bicep build --file deploy/azure/app-service.bicep\n\naz deployment group what-if `\n  --resource-group <resource-group> `\n  --template-file deploy/azure/app-service.bicep `\n  --parameters @deploy/azure/app-service.parameters.json\n\naz deployment group create `\n  --resource-group <resource-group> `\n  --template-file deploy/azure/app-service.bicep `\n  --parameters @deploy/azure/app-service.parameters.json'} />
      <ReferenceTable valueHeading="Valor" rows={[
        { name: "WEBSITES_PORT", defaultValue: "8080", description: "Porta pública do ASP.NET dentro do container." },
        { name: "WEBSITE_WARMUP_PATH", defaultValue: "/_health/ready", description: "Impede promoção antes de o renderer estar pronto." },
        { name: "WEBSITE_WARMUP_STATUSES", defaultValue: "200", description: "Somente readiness saudável conclui o warmup." },
        { name: "WEBSITES_CONTAINER_START_TIME_LIMIT", defaultValue: "300", description: "Orçamento de inicialização do container." }
      ]} />
      <div className="warning"><strong>Escopo do template</strong><span>O Bicep base cria o App Service, mas não cria nem automatiza o slot. Provisione staging e o swap como recursos/etapas separados do pipeline.</span></div>
    </>
  },
  {
    id: "deploy-azure-container-apps", group: "Hospedagem e deploy", title: "Azure Container Apps",
    summary: "Use revisões, probes e tráfego progressivo sem expor o renderer.",
    tags: ["Azure", "Container Apps", "canary"],
    body: <>
      <h2>Revisões explícitas e rollback por tráfego</h2>
      <p>O template oficial cria environment, Container App com ingress HTTPS na porta 8080, probes Startup/Readiness/Liveness e modo de múltiplas revisões. O registry privado usa managed identity.</p>
      <CodeBlock label="Azure CLI (PowerShell)" code={'az bicep build --file deploy/azure/container-apps.bicep\n\naz deployment group create `\n  --resource-group <resource-group> `\n  --template-file deploy/azure/container-apps.bicep `\n  --parameters @deploy/azure/container-apps.parameters.json'} />
      <h3>Promoção progressiva</h3>
      <Steps>
        <Step title="Registre a revisão estável"><p>Guarde o nome retornado pela implantação saudável anterior.</p></Step>
        <Step title="Crie a candidata com peso zero"><p>Informe <code>stableRevisionName</code> e <code>latestRevisionWeight=0</code>.</p></Step>
        <Step title="Teste a revisão específica"><p>Valide readiness, HTML SSR, assets e mutação autenticada sem enviar usuários gerais.</p></Step>
        <Step title="Promova 5, 25 e 100"><p>Altere somente pesos, observe métricas em cada janela e interrompa em qualquer regressão.</p></Step>
        <Step title="Faça rollback"><p>Defina peso zero para a candidata e 100 para a revisão saudável anterior.</p></Step>
      </Steps>
      <div className="warning"><strong>SQLite limita escala</strong><span>O template começa com <code>minReplicas=1</code> e <code>maxReplicas=1</code>. Só aumente após mover estado mutável para banco externo e configurar cache/idempotência distribuídos.</span></div>
    </>
  },
  {
    id: "domains-reverse-proxy", group: "Hospedagem e deploy", title: "Domínio, HTTPS e reverse proxy",
    summary: "Publique a origem correta sem quebrar CSS, scripts, HMR ou segurança.",
    tags: ["domínio", "HTTPS", "proxy"],
    body: <>
      <h2>Assets e runtime usam a mesma origem pública</h2>
      <p>DotReact emite URLs relativas para cliente, CSS e módulos. O HTML não deve conter <code>localhost:5173</code> ou <code>127.0.0.1:5178</code>. Em desenvolvimento, ASP.NET faz proxy de <code>/_dotreact/dev/</code>; em produção, serve bundles fingerprintados.</p>
      <Steps>
        <Step title="Aponte o DNS"><p>Configure CNAME/A conforme a plataforma e valide domínio customizado no provedor.</p></Step>
        <Step title="Termine TLS na borda"><p>Use certificado gerenciado e redirecione HTTP para HTTPS. O renderer continua inacessível em loopback.</p></Step>
        <Step title="Restrinja forwarded headers"><p>Confie somente nos proxies/ingress conhecidos. Host e scheme incorretos afetam redirects, cookies e links absolutos.</p></Step>
        <Step title="Teste a origem externa"><p>Abra HTML, CSS, client.js, navegação parcial e uma action pelo domínio real, não somente por localhost.</p></Step>
      </Steps>
      <CodeBlock label="Smoke test" code={'curl --fail --location https://app.example.com/\ncurl --fail --head https://app.example.com/_dotreact/client.js\ncurl --fail https://app.example.com/_health/ready\n\n# não deve encontrar origem privada no HTML\ncurl --silent https://app.example.com/ | grep -E "localhost|127\\.0\\.0\\.1:517"'} />
      <div className="callout"><strong>Cloudflare Tunnel em desenvolvimento</strong><span>Encaminhe o domínio para a porta ASP.NET 5080, nunca diretamente para Vite/renderer. CSS, scripts e Fast Refresh permanecem same-origin sob <code>/_dotreact/dev/</code>.</span></div>
    </>
  },
  {
    id: "deployment-pipeline", group: "Hospedagem e deploy", title: "CI/CD e release",
    summary: "Converta os gates locais em uma promoção auditável e reproduzível.",
    tags: ["CI/CD", "GitHub Actions", "supply chain"],
    body: <>
      <h2>Construa uma vez; promova o mesmo digest</h2>
      <CodeBlock label="Pipeline recomendado" code={releasePipeline} />
      <p>O starter inclui um workflow de referência com permissões mínimas, Actions pinadas por SHA, validação da aplicação, Bicep, scan de infraestrutura e build do container com SBOM. Adapte autenticação e publicação ao registry sem substituir os gates.</p>
      <ReferenceTable valueHeading="Artefato" rows={[
        { name: "package-lock.json", description: "Fecha a resolução npm usada no build." },
        { name: "contracts/actions/manifest", description: "Prova a fronteira C# ↔ TypeScript do mesmo assembly." },
        { name: "imagem por digest", description: "É o único artefato promovido entre staging e produção." },
        { name: "SBOM + scans", description: "Registra dependências e blockers conhecidos do release." },
        { name: "Bicep compilado/what-if", description: "Mostra alteração de infraestrutura antes da execução." }
      ]} />
      <h3>Banco durante rollout</h3>
      <p>Use expand/contract: primeiro adicione estruturas compatíveis, depois publique código que entende versões antiga e nova, migre dados e só remova o legado após a janela de rollback. Uma migration destrutiva no mesmo passo do deploy torna o rollback ilusório.</p>
    </>
  },
  {
    id: "deployment-operations", group: "Hospedagem e deploy", title: "Operar, observar e reverter",
    summary: "Defina sinais de saúde, smoke tests, alertas e um rollback que realmente possa ser executado.",
    tags: ["operação", "observabilidade", "rollback"],
    body: <>
      <h2>Deploy termina depois da janela de observação</h2>
      <ReferenceTable valueHeading="Sinal" rows={[
        { name: "Liveness", defaultValue: "/_health/live", description: "Processo ASP.NET está vivo; falha pede reinício da plataforma." },
        { name: "Readiness", defaultValue: "/_health/ready", description: "Aplicação e renderer aceitam tráfego; falha remove a instância da rotação." },
        { name: "SSR", defaultValue: "rota representativa", description: "HTML útil, metadata, CSS e status correto antes do JavaScript." },
        { name: "Hydration", defaultValue: "browser smoke", description: "Sem mismatch; interação e navegação parcial funcionam." },
        { name: "Server Action", defaultValue: "mutação segura", description: "Auth, policy, antiforgery, persistência e revalidação." },
        { name: "Renderer", defaultValue: "métricas DotReact.Hosting.Node", description: "Startup, reinícios, saturação e limite de falhas." }
      ]} />
      <h3>Runbook mínimo</h3>
      <Steps>
        <Step title="Declare o incidente"><p>Registre início, versão/digest, impacto, owner e canal de coordenação.</p></Step>
        <Step title="Interrompa promoção"><p>Congele pesos/swap e preserve logs, traces e métricas da revisão candidata.</p></Step>
        <Step title="Reverta"><p>Restaure o digest, slot ou revisão anterior. Não reconstrua uma versão supostamente igual.</p></Step>
        <Step title="Valide recuperação"><p>Repita readiness, SSR, assets e action; acompanhe erro/latência durante a janela definida.</p></Step>
        <Step title="Corrija a causa"><p>Abra teste de regressão, documente aprendizado e só depois remova a versão anterior.</p></Step>
      </Steps>
      <div className="callout"><strong>Pronto para produção</strong><span>Uma equipe que sabe publicar, detectar falha e voltar para a última versão saudável possui um sistema operável; apenas ter um Dockerfile não basta.</span></div>
    </>
  }
];
