using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore.Authentication;

/// <summary>Registers secure cookie sessions on top of the standard ASP.NET Core pipeline.</summary>
public static class DotReactAuthenticationServiceCollectionExtensions
{
    /// <summary>
    /// Adds protected, revocable cookie sessions. Identity, OAuth providers and credential
    /// verification remain application-owned and can issue sessions through IDotReactSessionManager.
    /// </summary>
    public static IServiceCollection AddDotReactCookieSessions(
        this IServiceCollection services,
        Action<DotReactCookieSessionOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        var snapshot = new DotReactCookieSessionOptions();
        configure?.Invoke(snapshot);
        var sessionOptions = services.AddOptions<DotReactCookieSessionOptions>()
            .Configure(options =>
            {
                options.Scheme = snapshot.Scheme;
                options.DevelopmentCookieName = snapshot.DevelopmentCookieName;
                options.ProductionCookieName = snapshot.ProductionCookieName;
                options.Lifetime = snapshot.Lifetime;
                options.LoginPath = snapshot.LoginPath;
                options.AccessDeniedPath = snapshot.AccessDeniedPath;
            });
        sessionOptions
            .Validate(options => IsScheme(options.Scheme),
                "The session scheme must contain 1-64 safe ASCII characters.")
            .Validate(options => IsCookieName(options.DevelopmentCookieName),
                "The development session cookie name is invalid.")
            .Validate(options => options.ProductionCookieName.StartsWith("__Host-", StringComparison.Ordinal)
                && IsCookieName(options.ProductionCookieName),
                "The production session cookie must be a valid __Host- cookie name.")
            .Validate(options => options.Lifetime >= TimeSpan.FromMinutes(5)
                    && options.Lifetime <= TimeSpan.FromDays(30),
                "Session lifetime must be between 5 minutes and 30 days.")
            .Validate(options => options.LoginPath.HasValue && options.AccessDeniedPath.HasValue,
                "LoginPath and AccessDeniedPath are required.")
            .ValidateOnStart();

        services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = snapshot.Scheme;
                options.DefaultChallengeScheme = snapshot.Scheme;
                options.DefaultSignInScheme = snapshot.Scheme;
                options.DefaultSignOutScheme = snapshot.Scheme;
            })
            .AddCookie(snapshot.Scheme);
        services.AddAuthorization();
        services.AddHttpContextAccessor();
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<IDotReactSessionStore, InMemoryDotReactSessionStore>();
        services.TryAddScoped<IDotReactSessionManager, DotReactSessionManager>();
        services.TryAddTransient<DotReactCookieSessionEvents>();
        services.AddOptions<CookieAuthenticationOptions>(snapshot.Scheme)
            .Configure<IOptions<DotReactCookieSessionOptions>, IHostEnvironment>((cookie, configured, environment) =>
            {
                var options = configured.Value;
                cookie.Cookie.Name = environment.IsDevelopment()
                    ? options.DevelopmentCookieName
                    : options.ProductionCookieName;
                cookie.Cookie.HttpOnly = true;
                cookie.Cookie.IsEssential = true;
                cookie.Cookie.Path = "/";
                cookie.Cookie.Domain = null;
                cookie.Cookie.SameSite = SameSiteMode.Lax;
                cookie.Cookie.SecurePolicy = environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                cookie.ExpireTimeSpan = options.Lifetime;
                cookie.SlidingExpiration = false;
                cookie.LoginPath = options.LoginPath;
                cookie.AccessDeniedPath = options.AccessDeniedPath;
                cookie.ReturnUrlParameter = "returnUrl";
                cookie.EventsType = typeof(DotReactCookieSessionEvents);
            });
        return services;
    }

    private static bool IsScheme(string value) => value.Length is > 0 and <= 64
        && value.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-');

    private static bool IsCookieName(string value) => value.Length is > 0 and <= 128
        && value.All(character => char.IsAsciiLetterOrDigit(character)
            || character is '!' or '#' or '$' or '%' or '&' or '\'' or '*' or '+' or '-' or '.' or '^' or '_'
                or '`' or '|' or '~');
}
