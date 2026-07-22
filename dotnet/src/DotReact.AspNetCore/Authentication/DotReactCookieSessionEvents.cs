using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore.Authentication;

/// <summary>Validates server-side revocation and preserves API-style 401/403 responses.</summary>
public sealed class DotReactCookieSessionEvents(IDotReactSessionStore store) : CookieAuthenticationEvents
{
    /// <inheritdoc />
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var sessionId = context.Principal?.FindFirstValue(DotReactSessionDefaults.SessionIdClaim);
        var subject = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var issuedValue = context.Principal?.FindFirstValue(DotReactSessionDefaults.IssuedAtClaim);
        var validIssuedAt = long.TryParse(
            issuedValue, NumberStyles.None, CultureInfo.InvariantCulture, out var issuedTicks);
        var active = !string.IsNullOrWhiteSpace(sessionId)
            && !string.IsNullOrWhiteSpace(subject)
            && validIssuedAt
            && await store.IsActiveAsync(
                sessionId, subject, new DateTimeOffset(issuedTicks, TimeSpan.Zero),
                context.HttpContext.RequestAborted).ConfigureAwait(false);
        if (active) return;

        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(context.Scheme.Name).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context) =>
        IsApiRequest(context.Request)
            ? WriteStatusAsync(context.Response, StatusCodes.Status401Unauthorized)
            : base.RedirectToLogin(context);

    /// <inheritdoc />
    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context) =>
        IsApiRequest(context.Request)
            ? WriteStatusAsync(context.Response, StatusCodes.Status403Forbidden)
            : base.RedirectToAccessDenied(context);

    private static bool IsApiRequest(HttpRequest request) =>
        request.Path.StartsWithSegments("/_dotreact", StringComparison.Ordinal)
        || request.GetTypedHeaders().Accept?.Any(value =>
            value.MediaType.HasValue
            && (value.MediaType.Value.EndsWith("/json", StringComparison.OrdinalIgnoreCase)
                || value.MediaType.Value.EndsWith("+json", StringComparison.OrdinalIgnoreCase))) == true;

    private static Task WriteStatusAsync(HttpResponse response, int statusCode)
    {
        response.StatusCode = statusCode;
        response.Headers.CacheControl = "private,no-store";
        return Task.CompletedTask;
    }
}
