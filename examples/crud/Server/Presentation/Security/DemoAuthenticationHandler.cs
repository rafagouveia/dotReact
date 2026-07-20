using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace DotReact.Crud;

public sealed class DemoAuthenticationOptions : AuthenticationSchemeOptions;

/// <summary>
/// Gives the local sample a user without adding a real identity provider.
/// It deliberately refuses authentication outside Development and Testing.
/// Replace this scheme before exposing the application in production.
/// </summary>
public sealed class DemoAuthenticationHandler(
    IOptionsMonitor<DemoAuthenticationOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IHostEnvironment environment)
    : AuthenticationHandler<DemoAuthenticationOptions>(options, logger, encoder)
{
    public const string SchemeName = "DotReact.Crud.Demo";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
        {
            return Task.FromResult(AuthenticateResult.Fail(
                "The demo authentication scheme is disabled outside Development and Testing."));
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, "dotreact-demo-user"),
                new Claim(ClaimTypes.Name, "DotReact Demo")
            ],
            SchemeName);
        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}
