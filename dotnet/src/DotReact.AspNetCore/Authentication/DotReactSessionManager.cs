using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore.Authentication;

/// <summary>Creates and revokes protected ASP.NET Core cookie sessions.</summary>
public sealed class DotReactSessionManager(
    IDotReactSessionStore store,
    IOptions<DotReactCookieSessionOptions> options,
    TimeProvider timeProvider) : IDotReactSessionManager
{
    private readonly DotReactCookieSessionOptions _options = options.Value;

    /// <inheritdoc />
    public async ValueTask SignInAsync(
        HttpContext context,
        DotReactSessionDescriptor descriptor,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        Validate(descriptor);

        var now = timeProvider.GetUtcNow();
        var lifetime = descriptor.Lifetime ?? _options.Lifetime;
        if (lifetime < TimeSpan.FromMinutes(5) || lifetime > TimeSpan.FromDays(30))
            throw new ArgumentOutOfRangeException(nameof(descriptor),
                "Session lifetime must be between 5 minutes and 30 days.");
        var expires = now.Add(lifetime);
        var sessionId = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var claims = descriptor.Claims.Where(claim => !IsReserved(claim.Type)).ToList();
        claims.Add(new Claim(ClaimTypes.NameIdentifier, descriptor.Subject));
        claims.Add(new Claim(ClaimTypes.Name, descriptor.DisplayName));
        claims.Add(new Claim(DotReactSessionDefaults.SessionIdClaim, sessionId));
        claims.Add(new Claim(DotReactSessionDefaults.IssuedAtClaim,
            now.UtcTicks.ToString(CultureInfo.InvariantCulture), ClaimValueTypes.Integer64));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            claims, _options.Scheme, ClaimTypes.Name, ClaimTypes.Role));
        var registration = new DotReactSessionRegistration(sessionId, descriptor.Subject, now, expires);

        await store.RegisterAsync(registration, cancellationToken).ConfigureAwait(false);
        try
        {
            await context.SignInAsync(_options.Scheme, principal, new AuthenticationProperties
            {
                AllowRefresh = false,
                IsPersistent = descriptor.Persistent,
                IssuedUtc = now,
                ExpiresUtc = expires
            }).ConfigureAwait(false);
        }
        catch
        {
            await store.RevokeAsync(sessionId, descriptor.Subject, cancellationToken).ConfigureAwait(false);
            throw;
        }
    }

    /// <inheritdoc />
    public async ValueTask SignOutAsync(
        HttpContext context,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        var session = ReadCurrent(context.User);
        if (session is not null)
            await store.RevokeAsync(session.Value.SessionId, session.Value.Subject, cancellationToken)
                .ConfigureAwait(false);
        await context.SignOutAsync(_options.Scheme).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async ValueTask RenewAsync(
        HttpContext context,
        DotReactSessionDescriptor descriptor,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        var current = ReadCurrent(context.User);
        if (current is not null)
            await store.RevokeAsync(current.Value.SessionId, current.Value.Subject, cancellationToken)
                .ConfigureAwait(false);
        await SignInAsync(context, descriptor, cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async ValueTask RevokeAllAsync(
        HttpContext context,
        string subject,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        var now = timeProvider.GetUtcNow();
        await store.RevokeAllAsync(subject, now, cancellationToken).ConfigureAwait(false);
        if (string.Equals(
                context.User.FindFirstValue(ClaimTypes.NameIdentifier), subject, StringComparison.Ordinal))
            await context.SignOutAsync(_options.Scheme).ConfigureAwait(false);
    }

    private static void Validate(DotReactSessionDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(descriptor);
        ArgumentException.ThrowIfNullOrWhiteSpace(descriptor.Subject);
        ArgumentException.ThrowIfNullOrWhiteSpace(descriptor.DisplayName);
        ArgumentNullException.ThrowIfNull(descriptor.Claims);
        if (descriptor.Subject.Length > 256 || descriptor.DisplayName.Length > 256)
            throw new ArgumentOutOfRangeException(nameof(descriptor),
                "Session subject and display name are limited to 256 characters.");
        if (descriptor.Claims.Count > 32
            || descriptor.Claims.Any(claim => claim.Type.Length > 256 || claim.Value.Length > 1_024)
            || descriptor.Claims.Sum(claim => claim.Type.Length + claim.Value.Length) > 3_072)
            throw new ArgumentOutOfRangeException(nameof(descriptor),
                "Session claims exceed the safe count or encoded-size limit.");
    }

    private static bool IsReserved(string type) =>
        type is ClaimTypes.NameIdentifier or ClaimTypes.Name
            or DotReactSessionDefaults.SessionIdClaim or DotReactSessionDefaults.IssuedAtClaim;

    private static (string SessionId, string Subject)? ReadCurrent(ClaimsPrincipal principal)
    {
        var sessionId = principal.FindFirstValue(DotReactSessionDefaults.SessionIdClaim);
        var subject = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(subject)
            ? null
            : (sessionId, subject);
    }
}
