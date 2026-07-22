import { CodeBlock, ReferenceTable, Step, Steps } from "./components";
import type { DocPage } from "./types";

export const securityDocs: readonly DocPage[] = [
  {
    id: "security-model", group: "Segurança", title: "Modelo de segurança",
    summary: "Entenda ativos, fronteiras de confiança e o comportamento seguro por padrão do DotReact.",
    tags: ["threat model", "defense in depth", "ASP.NET"],
    body: <>
      <h2>ASP.NET Core é a única autoridade pública</h2>
      <p>O navegador e o renderer React são ambientes não confiáveis para decisões de negócio. O host C# autentica, autoriza, valida, persiste e escolhe quais dados públicos atravessam a fronteira JSON. Esconder um botão ou serializar uma flag não concede segurança.</p>
      <ReferenceTable valueHeading="Confiança" rows={[
        { name: "Browser", defaultValue: "não confiável", description: "Entrada, rota, query, form, storage e estado React podem ser manipulados." },
        { name: "Renderer Node", defaultValue: "isolado", description: "Recebe módulo, URL e props públicas; não herda secrets nem serviços do backend." },
        { name: "ASP.NET edge", defaultValue: "fronteira", description: "Aplica limites, auth, policies, antiforgery, headers e serialização." },
        { name: "Application/Domain", defaultValue: "autoridade", description: "Executa invariantes usando identidade e dados carregados no servidor." },
        { name: "Infrastructure", defaultValue: "privilegiada", description: "Acessa banco e integrações por ports explícitos e configuração secreta." }
      ]} />
      <h3>Defaults do framework</h3>
      <ul className="feature-list">
        <li>Server Actions exigem usuário autorizado salvo <code>[AllowAnonymous]</code> explícito.</li>
        <li>Mutações browser usam antiforgery, limites de body e resultados fechados.</li>
        <li>CSP, HSTS, nosniff, frame, referrer, permissions e COOP são emitidos em produção.</li>
        <li>Imagem remota é deny-by-default, bloqueia rede privada e limita bytes, pixels e concorrência.</li>
        <li>Erros de produção não expõem stack, paths ou mensagem interna.</li>
        <li>Cache compartilhado exige página explicitamente anônima.</li>
      </ul>
    </>
  },
  {
    id: "security-pages-actions", group: "Segurança", title: "Páginas, actions e autorização",
    summary: "Proteja leitura e escrita com policies, recursos de domínio, antiforgery e validação server-side.",
    tags: ["authorization", "CSRF", "policies"],
    body: <>
      <h2>Autorize a operação, não o componente</h2>
      <CodeBlock label="Action protegida por recurso" code={'[DotReactAction("invoices/update")]\n[Authorize(Policy = "invoices.write")]\n[DotReactAuthorizeResource("invoices.owner")]\npublic sealed class UpdateInvoiceAction(\n    IUpdateInvoice useCase,\n    IInvoiceResourceLoader resources)\n    : IDotReactAction<UpdateInvoiceRequest, InvoiceDto>,\n      IDotReactActionResourceProvider<UpdateInvoiceRequest>\n{\n    public ValueTask<object?> LoadAuthorizationResourceAsync(\n        UpdateInvoiceRequest request, CancellationToken ct) =>\n        resources.LoadAsync(request.Id, ct);\n\n    public ValueTask<DotReactActionResult<InvoiceDto>> ExecuteAsync(\n        UpdateInvoiceRequest request, CancellationToken ct) =>\n        useCase.ExecuteAsync(request, ct);\n}'} />
      <Steps>
        <Step title="Autentique"><p>Configure um handler de produção e execute authentication antes de authorization.</p></Step>
        <Step title="Aplique policy"><p>Proteja páginas e actions no endpoint. Para owner/tenant, carregue o recurso no servidor.</p></Step>
        <Step title="Valide entrada"><p>IDs, valores, status e ownership enviados pelo browser são apenas solicitações, nunca fatos.</p></Step>
        <Step title="Proteja replay"><p>Use antiforgery para cookie auth e idempotência em operações que podem ser repetidas.</p></Step>
        <Step title="Retorne erro seguro"><p>Use 400/404/409 e Problem Details. Exceções inesperadas ficam nos logs correlacionados.</p></Step>
      </Steps>
      <div className="warning"><strong>Regra</strong><span><code>[AllowAnonymous]</code> precisa de justificativa, rate limit e teste de abuso. Não use para contornar configuração de autenticação.</span></div>
    </>
  },
  {
    id: "security-rendering", group: "Segurança", title: "SSR, XSS, scripts e secrets",
    summary: "Evite que props, metadata, dependências remotas ou o renderer virem canais de execução e vazamento.",
    tags: ["XSS", "CSP", "SRI"],
    body: <>
      <h2>Todo valor renderizado continua sendo dado</h2>
      <p>React escapa texto por padrão e o shell serializa hydration JSON com encoding seguro. Não crie atalhos de HTML bruto. Metadata aceita uma superfície estruturada; URLs e atributos passam por allowlists antes do documento final.</p>
      <CodeBlock label="Script remoto com integridade" code={'import { script } from "@blackredsolutionsteam/dotreact-script";\n\nexport const metadata = {\n  scripts: [script({\n    src: "https://cdn.example.com/widget.js",\n    integrity: "sha384-BASE64_DIGEST_FROM_RELEASE",\n    strategy: "lazyOnload",\n    referrerPolicy: "no-referrer"\n  })]\n};'} />
      <ul className="feature-list">
        <li>Prefira scripts locais versionados. HTTPS remoto exige SHA-256/384/512 SRI e CORS anônimo.</li>
        <li>Não adicione <code>*</code>, <code>data:</code>, <code>unsafe-eval</code> ou <code>unsafe-inline</code> à CSP de produção.</li>
        <li>Props, HTML, hydration, <code>VITE_*</code> e bundle são públicos. Nunca envie token, connection string ou decisão de autorização.</li>
        <li>O renderer gerenciado não herda environment do ASP.NET. Exponha somente valor não secreto em <code>PublicEnvironmentVariables</code>.</li>
        <li>Não registre body, props, cookie ou URL completa com query sensível em log/telemetria.</li>
      </ul>
    </>
  },
  {
    id: "security-sessions", group: "Segurança", title: "Sessões com cookies",
    summary: "Crie, renove e invalide sessões revogáveis sem expor identificadores ao JavaScript.",
    tags: ["sessions", "cookies", "logout"],
    body: <>
      <h2>O caso de uso autentica; o adapter cria a sessão</h2>
      <p><code>AddDotReactApplication</code> registra Cookie Authentication quando a aplicação ainda não escolheu Identity ou outro handler. O cookie é <code>HttpOnly</code> e <code>SameSite=Lax</code>; em produção, é marcado com <code>Secure</code> e usa o prefixo <code>__Host-</code>. Ele tem duração absoluta e carrega apenas um ticket protegido. O React recebe somente o DTO público do usuário.</p>
      <ReferenceTable valueHeading="Responsabilidade" rows={[
        { name: "Domain", defaultValue: "regras do usuário", description: "Estado, permissões e invariantes sem ASP.NET, cookie ou ClaimsPrincipal." },
        { name: "Application", defaultValue: "caso de uso", description: "Valida credencial por um port e retorna uma identidade autenticada ou erro." },
        { name: "Infrastructure", defaultValue: "adapters", description: "Implementa usuário, hash de senha, Identity, banco e provedores externos." },
        { name: "Presentation", defaultValue: "sessão HTTP", description: "A action traduz o resultado e chama IDotReactSessionManager." },
        { name: "React", defaultValue: "experiência", description: "Mostra o estado permitido; nunca armazena cookie, token ou decisão de autorização." }
      ]} />
      <h3>Organização recomendada</h3>
      <CodeBlock label="Estrutura por feature" code={'Server/Features/Identity/\n  Domain/User.cs\n  Application/SignIn/AuthenticateUser.cs\n  Application/Ports/IUserCredentialVerifier.cs\n  Infrastructure/Persistence/UserCredentialVerifier.cs\n  Presentation/LoginAction.cs\n  Presentation/LogoutAction.cs\n  Presentation/RevokeAllSessionsAction.cs\n  Composition/IdentityServices.cs'} />
      <h3>1. Autentique sem acoplar o caso de uso ao cookie</h3>
      <CodeBlock label="Application/SignIn/AuthenticateUser.cs" code={'public interface IUserCredentialVerifier\n{\n    ValueTask<AuthenticatedUser?> VerifyAsync(\n        string email, string password, CancellationToken ct);\n}\n\npublic sealed record AuthenticatedUser(\n    string Id, string DisplayName, IReadOnlyCollection<string> Roles);\n\npublic sealed class AuthenticateUser(IUserCredentialVerifier credentials)\n{\n    public ValueTask<AuthenticatedUser?> ExecuteAsync(\n        string email, string password, CancellationToken ct) =>\n        credentials.VerifyAsync(email.Trim(), password, ct);\n}'} />
      <p>O adapter de credenciais usa um algoritmo de hash de senha mantido, comparação resistente a timing e rate limit. Ele nunca registra a senha nem informa se foi o e-mail ou a senha que falhou.</p>
      <h3>2. Crie e encerre a sessão em actions pequenas</h3>
      <CodeBlock label="Presentation/LoginAction.cs" code={'[AllowAnonymous]\n[DotReactAction("auth/login")]\npublic sealed class LoginAction(\n    AuthenticateUser authenticate,\n    IDotReactSessionManager sessions,\n    IHttpContextAccessor http)\n    : IDotReactAction<LoginRequest, LoginResponse>\n{\n    public async ValueTask<DotReactActionResult<LoginResponse>> ExecuteAsync(\n        LoginRequest request, CancellationToken ct)\n    {\n        var user = await authenticate.ExecuteAsync(request.Email, request.Password, ct);\n        if (user is null)\n            return DotReactActionResult<LoginResponse>.Validation(\n                new Dictionary<string, string[]> { ["credentials"] = ["Credenciais inválidas."] });\n\n        await sessions.SignInAsync(http.HttpContext!, new DotReactSessionDescriptor(\n            user.Id, user.DisplayName,\n            user.Roles.Select(role => new Claim(ClaimTypes.Role, role)).ToArray(),\n            Persistent: request.RememberMe), ct);\n        return DotReactActionResult<LoginResponse>.Success(new(user.DisplayName));\n    }\n}\n\n[Authorize]\n[DotReactAction("auth/logout")]\npublic sealed class LogoutAction(IDotReactSessionManager sessions, IHttpContextAccessor http)\n    : IDotReactAction<LogoutRequest, LogoutResponse>\n{\n    public async ValueTask<DotReactActionResult<LogoutResponse>> ExecuteAsync(\n        LogoutRequest request, CancellationToken ct)\n    {\n        await sessions.SignOutAsync(http.HttpContext!, ct);\n        return DotReactActionResult<LogoutResponse>.Success(new());\n    }\n}'} />
      <p>Login e logout continuam sendo mutações: Server Actions validam antiforgery inclusive quando o login usa <code>[AllowAnonymous]</code>. Não implemente logout por GET.</p>
      <h3>3. Invalide um dispositivo ou todos</h3>
      <CodeBlock label="Presentation/RevokeAllSessionsAction.cs" code={'[Authorize]\n[DotReactAction("auth/revoke-all")]\npublic sealed class RevokeAllSessionsAction(\n    IDotReactSessionManager sessions, IHttpContextAccessor http)\n    : IDotReactAction<RevokeAllRequest, RevokeAllResponse>\n{\n    public async ValueTask<DotReactActionResult<RevokeAllResponse>> ExecuteAsync(\n        RevokeAllRequest request, CancellationToken ct)\n    {\n        var context = http.HttpContext!;\n        var subject = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;\n        await sessions.RevokeAllAsync(context, subject, ct);\n        return DotReactActionResult<RevokeAllResponse>.Success(new());\n    }\n}'} />
      <Steps>
        <Step title="Sessão atual"><p><code>SignOutAsync</code> revoga o ID server-side e apaga o cookie.</p></Step>
        <Step title="Todos os dispositivos"><p><code>RevokeAllAsync</code> grava um corte temporal por usuário; qualquer sessão anterior falha na próxima request.</p></Step>
        <Step title="Mudança de privilégio"><p>Use <code>RenewAsync</code> após troca de role, MFA ou dado sensível para rotacionar o identificador.</p></Step>
        <Step title="Múltiplas réplicas"><p>Configure <code>DOTREACT_REDIS_CONNECTION</code>; o adapter Redis substitui o store em memória e compartilha revogação.</p></Step>
        <Step title="Data Protection"><p>Persista e compartilhe o key ring fora do container para que réplicas consigam validar os mesmos cookies.</p></Step>
      </Steps>
      <h3>4. Leia a identidade por um port pequeno</h3>
      <CodeBlock label="Application/Ports/ICurrentUser.cs + Presentation/HttpCurrentUser.cs" code={'public interface ICurrentUser\n{\n    bool IsAuthenticated { get; }\n    string? Id { get; }\n    bool IsInRole(string role);\n}\n\npublic sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser\n{\n    private ClaimsPrincipal Principal =>\n        accessor.HttpContext?.User ?? new ClaimsPrincipal();\n\n    public bool IsAuthenticated => Principal.Identity?.IsAuthenticated == true;\n    public string? Id => Principal.FindFirstValue(ClaimTypes.NameIdentifier);\n    public bool IsInRole(string role) => Principal.IsInRole(role);\n}'} />
      <p>Loaders e casos de uso recebem <code>ICurrentUser</code>; eles não leem cookie, sessão ou <code>HttpContext</code> diretamente. O servidor continua reavaliando policies em toda operação sensível.</p>
      <div className="callout"><strong>Teste o ciclo inteiro</strong><span>Crie duas sessões, renove uma, invalide a atual e depois todas. Confirme 401 no replay, 403 para policy negada, antiforgery no login/logout e ausência de cookie ou token no HTML, props, logs e Web Storage.</span></div>
      <div className="warning"><strong>Não use ASP.NET Session como autenticação</strong><span><code>ISession</code> serve para estado temporário não sensível. Autenticação usa Cookie Authentication ou Identity; bearer tokens não ficam em <code>localStorage</code>.</span></div>
    </>
  },
  {
    id: "security-identity-social", group: "Segurança", title: "Identity e login social",
    summary: "Integre contas locais, Google, Microsoft ou outro provedor sem mover OAuth para o React.",
    tags: ["Identity", "OAuth", "OpenID Connect"],
    body: <>
      <h2>Use o protocolo pronto; não crie seu próprio login social</h2>
      <p>Quando o produto possui usuários, recuperação de senha, MFA, confirmação de e-mail ou vários provedores, prefira ASP.NET Core Identity. Registre Identity antes de <code>AddDotReactApplication</code>; o hosting detecta o handler existente e não instala o cookie DotReact. A sessão passa a ser administrada por <code>SignInManager</code> e invalidada pelo security stamp.</p>
      <CodeBlock label="Pacotes do projeto" code={'dotnet add Server/Server.csproj package Microsoft.AspNetCore.Identity.EntityFrameworkCore\ndotnet add Server/Server.csproj package Microsoft.AspNetCore.Authentication.Google'} />
      <CodeBlock label="Composition/IdentityServices.cs" code={'builder.Services\n    .AddIdentity<ApplicationUser, IdentityRole>(options =>\n    {\n        options.SignIn.RequireConfirmedEmail = true;\n        options.User.RequireUniqueEmail = true;\n        options.Password.RequiredLength = 12;\n        options.Lockout.MaxFailedAccessAttempts = 5;\n    })\n    .AddEntityFrameworkStores<AppDbContext>()\n    .AddDefaultTokenProviders();\n\nbuilder.Services.AddAuthentication()\n    .AddGoogle("Google", options =>\n    {\n        options.ClientId = builder.Configuration["Authentication:Google:ClientId"]!;\n        options.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]!;\n    });\n\nbuilder.Services.ConfigureApplicationCookie(cookie =>\n{\n    cookie.Cookie.HttpOnly = true;\n    cookie.Cookie.SameSite = SameSiteMode.Lax;\n    cookie.Cookie.SecurePolicy = CookieSecurePolicy.Always;\n    cookie.SlidingExpiration = false;\n});\n\nbuilder.Services.Configure<SecurityStampValidatorOptions>(options =>\n    options.ValidationInterval = TimeSpan.FromMinutes(5));'} />
      <p>Client ID pode ser configuração; client secret, chaves e tokens de refresh vêm de Secret Manager no desenvolvimento e do secret store da plataforma em produção. Nunca use variável <code>VITE_*</code> para isso.</p>
      <h3>Desafio externo com provider e retorno restritos</h3>
      <CodeBlock label="Presentation/ExternalLoginEndpoints.cs" code={'var externalProviders = new HashSet<string>(StringComparer.Ordinal)\n{\n    "Google", "Microsoft"\n};\n\nstatic string SafeLocalReturnUrl(string? value) =>\n    value is { Length: > 0 and <= 512 }\n    && value[0] == \'/\'\n    && (value.Length == 1 || value[1] is not \'/\' and not \'\\\\\')\n    && !value.Contains(\'\\\\\')\n    && !value.Contains(\'\\r\')\n    && !value.Contains(\'\\n\') ? value : "/";\n\napp.MapGet("/auth/external/{provider}", (\n    string provider, string? returnUrl, SignInManager<ApplicationUser> signIn) =>\n{\n    if (!externalProviders.Contains(provider)) return Results.NotFound();\n    var callback = "/auth/external/callback?returnUrl="\n        + Uri.EscapeDataString(SafeLocalReturnUrl(returnUrl));\n    var properties = signIn.ConfigureExternalAuthenticationProperties(provider, callback);\n    return Results.Challenge(properties, [provider]);\n}).AllowAnonymous();\n\napp.MapGet("/auth/external/callback", async (\n    string? returnUrl, SignInManager<ApplicationUser> signIn,\n    CompleteExternalSignIn complete, CancellationToken ct) =>\n{\n    var info = await signIn.GetExternalLoginInfoAsync();\n    if (info is null) return Results.BadRequest();\n\n    var result = await complete.ExecuteAsync(\n        info.LoginProvider, info.ProviderKey, info.Principal, ct);\n    if (!result.Succeeded) return Results.Forbid();\n\n    await signIn.SignInAsync(result.User, isPersistent: false, info.LoginProvider);\n    return Results.LocalRedirect(SafeLocalReturnUrl(returnUrl));\n}).AllowAnonymous();'} />
      <p><code>CompleteExternalSignIn</code> é um caso de uso: localiza vínculo existente, verifica conta bloqueada e só cria ou vincula usuário conforme regra explícita. O endpoint apenas traduz o resultado e emite o cookie do Identity.</p>
      <ul className="feature-list">
        <li>O callback valida state, correlation cookie, issuer e redirect URI pelo handler oficial.</li>
        <li>Vincule contas somente após uma regra explícita; não confie apenas no e-mail sem verificar o provider.</li>
        <li>Após senha alterada, conta bloqueada ou incidente, use <code>UserManager.UpdateSecurityStampAsync</code>.</li>
        <li>Em proxy ou Cloudflare, aplique forwarded headers confiáveis antes do desafio para gerar callback HTTPS correto.</li>
        <li>Teste login cancelado, state inválido, callback repetido, conta bloqueada e retorno externo malicioso.</li>
      </ul>
      <div className="callout"><strong>Fronteira DotReact</strong><span>DRX apenas inicia a navegação para <code>/auth/external/Google</code> e recebe props públicas após o retorno. Segredos, códigos OAuth e refresh tokens nunca cruzam a fronteira JSON.</span></div>
    </>
  },
  {
    id: "security-tokens", group: "Segurança", title: "Tokens e APIs",
    summary: "Escolha cookies para o navegador e bearer tokens somente para clientes e APIs que realmente precisam deles.",
    tags: ["bearer", "JWT", "API"],
    body: <>
      <h2>Cookie para a aplicação web; token para outra fronteira</h2>
      <ReferenceTable valueHeading="Escolha" rows={[
        { name: "DRX no navegador", defaultValue: "cookie HttpOnly", description: "Mesmo origin, antiforgery e sessão revogável; nenhum token acessível ao React." },
        { name: "App móvel ou desktop", defaultValue: "OIDC + PKCE", description: "Access token curto emitido por um authorization server confiável." },
        { name: "Serviço para serviço", defaultValue: "client credentials", description: "Identidade de workload, audience e scopes mínimos; sem usuário fictício." },
        { name: "API pública", defaultValue: "JwtBearer", description: "Valida issuer, audience, assinatura, expiração e policy no ASP.NET." },
        { name: "Renderer privado", defaultValue: "credencial interna", description: "DOTREACT_RENDERER_TOKEN autentica apenas C# → Node; nunca representa um usuário." }
      ]} />
      <CodeBlock label="API bearer separada" code={'builder.Services.AddAuthentication()\n    .AddJwtBearer("external-api", options =>\n    {\n        options.Authority = builder.Configuration["Authentication:Authority"];\n        options.Audience = "accounting-api";\n        options.MapInboundClaims = false;\n        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();\n    });\n\nbuilder.Services.AddAuthorization(options =>\n    options.AddPolicy("external-api", policy =>\n        policy.AddAuthenticationSchemes("external-api")\n            .RequireAuthenticatedUser()\n            .RequireClaim("scope", "accounting.read")));\n\napp.MapGroup("/api/v1")\n    .RequireAuthorization("external-api")\n    .MapAccountingApi();'} />
      <p>O authorization server emite e rotaciona tokens. A aplicação valida; ela não monta JWT manualmente com uma chave no repositório. Se a API e a interface vivem no mesmo origin e atendem o mesmo usuário, o cookie revogável costuma ser mais simples.</p>
      <ul className="feature-list">
        <li>Não persista access token ou refresh token em <code>localStorage</code> ou <code>sessionStorage</code>.</li>
        <li>Não envie bearer token como prop, hydration JSON, query string, log ou mensagem de erro.</li>
        <li>Use audience e scopes específicos, expiração curta, rotação e revogação no provedor.</li>
        <li>Policies do servidor continuam obrigatórias; esconder UI no React é apenas experiência.</li>
        <li>CORS não substitui autenticação, authorization, antiforgery ou validação de redirect.</li>
      </ul>
    </>
  },
  {
    id: "security-data-cache", group: "Segurança", title: "Dados, cache e isolamento",
    summary: "Impeça vazamento entre usuários, tenants, builds e réplicas.",
    tags: ["cache", "tenant", "Data Protection"],
    body: <>
      <h2>O cache precisa carregar a mesma fronteira de autorização do dado</h2>
      <ReferenceTable valueHeading="Política" rows={[
        { name: "DotReactCache", defaultValue: "somente anônimo", description: "Exige AllowAnonymous e usa chave compartilhada de path/query." },
        { name: "Prerender/ISR", defaultValue: "conteúdo público", description: "Nunca persiste HTML personalizado; chave inclui build ID." },
        { name: "Cache privado", defaultValue: "aplicação", description: "Inclua identidade, tenant, policy/versionamento e retenção explícitos." },
        { name: "Idempotência", defaultValue: "caller + action + chave", description: "Em múltiplas réplicas use store distribuído coordenado." },
        { name: "Data Protection", defaultValue: "key ring compartilhado", description: "Obrigatório para cookies e antiforgery consistentes entre réplicas." }
      ]} />
      <h3>Persistência</h3>
      <p>SQLite mantém um único arquivo e não é o adapter indicado para scale-out ou escrita concorrente intensa. Em produção distribuída, use banco externo, migrations controladas, backup/restore testado e credenciais vindas de secret store. O container não é armazenamento durável.</p>
      <h3>Imagem remota</h3>
      <p>Cadastre origins HTTPS exatas. O runtime resolve DNS, bloqueia loopback/redes privadas, não segue redirect, limita origem/decodificação e rejeita transform concorrente acima do orçamento. Não converta o endpoint em proxy de URL arbitrária.</p>
    </>
  },
  {
    id: "security-production-checklist", group: "Segurança", title: "Checklist de produção",
    summary: "Revise aplicação, infraestrutura, supply chain e resposta a incidentes antes de liberar tráfego.",
    tags: ["produção", "hardening", "checklist"],
    body: <>
      <h2>Gate de segurança antes do deploy</h2>
      <Steps>
        <Step title="Identidade"><p>Provider real configurado; cookies seguros; policies e testes anônimo/autorizado por recurso.</p></Step>
        <Step title="Rede"><p>TLS obrigatório, proxy confiável, forwarded headers restritos, HSTS conferido e renderer inacessível fora do loopback.</p></Step>
        <Step title="Secrets"><p>Nenhum valor no Git, props ou bundle; rotação definida; renderer recebe somente environment público explícito.</p></Step>
        <Step title="Dados"><p>Key ring persistente/protegido, migrations revisadas, backup restaurado em teste e cache isolado por build/tenant.</p></Step>
        <Step title="Abuso"><p>Rate/concurrency limits no app e WAF/plataforma para volume; uploads e integrações possuem limites próprios.</p></Step>
        <Step title="Supply chain"><p>Lockfiles versionados, Actions pinadas por SHA, npm/NuGet audits e scan do container/infra verdes.</p></Step>
        <Step title="Operação"><p>Logs redigidos, alertas de auth/429/5xx/saturação, runbook de incidente e canal privado de reporte.</p></Step>
      </Steps>
      <CodeBlock label="Verificação" code={'npm run check:contracts\nnpm run typecheck\nnpm test\nnpm run build\nnpm audit --audit-level=high\nnpm run audit:dotnet\n\n# depois do deploy\ncurl -I https://app.example.com/_health/live\ncurl -I https://app.example.com/'} />
      <div className="callout"><strong>Documentos normativos</strong><span>Consulte <code>SECURITY.md</code> para reporte e requisitos operacionais e <code>docs/security/SECURITY_AUDIT_2026-07-19.md</code> para achados, correções e riscos residuais.</span></div>
    </>
  }
];
