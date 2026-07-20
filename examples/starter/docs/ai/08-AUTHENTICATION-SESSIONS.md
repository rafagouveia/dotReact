# Authentication and sessions

This chapter is mandatory whenever a feature reads the current user, signs a
user in or out, changes permissions, integrates an external identity provider,
or exposes a bearer-protected API.

## Authority and trust boundary

ASP.NET Core is the identity authority. React may render public identity fields
and adjust the user experience, but it never proves authentication or grants
authorization. Do not put session IDs, access tokens, refresh tokens, OAuth
codes, provider secrets, or authorization decisions in DRX props, hydration,
`localStorage`, `sessionStorage`, URLs, logs, or generated contracts.

DotReact Server Actions use same-origin credentials and antiforgery. Cookie-
authenticated mutations must keep that flow enabled. SameSite is defense in
depth, not a replacement for antiforgery.

## Choose one session owner

Use the built-in DotReact cookie-session integration for an application that
already owns credential verification and needs a small revocable session
boundary. `AddDotReactApplication()` installs it only when the application has
not registered another ASP.NET Core authentication handler.

Use ASP.NET Core Identity when the product needs password management, account
confirmation, password recovery, MFA, lockout, security stamps, or account
linking. Register Identity before `AddDotReactApplication()`. Identity then owns
its cookie and `SignInManager`; do not also issue a DotReact session.

Use an OpenID Connect/OAuth handler for Google, Microsoft, or another provider.
Provider challenges and callbacks are ASP.NET endpoints. DRX may navigate to a
challenge endpoint but never processes OAuth codes or secrets.

Use bearer tokens for mobile/desktop clients, machine-to-machine calls, or a
separate API boundary. Interactive same-origin DRX pages should use an
`HttpOnly` cookie instead.

## SOLID feature shape

```text
Server/Features/Identity/
  Domain/User.cs
  Application/Ports/IUserCredentialVerifier.cs
  Application/SignIn/AuthenticateUser.cs
  Infrastructure/Persistence/UserCredentialVerifier.cs
  Presentation/LoginAction.cs
  Presentation/LogoutAction.cs
  Presentation/RevokeAllSessionsAction.cs
  Composition/IdentityServices.cs
```

- Domain owns user invariants and knows no cookies, claims, ASP.NET, EF, or OAuth.
- Application owns focused use cases and small ports such as
  `IUserCredentialVerifier` and `ICurrentUser`.
- Infrastructure implements password hashing, Identity persistence, external
  provider adapters, and database access.
- Presentation translates HTTP/action inputs, calls one use case, and creates or
  invalidates the session.
- Composition selects the concrete adapters. Do not resolve services manually
  inside business logic.

## DotReact cookie sessions

After a trusted authentication use case succeeds, Presentation creates the
session:

```csharp
await sessions.SignInAsync(httpContext, new DotReactSessionDescriptor(
    user.Id,
    user.DisplayName,
    user.Roles.Select(role => new Claim(ClaimTypes.Role, role)).ToArray(),
    Persistent: request.RememberMe), cancellationToken);
```

The framework generates and rotates an opaque 256-bit session ID, registers it
server-side, and emits a protected cookie. Production cookies use `__Host-`,
`Secure`, `HttpOnly`, `SameSite=Lax`, path `/`, no domain, and an absolute
lifetime. Development permits HTTP without pretending it is production TLS.

Use `SignOutAsync` to revoke only the current device. Use `RevokeAllAsync` after
password reset, account disablement, privilege changes, or an incident. Use
`RenewAsync` after MFA or privilege elevation to rotate the session identifier.
Do not implement logout with GET.

The default in-memory registry is suitable only for one development process.
Set `DOTREACT_REDIS_CONNECTION` in multi-replica production so session creation
and revocation use the shared Redis adapter. Persist and share the ASP.NET Data
Protection key ring outside disposable containers as well.

DotReact derives a Redis key prefix from the ASP.NET application name. Set
`DOTREACT_REDIS_KEY_PREFIX` only when deployment naming requires an explicit,
stable namespace. Never reuse a prefix across unrelated applications.

## Identity and external providers

With Identity, invalidate all application cookies by updating the security
stamp and configure a validation interval appropriate to the risk. Provider
client secrets come from Secret Manager locally and the platform secret store
in production; never from a `VITE_*` variable or committed file.

External provider names must come from an allowlist. Accept only a bounded local
return path (`/path`, never `//host` or an absolute attacker-controlled URL).
Trust the official handler to validate state, correlation cookie, issuer,
signature, nonce, and redirect URI. Account linking must be an explicit use case;
do not merge accounts only because two providers returned the same email.

Behind Cloudflare, Azure, or another proxy, apply trusted forwarded headers
before issuing the challenge so the handler produces the correct HTTPS callback.

## Tests required for authentication changes

- invalid and valid credentials return indistinguishable public failures;
- login requires antiforgery and rate limiting;
- protected pages/actions return 401 for anonymous callers and 403 for a denied
  authenticated principal;
- logout revokes the current cookie and replay fails;
- revoke-all invalidates cookies from two independently created clients;
- session renewal changes the session ID after MFA or role change;
- provider allowlist, invalid state, repeated callback, cancellation, blocked
  account, and malicious return URL fail closed;
- no cookie, token, password, OAuth code, or provider secret appears in logs,
  props, HTML, hydration, generated files, or browser storage;
- multi-replica tests use the Redis session store and a shared Data Protection
  key ring.
