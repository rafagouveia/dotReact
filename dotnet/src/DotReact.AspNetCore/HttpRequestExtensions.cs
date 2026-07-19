using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore;

internal static class HttpRequestExtensions
{
    public static string GetEncodedPathAndQuery(this HttpRequest request) =>
        request.PathBase.Add(request.Path) + request.QueryString;
}
